import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, requireCostAccess, hashPassword, createToken, checkPassword, getUserBuckets } from './auth.js';
import { query, queryOne, run, runReturning, getPool, ensureUploadJobsTable, encrypt, decrypt, getSetting, setSetting, getAllSettings } from './db.js';
import { getProviderInstance, getActiveProviders, getAllProviders, testProviderConnection, getProviderTypes, clearProviderCache } from './cloud-providers/index.js';

// Helper to check bucket permissions (includes group permissions)
async function checkBucketPermission(userId, providerId, bucketName, permission) {
  // 1. Check if user has direct permission
  const directPerm = await queryOne(`
    SELECT * FROM bucket_permissions 
    WHERE user_id = ? AND provider_id = ? AND bucket_name = ?
  `, [userId, providerId, bucketName]);
  
  if (directPerm && directPerm[`can_${permission}`] === true) {
    return true;
  }
  
  // 2. Check group permissions
  const groupPerm = await queryOne(`
    SELECT gbp.* FROM group_bucket_permissions gbp
    JOIN group_members gm ON gbp.group_id = gm.group_id
    WHERE gm.user_id = ? AND gbp.provider_id = ? AND gbp.bucket_name = ? AND gbp.can_${permission} = TRUE
    LIMIT 1
  `, [userId, providerId, bucketName]);
  
  if (groupPerm) {
    return true;
  }
  
  // 3. Legacy: check if user has provider access (no specific bucket permissions)
  const hasDirectPerms = await queryOne(
    'SELECT 1 FROM bucket_permissions WHERE user_id = ? LIMIT 1', 
    [userId]
  );
  const hasGroupPerms = await queryOne(
    'SELECT 1 FROM group_members WHERE user_id = ? LIMIT 1', 
    [userId]
  );
  
  // If user has any specific permissions (direct or group), don't fall back to legacy
  if (hasDirectPerms || hasGroupPerms) {
    return false;
  }
  
  // Legacy: if user has provider access but no specific permissions anywhere, allow all
  const providerAccess = await queryOne(
    'SELECT 1 FROM user_providers WHERE user_id = ? AND provider_id = ?', 
    [userId, providerId]
  );
  
  return !!providerAccess;
}

// Helper to get user's permissions for a bucket (merges direct + group permissions)
async function getBucketPermissions(userId, providerId, bucketName) {
  // Get direct permissions
  const directPerm = await queryOne(`
    SELECT can_view, can_upload, can_download, can_delete, can_share, can_edit
    FROM bucket_permissions 
    WHERE user_id = ? AND provider_id = ? AND bucket_name = ?
  `, [userId, providerId, bucketName]);
  
  // Get group permissions (merge all groups - OR logic)
  const groupPerms = await query(`
    SELECT gbp.can_view, gbp.can_upload, gbp.can_download, gbp.can_delete, gbp.can_share, gbp.can_edit
    FROM group_bucket_permissions gbp
    JOIN group_members gm ON gbp.group_id = gm.group_id
    WHERE gm.user_id = ? AND gbp.provider_id = ? AND gbp.bucket_name = ?
  `, [userId, providerId, bucketName]);
  
  // Merge permissions (user gets permission if ANY source grants it)
  const merged = {
    can_view: directPerm?.can_view || false,
    can_upload: directPerm?.can_upload || false,
    can_download: directPerm?.can_download || false,
    can_delete: directPerm?.can_delete || false,
    can_share: directPerm?.can_share || false,
    can_edit: directPerm?.can_edit || false,
  };
  
  for (const gp of groupPerms) {
    if (gp.can_view) merged.can_view = true;
    if (gp.can_upload) merged.can_upload = true;
    if (gp.can_download) merged.can_download = true;
    if (gp.can_delete) merged.can_delete = true;
    if (gp.can_share) merged.can_share = true;
    if (gp.can_edit) merged.can_edit = true;
  }
  
  // If user has any permissions, return them
  if (directPerm || groupPerms.length > 0) {
    return merged;
  }
  
  // Legacy: check if user has provider access
  const providerAccess = await queryOne(
    'SELECT 1 FROM user_providers WHERE user_id = ? AND provider_id = ?', 
    [userId, providerId]
  );
  
  // Legacy users get all permissions
  if (providerAccess) {
    return {
      can_view: true,
      can_upload: true,
      can_download: true,
      can_delete: true,
      can_share: true,
      can_edit: true,
    };
  }
  
  return {
    can_view: false,
    can_upload: false,
    can_download: false,
    can_delete: false,
    can_share: false,
    can_edit: false,
  };
}

// Generate secure share token
function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

const router = Router();

// --- Health Check ---
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await queryOne('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: e.message });
  }
});

// --- Public ---
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const user = await queryOne('SELECT id, username, password_hash, is_admin FROM users WHERE username = ?', [username]);
    if (!user || !checkPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = createToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, is_admin: !!user.is_admin },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Protected (any logged-in user) ---

// Get current user profile (fresh from database)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, is_admin, is_cost_manager, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me/buckets', requireAuth, async (req, res) => {
  try {
    const buckets = await getUserBuckets(req.user.id);
    res.json({ buckets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get providers available to the user
router.get('/providers', requireAuth, async (req, res) => {
  try {
    let providers;
    
    if (req.user.is_admin) {
      // Admin sees all active providers
      providers = await getActiveProviders();
    } else {
      // Regular users see only providers they have access to
      providers = await query(`
        SELECT DISTINCT cp.id, cp.name, cp.type
        FROM cloud_providers cp
        INNER JOIN user_providers up ON cp.id = up.provider_id
        WHERE up.user_id = ? AND cp.is_active = TRUE
        ORDER BY cp.name
      `, [req.user.id]);
    }
    
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get buckets for a specific provider with permissions
router.get('/providers/:providerId/buckets', requireAuth, async (req, res) => {
  try {
    const providerId = Number(req.params.providerId);
    
    // Check user has access to this provider
    if (!req.user.is_admin) {
      const access = await queryOne('SELECT 1 FROM user_providers WHERE user_id = ? AND provider_id = ?', [req.user.id, providerId]);
      if (!access) {
        return res.status(403).json({ error: 'Access denied to this provider' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const allBuckets = await provider.listBuckets();
    
    if (req.user.is_admin) {
      // Admin gets all permissions
      const bucketsWithPerms = allBuckets.map(b => ({
        ...b,
        permissions: {
          can_view: true,
          can_upload: true,
          can_download: true,
          can_delete: true,
          can_share: true,
          can_edit: true,
        }
      }));
      return res.json({ buckets: bucketsWithPerms });
    }
    
    // Get user's bucket permissions
    const userBucketPerms = await query(`
      SELECT bucket_name, can_view, can_upload, can_download, can_delete, can_share, can_edit
      FROM bucket_permissions 
      WHERE user_id = ? AND provider_id = ?
    `, [req.user.id, providerId]);
    
    const permMap = {};
    for (const p of userBucketPerms) {
      permMap[p.bucket_name] = {
        can_view: p.can_view,
        can_upload: p.can_upload,
        can_download: p.can_download,
        can_delete: p.can_delete,
        can_share: p.can_share,
        can_edit: p.can_edit,
      };
    }
    
    // Filter to buckets user has access to (from user_buckets or bucket_permissions)
    const userBuckets = await query('SELECT bucket_name FROM user_buckets WHERE user_id = ? AND provider_id = ?', [req.user.id, providerId]);
    const allowedSet = new Set([
      ...userBuckets.map(b => b.bucket_name),
      ...userBucketPerms.map(b => b.bucket_name)
    ]);
    
    // If user has no specific bucket restrictions for this provider, show all with default permissions
    if (allowedSet.size === 0) {
      const hasAnyAccess = await queryOne('SELECT 1 FROM user_providers WHERE user_id = ? AND provider_id = ?', [req.user.id, providerId]);
      if (hasAnyAccess) {
        // Legacy: full access
        const bucketsWithPerms = allBuckets.map(b => ({
          ...b,
          permissions: permMap[b.name] || {
            can_view: true,
            can_upload: true,
            can_download: true,
            can_delete: true,
            can_share: true,
            can_edit: true,
          }
        }));
        return res.json({ buckets: bucketsWithPerms });
      }
    }
    
    // Return only allowed buckets with their permissions
    const filteredBuckets = allBuckets
      .filter(b => allowedSet.has(b.name))
      .map(b => ({
        ...b,
        permissions: permMap[b.name] || {
          can_view: true,
          can_upload: true,
          can_download: false,
          can_delete: false,
          can_share: false,
          can_edit: false,
        }
      }));
    
    res.json({ buckets: filteredBuckets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Threshold (bytes) above which we use resumable upload when supported (e.g. 100MB)
const RESUMABLE_THRESHOLD = 100 * 1024 * 1024;

// Get signed upload URL for a provider (optionally resumable for large files)
router.post('/providers/:providerId/upload-url', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const { bucket, objectName, contentType, fileSize, fileName, resumable } = req.body || {};
  
  if (!bucket || !objectName) {
    return res.status(400).json({ error: 'bucket and objectName required' });
  }
  
  try {
    // Check user has access to this provider and bucket
    if (!req.user.is_admin) {
      const providerAccess = await queryOne('SELECT 1 FROM user_providers WHERE user_id = ? AND provider_id = ?', [req.user.id, providerId]);
      if (!providerAccess) {
        return res.status(403).json({ error: 'Access denied to this provider' });
      }
      
      const bucketAccess = await queryOne('SELECT 1 FROM user_buckets WHERE user_id = ? AND provider_id = ? AND bucket_name = ?', [req.user.id, providerId, bucket]);
      const hasAnyBucketRestriction = await queryOne('SELECT 1 FROM user_buckets WHERE user_id = ? AND provider_id = ?', [req.user.id, providerId]);
      if (hasAnyBucketRestriction && !bucketAccess) {
        return res.status(403).json({ error: 'Access denied to this bucket' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const providerInfo = await queryOne('SELECT name FROM cloud_providers WHERE id = ?', [providerId]);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const size = Number(fileSize) || 0;
    const useResumable = resumable === true || (size > 0 && size >= RESUMABLE_THRESHOLD);
    let uploadUrl;
    let resumableSession = null;
    let jobId = null;

    if (useResumable && provider.createResumableUpload) {
      const result = await provider.createResumableUpload(bucket, objectName, contentType || 'application/octet-stream', size);
      if (result && result.uploadUri) {
        uploadUrl = result.uploadUri;
        resumableSession = result.uploadUri;
      }
    }
    if (!uploadUrl) {
      uploadUrl = await provider.getSignedUploadUrl(bucket, objectName, contentType);
    }

    // Create upload job for tracking (progress, resume, background jobs UI)
    await ensureUploadJobsTable();
    try {
      const jobResult = await runReturning(`
        INSERT INTO upload_jobs (user_id, username, provider_id, provider_name, bucket, object_path, file_name, file_size, content_type, status, job_type, resumable_session, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'direct', ?, ?)
      `, [
        req.user.id,
        req.user.username,
        providerId,
        providerInfo?.name || 'Unknown',
        bucket,
        objectName,
        fileName || objectName.split('/').pop(),
        size,
        contentType || 'application/octet-stream',
        resumableSession,
        ip
      ]);
      if (jobResult && jobResult.id) {
        jobId = jobResult.id;
        console.log('[Background jobs] Created job', jobId, 'for user', req.user.id, req.user.username);
      }
    } catch (jobErr) {
      console.error('[Background jobs] Upload job create failed (upload will still work):', jobErr.message);
    }

    // Log the upload attempt (upload_logs for admin/history)
    await run(`
      INSERT INTO upload_logs (user_id, username, provider_id, provider_name, bucket, object_path, file_name, file_size, content_type, status, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [
      req.user.id,
      req.user.username,
      providerId,
      providerInfo?.name || 'Unknown',
      bucket,
      objectName,
      fileName || objectName.split('/').pop(),
      size,
      contentType || 'application/octet-stream',
      ip
    ]);
    
    res.json({ uploadUrl, jobId });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create upload URL' });
  }
});

// Log upload completion (and update job if jobId provided)
router.post('/upload-complete', requireAuth, async (req, res) => {
  const { bucket, objectName, status, error, jobId } = req.body || {};
  if (!bucket || !objectName) {
    return res.status(400).json({ error: 'bucket and objectName required' });
  }
  
  try {
    if (jobId) {
      try {
        const pool = getPool();
        await pool.query(
          `UPDATE upload_jobs SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP, bytes_uploaded = file_size, progress_pct = 100 WHERE id = $3 AND user_id = $4`,
          [status === 'success' ? 'completed' : 'failed', error || null, jobId, req.user.id]
        );
      } catch (_) {}
    }
    await run(`
      UPDATE upload_logs 
      SET status = ?, error_message = ?
      WHERE id = (
        SELECT id FROM upload_logs 
        WHERE user_id = ? AND bucket = ? AND object_path = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
      )
    `, [status || 'success', error || null, req.user.id, bucket, objectName]);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update upload job progress (chunked uploads)
router.patch('/jobs/:id/progress', requireAuth, async (req, res) => {
  const jobId = Number(req.params.id);
  const { bytes_uploaded, status: jobStatus, error_message: jobError } = req.body || {};
  if (!Number.isInteger(jobId)) {
    return res.status(400).json({ error: 'job id required' });
  }
  try {
    const job = await queryOne('SELECT id, user_id, file_size FROM upload_jobs WHERE id = ? AND user_id = ?', [jobId, req.user.id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const total = Number(job.file_size) || 1;
    const uploaded = bytes_uploaded != null ? Number(bytes_uploaded) : null;
    const progressPct = uploaded != null && total > 0 ? Math.min(100, Math.round((uploaded / total) * 1000) / 10) : null;
    const pool = getPool();
    const updates = ['started_at = COALESCE(started_at, CURRENT_TIMESTAMP)'];
    const values = [];
    let idx = 1;
    if (jobStatus) {
      updates.push(`status = $${idx++}`);
      values.push(jobStatus);
    }
    if (jobError !== undefined) {
      updates.push(`error_message = $${idx++}`);
      values.push(jobError);
    }
    if (uploaded != null) {
      updates.push(`bytes_uploaded = $${idx++}`);
      values.push(uploaded);
    }
    if (progressPct != null) {
      updates.push(`progress_pct = $${idx++}`);
      values.push(progressPct);
    }
    if (jobStatus === 'failed' || jobStatus === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
    values.push(jobId, req.user.id);
    await pool.query(
      `UPDATE upload_jobs SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`,
      values
    );
    res.json({ ok: true, progress_pct: progressPct });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List upload jobs for current user
router.get('/jobs', requireAuth, async (req, res) => {
  await ensureUploadJobsTable();
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const statusFilter = req.query.status; // optional: pending, uploading, completed, failed, paused
    let sql = `
      SELECT id, provider_id, provider_name, bucket, object_path, file_name, file_size, content_type,
             status, bytes_uploaded, progress_pct, error_message, job_type, created_at, started_at, completed_at
      FROM upload_jobs WHERE user_id = ?
    `;
    const params = [req.user.id];
    if (statusFilter) {
      sql += ' AND status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const jobs = await query(sql, params);
    const totalResult = await queryOne(
      'SELECT COUNT(*) as total FROM upload_jobs WHERE user_id = ?' + (statusFilter ? ' AND status = ?' : ''),
      statusFilter ? [req.user.id, statusFilter] : [req.user.id]
    );
    res.json({ jobs: jobs || [], total: Number(totalResult?.total) || 0 });
  } catch (e) {
    if (e.message && e.message.includes('upload_jobs')) {
      res.json({ jobs: [], total: 0 });
      return;
    }
    res.status(500).json({ error: e.message });
  }
});

// Get one job (for resume: returns uploadUrl if resumable and still uploadable)
router.get('/jobs/:id', requireAuth, async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job id' });
  try {
    const job = await queryOne(
      'SELECT id, provider_id, provider_name, bucket, object_path, file_name, file_size, status, bytes_uploaded, progress_pct, error_message, resumable_session, created_at, started_at, completed_at FROM upload_jobs WHERE id = ? AND user_id = ?',
      [jobId, req.user.id]
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const out = {
      id: job.id,
      provider_id: job.provider_id,
      provider_name: job.provider_name,
      bucket: job.bucket,
      object_path: job.object_path,
      file_name: job.file_name,
      file_size: Number(job.file_size),
      status: job.status,
      bytes_uploaded: Number(job.bytes_uploaded) || 0,
      progress_pct: Number(job.progress_pct) || 0,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
    };
    const canReturnResumable = ['uploading', 'paused', 'pending', 'failed'].includes(job.status) && job.resumable_session;
    if (canReturnResumable) {
      out.uploadUrl = job.resumable_session;
      out.canResume = true;
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin only ---
router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await query('SELECT id, username, is_admin, is_cost_manager, created_at FROM users ORDER BY id');
    const bucketsByUser = {};
    for (const u of users) {
      bucketsByUser[u.id] = await getUserBuckets(u.id);
    }
    res.json({ users, bucketsByUser });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, is_admin, is_cost_manager } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    const result = await runReturning(
      'INSERT INTO users (username, password_hash, is_admin, is_cost_manager) VALUES (?, ?, ?, ?)',
      [username, hashPassword(password), is_admin ? true : false, is_cost_manager ? true : false]
    );
    res.json({ id: result.id, username });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { password, is_admin, is_cost_manager } = req.body || {};
  
  try {
    const user = await queryOne('SELECT id, is_admin FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (password) {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), id]);
    }
    
    // Update admin status (but don't allow demoting yourself)
    if (typeof is_admin === 'boolean' && id !== req.user.id) {
      await run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin, id]);
    }
    
    // Update cost manager status
    if (typeof is_cost_manager === 'boolean') {
      await run('UPDATE users SET is_cost_manager = ? WHERE id = ?', [is_cost_manager, id]);
    }
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  try {
    const user = await queryOne('SELECT is_admin FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_admin) return res.status(400).json({ error: 'Cannot delete admin' });
    
    await run('DELETE FROM user_buckets WHERE user_id = ?', [id]);
    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ PROVIDER MANAGEMENT (Admin) ============

// Get provider types/schemas
router.get('/admin/provider-types', requireAuth, requireAdmin, (req, res) => {
  res.json({ types: getProviderTypes() });
});

// Get all providers
router.get('/admin/providers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const providers = await getAllProviders();
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add a new provider
router.post('/admin/providers', requireAuth, requireAdmin, async (req, res) => {
  const { name, type, config } = req.body || {};
  
  if (!name || !type || !config) {
    return res.status(400).json({ error: 'name, type, and config are required' });
  }
  
  try {
    // Test connection first
    const testResult = await testProviderConnection(type, config);
    if (!testResult.success) {
      return res.status(400).json({ error: `Connection test failed: ${testResult.message}` });
    }
    
    // Encrypt and store
    const encryptedConfig = encrypt(JSON.stringify(config));
    const result = await runReturning(`
      INSERT INTO cloud_providers (name, type, config, is_active)
      VALUES (?, ?, ?, TRUE)
    `, [name, type, encryptedConfig]);
    
    res.json({ id: result.id, name, type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update a provider
router.patch('/admin/providers/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, config, is_active } = req.body || {};
  
  try {
    const provider = await queryOne('SELECT * FROM cloud_providers WHERE id = ?', [id]);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    // If config is being updated, test connection
    if (config) {
      const testResult = await testProviderConnection(provider.type, config);
      if (!testResult.success) {
        return res.status(400).json({ error: `Connection test failed: ${testResult.message}` });
      }
      
      const encryptedConfig = encrypt(JSON.stringify(config));
      await run('UPDATE cloud_providers SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [encryptedConfig, id]);
      clearProviderCache(id);
    }
    
    if (name) {
      await run('UPDATE cloud_providers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
    }
    
    if (typeof is_active === 'boolean' || typeof is_active === 'number') {
      await run('UPDATE cloud_providers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [!!is_active, id]);
      if (!is_active) clearProviderCache(id);
    }
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a provider
router.delete('/admin/providers/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  try {
    const provider = await queryOne('SELECT * FROM cloud_providers WHERE id = ?', [id]);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    // Delete related records
    await run('DELETE FROM user_providers WHERE provider_id = ?', [id]);
    await run('DELETE FROM user_buckets WHERE provider_id = ?', [id]);
    await run('DELETE FROM cloud_providers WHERE id = ?', [id]);
    clearProviderCache(id);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Test provider connection
router.post('/admin/providers/test', requireAuth, requireAdmin, async (req, res) => {
  const { type, config } = req.body || {};
  
  if (!type || !config) {
    return res.status(400).json({ error: 'type and config are required' });
  }
  
  try {
    const result = await testProviderConnection(type, config);
    res.json(result);
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// Get buckets for a provider (admin)
router.get('/admin/providers/:id/buckets', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  try {
    const provider = await getProviderInstance(id);
    const buckets = await provider.listBuckets();
    res.json({ buckets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user's provider access
router.get('/admin/users/:userId/providers', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  
  try {
    const providers = await query(`
      SELECT cp.id, cp.name, cp.type
      FROM cloud_providers cp
      INNER JOIN user_providers up ON cp.id = up.provider_id
      WHERE up.user_id = ?
    `, [userId]);
    
    const buckets = await query(`
      SELECT provider_id, bucket_name
      FROM user_buckets
      WHERE user_id = ?
    `, [userId]);
    
    res.json({ providers, buckets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user's provider access
router.put('/admin/users/:userId/providers', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const { providerIds, buckets } = req.body || {};
  
  try {
    // Update provider access
    await run('DELETE FROM user_providers WHERE user_id = ?', [userId]);
    if (Array.isArray(providerIds)) {
      for (const pid of providerIds) {
        await run('INSERT INTO user_providers (user_id, provider_id) VALUES (?, ?)', [userId, Number(pid)]);
      }
    }
    
    // Update bucket access
    await run('DELETE FROM user_buckets WHERE user_id = ?', [userId]);
    if (Array.isArray(buckets)) {
      for (const b of buckets) {
        if (b.provider_id && b.bucket_name) {
          await run('INSERT INTO user_buckets (user_id, provider_id, bucket_name) VALUES (?, ?, ?)', [userId, Number(b.provider_id), b.bucket_name]);
        }
      }
    }
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get upload logs (admin only)
router.get('/admin/uploads', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, provider_id, bucket, status, date_from, date_to, limit = 100, offset = 0 } = req.query;
  
  try {
    let sql = 'SELECT * FROM upload_logs WHERE 1=1';
    const params = [];
    
    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(Number(user_id));
    }
    if (provider_id) {
      sql += ' AND provider_id = ?';
      params.push(Number(provider_id));
    }
    if (bucket) {
      sql += ' AND bucket = ?';
      params.push(bucket);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (date_from) {
      sql += ' AND DATE(created_at) >= ?';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND DATE(created_at) <= ?';
      params.push(date_to);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    
    const logs = await query(sql, params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM upload_logs WHERE 1=1';
    const countParams = [];
    if (user_id) {
      countSql += ' AND user_id = ?';
      countParams.push(Number(user_id));
    }
    if (provider_id) {
      countSql += ' AND provider_id = ?';
      countParams.push(Number(provider_id));
    }
    if (bucket) {
      countSql += ' AND bucket = ?';
      countParams.push(bucket);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (date_from) {
      countSql += ' AND DATE(created_at) >= ?';
      countParams.push(date_from);
    }
    if (date_to) {
      countSql += ' AND DATE(created_at) <= ?';
      countParams.push(date_to);
    }
    const countResult = await queryOne(countSql, countParams);
    
    res.json({ logs, total: countResult?.total || 0, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get upload stats (admin only)
router.get('/admin/uploads/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUploadsResult = await queryOne('SELECT COUNT(*) as count FROM upload_logs');
    const successfulUploadsResult = await queryOne("SELECT COUNT(*) as count FROM upload_logs WHERE status = 'success'");
    const failedUploadsResult = await queryOne("SELECT COUNT(*) as count FROM upload_logs WHERE status = 'failed'");
    const totalSizeResult = await queryOne("SELECT COALESCE(SUM(file_size), 0) as total FROM upload_logs WHERE status = 'success'");
    
    // PostgreSQL returns bigint as string, so convert to numbers
    const totalUploads = Number(totalUploadsResult?.count) || 0;
    const successfulUploads = Number(successfulUploadsResult?.count) || 0;
    const failedUploads = Number(failedUploadsResult?.count) || 0;
    const totalSize = Number(totalSizeResult?.total) || 0;
    
    const byUser = await query(`
      SELECT username, COUNT(*)::integer as uploads, COALESCE(SUM(file_size), 0)::bigint as total_size
      FROM upload_logs 
      WHERE status = 'success'
      GROUP BY user_id, username
      ORDER BY uploads DESC
      LIMIT 10
    `);
    
    const byBucket = await query(`
      SELECT bucket, COUNT(*)::integer as uploads, COALESCE(SUM(file_size), 0)::bigint as total_size
      FROM upload_logs 
      WHERE status = 'success'
      GROUP BY bucket
      ORDER BY uploads DESC
      LIMIT 10
    `);
    
    const recentActivity = await query(`
      SELECT DATE(created_at) as date, COUNT(*)::integer as uploads
      FROM upload_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    res.json({
      totalUploads,
      successfulUploads,
      failedUploads,
      totalSize,
      byUser,
      byBucket,
      recentActivity,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ FILE BROWSER ============

// List files/folders in a bucket
router.get('/providers/:providerId/buckets/:bucket/files', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const bucket = req.params.bucket;
  const { prefix = '', pageToken } = req.query;
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canView = await checkBucketPermission(req.user.id, providerId, bucket, 'view');
      if (!canView) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const result = await provider.listObjects(bucket, prefix, { 
      maxResults: 100,
      delimiter: '/',
      pageToken 
    });
    
    // Get user's permissions for this bucket
    const permissions = req.user.is_admin 
      ? { can_view: true, can_upload: true, can_download: true, can_delete: true, can_share: true, can_edit: true }
      : await getBucketPermissions(req.user.id, providerId, bucket);
    
    res.json({ ...result, permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get download URL for a file
router.get('/providers/:providerId/buckets/:bucket/download', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const bucket = req.params.bucket;
  const { path: objectPath } = req.query;
  
  if (!objectPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canDownload = await checkBucketPermission(req.user.id, providerId, bucket, 'download');
      if (!canDownload) {
        return res.status(403).json({ error: 'Download not allowed' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const providerInfo = await queryOne('SELECT name FROM cloud_providers WHERE id = ?', [providerId]);
    
    // Get file metadata for size
    let fileSize = 0;
    try {
      const metadata = await provider.getObjectMetadata(bucket, objectPath);
      fileSize = metadata.size || 0;
    } catch (e) {
      // Ignore metadata errors
    }
    
    const url = await provider.getSignedDownloadUrl(bucket, objectPath, 3600);
    
    // Log the download
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await run(`
      INSERT INTO download_logs (user_id, username, provider_id, provider_name, bucket, object_path, file_name, file_size, download_source, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cloudvault', ?)
    `, [
      req.user.id,
      req.user.username,
      providerId,
      providerInfo?.name || 'Unknown',
      bucket,
      objectPath,
      objectPath.split('/').pop(),
      fileSize,
      ip
    ]);
    
    res.json({ downloadUrl: url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a file
router.delete('/providers/:providerId/buckets/:bucket/files', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const bucket = req.params.bucket;
  const { paths } = req.body || {};
  
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths array is required' });
  }
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canDelete = await checkBucketPermission(req.user.id, providerId, bucket, 'delete');
      if (!canDelete) {
        return res.status(403).json({ error: 'Delete not allowed' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const results = await provider.deleteObjects(bucket, paths);
    
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rename/move a file
router.post('/providers/:providerId/buckets/:bucket/rename', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const bucket = req.params.bucket;
  const { oldPath, newPath } = req.body || {};
  
  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'oldPath and newPath are required' });
  }
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canEdit = await checkBucketPermission(req.user.id, providerId, bucket, 'edit');
      if (!canEdit) {
        return res.status(403).json({ error: 'Edit not allowed' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    await provider.renameObject(bucket, oldPath, newPath);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get file metadata
router.get('/providers/:providerId/buckets/:bucket/metadata', requireAuth, async (req, res) => {
  const providerId = Number(req.params.providerId);
  const bucket = req.params.bucket;
  const { path: objectPath } = req.query;
  
  if (!objectPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canView = await checkBucketPermission(req.user.id, providerId, bucket, 'view');
      if (!canView) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const provider = await getProviderInstance(providerId);
    const metadata = await provider.getObjectMetadata(bucket, objectPath);
    
    res.json({ metadata });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ SHARING ============

// Create a share link
router.post('/share', requireAuth, async (req, res) => {
  const { providerId, bucket, objectPath, isFolder, sharedWithEmail, expiresInHours = 24, canDownload = true, maxDownloads, password } = req.body || {};
  
  if (!providerId || !bucket || !objectPath) {
    return res.status(400).json({ error: 'providerId, bucket, and objectPath are required' });
  }
  
  try {
    // Check permission
    if (!req.user.is_admin) {
      const canShare = await checkBucketPermission(req.user.id, providerId, bucket, 'share');
      if (!canShare) {
        return res.status(403).json({ error: 'Share not allowed' });
      }
    }
    
    const shareToken = generateShareToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    
    let passwordHash = null;
    if (password) {
      const bcrypt = await import('bcryptjs');
      passwordHash = bcrypt.default.hashSync(password, 10);
    }
    
    const result = await runReturning(`
      INSERT INTO shared_links (
        share_token, created_by, provider_id, bucket_name, object_path, 
        is_folder, shared_with_email, can_download, can_view, expires_at, 
        max_downloads, password_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)
    `, [
      shareToken, req.user.id, providerId, bucket, objectPath,
      isFolder || false, sharedWithEmail || null, canDownload, expiresAt,
      maxDownloads || null, passwordHash
    ]);
    
    // TODO: Send email notification if sharedWithEmail is provided
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const shareUrl = `${baseUrl}/share/${shareToken}`;
    
    res.json({ 
      id: result.id,
      shareToken,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user's shared links
router.get('/share/my-links', requireAuth, async (req, res) => {
  try {
    const links = await query(`
      SELECT sl.*, cp.name as provider_name
      FROM shared_links sl
      LEFT JOIN cloud_providers cp ON sl.provider_id = cp.id
      WHERE sl.created_by = ?
      ORDER BY sl.created_at DESC
    `, [req.user.id]);
    
    res.json({ links });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a share link
router.delete('/share/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  
  try {
    const link = await queryOne('SELECT * FROM shared_links WHERE id = ?', [id]);
    if (!link) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    
    // Only creator or admin can delete
    if (link.created_by !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await run('DELETE FROM shared_links WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Access a shared link (public endpoint)
router.get('/s/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;
  
  try {
    const link = await queryOne(`
      SELECT sl.*, cp.name as provider_name, u.username as created_by_username
      FROM shared_links sl
      LEFT JOIN cloud_providers cp ON sl.provider_id = cp.id
      LEFT JOIN users u ON sl.created_by = u.id
      WHERE sl.share_token = ?
    `, [token]);
    
    if (!link) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }
    
    // Check expiry
    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }
    
    // Check max downloads
    if (link.max_downloads && link.download_count >= link.max_downloads) {
      return res.status(410).json({ error: 'Download limit reached' });
    }
    
    // Check password if required
    if (link.password_hash) {
      if (!password) {
        return res.json({ 
          requiresPassword: true,
          fileName: link.object_path.split('/').pop(),
          isFolder: link.is_folder,
        });
      }
      
      const bcrypt = await import('bcryptjs');
      if (!bcrypt.default.compareSync(password, link.password_hash)) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }
    
    // Return share info
    res.json({
      fileName: link.object_path.split('/').pop(),
      objectPath: link.object_path,
      bucket: link.bucket_name,
      isFolder: link.is_folder,
      canDownload: link.can_download,
      canView: link.can_view,
      createdBy: link.created_by_username,
      expiresAt: link.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download from shared link
router.get('/s/:token/download', async (req, res) => {
  const { token } = req.params;
  const { password, path: subPath } = req.query;
  
  try {
    const link = await queryOne('SELECT * FROM shared_links WHERE share_token = ?', [token]);
    
    if (!link) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    
    // Validate
    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }
    
    if (!link.can_download) {
      return res.status(403).json({ error: 'Download not allowed' });
    }
    
    if (link.max_downloads && link.download_count >= link.max_downloads) {
      return res.status(410).json({ error: 'Download limit reached' });
    }
    
    // Check password
    if (link.password_hash) {
      if (!password) {
        return res.status(401).json({ error: 'Password required' });
      }
      const bcrypt = await import('bcryptjs');
      if (!bcrypt.default.compareSync(password, link.password_hash)) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }
    
    // Get download URL
    const provider = await getProviderInstance(link.provider_id);
    let objectPath = link.object_path;
    
    // For folder shares, allow downloading files within the folder
    if (link.is_folder && subPath) {
      // Ensure subPath is within the shared folder
      if (!subPath.startsWith(link.object_path)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      objectPath = subPath;
    }
    
    const downloadUrl = await provider.getSignedDownloadUrl(link.bucket_name, objectPath, 3600);
    
    // Increment download count
    await run('UPDATE shared_links SET download_count = download_count + 1 WHERE id = ?', [link.id]);
    
    // Log access
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await run(`
      INSERT INTO share_access_logs (share_id, ip_address, action)
      VALUES (?, ?, 'download')
    `, [link.id, ip]);
    
    res.json({ downloadUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List files in shared folder
router.get('/s/:token/files', async (req, res) => {
  const { token } = req.params;
  const { password, prefix = '' } = req.query;
  
  try {
    const link = await queryOne('SELECT * FROM shared_links WHERE share_token = ?', [token]);
    
    if (!link || !link.is_folder) {
      return res.status(404).json({ error: 'Share link not found or not a folder' });
    }
    
    // Validate
    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }
    
    // Check password
    if (link.password_hash) {
      if (!password) {
        return res.status(401).json({ error: 'Password required' });
      }
      const bcrypt = await import('bcryptjs');
      if (!bcrypt.default.compareSync(password, link.password_hash)) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }
    
    // List files within the shared folder
    const provider = await getProviderInstance(link.provider_id);
    const fullPrefix = prefix ? `${link.object_path}${prefix}` : link.object_path;
    
    // Ensure we're still within the shared folder
    if (!fullPrefix.startsWith(link.object_path)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await provider.listObjects(link.bucket_name, fullPrefix, {
      maxResults: 100,
      delimiter: '/',
    });
    
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ BUCKET PERMISSIONS (Admin) ============

// Get user's bucket permissions
router.get('/admin/users/:userId/bucket-permissions', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  
  try {
    const permissions = await query(`
      SELECT bp.*, cp.name as provider_name
      FROM bucket_permissions bp
      LEFT JOIN cloud_providers cp ON bp.provider_id = cp.id
      WHERE bp.user_id = ?
    `, [userId]);
    
    res.json({ permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set bucket permissions for a user
router.put('/admin/users/:userId/bucket-permissions', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const { permissions } = req.body || {};
  
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions array is required' });
  }
  
  try {
    // Delete existing permissions
    await run('DELETE FROM bucket_permissions WHERE user_id = ?', [userId]);
    
    // Insert new permissions
    for (const perm of permissions) {
      if (!perm.provider_id || !perm.bucket_name) continue;
      
      await run(`
        INSERT INTO bucket_permissions (
          user_id, provider_id, bucket_name, 
          can_view, can_upload, can_download, can_delete, can_share, can_edit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, perm.provider_id, perm.bucket_name,
        perm.can_view ?? false,
        perm.can_upload ?? false,
        perm.can_download ?? false,
        perm.can_delete ?? false,
        perm.can_share ?? false,
        perm.can_edit ?? false,
      ]);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ PERMISSION GROUPS (Admin) ============

// Get all groups
router.get('/admin/groups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const groups = await query(`
      SELECT g.*, 
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
        (SELECT COUNT(*) FROM group_bucket_permissions WHERE group_id = g.id) as bucket_count
      FROM permission_groups g
      ORDER BY g.name
    `);
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single group with details
router.get('/admin/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  try {
    const group = await queryOne('SELECT * FROM permission_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Get members
    const members = await query(`
      SELECT u.id, u.username, gm.created_at as joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY u.username
    `, [groupId]);
    
    // Get bucket permissions
    const permissions = await query(`
      SELECT gbp.*, cp.name as provider_name, cp.type as provider_type
      FROM group_bucket_permissions gbp
      LEFT JOIN cloud_providers cp ON gbp.provider_id = cp.id
      WHERE gbp.group_id = ?
      ORDER BY cp.name, gbp.bucket_name
    `, [groupId]);
    
    res.json({ group, members, permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create group
router.post('/admin/groups', requireAuth, requireAdmin, async (req, res) => {
  const { name, description, color } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }
  
  try {
    const result = await run(`
      INSERT INTO permission_groups (name, description, color)
      VALUES (?, ?, ?)
      RETURNING id
    `, [name.trim(), description || '', color || '#6366f1']);
    
    res.json({ id: result.id, message: 'Group created' });
  } catch (e) {
    if (e.message.includes('unique') || e.message.includes('duplicate')) {
      return res.status(400).json({ error: 'A group with this name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Update group
router.patch('/admin/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  const { name, description, color } = req.body;
  
  try {
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(groupId);
    
    await run(`UPDATE permission_groups SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('unique') || e.message.includes('duplicate')) {
      return res.status(400).json({ error: 'A group with this name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Delete group
router.delete('/admin/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  try {
    await run('DELETE FROM permission_groups WHERE id = ?', [groupId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add members to group
router.post('/admin/groups/:id/members', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  const { userIds } = req.body;
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  
  try {
    for (const userId of userIds) {
      await run(`
        INSERT INTO group_members (group_id, user_id)
        VALUES (?, ?)
        ON CONFLICT (group_id, user_id) DO NOTHING
      `, [groupId, Number(userId)]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove member from group
router.delete('/admin/groups/:id/members/:userId', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.params.userId);
  
  try {
    await run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set group's bucket permissions (replaces all)
router.put('/admin/groups/:id/permissions', requireAuth, requireAdmin, async (req, res) => {
  const groupId = Number(req.params.id);
  const { permissions } = req.body;
  
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions array is required' });
  }
  
  try {
    // Delete existing permissions
    await run('DELETE FROM group_bucket_permissions WHERE group_id = ?', [groupId]);
    
    // Insert new permissions
    for (const perm of permissions) {
      if (!perm.provider_id || !perm.bucket_name) continue;
      
      await run(`
        INSERT INTO group_bucket_permissions (
          group_id, provider_id, bucket_name,
          can_view, can_upload, can_download, can_delete, can_share, can_edit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        groupId, perm.provider_id, perm.bucket_name,
        perm.can_view ?? false,
        perm.can_upload ?? false,
        perm.can_download ?? false,
        perm.can_delete ?? false,
        perm.can_share ?? false,
        perm.can_edit ?? false,
      ]);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user's groups
router.get('/admin/users/:userId/groups', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  try {
    const groups = await query(`
      SELECT g.* FROM permission_groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY g.name
    `, [userId]);
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set user's groups (replaces all)
router.put('/admin/users/:userId/groups', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const { groupIds } = req.body;
  
  if (!Array.isArray(groupIds)) {
    return res.status(400).json({ error: 'groupIds array is required' });
  }
  
  try {
    // Delete existing memberships
    await run('DELETE FROM group_members WHERE user_id = ?', [userId]);
    
    // Add new memberships
    for (const groupId of groupIds) {
      await run(`
        INSERT INTO group_members (group_id, user_id)
        VALUES (?, ?)
      `, [Number(groupId), userId]);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ APP SETTINGS (Admin) ============

router.get('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({ settings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const { settings } = req.body || {};
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object is required' });
  }
  
  try {
    for (const [key, value] of Object.entries(settings)) {
      // Encrypt sensitive settings
      if (key.includes('password') || key.includes('secret') || key.includes('key')) {
        await setSetting(key, encrypt(String(value)));
      } else {
        await setSetting(key, String(value));
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ COST ANALYTICS ============

// Cloud provider pricing (approximate, per GB)
const PRICING = {
  gcp: {
    storage_per_gb_month: 0.020,  // Standard storage
    egress_per_gb: 0.12,          // Network egress
    ingress_per_gb: 0.00,         // Ingress is free
    class_a_ops_per_10k: 0.05,    // PUT, COPY, POST
    class_b_ops_per_10k: 0.004,   // GET, HEAD
  },
  aws: {
    storage_per_gb_month: 0.023,
    egress_per_gb: 0.09,
    ingress_per_gb: 0.00,
    class_a_ops_per_10k: 0.05,
    class_b_ops_per_10k: 0.004,
  },
  azure: {
    storage_per_gb_month: 0.018,
    egress_per_gb: 0.087,
    ingress_per_gb: 0.00,
    class_a_ops_per_10k: 0.065,
    class_b_ops_per_10k: 0.005,
  },
  oracle: {
    storage_per_gb_month: 0.0255,
    egress_per_gb: 0.0085,
    ingress_per_gb: 0.00,
    class_a_ops_per_10k: 0.004,
    class_b_ops_per_10k: 0.0004,
  },
  s3_compatible: {
    storage_per_gb_month: 0.02,
    egress_per_gb: 0.05,
    ingress_per_gb: 0.00,
    class_a_ops_per_10k: 0.04,
    class_b_ops_per_10k: 0.004,
  },
};

// Get cost analytics
router.get('/admin/costs', requireAuth, requireCostAccess, async (req, res) => {
  const { providerId, bucket, dateFrom, dateTo } = req.query;
  
  try {
    // Get providers
    const providers = await getAllProviders();
    const providerMap = {};
    for (const p of providers) {
      providerMap[p.id] = p;
    }
    
    // Get cached bucket sizes from database (fast!)
    const cachedSizes = await query(`
      SELECT provider_id, bucket_name, size_bytes, object_count, last_calculated, is_calculating
      FROM bucket_size_cache
    `);
    const bucketSizeCache = {};
    for (const row of cachedSizes) {
      bucketSizeCache[`${row.provider_id}-${row.bucket_name}`] = {
        size: Number(row.size_bytes),
        objectCount: Number(row.object_count),
        lastCalculated: row.last_calculated,
        isCalculating: row.is_calculating,
      };
    }
    
    // ========== UPLOADS (Ingress) ==========
    let uploadSql = `
      SELECT 
        provider_id,
        bucket,
        upload_source,
        DATE(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(file_size), 0) as total_bytes
      FROM upload_logs
      WHERE status = 'success'
    `;
    const uploadParams = [];
    
    if (providerId) {
      uploadSql += ' AND provider_id = ?';
      uploadParams.push(Number(providerId));
    }
    if (bucket) {
      uploadSql += ' AND bucket = ?';
      uploadParams.push(bucket);
    }
    if (dateFrom) {
      uploadSql += ' AND DATE(created_at) >= ?';
      uploadParams.push(dateFrom);
    }
    if (dateTo) {
      uploadSql += ' AND DATE(created_at) <= ?';
      uploadParams.push(dateTo);
    }
    uploadSql += ' GROUP BY provider_id, bucket, upload_source, DATE(created_at) ORDER BY date DESC';
    
    const uploads = await query(uploadSql, uploadParams);
    
    // ========== DOWNLOADS (Egress) ==========
    let downloadSql = `
      SELECT 
        provider_id,
        bucket,
        download_source,
        DATE(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(file_size), 0) as total_bytes
      FROM download_logs
      WHERE 1=1
    `;
    const downloadParams = [];
    
    if (providerId) {
      downloadSql += ' AND provider_id = ?';
      downloadParams.push(Number(providerId));
    }
    if (bucket) {
      downloadSql += ' AND bucket = ?';
      downloadParams.push(bucket);
    }
    if (dateFrom) {
      downloadSql += ' AND DATE(created_at) >= ?';
      downloadParams.push(dateFrom);
    }
    if (dateTo) {
      downloadSql += ' AND DATE(created_at) <= ?';
      downloadParams.push(dateTo);
    }
    downloadSql += ' GROUP BY provider_id, bucket, download_source, DATE(created_at) ORDER BY date DESC';
    
    const downloads = await query(downloadSql, downloadParams);
    
    // ========== Calculate costs ==========
    
    // Upload costs (ingress + operations)
    const uploadCosts = uploads.map(row => {
      const provider = providerMap[row.provider_id];
      const providerType = provider?.type || 'gcp';
      const pricing = PRICING[providerType] || PRICING.gcp;
      
      const sizeGB = Number(row.total_bytes) / (1024 * 1024 * 1024);
      const ingressCost = sizeGB * pricing.ingress_per_gb;
      const opsCost = (Number(row.count) / 10000) * pricing.class_a_ops_per_10k;
      
      return {
        ...row,
        provider_name: provider?.name || 'Unknown',
        provider_type: providerType,
        size_gb: sizeGB,
        ingress_cost: ingressCost,
        operations_cost: opsCost,
        total_cost: ingressCost + opsCost,
        type: 'upload',
      };
    });
    
    // Download costs (egress + operations)
    const downloadCosts = downloads.map(row => {
      const provider = providerMap[row.provider_id];
      const providerType = provider?.type || 'gcp';
      const pricing = PRICING[providerType] || PRICING.gcp;
      
      const sizeGB = Number(row.total_bytes) / (1024 * 1024 * 1024);
      const egressCost = sizeGB * pricing.egress_per_gb;
      const opsCost = (Number(row.count) / 10000) * pricing.class_b_ops_per_10k;
      
      return {
        ...row,
        provider_name: provider?.name || 'Unknown',
        provider_type: providerType,
        size_gb: sizeGB,
        egress_cost: egressCost,
        operations_cost: opsCost,
        total_cost: egressCost + opsCost,
        type: 'download',
      };
    });
    
    // ========== Aggregate by bucket ==========
    const byBucket = {};
    
    for (const row of uploadCosts) {
      const key = `${row.provider_id}-${row.bucket}`;
      if (!byBucket[key]) {
        byBucket[key] = {
          provider_id: row.provider_id,
          provider_name: row.provider_name,
          provider_type: row.provider_type,
          bucket: row.bucket,
          upload_bytes: 0,
          upload_count: 0,
          upload_cost: 0,
          cloudvault_upload_bytes: 0,
          cloudvault_upload_count: 0,
          cloud_upload_bytes: 0,
          cloud_upload_count: 0,
          download_bytes: 0,
          download_count: 0,
          download_cost: 0,
          cloudvault_download_bytes: 0,
          cloudvault_download_count: 0,
          cloud_download_bytes: 0,
          cloud_download_count: 0,
        };
      }
      byBucket[key].upload_bytes += Number(row.total_bytes);
      byBucket[key].upload_count += Number(row.count);
      byBucket[key].upload_cost += row.total_cost;
      
      if (row.upload_source === 'cloudvault') {
        byBucket[key].cloudvault_upload_bytes += Number(row.total_bytes);
        byBucket[key].cloudvault_upload_count += Number(row.count);
      } else {
        byBucket[key].cloud_upload_bytes += Number(row.total_bytes);
        byBucket[key].cloud_upload_count += Number(row.count);
      }
    }
    
    for (const row of downloadCosts) {
      const key = `${row.provider_id}-${row.bucket}`;
      if (!byBucket[key]) {
        byBucket[key] = {
          provider_id: row.provider_id,
          provider_name: row.provider_name,
          provider_type: row.provider_type,
          bucket: row.bucket,
          upload_bytes: 0,
          upload_count: 0,
          upload_cost: 0,
          cloudvault_upload_bytes: 0,
          cloudvault_upload_count: 0,
          cloud_upload_bytes: 0,
          cloud_upload_count: 0,
          download_bytes: 0,
          download_count: 0,
          download_cost: 0,
          cloudvault_download_bytes: 0,
          cloudvault_download_count: 0,
          cloud_download_bytes: 0,
          cloud_download_count: 0,
        };
      }
      byBucket[key].download_bytes += Number(row.total_bytes);
      byBucket[key].download_count += Number(row.count);
      byBucket[key].download_cost += row.total_cost;
      
      if (row.download_source === 'cloudvault') {
        byBucket[key].cloudvault_download_bytes += Number(row.total_bytes);
        byBucket[key].cloudvault_download_count += Number(row.count);
      } else {
        byBucket[key].cloud_download_bytes += Number(row.total_bytes);
        byBucket[key].cloud_download_count += Number(row.count);
      }
    }
    
    // Calculate storage cost using cached bucket sizes (real sizes from cloud)
    let totalStorageBytes = 0;
    for (const key of Object.keys(byBucket)) {
      const b = byBucket[key];
      const pricing = PRICING[b.provider_type] || PRICING.gcp;
      
      // Use cached bucket size if available, otherwise fall back to upload bytes
      const cached = bucketSizeCache[key];
      const storageBytes = cached?.size || b.upload_bytes;
      const objectCount = cached?.objectCount || 0;
      
      const storageGB = storageBytes / (1024 * 1024 * 1024);
      b.storage_bytes = storageBytes;
      b.storage_gb = storageGB;
      b.object_count = objectCount;
      b.last_calculated = cached?.lastCalculated || null;
      b.is_calculating = cached?.isCalculating || false;
      b.has_cached_size = !!cached;
      b.storage_cost_monthly = storageGB * pricing.storage_per_gb_month;
      b.storage_cost_daily = b.storage_cost_monthly / 30;
      b.total_cost = b.upload_cost + b.download_cost + b.storage_cost_monthly;
      
      totalStorageBytes += storageBytes;
    }
    
    // Also add buckets that have cached sizes but no upload/download activity
    for (const [key, cached] of Object.entries(bucketSizeCache)) {
      if (!byBucket[key]) {
        const [provId, ...bucketParts] = key.split('-');
        const bucketName = bucketParts.join('-');
        const provider = providerMap[Number(provId)];
        
        // Skip if filtering by provider/bucket
        if (providerId && Number(providerId) !== Number(provId)) continue;
        if (bucket && bucket !== bucketName) continue;
        
        const pricing = PRICING[provider?.type || 'gcp'] || PRICING.gcp;
        const storageGB = cached.size / (1024 * 1024 * 1024);
        
        byBucket[key] = {
          provider_id: Number(provId),
          provider_name: provider?.name || 'Unknown',
          provider_type: provider?.type || 'gcp',
          bucket: bucketName,
          upload_bytes: 0,
          upload_count: 0,
          upload_cost: 0,
          cloudvault_upload_bytes: 0,
          cloudvault_upload_count: 0,
          cloud_upload_bytes: 0,
          cloud_upload_count: 0,
          download_bytes: 0,
          download_count: 0,
          download_cost: 0,
          cloudvault_download_bytes: 0,
          cloudvault_download_count: 0,
          cloud_download_bytes: 0,
          cloud_download_count: 0,
          storage_bytes: cached.size,
          storage_gb: storageGB,
          object_count: cached.objectCount,
          last_calculated: cached.lastCalculated,
          is_calculating: cached.isCalculating,
          has_cached_size: true,
          storage_cost_monthly: storageGB * pricing.storage_per_gb_month,
          storage_cost_daily: (storageGB * pricing.storage_per_gb_month) / 30,
          total_cost: storageGB * pricing.storage_per_gb_month,
        };
        
        totalStorageBytes += cached.size;
      }
    }
    
    // ========== Summary ==========
    // Filtered summary (based on date range for uploads/downloads)
    const filteredUploadBytes = uploadCosts.reduce((sum, r) => sum + Number(r.total_bytes), 0);
    const filteredUploadCount = uploadCosts.reduce((sum, r) => sum + Number(r.count), 0);
    const filteredUploadCost = uploadCosts.reduce((sum, r) => sum + r.total_cost, 0);
    const filteredDownloadBytes = downloadCosts.reduce((sum, r) => sum + Number(r.total_bytes), 0);
    const filteredDownloadCount = downloadCosts.reduce((sum, r) => sum + Number(r.count), 0);
    const filteredDownloadCost = downloadCosts.reduce((sum, r) => sum + r.total_cost, 0);
    
    // Current storage (always shows current state, not filtered)
    const currentStorageBytes = totalStorageBytes;
    const currentStorageCostMonthly = Object.values(byBucket).reduce((sum, b) => sum + b.storage_cost_monthly, 0);
    
    const summary = {
      // Current storage (always current, not filtered by date)
      total_storage_bytes: currentStorageBytes,
      total_storage_cost_monthly: currentStorageCostMonthly,
      
      // Filtered activity (respects date filter)
      total_upload_bytes: filteredUploadBytes,
      total_upload_count: filteredUploadCount,
      total_upload_cost: filteredUploadCost,
      cloudvault_upload_bytes: uploadCosts.filter(r => r.upload_source === 'cloudvault').reduce((sum, r) => sum + Number(r.total_bytes), 0),
      cloudvault_upload_count: uploadCosts.filter(r => r.upload_source === 'cloudvault').reduce((sum, r) => sum + Number(r.count), 0),
      total_download_bytes: filteredDownloadBytes,
      total_download_count: filteredDownloadCount,
      total_download_cost: filteredDownloadCost,
      cloudvault_download_bytes: downloadCosts.filter(r => r.download_source === 'cloudvault').reduce((sum, r) => sum + Number(r.total_bytes), 0),
      cloudvault_download_count: downloadCosts.filter(r => r.download_source === 'cloudvault').reduce((sum, r) => sum + Number(r.count), 0),
      
      // Activity cost (filtered) vs Storage cost (current)
      activity_cost: filteredUploadCost + filteredDownloadCost,
      
      // Whether date filter is applied
      is_filtered: !!(dateFrom || dateTo),
    };
    // Total cost = storage (monthly, current) + activity (filtered period)
    summary.total_cost = summary.total_storage_cost_monthly + summary.activity_cost;
    
    // ========== Recent activity (for chart) ==========
    const dailyUploads = {};
    const dailyDownloads = {};
    
    for (const row of uploadCosts) {
      const date = row.date;
      if (!dailyUploads[date]) dailyUploads[date] = { date, bytes: 0, count: 0, cost: 0 };
      dailyUploads[date].bytes += Number(row.total_bytes);
      dailyUploads[date].count += Number(row.count);
      dailyUploads[date].cost += row.total_cost;
    }
    
    for (const row of downloadCosts) {
      const date = row.date;
      if (!dailyDownloads[date]) dailyDownloads[date] = { date, bytes: 0, count: 0, cost: 0 };
      dailyDownloads[date].bytes += Number(row.total_bytes);
      dailyDownloads[date].count += Number(row.count);
      dailyDownloads[date].cost += row.total_cost;
    }
    
    // ========== Storage history from snapshots ==========
    // Get historical storage snapshots (total across all buckets per day)
    let storageHistorySql = `
      SELECT 
        snapshot_date as date,
        SUM(size_bytes) as total_bytes,
        SUM(object_count) as total_objects
      FROM storage_history
      WHERE 1=1
    `;
    const historyParams = [];
    
    if (providerId) {
      storageHistorySql += ' AND provider_id = ?';
      historyParams.push(Number(providerId));
    }
    if (bucket) {
      storageHistorySql += ' AND bucket_name = ?';
      historyParams.push(bucket);
    }
    if (dateFrom) {
      storageHistorySql += ' AND snapshot_date >= ?';
      historyParams.push(dateFrom);
    }
    if (dateTo) {
      storageHistorySql += ' AND snapshot_date <= ?';
      historyParams.push(dateTo);
    }
    storageHistorySql += ' GROUP BY snapshot_date ORDER BY snapshot_date ASC';
    
    const storageHistoryRows = await query(storageHistorySql, historyParams);
    const storageHistory = storageHistoryRows.map(row => ({
      date: row.date,
      total_bytes: Number(row.total_bytes),
      total_objects: Number(row.total_objects),
    }));
    
    // ========== Cumulative uploads over time (via CloudVault) ==========
    // Get all uploads grouped by date to show upload growth
    const uploadGrowth = await query(`
      SELECT 
        DATE(created_at) as date,
        SUM(file_size) as daily_bytes,
        COUNT(*) as daily_count
      FROM upload_logs
      WHERE status = 'success'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // Calculate cumulative uploads
    let cumulativeBytes = 0;
    const cumulativeStorage = uploadGrowth.map(row => {
      cumulativeBytes += Number(row.daily_bytes);
      return {
        date: row.date,
        daily_bytes: Number(row.daily_bytes),
        cumulative_bytes: cumulativeBytes,
        daily_count: Number(row.daily_count),
      };
    });
    
    // ========== Recent file-level activity ==========
    const recentUploads = await query(`
      SELECT id, username, bucket, file_name, file_size, upload_source, provider_name, created_at
      FROM upload_logs
      WHERE status = 'success'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    const recentDownloads = await query(`
      SELECT id, username, bucket, file_name, file_size, download_source, provider_name, created_at
      FROM download_logs
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    // Add cost to recent items
    const recentUploadsWithCost = recentUploads.map(row => {
      const provider = providers.find(p => p.name === row.provider_name);
      const providerType = provider?.type || 'gcp';
      const pricing = PRICING[providerType] || PRICING.gcp;
      const sizeGB = Number(row.file_size) / (1024 * 1024 * 1024);
      return {
        ...row,
        size_gb: sizeGB,
        ingress_cost: sizeGB * pricing.ingress_per_gb,
        operation_cost: pricing.class_a_ops_per_10k / 10000,
      };
    });
    
    const recentDownloadsWithCost = recentDownloads.map(row => {
      const provider = providers.find(p => p.name === row.provider_name);
      const providerType = provider?.type || 'gcp';
      const pricing = PRICING[providerType] || PRICING.gcp;
      const sizeGB = Number(row.file_size) / (1024 * 1024 * 1024);
      return {
        ...row,
        size_gb: sizeGB,
        egress_cost: sizeGB * pricing.egress_per_gb,
        operation_cost: pricing.class_b_ops_per_10k / 10000,
      };
    });
    
    res.json({
      byBucket: Object.values(byBucket),
      summary,
      dailyUploads: Object.values(dailyUploads).sort((a, b) => new Date(a.date) - new Date(b.date)),
      dailyDownloads: Object.values(dailyDownloads).sort((a, b) => new Date(a.date) - new Date(b.date)),
      storageGrowth: cumulativeStorage,
      storageHistory: storageHistory,
      recentUploads: recentUploadsWithCost,
      recentDownloads: recentDownloadsWithCost,
      pricing: PRICING,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ BUCKET SIZE CALCULATION ============

// Calculate bucket size in background and cache it
async function calculateBucketSize(providerId, bucketName) {
  try {
    // Mark as calculating
    await run(`
      INSERT INTO bucket_size_cache (provider_id, bucket_name, is_calculating)
      VALUES (?, ?, TRUE)
      ON CONFLICT (provider_id, bucket_name) 
      DO UPDATE SET is_calculating = TRUE
    `, [providerId, bucketName]);
    
    const cloudProvider = await getProviderInstance(Number(providerId));
    
    let totalSize = 0;
    let objectCount = 0;
    let pageToken = null;
    
    // Track storage by date (based on file creation/upload time)
    const storageByDate = {}; // { 'YYYY-MM-DD': { bytes: 0, count: 0 } }
    
    // List all objects
    do {
      const result = await cloudProvider.listObjects(bucketName, '', { 
        delimiter: null,
        maxResults: 1000,
        pageToken 
      });
      
      for (const file of result.files || []) {
        const fileSize = Number(file.size || 0);
        totalSize += fileSize;
        objectCount++;
        
        // Get file creation date (use created or updated)
        const fileDate = file.created || file.updated;
        if (fileDate) {
          const dateStr = new Date(fileDate).toISOString().split('T')[0];
          if (!storageByDate[dateStr]) {
            storageByDate[dateStr] = { bytes: 0, count: 0 };
          }
          storageByDate[dateStr].bytes += fileSize;
          storageByDate[dateStr].count += 1;
        }
      }
      
      pageToken = result.nextPageToken;
    } while (pageToken);
    
    // Update cache with results
    await run(`
      INSERT INTO bucket_size_cache (provider_id, bucket_name, size_bytes, object_count, last_calculated, is_calculating)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, FALSE)
      ON CONFLICT (provider_id, bucket_name) 
      DO UPDATE SET size_bytes = ?, object_count = ?, last_calculated = CURRENT_TIMESTAMP, is_calculating = FALSE
    `, [providerId, bucketName, totalSize, objectCount, totalSize, objectCount]);
    
    // Build cumulative storage history from file dates
    // Sort dates and calculate cumulative storage at each date
    const sortedDates = Object.keys(storageByDate).sort();
    let cumulativeBytes = 0;
    let cumulativeCount = 0;
    
    for (const dateStr of sortedDates) {
      cumulativeBytes += storageByDate[dateStr].bytes;
      cumulativeCount += storageByDate[dateStr].count;
      
      // Save cumulative storage for this date
      await run(`
        INSERT INTO storage_history (provider_id, bucket_name, size_bytes, object_count, snapshot_date)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (provider_id, bucket_name, snapshot_date) 
        DO UPDATE SET size_bytes = ?, object_count = ?
      `, [providerId, bucketName, cumulativeBytes, cumulativeCount, dateStr, cumulativeBytes, cumulativeCount]);
    }
    
    return { size: totalSize, objectCount };
  } catch (e) {
    // Mark as not calculating on error
    await run(`
      UPDATE bucket_size_cache SET is_calculating = FALSE 
      WHERE provider_id = ? AND bucket_name = ?
    `, [providerId, bucketName]);
    throw e;
  }
}

// Refresh a single bucket's size
router.post('/admin/bucket-size/refresh', requireAuth, requireCostAccess, async (req, res) => {
  const { providerId, bucket } = req.body;
  
  if (!providerId || !bucket) {
    return res.status(400).json({ error: 'providerId and bucket are required' });
  }
  
  try {
    // Start calculation in background
    calculateBucketSize(providerId, bucket).catch(e => {
      console.error(`Failed to calculate size for ${bucket}:`, e.message);
    });
    
    res.json({ message: 'Calculation started', bucket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refresh ALL bucket sizes (runs in background)
router.post('/admin/bucket-size/refresh-all', requireAuth, requireCostAccess, async (req, res) => {
  try {
    const providers = await getAllProviders();
    let bucketsQueued = 0;
    
    for (const provider of providers.filter(p => p.is_active)) {
      try {
        const cloudProvider = await getProviderInstance(provider.id);
        const buckets = await cloudProvider.listBuckets();
        
        for (const b of buckets) {
          const bucketName = typeof b === 'string' ? b : b.name;
          
          // Start calculation in background (don't await)
          calculateBucketSize(provider.id, bucketName).catch(e => {
            console.error(`Failed to calculate size for ${bucketName}:`, e.message);
          });
          
          bucketsQueued++;
        }
      } catch (e) {
        console.error(`Failed to list buckets for provider ${provider.name}:`, e.message);
      }
    }
    
    res.json({ message: `Started calculating sizes for ${bucketsQueued} buckets` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get calculation status
router.get('/admin/bucket-size/status', requireAuth, requireCostAccess, async (req, res) => {
  try {
    const status = await query(`
      SELECT provider_id, bucket_name, size_bytes, object_count, last_calculated, is_calculating
      FROM bucket_size_cache
      ORDER BY last_calculated DESC NULLS LAST
    `);
    
    const calculating = status.filter(s => s.is_calculating).length;
    const completed = status.filter(s => !s.is_calculating && s.last_calculated).length;
    
    res.json({
      total: status.length,
      calculating,
      completed,
      buckets: status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ ADMIN SHARED LINKS ============

router.get('/admin/shares', requireAuth, requireAdmin, async (req, res) => {
  try {
    const links = await query(`
      SELECT sl.*, cp.name as provider_name, u.username as created_by_username
      FROM shared_links sl
      LEFT JOIN cloud_providers cp ON sl.provider_id = cp.id
      LEFT JOIN users u ON sl.created_by = u.id
      ORDER BY sl.created_at DESC
      LIMIT 100
    `);
    
    res.json({ links });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

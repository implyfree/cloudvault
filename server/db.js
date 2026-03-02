import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

// Encryption key for credentials
// ENCRYPTION_KEY should be a 64-character hex string (32 bytes when decoded)
// If provided as hex string, convert to Buffer; otherwise derive from JWT_SECRET
function deriveEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    // Check if it's a valid 64-character hex string
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    // If it's exactly 32 bytes, use as-is
    if (envKey.length === 32) {
      return Buffer.from(envKey, 'utf8');
    }
    // Otherwise, hash it to get 32 bytes
    console.warn('ENCRYPTION_KEY is not a valid 64-char hex string, hashing it to derive key');
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Fallback: derive from JWT_SECRET
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-key-change-me').digest();
}

// The active encryption key — starts as env-derived, but will be
// replaced with the DB-persisted key once initDb() runs.
let ENCRYPTION_KEY = deriveEncryptionKey();
const IV_LENGTH = 16;

/**
 * Called during initDb() to persist the encryption key in the database.
 * This ensures the SAME key survives across server/pod restarts even if
 * the JWT_SECRET env var changes.
 */
export async function initEncryptionKey(client) {
  try {
    // Check if a key is already stored in the database
    const result = await client.query(
      "SELECT value FROM app_settings WHERE key = 'encryption_key_hex'"
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      // Use the stored key
      const storedHex = result.rows[0].value;
      ENCRYPTION_KEY = Buffer.from(storedHex, 'hex');
      console.log('Loaded encryption key from database');
    } else {
      // First startup: persist the current derived key
      const keyHex = ENCRYPTION_KEY.toString('hex');
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('encryption_key_hex', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [keyHex]
      );
      console.log('Stored encryption key in database for persistence across restarts');
    }
  } catch (e) {
    console.warn('Could not persist encryption key (app_settings may not exist yet):', e.message);
    // This is fine — we'll use the env-derived key
  }
}

export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text) {
  if (!text) return null;
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

// PostgreSQL connection pool
let pool = null;

const DATABASE_URL = process.env.DATABASE_URL;

export async function initDb() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required. Example: postgresql://user:password@localhost:5432/dbname');
  }

  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : (DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection and create tables
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        is_cost_manager BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS cloud_providers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        config TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_providers_type ON cloud_providers(type);
      
      CREATE TABLE IF NOT EXISTS user_buckets (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        provider_id INTEGER REFERENCES cloud_providers(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, bucket_name, provider_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_buckets_user ON user_buckets(user_id);
      
      CREATE TABLE IF NOT EXISTS user_providers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, provider_id)
      );
      
      CREATE TABLE IF NOT EXISTS upload_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username VARCHAR(255) NOT NULL,
        bucket VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        content_type VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'success',
        error_message TEXT,
        ip_address VARCHAR(50),
        provider_id INTEGER,
        provider_name VARCHAR(255),
        upload_source VARCHAR(50) DEFAULT 'cloudvault',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_upload_logs_user ON upload_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_upload_logs_date ON upload_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_upload_logs_bucket ON upload_logs(bucket);

      -- Download logs for tracking egress
      CREATE TABLE IF NOT EXISTS download_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username VARCHAR(255),
        bucket VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        provider_id INTEGER,
        provider_name VARCHAR(255),
        download_source VARCHAR(50) DEFAULT 'cloudvault',
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_download_logs_user ON download_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_download_logs_date ON download_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_download_logs_bucket ON download_logs(bucket);

      -- Granular bucket permissions (view, edit, delete, share, download, upload)
      CREATE TABLE IF NOT EXISTS bucket_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        can_view BOOLEAN DEFAULT FALSE,
        can_upload BOOLEAN DEFAULT FALSE,
        can_download BOOLEAN DEFAULT FALSE,
        can_delete BOOLEAN DEFAULT FALSE,
        can_share BOOLEAN DEFAULT FALSE,
        can_edit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider_id, bucket_name)
      );
      CREATE INDEX IF NOT EXISTS idx_bucket_permissions_user ON bucket_permissions(user_id);

      -- Permission Groups (for bulk permission management)
      CREATE TABLE IF NOT EXISTS permission_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(20) DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Group members (users in groups)
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

      -- Group bucket permissions (permissions assigned to groups)
      CREATE TABLE IF NOT EXISTS group_bucket_permissions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        can_view BOOLEAN DEFAULT FALSE,
        can_upload BOOLEAN DEFAULT FALSE,
        can_download BOOLEAN DEFAULT FALSE,
        can_delete BOOLEAN DEFAULT FALSE,
        can_share BOOLEAN DEFAULT FALSE,
        can_edit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, provider_id, bucket_name)
      );
      CREATE INDEX IF NOT EXISTS idx_group_bucket_permissions_group ON group_bucket_permissions(group_id);

      -- Shared links for files/folders
      CREATE TABLE IF NOT EXISTS shared_links (
        id SERIAL PRIMARY KEY,
        share_token VARCHAR(64) UNIQUE NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        is_folder BOOLEAN DEFAULT FALSE,
        shared_with_email VARCHAR(255),
        can_download BOOLEAN DEFAULT TRUE,
        can_view BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP NOT NULL,
        max_downloads INTEGER,
        download_count INTEGER DEFAULT 0,
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(share_token);
      CREATE INDEX IF NOT EXISTS idx_shared_links_email ON shared_links(shared_with_email);

      -- Shared link access logs
      CREATE TABLE IF NOT EXISTS share_access_logs (
        id SERIAL PRIMARY KEY,
        share_id INTEGER NOT NULL REFERENCES shared_links(id) ON DELETE CASCADE,
        accessed_by_email VARCHAR(255),
        accessed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_address VARCHAR(50),
        action VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- App settings (SMTP, defaults, etc.)
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Cost tracking per bucket (estimated based on usage)
      CREATE TABLE IF NOT EXISTS bucket_usage (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        storage_bytes BIGINT DEFAULT 0,
        egress_bytes BIGINT DEFAULT 0,
        ingress_bytes BIGINT DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        UNIQUE(provider_id, bucket_name, date)
      );
      CREATE INDEX IF NOT EXISTS idx_bucket_usage_date ON bucket_usage(date);

      -- Cached bucket sizes (updated periodically or on-demand)
      CREATE TABLE IF NOT EXISTS bucket_size_cache (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        size_bytes BIGINT DEFAULT 0,
        object_count INTEGER DEFAULT 0,
        last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_calculating BOOLEAN DEFAULT FALSE,
        UNIQUE(provider_id, bucket_name)
      );
      CREATE INDEX IF NOT EXISTS idx_bucket_size_cache_provider ON bucket_size_cache(provider_id);
      
      -- Storage history snapshots (for historical graphs)
      CREATE TABLE IF NOT EXISTS storage_history (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        bucket_name VARCHAR(255) NOT NULL,
        size_bytes BIGINT DEFAULT 0,
        object_count INTEGER DEFAULT 0,
        snapshot_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider_id, bucket_name, snapshot_date)
      );
      CREATE INDEX IF NOT EXISTS idx_storage_history_date ON storage_history(snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_storage_history_bucket ON storage_history(provider_id, bucket_name);

      -- Upload jobs (background / resumable upload tracking)
      CREATE TABLE IF NOT EXISTS upload_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        provider_name VARCHAR(255) NOT NULL,
        bucket VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        content_type VARCHAR(255) DEFAULT 'application/octet-stream',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        bytes_uploaded BIGINT DEFAULT 0,
        progress_pct NUMERIC(5,2) DEFAULT 0,
        error_message TEXT,
        job_type VARCHAR(20) DEFAULT 'direct',
        source_url TEXT,
        resumable_session TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_upload_jobs_user ON upload_jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_upload_jobs_created ON upload_jobs(created_at DESC);
    `);

    // Create admin user if not exists
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    const existing = await client.query('SELECT 1 FROM users WHERE is_admin = TRUE LIMIT 1');
    if (existing.rows.length === 0) {
      const hash = bcrypt.hashSync(adminPassword, 10);
      await client.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE)',
        ['admin', hash]
      );
      console.log('Created admin user');
    }

    // Add upload_source column to upload_logs if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_logs' AND column_name='upload_source') THEN
          ALTER TABLE upload_logs ADD COLUMN upload_source VARCHAR(50) DEFAULT 'cloudvault';
        END IF;
      END $$;
    `);

    // Add is_cost_manager column to users if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_cost_manager') THEN
          ALTER TABLE users ADD COLUMN is_cost_manager BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Ensure upload_jobs table exists (migration for servers that started before this table was added)
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        provider_name VARCHAR(255) NOT NULL,
        bucket VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        content_type VARCHAR(255) DEFAULT 'application/octet-stream',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        bytes_uploaded BIGINT DEFAULT 0,
        progress_pct NUMERIC(5,2) DEFAULT 0,
        error_message TEXT,
        job_type VARCHAR(20) DEFAULT 'direct',
        source_url TEXT,
        resumable_session TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_user ON upload_jobs(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_created ON upload_jobs(created_at DESC)');

    // Persist encryption key in database so it survives pod/server restarts
    await initEncryptionKey(client);

    console.log('PostgreSQL database initialized');
  } finally {
    client.release();
  }

  return pool;
}

// Get the connection pool
export function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

// Ensure upload_jobs table exists (call before insert so jobs always work)
let uploadJobsTableChecked = false;
export async function ensureUploadJobsTable() {
  if (uploadJobsTableChecked) return;
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS upload_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        provider_id INTEGER NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
        provider_name VARCHAR(255) NOT NULL,
        bucket VARCHAR(255) NOT NULL,
        object_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        content_type VARCHAR(255) DEFAULT 'application/octet-stream',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        bytes_uploaded BIGINT DEFAULT 0,
        progress_pct NUMERIC(5,2) DEFAULT 0,
        error_message TEXT,
        job_type VARCHAR(20) DEFAULT 'direct',
        source_url TEXT,
        resumable_session TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_user ON upload_jobs(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_upload_jobs_created ON upload_jobs(created_at DESC)');
    uploadJobsTableChecked = true;
  } catch (e) {
    console.error('ensureUploadJobsTable failed:', e.message);
  }
}

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Query helpers
export async function query(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0];
}

export async function run(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return {
    changes: result.rowCount,
    lastInsertRowid: result.rows[0]?.id
  };
}

export async function runReturning(sql, params = []) {
  let pgSql = convertPlaceholders(sql);
  // Add RETURNING id if not present
  if (!pgSql.toLowerCase().includes('returning')) {
    pgSql += ' RETURNING id';
  }
  const result = await pool.query(pgSql, params);
  return result.rows[0];
}

// App settings helpers
export async function getSetting(key, defaultValue = null) {
  try {
    const result = await queryOne('SELECT value FROM app_settings WHERE key = ?', [key]);
    return result?.value ?? defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

export async function setSetting(key, value) {
  await pool.query(`
    INSERT INTO app_settings (key, value, updated_at) 
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
  `, [key, value]);
}

export async function getAllSettings() {
  const rows = await query('SELECT key, value FROM app_settings');
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

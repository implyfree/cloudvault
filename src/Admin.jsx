import { useState, useEffect } from 'react';
import { api } from './api';
import { ProvidersAdmin } from './ProvidersAdmin';
import { CostAnalytics } from './CostAnalytics';
import { Settings } from './Settings';

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

// Get admin view from URL path
function getAdminView() {
  const path = window.location.pathname;
  if (path === '/admin/users') return 'users';
  if (path === '/admin/groups') return 'groups';
  if (path === '/admin/uploads') return 'uploads';
  if (path === '/admin/stats') return 'stats';
  if (path === '/admin/costs') return 'costs';
  if (path === '/admin/shares') return 'shares';
  if (path === '/admin/settings') return 'settings';
  if (path === '/admin/providers' || path === '/admin') return 'providers';
  return 'providers';
}

export function Admin({ onUserChange }) {
  const [view, setViewState] = useState(getAdminView);
  
  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setViewState(getAdminView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  const setView = (newView) => {
    setViewState(newView);
    const newPath = `/admin/${newView}`;
    window.history.pushState({}, '', newPath);
  };
  const [users, setUsers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [providerBuckets, setProviderBuckets] = useState({}); // { providerId: [buckets] }
  const [allBuckets, setAllBuckets] = useState([]); // Flat list of all buckets for filtering
  const [userAccess, setUserAccess] = useState({}); // { userId: { providers: [], buckets: [] } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [loadingBuckets, setLoadingBuckets] = useState({});
  const [bucketSearch, setBucketSearch] = useState({}); // { providerId: searchTerm }
  const [groups, setGroups] = useState([]);
  
  // Upload logs state
  const [uploadLogs, setUploadLogs] = useState([]);
  const [uploadStats, setUploadStats] = useState(null);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsFilter, setLogsFilter] = useState({ user_id: '', provider_id: '', bucket: '', status: '', date_from: '', date_to: '' });
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const logsPerPage = 20;

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const [userRes, providerRes, groupsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/providers'),
        api.get('/admin/groups'),
      ]);
      setUsers(userRes.users || []);
      const providerList = providerRes.providers || [];
      setProviders(providerList);
      setGroups(groupsRes.groups || []);
      
      // Load buckets from all active providers for the filter dropdown
      const bucketSet = new Set();
      for (const p of providerList.filter(pr => pr.is_active)) {
        try {
          const res = await api.get(`/admin/providers/${p.id}/buckets`);
          const buckets = (res.buckets || []).map(b => typeof b === 'string' ? b : b.name);
          buckets.forEach(b => bucketSet.add(b));
          setProviderBuckets(prev => ({ ...prev, [p.id]: buckets }));
        } catch (e) {
          console.error('Failed to load buckets for provider', p.id);
        }
      }
      setAllBuckets(Array.from(bucketSet).sort());
      
      // Load user access for each user
      const accessMap = {};
      for (const user of (userRes.users || [])) {
        try {
          const access = await api.get(`/admin/users/${user.id}/providers`);
          accessMap[user.id] = access;
        } catch (e) {
          accessMap[user.id] = { providers: [], buckets: [] };
        }
      }
      setUserAccess(accessMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUploadLogs = () => {
    setLoading(true);
    setSelectedLogs(new Set()); // Clear selection when loading new data
    const params = new URLSearchParams({
      limit: logsPerPage,
      offset: logsPage * logsPerPage,
    });
    if (logsFilter.user_id) params.set('user_id', logsFilter.user_id);
    if (logsFilter.provider_id) params.set('provider_id', logsFilter.provider_id);
    if (logsFilter.bucket) params.set('bucket', logsFilter.bucket);
    if (logsFilter.status) params.set('status', logsFilter.status);
    if (logsFilter.date_from) params.set('date_from', logsFilter.date_from);
    if (logsFilter.date_to) params.set('date_to', logsFilter.date_to);
    
    api.get(`/admin/uploads?${params}`)
      .then((res) => {
        setUploadLogs(res.logs || []);
        setLogsTotal(res.total || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadStats = () => {
    setLoading(true);
    api.get('/admin/uploads/stats')
      .then((res) => setUploadStats(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (view === 'uploads') {
      loadUploadLogs();
    } else if (view === 'stats') {
      loadStats();
    }
  }, [view, logsPage, logsFilter]);

  const openAdd = () => setModal({ 
    type: 'add', 
    username: '', 
    password: '', 
    is_admin: false,
    is_cost_manager: false,
    providerIds: [],
    buckets: [], // { provider_id, bucket_name }
    groupIds: [],
  });
  
  const openEdit = async (u) => {
    const access = userAccess[u.id] || { providers: [], buckets: [] };
    
    // Fetch bucket permissions and groups for this user
    let bucketPermissions = [];
    let userGroups = [];
    try {
      const [permsRes, groupsRes] = await Promise.all([
        api.get(`/admin/users/${u.id}/bucket-permissions`),
        api.get(`/admin/users/${u.id}/groups`),
      ]);
      bucketPermissions = (permsRes.permissions || []).map(p => ({
        provider_id: p.provider_id,
        bucket_name: p.bucket_name,
        can_view: p.can_view,
        can_upload: p.can_upload,
        can_download: p.can_download,
        can_delete: p.can_delete,
        can_share: p.can_share,
        can_edit: p.can_edit,
      }));
      userGroups = (groupsRes.groups || []).map(g => g.id);
    } catch (e) {
      console.error('Failed to load user data:', e);
      // Fall back to legacy buckets without permissions
      bucketPermissions = (access.buckets || []).map(b => ({
        provider_id: b.provider_id,
        bucket_name: b.bucket_name,
        can_view: true,
        can_upload: true,
        can_download: true,
        can_delete: true,
        can_share: true,
        can_edit: true,
      }));
    }
    
    setModal({ 
      type: 'edit', 
      id: u.id, 
      username: u.username, 
      password: '', 
      is_admin: !!u.is_admin,
      is_cost_manager: !!u.is_cost_manager,
      providerIds: access.providers?.map(p => p.id) || [],
      buckets: bucketPermissions,
      groupIds: userGroups,
    });
    
    // Load buckets for providers user has access to
    for (const p of (access.providers || [])) {
      if (!providerBuckets[p.id]) {
        loadProviderBuckets(p.id);
      }
    }
  };
  
  const closeModal = () => {
    setModal(null);
    setBucketSearch({});
  };

  const loadProviderBuckets = async (providerId) => {
    if (loadingBuckets[providerId] || providerBuckets[providerId]) return;
    
    setLoadingBuckets(prev => ({ ...prev, [providerId]: true }));
    try {
      const res = await api.get(`/admin/providers/${providerId}/buckets`);
      setProviderBuckets(prev => ({ 
        ...prev, 
        [providerId]: (res.buckets || []).map(b => typeof b === 'string' ? b : b.name)
      }));
    } catch (e) {
      console.error('Failed to load buckets for provider', providerId, e);
    } finally {
      setLoadingBuckets(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const saveUser = async () => {
    if (!modal) return;
    setError('');
    try {
      let userId;
      if (modal.type === 'add') {
        if (!modal.username || !modal.password) {
          setError('Username and password are required');
          return;
        }
        const res = await api.post('/admin/users', { 
          username: modal.username, 
          password: modal.password,
          is_admin: modal.is_admin,
          is_cost_manager: modal.is_cost_manager,
        });
        userId = res.id;
        // Set provider access for new user
        if (userId) {
          await api.put(`/admin/users/${userId}/providers`, {
            providerIds: modal.providerIds,
            buckets: modal.buckets,
          });
        }
      } else {
        userId = modal.id;
        // Update user
        const updates = {};
        if (modal.password) updates.password = modal.password;
        if (typeof modal.is_admin === 'boolean') updates.is_admin = modal.is_admin;
        if (typeof modal.is_cost_manager === 'boolean') updates.is_cost_manager = modal.is_cost_manager;
        
        await api.patch(`/admin/users/${userId}`, updates);
        
        // Update provider access
        await api.put(`/admin/users/${userId}/providers`, {
          providerIds: modal.providerIds,
          buckets: modal.buckets,
        });
      }
      
      // Save bucket permissions (granular access)
      if (userId && modal.buckets.length > 0) {
        await api.put(`/admin/users/${userId}/bucket-permissions`, {
          permissions: modal.buckets.map(b => ({
            provider_id: b.provider_id,
            bucket_name: b.bucket_name,
            can_view: b.can_view ?? true,
            can_upload: b.can_upload ?? true,
            can_download: b.can_download ?? true,
            can_delete: b.can_delete ?? false,
            can_share: b.can_share ?? false,
            can_edit: b.can_edit ?? false,
          })),
        });
      }
      
      // Save group memberships
      if (userId) {
        await api.put(`/admin/users/${userId}/groups`, {
          groupIds: modal.groupIds || [],
        });
      }
      
      closeModal();
      loadUsers();
      onUserChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Remove this user? They will no longer be able to log in.')) return;
    setError('');
    try {
      await api.delete(`/admin/users/${id}`);
      loadUsers();
      onUserChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleProvider = (providerId) => {
    if (!modal) return;
    const isSelected = modal.providerIds.includes(providerId);
    let newProviderIds;
    let newBuckets = [...modal.buckets];
    
    if (isSelected) {
      // Remove provider and its buckets
      newProviderIds = modal.providerIds.filter(id => id !== providerId);
      newBuckets = newBuckets.filter(b => b.provider_id !== providerId);
    } else {
      // Add provider
      newProviderIds = [...modal.providerIds, providerId];
      // Load buckets for this provider
      loadProviderBuckets(providerId);
    }
    
    setModal({ ...modal, providerIds: newProviderIds, buckets: newBuckets });
  };

  const toggleBucket = (providerId, bucketName) => {
    if (!modal) return;
    const pid = Number(providerId);
    const exists = modal.buckets.some(b => Number(b.provider_id) === pid && b.bucket_name === bucketName);
    let newBuckets;
    
    if (exists) {
      newBuckets = modal.buckets.filter(b => !(Number(b.provider_id) === pid && b.bucket_name === bucketName));
    } else {
      // Add bucket with default permissions (all enabled)
      newBuckets = [...modal.buckets, { 
        provider_id: pid, 
        bucket_name: bucketName,
        can_view: true,
        can_upload: true,
        can_download: true,
        can_delete: false,
        can_share: false,
        can_edit: false,
      }];
    }
    
    setModal({ ...modal, buckets: newBuckets });
  };
  
  const updateBucketPermission = (providerId, bucketName, permission, value) => {
    if (!modal) return;
    const pid = Number(providerId);
    const newBuckets = modal.buckets.map(b => {
      if (Number(b.provider_id) === pid && b.bucket_name === bucketName) {
        return { ...b, [permission]: value };
      }
      return b;
    });
    setModal({ ...modal, buckets: newBuckets });
  };
  
  const getBucketPermissions = (providerId, bucketName) => {
    const pid = Number(providerId);
    const bucket = modal?.buckets.find(b => Number(b.provider_id) === pid && b.bucket_name === bucketName);
    return bucket || null;
  };

  const selectAllBuckets = (providerId) => {
    if (!modal) return;
    const pid = Number(providerId);
    const buckets = providerBuckets[providerId] || [];
    const currentBuckets = modal.buckets.filter(b => Number(b.provider_id) !== pid);
    const allSelected = buckets.every(name => 
      modal.buckets.some(b => Number(b.provider_id) === pid && b.bucket_name === name)
    );
    
    if (allSelected) {
      // Deselect all
      setModal({ ...modal, buckets: currentBuckets });
    } else {
      // Select all with default permissions
      const newBuckets = buckets.map(name => ({ 
        provider_id: providerId, 
        bucket_name: name,
        can_view: true,
        can_upload: true,
        can_download: true,
        can_delete: false,
        can_share: false,
        can_edit: false,
      }));
      setModal({ ...modal, buckets: [...currentBuckets, ...newBuckets] });
    }
  };

  const viewUserUploads = (userId) => {
    setLogsFilter({ ...logsFilter, user_id: String(userId) });
    setLogsPage(0);
    setView('uploads');
  };
  
  const getProviderName = (providerId) => {
    const p = providers.find(pr => pr.id === providerId);
    return p?.name || `Provider ${providerId}`;
  };

  // Toggle log selection
  const toggleLogSelection = (logId, e) => {
    e.stopPropagation();
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(logId)) {
      newSelected.delete(logId);
    } else {
      newSelected.add(logId);
    }
    setSelectedLogs(newSelected);
  };

  // Select all visible logs
  const toggleSelectAll = () => {
    if (selectedLogs.size === uploadLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(uploadLogs.map(l => l.id)));
    }
  };

  // Download logs as Excel/CSV
  const downloadLogsAsExcel = async (onlySelected = false) => {
    try {
      let logs;
      
      if (onlySelected && selectedLogs.size > 0) {
        // Use selected logs from current view
        logs = uploadLogs.filter(l => selectedLogs.has(l.id));
      } else {
        // Fetch all logs with current filters (no pagination limit)
        const params = new URLSearchParams({ limit: 10000, offset: 0 });
        if (logsFilter.user_id) params.set('user_id', logsFilter.user_id);
        if (logsFilter.provider_id) params.set('provider_id', logsFilter.provider_id);
        if (logsFilter.bucket) params.set('bucket', logsFilter.bucket);
        if (logsFilter.status) params.set('status', logsFilter.status);
        if (logsFilter.date_from) params.set('date_from', logsFilter.date_from);
        if (logsFilter.date_to) params.set('date_to', logsFilter.date_to);
        
        const res = await api.get(`/admin/uploads?${params}`);
        logs = res.logs || [];
      }
      
      if (logs.length === 0) {
        alert('No logs to export');
        return;
      }
      
      // Create CSV content
      const headers = [
        'Date',
        'Time',
        'User',
        'Provider',
        'Bucket',
        'File Name',
        'Full Path',
        'File Size (bytes)',
        'File Size',
        'Content Type',
        'Status',
        'Error Message',
        'IP Address'
      ];
      
      const rows = logs.map(log => {
        const date = new Date(log.created_at);
        return [
          date.toLocaleDateString(),
          date.toLocaleTimeString(),
          log.username,
          log.provider_name || '',
          log.bucket,
          log.file_name,
          log.object_path,
          log.file_size,
          formatSize(log.file_size),
          log.content_type || '',
          log.status,
          log.error_message || '',
          log.ip_address || ''
        ];
      });
      
      // Escape CSV values
      const escapeCSV = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      // Add BOM for Excel UTF-8 compatibility
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      link.download = `upload-logs-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Failed to export: ' + e.message);
    }
  };

  if (loading && view === 'users' && users.length === 0) {
    return (
      <div className="admin-loading">
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
        <p style={{ marginTop: '1rem' }}>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <section className="admin-section">
      <div className="section-header">
        <div>
          <h2>Admin Panel</h2>
          <p className="text-muted">Manage users, view uploads, and monitor activity</p>
        </div>
        <div className="section-actions">
          <button 
            type="button" 
            className={`btn btn-small ${view === 'providers' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('providers')}
          >
            Providers
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'users' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('users')}
          >
            Users
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'groups' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('groups')}
          >
            Groups
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'uploads' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => { setView('uploads'); setLogsPage(0); setSelectedLogs(new Set()); }}
          >
            Upload Logs
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'stats' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('stats')}
          >
            Statistics
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'costs' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('costs')}
          >
            Costs
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'shares' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('shares')}
          >
            Shares
          </button>
          <button 
            type="button" 
            className={`btn btn-small ${view === 'settings' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </div>
      </div>
      
      {error && <p className="form-error">{error}</p>}

      {/* Providers View */}
      {view === 'providers' && <ProvidersAdmin />}

      {/* Users View */}
      {view === 'users' && (
        <>
          <div className="admin-toolbar">
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              Add User
            </button>
          </div>
          
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Provider Access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const access = userAccess[u.id] || { providers: [], buckets: [] };
                  return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="avatar" style={{ 
                          width: 32, 
                          height: 32, 
                          background: u.is_admin ? 'linear-gradient(135deg, var(--purple), var(--accent))' : 'var(--glass)',
                          border: u.is_admin ? 'none' : '1px solid var(--glass-border)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: u.is_admin ? 'white' : 'var(--text-secondary)',
                        }}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{u.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.is_admin ? 'badge-admin' : u.is_cost_manager ? 'badge-cost' : 'badge-user'}`}>
                        {u.is_admin ? 'Admin' : u.is_cost_manager ? 'Cost Manager' : 'User'}
                      </span>
                    </td>
                    <td>
                      {u.is_admin ? (
                        <span className="muted">Full access (Admin)</span>
                      ) : access.providers?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {access.providers.slice(0, 3).map(p => (
                            <span key={p.id} style={{ 
                              padding: '0.2rem 0.5rem', 
                              background: 'var(--glass)', 
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                            }}>
                              {p.name}
                            </span>
                          ))}
                          {access.providers.length > 3 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              +{access.providers.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="muted">No access</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => viewUserUploads(u.id)}>
                          Uploads
                        </button>
                        <button type="button" className="btn btn-small btn-secondary" onClick={() => openEdit(u)}>
                          Edit
                        </button>
                        {!u.is_admin && (
                          <button type="button" className="btn btn-small btn-danger" onClick={() => deleteUser(u.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Upload Logs View */}
      {view === 'uploads' && (
        <>
          <div className="logs-toolbar">
            <div className="logs-filters">
              <select 
                value={logsFilter.user_id} 
                onChange={(e) => { setLogsFilter({ ...logsFilter, user_id: e.target.value }); setLogsPage(0); }}
              >
                <option value="">All Users</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
              <select 
                value={logsFilter.provider_id} 
                onChange={(e) => { setLogsFilter({ ...logsFilter, provider_id: e.target.value }); setLogsPage(0); }}
              >
                <option value="">All Providers</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select 
                value={logsFilter.bucket} 
                onChange={(e) => { setLogsFilter({ ...logsFilter, bucket: e.target.value }); setLogsPage(0); }}
              >
                <option value="">All Buckets</option>
                {allBuckets.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select 
                value={logsFilter.status} 
                onChange={(e) => { setLogsFilter({ ...logsFilter, status: e.target.value }); setLogsPage(0); }}
              >
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
              <div className="date-range-filter">
                <input 
                  type="date" 
                  value={logsFilter.date_from}
                  onChange={(e) => { setLogsFilter({ ...logsFilter, date_from: e.target.value }); setLogsPage(0); }}
                  title="From date"
                />
                <span className="date-separator">to</span>
                <input 
                  type="date" 
                  value={logsFilter.date_to}
                  onChange={(e) => { setLogsFilter({ ...logsFilter, date_to: e.target.value }); setLogsPage(0); }}
                  title="To date"
                />
              </div>
              <button 
                type="button" 
                className="btn btn-small btn-ghost"
                onClick={() => { setLogsFilter({ user_id: '', provider_id: '', bucket: '', status: '', date_from: '', date_to: '' }); setLogsPage(0); }}
              >
                Clear
              </button>
            </div>
            <div className="logs-actions">
              {selectedLogs.size > 0 && (
                <button 
                  type="button" 
                  className="btn btn-small btn-secondary"
                  onClick={() => downloadLogsAsExcel(true)}
                  title="Download selected logs"
                >
                  Export Selected ({selectedLogs.size})
                </button>
              )}
              <button 
                type="button" 
                className="btn btn-small btn-primary"
                onClick={() => downloadLogsAsExcel(false)}
                title="Download all filtered logs as Excel/CSV"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.35rem' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export All
              </button>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading">
              <div className="spinner" style={{ width: 24, height: 24 }}></div>
            </div>
          ) : uploadLogs.length === 0 ? (
            <div className="empty-state">
              <p>No upload logs found</p>
            </div>
          ) : (
            <>
              <div className="logs-table-wrap">
                <table className="users-table logs-table logs-table-fixed">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input 
                          type="checkbox" 
                          checked={uploadLogs.length > 0 && selectedLogs.size === uploadLogs.length}
                          onChange={toggleSelectAll}
                          title="Select all"
                        />
                      </th>
                      <th className="col-date">Date</th>
                      <th className="col-user">User</th>
                      <th className="col-provider">Provider</th>
                      <th className="col-file">File</th>
                      <th className="col-bucket">Bucket / Path</th>
                      <th className="col-size">Size</th>
                      <th className="col-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadLogs.map((log) => (
                      <tr 
                        key={log.id} 
                        className={`log-row-clickable ${selectedLogs.has(log.id) ? 'selected' : ''}`} 
                        onClick={() => setSelectedLog(log)}
                      >
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedLogs.has(log.id)}
                            onChange={(e) => toggleLogSelection(log.id, e)}
                          />
                        </td>
                        <td className="col-date">{formatDate(log.created_at)}</td>
                        <td className="col-user">{log.username}</td>
                        <td className="col-provider">{log.provider_name || '-'}</td>
                        <td className="col-file" title={log.file_name}>{log.file_name}</td>
                        <td className="col-bucket" title={`${log.bucket}/${log.object_path}`}>
                          <span className="bucket-name">{log.bucket}</span>
                          <span className="object-path">/{log.object_path}</span>
                        </td>
                        <td className="col-size">{formatSize(log.file_size)}</td>
                        <td className="col-status">
                          <span className={`status-badge ${log.status}`}>
                            {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '○'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Log Details Modal */}
              {selectedLog && (
                <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
                  <div className="modal modal-log-details" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>Upload Details</h3>
                      <button type="button" className="modal-close" onClick={() => setSelectedLog(null)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                    <div className="modal-body">
                      <div className="log-detail-grid">
                        <div className="log-detail-item">
                          <span className="log-detail-label">Status</span>
                          <span className={`log-detail-value status-${selectedLog.status}`}>
                            {selectedLog.status === 'success' ? 'Success' : selectedLog.status === 'failed' ? 'Failed' : 'Pending'}
                          </span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">Date & Time</span>
                          <span className="log-detail-value">{new Date(selectedLog.created_at).toLocaleString()}</span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">User</span>
                          <span className="log-detail-value">{selectedLog.username}</span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">Provider</span>
                          <span className="log-detail-value">{selectedLog.provider_name || 'N/A'}</span>
                        </div>
                        <div className="log-detail-item full-width">
                          <span className="log-detail-label">File Name</span>
                          <span className="log-detail-value mono">{selectedLog.file_name}</span>
                        </div>
                        <div className="log-detail-item full-width">
                          <span className="log-detail-label">Bucket</span>
                          <span className="log-detail-value mono">{selectedLog.bucket}</span>
                        </div>
                        <div className="log-detail-item full-width">
                          <span className="log-detail-label">Full Path</span>
                          <span className="log-detail-value mono">{selectedLog.object_path}</span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">File Size</span>
                          <span className="log-detail-value">{formatSize(selectedLog.file_size)}</span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">Content Type</span>
                          <span className="log-detail-value">{selectedLog.content_type || 'N/A'}</span>
                        </div>
                        <div className="log-detail-item">
                          <span className="log-detail-label">IP Address</span>
                          <span className="log-detail-value mono">{selectedLog.ip_address || 'N/A'}</span>
                        </div>
                        {selectedLog.error_message && (
                          <div className="log-detail-item full-width">
                            <span className="log-detail-label">Error Message</span>
                            <span className="log-detail-value error">{selectedLog.error_message}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pagination">
                <span className="pagination-info">
                  Showing {logsPage * logsPerPage + 1}-{Math.min((logsPage + 1) * logsPerPage, logsTotal)} of {logsTotal}
                </span>
                <div className="pagination-buttons">
                  <button 
                    type="button" 
                    className="btn btn-small btn-ghost"
                    disabled={logsPage === 0}
                    onClick={() => setLogsPage(p => p - 1)}
                  >
                    Previous
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-small btn-ghost"
                    disabled={(logsPage + 1) * logsPerPage >= logsTotal}
                    onClick={() => setLogsPage(p => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Statistics View */}
      {view === 'stats' && (
        <>
          {loading || !uploadStats ? (
            <div className="admin-loading">
              <div className="spinner" style={{ width: 24, height: 24 }}></div>
            </div>
          ) : (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{uploadStats.totalUploads}</div>
                <div className="stat-label">Total Uploads</div>
              </div>
              <div className="stat-card success">
                <div className="stat-value">{uploadStats.successfulUploads}</div>
                <div className="stat-label">Successful</div>
              </div>
              <div className="stat-card danger">
                <div className="stat-value">{uploadStats.failedUploads}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{formatSize(uploadStats.totalSize)}</div>
                <div className="stat-label">Total Data Uploaded</div>
              </div>

              <div className="stat-section">
                <h4>Top Users</h4>
                {uploadStats.byUser.length === 0 ? (
                  <p className="text-muted">No data yet</p>
                ) : (
                  <div className="stat-list">
                    {uploadStats.byUser.map((u, i) => (
                      <div key={i} className="stat-list-item">
                        <span className="stat-rank">{i + 1}</span>
                        <span className="stat-name">{u.username}</span>
                        <span className="stat-detail">{u.uploads} uploads • {formatSize(u.total_size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stat-section">
                <h4>Top Buckets</h4>
                {uploadStats.byBucket.length === 0 ? (
                  <p className="text-muted">No data yet</p>
                ) : (
                  <div className="stat-list">
                    {uploadStats.byBucket.map((b, i) => (
                      <div key={i} className="stat-list-item">
                        <span className="stat-rank">{i + 1}</span>
                        <span className="stat-name">{b.bucket}</span>
                        <span className="stat-detail">{b.uploads} uploads • {formatSize(b.total_size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Cost Analytics View */}
      {view === 'costs' && <CostAnalytics />}

      {/* Shares View */}
      {view === 'shares' && <SharesAdmin />}

      {/* Settings View */}
      {view === 'settings' && <Settings />}

      {/* Groups View */}
      {view === 'groups' && <GroupsAdmin providers={providers} />}

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-user" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.type === 'add' ? 'Add New User' : `Edit User: ${modal.username}`}</h3>
              <button type="button" className="modal-close" onClick={closeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={modal.username}
                  onChange={(e) => setModal({ ...modal, username: e.target.value })}
                  disabled={modal.type === 'edit'}
                  placeholder="Enter username"
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">{modal.type === 'add' ? 'Password' : 'New Password'}</label>
                <input
                  type="password"
                  className="form-input"
                  value={modal.password}
                  onChange={(e) => setModal({ ...modal, password: e.target.value })}
                  placeholder={modal.type === 'edit' ? 'Leave blank to keep current' : 'Enter password'}
                />
              </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={modal.is_admin}
                    onChange={(e) => setModal({ ...modal, is_admin: e.target.checked })}
                  />
                  <span>Administrator</span>
                </label>
                <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                  Admins have full access to all providers, buckets, and settings
                </p>
              </div>
              
              {!modal.is_admin && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={modal.is_cost_manager || false}
                      onChange={(e) => setModal({ ...modal, is_cost_manager: e.target.checked })}
                    />
                    <span>Cost Manager</span>
                  </label>
                  <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                    Cost managers can view cost analytics and storage statistics
                  </p>
                </div>
              )}
              
              {!modal.is_admin && (
                <>
                  {/* Groups Section */}
                  {groups.length > 0 && (
                    <div className="permissions-section">
                      <h4>Group Membership</h4>
                      <p className="text-muted">Add user to groups to inherit their permissions</p>
                      <div className="groups-checklist">
                        {groups.map(g => (
                          <label 
                            key={g.id} 
                            className={`group-check-item ${modal.groupIds?.includes(g.id) ? 'selected' : ''}`}
                            style={{ borderLeftColor: g.color }}
                          >
                            <input
                              type="checkbox"
                              checked={modal.groupIds?.includes(g.id) || false}
                              onChange={() => {
                                const gid = g.id;
                                const current = modal.groupIds || [];
                                const newGroups = current.includes(gid)
                                  ? current.filter(id => id !== gid)
                                  : [...current, gid];
                                setModal({ ...modal, groupIds: newGroups });
                              }}
                            />
                            <span className="group-color-dot" style={{ background: g.color }}></span>
                            <span className="group-check-name">{g.name}</span>
                            <span className="group-check-info">{g.member_count} members • {g.bucket_count} buckets</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="permissions-section">
                    <h4>Direct Provider Access</h4>
                    <p className="text-muted">Select providers for direct access (in addition to group permissions)</p>
                    
                    {providers.length === 0 ? (
                      <p className="text-muted">No providers configured. Add providers first.</p>
                    ) : (
                      <div className="provider-checklist">
                        {providers.filter(p => p.is_active).map(p => (
                          <label 
                            key={p.id} 
                            className={`provider-check-item ${modal.providerIds.includes(p.id) ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={modal.providerIds.includes(p.id)}
                              onChange={() => toggleProvider(p.id)}
                            />
                            <span className="provider-check-name">{p.name}</span>
                            <span className="provider-check-type">{p.type}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {modal.providerIds.length > 0 && (
                    <div className="permissions-section">
                      <h4>Bucket Access</h4>
                      <p className="text-muted">Select specific buckets (leave empty for all buckets in provider)</p>
                      
                      {modal.providerIds.map(providerId => {
                        const pid = Number(providerId);
                        const allBuckets = providerBuckets[providerId] || [];
                        const searchTerm = bucketSearch[providerId] || '';
                        const buckets = searchTerm 
                          ? allBuckets.filter(b => b.toLowerCase().includes(searchTerm.toLowerCase()))
                          : allBuckets;
                        const isLoading = loadingBuckets[providerId];
                        const selectedCount = modal.buckets.filter(b => Number(b.provider_id) === pid).length;
                        
                        return (
                          <div key={providerId} className="bucket-section">
                            <div className="bucket-section-header">
                              <span className="bucket-section-title">{getProviderName(providerId)}</span>
                              <span className="bucket-section-count">
                                {selectedCount > 0 ? `${selectedCount} selected` : 'All buckets'}
                              </span>
                            </div>
                            
                            {isLoading ? (
                              <div className="loading-inline">
                                <div className="progress-spinner" style={{ width: 16, height: 16 }}></div>
                                <span className="text-muted">Loading buckets...</span>
                              </div>
                            ) : allBuckets.length === 0 ? (
                              <p className="text-muted">No buckets found in this provider</p>
                            ) : (
                              <>
                                <div className="bucket-search-row">
                                  <input
                                    type="text"
                                    className="bucket-search-input"
                                    placeholder="Search buckets..."
                                    value={searchTerm}
                                    onChange={(e) => setBucketSearch({ ...bucketSearch, [providerId]: e.target.value })}
                                  />
                                  <button 
                                    type="button" 
                                    className="btn btn-small btn-ghost"
                                    onClick={() => selectAllBuckets(providerId)}
                                  >
                                    {selectedCount === allBuckets.length ? 'Deselect All' : 'Select All'}
                                  </button>
                                </div>
                                
                                <div className="bucket-permission-list">
                                  {buckets.length === 0 ? (
                                    <p className="text-muted">No buckets match "{searchTerm}"</p>
                                  ) : (
                                    buckets.map(name => {
                                      const pid = Number(providerId);
                                      const isSelected = modal.buckets.some(
                                        b => Number(b.provider_id) === pid && b.bucket_name === name
                                      );
                                      const perms = getBucketPermissions(pid, name);
                                      return (
                                        <div key={name} className={`bucket-permission-item ${isSelected ? 'selected' : ''}`}>
                                          <div className="bucket-permission-header">
                                            <label className="bucket-checkbox">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleBucket(providerId, name)}
                                              />
                                              <span className="bucket-name">{name}</span>
                                            </label>
                                          </div>
                                          {isSelected && perms && (
                                            <div className="bucket-permissions-grid">
                                              <label className="perm-checkbox" title="Can browse and view files">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_view}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_view', e.target.checked)}
                                                />
                                                <span>View</span>
                                              </label>
                                              <label className="perm-checkbox" title="Can upload files">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_upload}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_upload', e.target.checked)}
                                                />
                                                <span>Upload</span>
                                              </label>
                                              <label className="perm-checkbox" title="Can download files">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_download}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_download', e.target.checked)}
                                                />
                                                <span>Download</span>
                                              </label>
                                              <label className="perm-checkbox" title="Can delete files">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_delete}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_delete', e.target.checked)}
                                                />
                                                <span>Delete</span>
                                              </label>
                                              <label className="perm-checkbox" title="Can share files with others">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_share}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_share', e.target.checked)}
                                                />
                                                <span>Share</span>
                                              </label>
                                              <label className="perm-checkbox" title="Can rename and move files">
                                                <input
                                                  type="checkbox"
                                                  checked={perms.can_edit}
                                                  onChange={(e) => updateBucketPermission(providerId, name, 'can_edit', e.target.checked)}
                                                />
                                                <span>Edit</span>
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={saveUser}
                disabled={modal.type === 'add' && (!modal.username || !modal.password)}
              >
                {modal.type === 'add' ? 'Add User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Shares Admin Component
function SharesAdmin() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadShares();
  }, []);

  const loadShares = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/shares');
      setShares(res.links || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteShare = async (id) => {
    if (!confirm('Delete this share link?')) return;
    try {
      await api.delete(`/share/${id}`);
      loadShares();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="shares-admin">
      {error && <p className="form-error">{error}</p>}
      
      {shares.length === 0 ? (
        <div className="empty-state">
          <p>No shared links yet</p>
        </div>
      ) : (
        <div className="shares-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>File/Folder</th>
                <th>Shared By</th>
                <th>Shared With</th>
                <th>Expires</th>
                <th>Downloads</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.id}>
                  <td>
                    <span className="share-path">
                      {share.is_folder ? '📁' : '📄'} {share.object_path.split('/').pop()}
                    </span>
                    <span className="share-bucket text-muted">{share.bucket_name}</span>
                  </td>
                  <td>{share.created_by_username}</td>
                  <td>{share.shared_with_email || '-'}</td>
                  <td>
                    {new Date(share.expires_at) < new Date() ? (
                      <span className="text-danger">Expired</span>
                    ) : (
                      formatDate(share.expires_at)
                    )}
                  </td>
                  <td>
                    {share.download_count}
                    {share.max_downloads && ` / ${share.max_downloads}`}
                  </td>
                  <td>
                    <button 
                      type="button" 
                      className="btn btn-small btn-ghost"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${share.share_token}`)}
                    >
                      Copy
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-small btn-danger"
                      onClick={() => deleteShare(share.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Groups Admin Component
function GroupsAdmin({ providers }) {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [providerBuckets, setProviderBuckets] = useState({});
  const [loadingBuckets, setLoadingBuckets] = useState({});
  const [bucketSearch, setBucketSearch] = useState({});

  useEffect(() => {
    loadGroups();
    loadUsers();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/groups');
      setGroups(res.groups || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.users || []);
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  };

  const loadProviderBuckets = async (providerId) => {
    if (loadingBuckets[providerId] || providerBuckets[providerId]) return;
    
    setLoadingBuckets(prev => ({ ...prev, [providerId]: true }));
    try {
      const res = await api.get(`/admin/providers/${providerId}/buckets`);
      const buckets = (res.buckets || []).map(b => typeof b === 'string' ? b : b.name);
      setProviderBuckets(prev => ({ ...prev, [providerId]: buckets }));
    } catch (e) {
      console.error('Failed to load buckets:', e);
    } finally {
      setLoadingBuckets(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const openAddGroup = () => {
    setModal({
      type: 'add',
      name: '',
      description: '',
      color: '#6366f1',
      members: [],
      permissions: [],
      selectedProviders: [],
    });
  };

  const openEditGroup = async (group) => {
    try {
      const res = await api.get(`/admin/groups/${group.id}`);
      
      // Get unique provider IDs from permissions
      const providerIds = [...new Set(res.permissions.map(p => p.provider_id))];
      
      // Load buckets for each provider
      for (const pid of providerIds) {
        loadProviderBuckets(pid);
      }
      
      setModal({
        type: 'edit',
        id: group.id,
        name: res.group.name,
        description: res.group.description || '',
        color: res.group.color || '#6366f1',
        members: res.members.map(m => m.id),
        permissions: res.permissions.map(p => ({
          provider_id: p.provider_id,
          bucket_name: p.bucket_name,
          can_view: p.can_view,
          can_upload: p.can_upload,
          can_download: p.can_download,
          can_delete: p.can_delete,
          can_share: p.can_share,
          can_edit: p.can_edit,
        })),
        selectedProviders: providerIds,
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const closeModal = () => {
    setModal(null);
  };

  const saveGroup = async () => {
    if (!modal.name.trim()) {
      setError('Group name is required');
      return;
    }

    setError('');
    try {
      let groupId;
      
      if (modal.type === 'add') {
        const res = await api.post('/admin/groups', {
          name: modal.name.trim(),
          description: modal.description,
          color: modal.color,
        });
        groupId = res.id;
      } else {
        groupId = modal.id;
        await api.patch(`/admin/groups/${groupId}`, {
          name: modal.name.trim(),
          description: modal.description,
          color: modal.color,
        });
      }

      // Save members
      if (modal.members.length > 0) {
        await api.post(`/admin/groups/${groupId}/members`, {
          userIds: modal.members,
        });
      }

      // Save permissions
      await api.put(`/admin/groups/${groupId}/permissions`, {
        permissions: modal.permissions,
      });

      closeModal();
      loadGroups();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteGroup = async (id) => {
    if (!confirm('Delete this group? Members will lose permissions granted through this group.')) return;
    try {
      await api.delete(`/admin/groups/${id}`);
      loadGroups();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleProvider = (providerId) => {
    if (!modal) return;
    const pid = Number(providerId);
    const isSelected = modal.selectedProviders.includes(pid);
    
    if (isSelected) {
      // Remove provider and its bucket permissions
      setModal({
        ...modal,
        selectedProviders: modal.selectedProviders.filter(id => id !== pid),
        permissions: modal.permissions.filter(p => Number(p.provider_id) !== pid),
      });
    } else {
      // Add provider
      setModal({
        ...modal,
        selectedProviders: [...modal.selectedProviders, pid],
      });
      loadProviderBuckets(pid);
    }
  };

  const toggleBucket = (providerId, bucketName) => {
    if (!modal) return;
    const pid = Number(providerId);
    const exists = modal.permissions.some(p => Number(p.provider_id) === pid && p.bucket_name === bucketName);
    
    if (exists) {
      setModal({
        ...modal,
        permissions: modal.permissions.filter(p => !(Number(p.provider_id) === pid && p.bucket_name === bucketName)),
      });
    } else {
      setModal({
        ...modal,
        permissions: [...modal.permissions, {
          provider_id: pid,
          bucket_name: bucketName,
          can_view: true,
          can_upload: true,
          can_download: true,
          can_delete: false,
          can_share: false,
          can_edit: false,
        }],
      });
    }
  };

  const updatePermission = (providerId, bucketName, permission, value) => {
    if (!modal) return;
    const pid = Number(providerId);
    setModal({
      ...modal,
      permissions: modal.permissions.map(p => {
        if (Number(p.provider_id) === pid && p.bucket_name === bucketName) {
          return { ...p, [permission]: value };
        }
        return p;
      }),
    });
  };

  const getPermission = (providerId, bucketName) => {
    const pid = Number(providerId);
    return modal?.permissions.find(p => Number(p.provider_id) === pid && p.bucket_name === bucketName);
  };

  const toggleMember = (userId) => {
    if (!modal) return;
    const uid = Number(userId);
    const isMember = modal.members.includes(uid);
    
    setModal({
      ...modal,
      members: isMember 
        ? modal.members.filter(id => id !== uid)
        : [...modal.members, uid],
    });
  };

  const getProviderName = (providerId) => {
    const provider = providers.find(p => p.id === Number(providerId));
    return provider?.name || `Provider ${providerId}`;
  };

  const GROUP_COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1',
  ];

  return (
    <div className="groups-admin">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={openAddGroup}>
          Create Group
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner"></div>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>No groups created yet.</p>
          <p className="text-muted">Groups let you manage permissions for multiple users at once.</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map(group => (
            <div key={group.id} className="group-card">
              <div className="group-card-header" style={{ borderLeftColor: group.color }}>
                <div className="group-color" style={{ background: group.color }}></div>
                <div className="group-info">
                  <h4>{group.name}</h4>
                  {group.description && <p className="text-muted">{group.description}</p>}
                </div>
              </div>
              <div className="group-card-stats">
                <div className="group-stat">
                  <span className="stat-value">{group.member_count}</span>
                  <span className="stat-label">Members</span>
                </div>
                <div className="group-stat">
                  <span className="stat-value">{group.bucket_count}</span>
                  <span className="stat-label">Buckets</span>
                </div>
              </div>
              <div className="group-card-actions">
                <button type="button" className="btn btn-small btn-secondary" onClick={() => openEditGroup(group)}>
                  Edit
                </button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => deleteGroup(group.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-group" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.type === 'add' ? 'Create Group' : `Edit Group: ${modal.name}`}</h3>
              <button type="button" className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  placeholder="e.g., Developers, Marketing, Read-Only"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  placeholder="Brief description of this group's purpose"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-picker">
                  {GROUP_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${modal.color === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      onClick={() => setModal({ ...modal, color })}
                    />
                  ))}
                </div>
              </div>

              <div className="permissions-section">
                <h4>Members</h4>
                <p className="text-muted">Select users to add to this group</p>
                <div className="members-list">
                  {users.filter(u => !u.is_admin).map(user => (
                    <label key={user.id} className={`member-item ${modal.members.includes(user.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={modal.members.includes(user.id)}
                        onChange={() => toggleMember(user.id)}
                      />
                      <span>{user.username}</span>
                    </label>
                  ))}
                  {users.filter(u => !u.is_admin).length === 0 && (
                    <p className="text-muted">No non-admin users available</p>
                  )}
                </div>
              </div>

              <div className="permissions-section">
                <h4>Bucket Permissions</h4>
                <p className="text-muted">Select providers and buckets this group can access</p>
                
                <div className="provider-checklist">
                  {providers.filter(p => p.is_active).map(p => (
                    <label 
                      key={p.id} 
                      className={`provider-check-item ${modal.selectedProviders.includes(p.id) ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={modal.selectedProviders.includes(p.id)}
                        onChange={() => toggleProvider(p.id)}
                      />
                      <span className="provider-check-name">{p.name}</span>
                      <span className="provider-check-type">{p.type}</span>
                    </label>
                  ))}
                </div>

                {modal.selectedProviders.length > 0 && (
                  <div className="bucket-permissions-section">
                    {modal.selectedProviders.map(providerId => {
                      const allBuckets = providerBuckets[providerId] || [];
                      const searchTerm = bucketSearch[providerId] || '';
                      const buckets = searchTerm
                        ? allBuckets.filter(b => b.toLowerCase().includes(searchTerm.toLowerCase()))
                        : allBuckets;
                      const isLoading = loadingBuckets[providerId];
                      const selectedCount = modal.permissions.filter(p => Number(p.provider_id) === providerId).length;

                      return (
                        <div key={providerId} className="bucket-section">
                          <div className="bucket-section-header">
                            <span className="bucket-section-title">{getProviderName(providerId)}</span>
                            <span className="bucket-section-count">
                              {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'}
                            </span>
                          </div>

                          {isLoading ? (
                            <div className="loading-inline">
                              <div className="spinner-small"></div>
                              <span className="text-muted">Loading buckets...</span>
                            </div>
                          ) : allBuckets.length === 0 ? (
                            <p className="text-muted">No buckets found</p>
                          ) : (
                            <>
                              <div className="bucket-search-row">
                                <input
                                  type="text"
                                  className="bucket-search-input"
                                  placeholder="Search buckets..."
                                  value={searchTerm}
                                  onChange={(e) => setBucketSearch({ ...bucketSearch, [providerId]: e.target.value })}
                                />
                                <span className="bucket-count">{buckets.length} of {allBuckets.length}</span>
                              </div>
                              <div className="bucket-permission-list">
                              {buckets.length === 0 ? (
                                <p className="text-muted">No buckets match "{searchTerm}"</p>
                              ) : buckets.map(name => {
                                const isSelected = modal.permissions.some(
                                  p => Number(p.provider_id) === providerId && p.bucket_name === name
                                );
                                const perms = getPermission(providerId, name);

                                return (
                                  <div key={name} className={`bucket-permission-item ${isSelected ? 'selected' : ''}`}>
                                    <div className="bucket-permission-header">
                                      <label className="bucket-checkbox">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleBucket(providerId, name)}
                                        />
                                        <span className="bucket-name">{name}</span>
                                      </label>
                                    </div>
                                    {isSelected && perms && (
                                      <div className="bucket-permissions-grid">
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_view}
                                            onChange={(e) => updatePermission(providerId, name, 'can_view', e.target.checked)}
                                          />
                                          <span>View</span>
                                        </label>
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_upload}
                                            onChange={(e) => updatePermission(providerId, name, 'can_upload', e.target.checked)}
                                          />
                                          <span>Upload</span>
                                        </label>
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_download}
                                            onChange={(e) => updatePermission(providerId, name, 'can_download', e.target.checked)}
                                          />
                                          <span>Download</span>
                                        </label>
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_delete}
                                            onChange={(e) => updatePermission(providerId, name, 'can_delete', e.target.checked)}
                                          />
                                          <span>Delete</span>
                                        </label>
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_share}
                                            onChange={(e) => updatePermission(providerId, name, 'can_share', e.target.checked)}
                                          />
                                          <span>Share</span>
                                        </label>
                                        <label className="perm-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={perms.can_edit}
                                            onChange={(e) => updatePermission(providerId, name, 'can_edit', e.target.checked)}
                                          />
                                          <span>Edit</span>
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={saveGroup}
                disabled={!modal.name.trim()}
              >
                {modal.type === 'add' ? 'Create Group' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

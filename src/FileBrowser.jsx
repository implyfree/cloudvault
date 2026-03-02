import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function getFileIcon(name, isFolder) {
  if (isFolder) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons = {
    // Images
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    // Videos
    mp4: '🎬', webm: '🎬', mov: '🎬', avi: '🎬',
    // Audio
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵',
    // Documents
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️',
    // Archives
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    // Code
    js: '📜', ts: '📜', jsx: '📜', tsx: '📜', py: '🐍', java: '☕', json: '📋',
    // Data
    csv: '📊', sql: '🗃️',
  };
  return icons[ext] || '📄';
}

export function FileBrowser({ providerId, bucket, onClose }) {
  const [path, setPath] = useState('');
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissions, setPermissions] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [viewMode, setViewMode] = useState('list'); // list or grid
  const [sortBy, setSortBy] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showShareModal, setShowShareModal] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(new Set());
    
    try {
      const res = await api.get(`/providers/${providerId}/buckets/${bucket}/files?prefix=${encodeURIComponent(path)}`);
      setFiles(res.files || []);
      setFolders(res.folders || []);
      setPermissions(res.permissions || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [providerId, bucket, path]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const navigateTo = (newPath) => {
    setPath(newPath);
  };

  const navigateUp = () => {
    if (!path) return;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath(parts.length ? parts.join('/') + '/' : '');
  };

  const handleFolderClick = (folder) => {
    navigateTo(folder.name);
  };

  const handleFileClick = (file) => {
    // Toggle selection
    const newSelected = new Set(selected);
    if (newSelected.has(file.name)) {
      newSelected.delete(file.name);
    } else {
      newSelected.add(file.name);
    }
    setSelected(newSelected);
  };

  const handleDownload = async (filePath) => {
    try {
      const res = await api.get(`/providers/${providerId}/buckets/${bucket}/download?path=${encodeURIComponent(filePath)}`);
      window.open(res.downloadUrl, '_blank');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (paths) => {
    try {
      await api.delete(`/providers/${providerId}/buckets/${bucket}/files`, { paths });
      setDeleteConfirm(null);
      loadFiles();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRename = async (oldPath, newName) => {
    const newPath = path + newName;
    try {
      await api.post(`/providers/${providerId}/buckets/${bucket}/rename`, { oldPath, newPath });
      setRenameModal(null);
      loadFiles();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleShare = async (item) => {
    setShareLoading(true);
    setShareResult(null);
    
    try {
      const res = await api.post('/share', {
        providerId,
        bucket,
        objectPath: item.name,
        isFolder: item.isFolder,
        expiresInHours: showShareModal.expiresInHours || 24,
        canDownload: showShareModal.canDownload !== false,
        maxDownloads: showShareModal.maxDownloads || null,
        password: showShareModal.password || null,
        sharedWithEmail: showShareModal.email || null,
      });
      setShareResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setShareLoading(false);
    }
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Sort items
  const sortedFiles = [...files].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (sortBy === 'date') cmp = new Date(a.updated || 0) - new Date(b.updated || 0);
    return sortAsc ? cmp : -cmp;
  });

  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  // Breadcrumb
  const pathParts = path.split('/').filter(Boolean);
  const breadcrumbs = [
    { name: bucket, path: '' },
    ...pathParts.map((part, i) => ({
      name: part,
      path: pathParts.slice(0, i + 1).join('/') + '/',
    })),
  ];

  return (
    <div className="file-browser" onClick={closeContextMenu}>
      <div className="file-browser-header">
        <div className="file-browser-title">
          <h3>Browse Files</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        
        {/* Breadcrumb */}
        <div className="file-browser-breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <button 
                type="button" 
                className="breadcrumb-item"
                onClick={() => navigateTo(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="file-browser-toolbar">
          <div className="toolbar-left">
            <button 
              type="button" 
              className="btn btn-ghost btn-small"
              onClick={navigateUp}
              disabled={!path}
            >
              ↑ Up
            </button>
            <button 
              type="button" 
              className="btn btn-ghost btn-small"
              onClick={loadFiles}
            >
              ↻ Refresh
            </button>
          </div>
          
          <div className="toolbar-right">
            {selected.size > 0 && (
              <>
                {permissions.can_download && (
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-small"
                    onClick={() => selected.forEach(s => handleDownload(s))}
                  >
                    Download ({selected.size})
                  </button>
                )}
                {permissions.can_delete && (
                  <button 
                    type="button" 
                    className="btn btn-danger btn-small"
                    onClick={() => setDeleteConfirm(Array.from(selected))}
                  >
                    Delete ({selected.size})
                  </button>
                )}
              </>
            )}
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="date">Date</option>
            </select>
            
            <button 
              type="button" 
              className="btn btn-ghost btn-small"
              onClick={() => setSortAsc(!sortAsc)}
            >
              {sortAsc ? '↑' : '↓'}
            </button>
            
            <button 
              type="button" 
              className={`btn btn-ghost btn-small ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              ≡
            </button>
            <button 
              type="button" 
              className={`btn btn-ghost btn-small ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              ⊞
            </button>
          </div>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="file-browser-loading">
          <div className="spinner"></div>
          <p>Loading files...</p>
        </div>
      ) : (
        <div className={`file-browser-content ${viewMode}`}>
          {sortedFolders.length === 0 && sortedFiles.length === 0 ? (
            <div className="file-browser-empty">
              <p>This folder is empty</p>
            </div>
          ) : viewMode === 'list' ? (
            <table className="file-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Name</th>
                  <th style={{ width: 100 }}>Size</th>
                  <th style={{ width: 180 }}>Modified</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedFolders.map((folder) => (
                  <tr 
                    key={folder.name} 
                    className="folder-row"
                    onDoubleClick={() => handleFolderClick(folder)}
                    onContextMenu={(e) => handleContextMenu(e, { ...folder, isFolder: true })}
                  >
                    <td>{getFileIcon(folder.name, true)}</td>
                    <td>
                      <button 
                        type="button" 
                        className="file-name-btn"
                        onClick={() => handleFolderClick(folder)}
                      >
                        {folder.name.replace(path, '').replace(/\/$/, '')}
                      </button>
                    </td>
                    <td>-</td>
                    <td>-</td>
                    <td>
                      {permissions.can_share && (
                        <button 
                          type="button" 
                          className="btn btn-ghost btn-small"
                          onClick={() => setShowShareModal({ item: { ...folder, isFolder: true } })}
                        >
                          Share
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedFiles.map((file) => (
                  <tr 
                    key={file.name}
                    className={`file-row ${selected.has(file.name) ? 'selected' : ''}`}
                    onClick={() => handleFileClick(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                  >
                    <td>{getFileIcon(file.name, false)}</td>
                    <td className="file-name">{file.name.replace(path, '')}</td>
                    <td>{formatSize(file.size)}</td>
                    <td>{formatDate(file.updated)}</td>
                    <td>
                      <div className="file-actions">
                        {permissions.can_download && (
                          <button 
                            type="button" 
                            className="btn btn-ghost btn-small"
                            onClick={(e) => { e.stopPropagation(); handleDownload(file.name); }}
                          >
                            ↓
                          </button>
                        )}
                        {permissions.can_share && (
                          <button 
                            type="button" 
                            className="btn btn-ghost btn-small"
                            onClick={(e) => { e.stopPropagation(); setShowShareModal({ item: file }); }}
                          >
                            🔗
                          </button>
                        )}
                        {permissions.can_delete && (
                          <button 
                            type="button" 
                            className="btn btn-ghost btn-small btn-danger-text"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm([file.name]); }}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="file-grid">
              {sortedFolders.map((folder) => (
                <div 
                  key={folder.name}
                  className="file-grid-item folder"
                  onDoubleClick={() => handleFolderClick(folder)}
                  onContextMenu={(e) => handleContextMenu(e, { ...folder, isFolder: true })}
                >
                  <div className="file-grid-icon">{getFileIcon(folder.name, true)}</div>
                  <div className="file-grid-name">{folder.name.replace(path, '').replace(/\/$/, '')}</div>
                </div>
              ))}
              {sortedFiles.map((file) => (
                <div 
                  key={file.name}
                  className={`file-grid-item ${selected.has(file.name) ? 'selected' : ''}`}
                  onClick={() => handleFileClick(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                >
                  <div className="file-grid-icon">{getFileIcon(file.name, false)}</div>
                  <div className="file-grid-name">{file.name.replace(path, '')}</div>
                  <div className="file-grid-size">{formatSize(file.size)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {!contextMenu.item.isFolder && permissions.can_download && (
            <button onClick={() => { handleDownload(contextMenu.item.name); closeContextMenu(); }}>
              Download
            </button>
          )}
          {permissions.can_share && (
            <button onClick={() => { setShowShareModal({ item: contextMenu.item }); closeContextMenu(); }}>
              Share
            </button>
          )}
          {permissions.can_edit && !contextMenu.item.isFolder && (
            <button onClick={() => { setRenameModal(contextMenu.item); closeContextMenu(); }}>
              Rename
            </button>
          )}
          {permissions.can_delete && (
            <button className="danger" onClick={() => { setDeleteConfirm([contextMenu.item.name]); closeContextMenu(); }}>
              Delete
            </button>
          )}
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => { setShowShareModal(null); setShareResult(null); }}>
          <div className="modal modal-share" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Share {showShareModal.item.isFolder ? 'Folder' : 'File'}</h3>
              <button type="button" className="modal-close" onClick={() => { setShowShareModal(null); setShareResult(null); }}>✕</button>
            </div>
            <div className="modal-body">
              {shareResult ? (
                <div className="share-result">
                  <p className="share-success">Share link created!</p>
                  <div className="share-url-box">
                    <input type="text" value={shareResult.shareUrl} readOnly />
                    <button 
                      type="button" 
                      className="btn btn-primary"
                      onClick={() => navigator.clipboard.writeText(shareResult.shareUrl)}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="share-expiry">Expires: {formatDate(shareResult.expiresAt)}</p>
                </div>
              ) : (
                <>
                  <div className="share-file-name">
                    <span>{getFileIcon(showShareModal.item.name, showShareModal.item.isFolder)}</span>
                    <span>{showShareModal.item.name.split('/').pop()}</span>
                  </div>
                  
                  <label>
                    Share with email (optional)
                    <input 
                      type="email" 
                      placeholder="user@example.com"
                      value={showShareModal.email || ''}
                      onChange={(e) => setShowShareModal({ ...showShareModal, email: e.target.value })}
                    />
                  </label>
                  
                  <div className="share-form-row">
                    <label>
                      Expires in
                      <select 
                        value={showShareModal.expiresInHours || 24}
                        onChange={(e) => setShowShareModal({ ...showShareModal, expiresInHours: Number(e.target.value) })}
                      >
                        <option value={1}>1 hour</option>
                        <option value={24}>24 hours</option>
                        <option value={168}>7 days</option>
                        <option value={720}>30 days</option>
                      </select>
                    </label>
                    
                    <label>
                      Max downloads
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Unlimited"
                        value={showShareModal.maxDownloads || ''}
                        onChange={(e) => setShowShareModal({ ...showShareModal, maxDownloads: e.target.value ? Number(e.target.value) : null })}
                      />
                    </label>
                  </div>
                  
                  <label>
                    Password protection (optional)
                    <input 
                      type="password" 
                      placeholder="Leave empty for no password"
                      value={showShareModal.password || ''}
                      onChange={(e) => setShowShareModal({ ...showShareModal, password: e.target.value })}
                    />
                  </label>
                  
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={showShareModal.canDownload !== false}
                      onChange={(e) => setShowShareModal({ ...showShareModal, canDownload: e.target.checked })}
                    />
                    <span>Allow download</span>
                  </label>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowShareModal(null); setShareResult(null); }}>
                {shareResult ? 'Close' : 'Cancel'}
              </button>
              {!shareResult && (
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => handleShare(showShareModal.item)}
                  disabled={shareLoading}
                >
                  {shareLoading ? 'Creating...' : 'Create Share Link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-confirm-icon danger">🗑</div>
            <h3>Delete {deleteConfirm.length} item{deleteConfirm.length > 1 ? 's' : ''}?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div className="modal-overlay" onClick={() => setRenameModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename File</h3>
              <button type="button" className="modal-close" onClick={() => setRenameModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>
                New name
                <input 
                  type="text" 
                  defaultValue={renameModal.name.replace(path, '')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRename(renameModal.name, e.target.value);
                    }
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRenameModal(null)}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={(e) => {
                  const input = e.target.closest('.modal').querySelector('input');
                  handleRename(renameModal.name, input.value);
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

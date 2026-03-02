import { useState, useEffect } from 'react';
import { api } from './api';
import { LogoWithText } from './Logo';

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
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    mp4: '🎬', webm: '🎬', mov: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵',
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    zip: '📦', rar: '📦', '7z': '📦',
  };
  return icons[ext] || '📄';
}

export function SharedAccess({ token }) {
  const [shareInfo, setShareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadShareInfo();
  }, [token]);

  const loadShareInfo = async (pwd = '') => {
    setLoading(true);
    setError('');
    
    try {
      const url = `/s/${token}${pwd ? `?password=${encodeURIComponent(pwd)}` : ''}`;
      const res = await api.get(url);
      
      if (res.requiresPassword) {
        setNeedsPassword(true);
        setShareInfo({ fileName: res.fileName, isFolder: res.isFolder });
      } else {
        setShareInfo(res);
        setNeedsPassword(false);
        
        if (res.isFolder) {
          loadFolderContents('');
        }
      }
    } catch (e) {
      if (e.message.includes('expired')) {
        setError('This share link has expired.');
      } else if (e.message.includes('limit')) {
        setError('Download limit reached for this share.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFolderContents = async (prefix) => {
    try {
      const url = `/s/${token}/files?prefix=${encodeURIComponent(prefix)}${password ? `&password=${encodeURIComponent(password)}` : ''}`;
      const res = await api.get(url);
      setFiles(res.files || []);
      setFolders(res.folders || []);
      setCurrentPath(prefix);
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    loadShareInfo(password);
  };

  const handleDownload = async (filePath = null) => {
    setDownloading(true);
    
    try {
      let url = `/s/${token}/download`;
      const params = new URLSearchParams();
      if (password) params.set('password', password);
      if (filePath) params.set('path', filePath);
      
      if (params.toString()) {
        url += `?${params}`;
      }
      
      const res = await api.get(url);
      window.open(res.downloadUrl, '_blank');
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const navigateToFolder = (folderPath) => {
    loadFolderContents(folderPath.replace(shareInfo.objectPath, ''));
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadFolderContents(parts.length ? parts.join('/') + '/' : '');
  };

  if (loading) {
    return (
      <div className="shared-access">
        <div className="shared-access-loading">
          <div className="spinner"></div>
          <p>Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-access">
        <div className="shared-access-header">
          <LogoWithText size={32} />
        </div>
        <div className="shared-access-error">
          <div className="error-icon">⚠️</div>
          <h2>Unable to Access</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="shared-access">
        <div className="shared-access-header">
          <LogoWithText size={32} />
        </div>
        <div className="shared-access-password">
          <div className="password-icon">🔒</div>
          <h2>Password Protected</h2>
          <p>This {shareInfo?.isFolder ? 'folder' : 'file'} is password protected.</p>
          <p className="file-name">{getFileIcon(shareInfo?.fileName, shareInfo?.isFolder)} {shareInfo?.fileName}</p>
          
          <form onSubmit={handlePasswordSubmit}>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-access">
      <div className="shared-access-header">
        <LogoWithText size={32} />
      </div>
      
      <div className="shared-access-content">
        <div className="share-info">
          <div className="share-icon">
            {getFileIcon(shareInfo.fileName, shareInfo.isFolder)}
          </div>
          <div className="share-details">
            <h2>{shareInfo.fileName}</h2>
            <p className="share-meta">
              Shared by {shareInfo.createdBy} • Expires {formatDate(shareInfo.expiresAt)}
            </p>
          </div>
        </div>

        {shareInfo.isFolder ? (
          <div className="shared-folder-browser">
            {/* Breadcrumb */}
            <div className="shared-breadcrumb">
              <button 
                type="button" 
                className="breadcrumb-item"
                onClick={() => loadFolderContents('')}
              >
                {shareInfo.fileName}
              </button>
              {currentPath && currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                <span key={i}>
                  <span className="breadcrumb-sep">/</span>
                  <button 
                    type="button" 
                    className="breadcrumb-item"
                    onClick={() => loadFolderContents(arr.slice(0, i + 1).join('/') + '/')}
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>

            {/* Toolbar */}
            {currentPath && (
              <div className="shared-toolbar">
                <button type="button" className="btn btn-ghost btn-small" onClick={navigateUp}>
                  ↑ Up
                </button>
              </div>
            )}

            {/* File List */}
            <div className="shared-file-list">
              {folders.length === 0 && files.length === 0 ? (
                <p className="empty-folder">This folder is empty</p>
              ) : (
                <table className="file-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>Name</th>
                      <th style={{ width: 100 }}>Size</th>
                      {shareInfo.canDownload && <th style={{ width: 80 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map((folder) => (
                      <tr 
                        key={folder.name} 
                        className="folder-row"
                        onDoubleClick={() => navigateToFolder(folder.name)}
                      >
                        <td>{getFileIcon(folder.name, true)}</td>
                        <td>
                          <button 
                            type="button" 
                            className="file-name-btn"
                            onClick={() => navigateToFolder(folder.name)}
                          >
                            {folder.name.replace(shareInfo.objectPath, '').replace(currentPath, '').replace(/\/$/, '')}
                          </button>
                        </td>
                        <td>-</td>
                        {shareInfo.canDownload && <td></td>}
                      </tr>
                    ))}
                    {files.map((file) => (
                      <tr key={file.name} className="file-row">
                        <td>{getFileIcon(file.name, false)}</td>
                        <td>{file.name.replace(shareInfo.objectPath, '').replace(currentPath, '')}</td>
                        <td>{formatSize(file.size)}</td>
                        {shareInfo.canDownload && (
                          <td>
                            <button 
                              type="button" 
                              className="btn btn-ghost btn-small"
                              onClick={() => handleDownload(file.name)}
                              disabled={downloading}
                            >
                              ↓
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="shared-file-actions">
            {shareInfo.canDownload && (
              <button 
                type="button" 
                className="btn btn-primary btn-large"
                onClick={() => handleDownload()}
                disabled={downloading}
              >
                {downloading ? 'Preparing download...' : 'Download File'}
              </button>
            )}
            {!shareInfo.canDownload && shareInfo.canView && (
              <p className="view-only-notice">This file is view-only. Downloads are not allowed.</p>
            )}
          </div>
        )}
      </div>

      <div className="shared-access-footer">
        <p>Powered by CloudVault</p>
      </div>
    </div>
  );
}

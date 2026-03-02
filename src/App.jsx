import { useState, useEffect, useCallback } from 'react';
import { Login } from './Login';
import { Upload } from './Upload';
import { Admin } from './Admin';
import { SharedAccess } from './SharedAccess';
import { api } from './api';
import { LogoWithText } from './Logo';
import { ThemeToggle } from './ThemeToggle';

// Get view from URL path
function getViewFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/share/') || path.startsWith('/s/')) return 'shared';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/browse' || path.startsWith('/browse/')) return 'browse';
  return 'upload';
}

// Get share token from URL
function getShareToken() {
  const path = window.location.pathname;
  if (path.startsWith('/share/')) return path.replace('/share/', '');
  if (path.startsWith('/s/')) return path.replace('/s/', '');
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(getViewFromPath);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [shareToken] = useState(getShareToken);
  const [uploadActive, setUploadActive] = useState(false);
  const [uploadInfo, setUploadInfo] = useState({ speed: '', eta: '' });

  // Listen for upload status changes from Upload component
  useEffect(() => {
    const handler = (e) => {
      setUploadActive(e.detail.active);
      if (e.detail.speed !== undefined) {
        setUploadInfo({ speed: e.detail.speed, eta: e.detail.eta });
      }
    };
    window.addEventListener('upload-status-change', handler);
    return () => window.removeEventListener('upload-status-change', handler);
  }, []);

  // Warn before browser close/refresh during active upload
  useEffect(() => {
    if (!uploadActive) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'Upload in progress. Closing this page will cancel the upload.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploadActive]);

  // If this is a share link, render the shared access page
  if (view === 'shared' && shareToken) {
    return <SharedAccess token={shareToken} />;
  }

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setView(getViewFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Change view and update URL
  const changeView = (newView) => {
    setView(newView);
    const newPath = newView === 'admin' ? '/admin' : '/';
    window.history.pushState({}, '', newPath);
  };

  // Go to home (upload page) – changeView already pushState('/'); notify Upload to sync tab from path
  const goHome = () => {
    changeView('upload');
    window.dispatchEvent(new CustomEvent('app-navigate'));
  };

  const loadUser = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Fetch fresh user data from server to get updated permissions
    api.get('/me')
      .then((userData) => {
        // Update localStorage with fresh data
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const onLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const onLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentView');
    setShowLogoutConfirm(false);
    setUser(null);
    window.history.pushState({}, '', '/');
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={onLogin} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo-link" onClick={goHome} style={{ cursor: 'pointer' }}>
          <LogoWithText size={28} />
        </div>
        <div className="header-actions">
          <div className="user-badge">
            <div className="avatar">{user.username?.charAt(0).toUpperCase()}</div>
            <span>{user.username}</span>
            {user.is_admin && <span style={{ color: 'var(--purple)', fontWeight: 500 }}>Admin</span>}
          </div>
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              className={`btn btn-small ${view === 'upload' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => changeView('upload')}
            >
              Upload
            </button>
            {user.is_admin && (
              <button
                type="button"
                className={`btn btn-small ${view === 'admin' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => changeView('admin')}
              >
                Admin
              </button>
            )}
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowLogoutConfirm(true)}>
              Logout
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      {/* Global upload-in-progress banner — visible on ALL pages */}
      {uploadActive && (
        <div className="upload-global-banner">
          <span className="upload-global-banner-dot" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Upload in progress — do not close or refresh this page
          {uploadInfo.speed && (
            <span className="upload-global-banner-stats">
              {uploadInfo.speed} • ETA: {uploadInfo.eta || '...'}
            </span>
          )}
        </div>
      )}

      <main className="main">
        {view === 'admin' && user.is_admin ? (
          <Admin onUserChange={loadUser} />
        ) : (
          <Upload user={user} />
        )}
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-confirm-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <h3>Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="modal-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onLogout}
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

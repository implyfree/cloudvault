import { useState, useEffect } from 'react';
import { api } from './api';

export function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/settings');
      setSettings(res.settings || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
    setSuccess('');
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      await api.put('/admin/settings', { settings });
      setSuccess('Settings saved successfully');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async () => {
    setTestingSmtp(true);
    setError('');
    
    try {
      // For now, just validate the settings are present
      const required = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from'];
      const missing = required.filter(k => !settings[k]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required SMTP settings: ${missing.join(', ')}`);
      }
      
      setSuccess('SMTP configuration looks valid. Email functionality will be available when the email service is implemented.');
    } catch (e) {
      setError(e.message);
    } finally {
      setTestingSmtp(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h3>Application Settings</h3>
        <p className="text-muted">Configure email, sharing defaults, and other application settings</p>
      </div>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      {/* SMTP Settings */}
      <div className="settings-section">
        <h4>Email Configuration (SMTP)</h4>
        <p className="text-muted">Configure SMTP settings for sending share notifications</p>
        
        <div className="settings-grid">
          <label>
            SMTP Host
            <input 
              type="text" 
              value={settings.smtp_host || ''} 
              onChange={(e) => handleChange('smtp_host', e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </label>
          
          <label>
            SMTP Port
            <input 
              type="number" 
              value={settings.smtp_port || ''} 
              onChange={(e) => handleChange('smtp_port', e.target.value)}
              placeholder="587"
            />
          </label>
          
          <label>
            SMTP Username
            <input 
              type="text" 
              value={settings.smtp_user || ''} 
              onChange={(e) => handleChange('smtp_user', e.target.value)}
              placeholder="your-email@gmail.com"
            />
          </label>
          
          <label>
            SMTP Password
            <input 
              type="password" 
              value={settings.smtp_password || ''} 
              onChange={(e) => handleChange('smtp_password', e.target.value)}
              placeholder="••••••••"
            />
          </label>
          
          <label>
            From Email
            <input 
              type="email" 
              value={settings.smtp_from || ''} 
              onChange={(e) => handleChange('smtp_from', e.target.value)}
              placeholder="noreply@yourdomain.com"
            />
          </label>
          
          <label>
            From Name
            <input 
              type="text" 
              value={settings.smtp_from_name || ''} 
              onChange={(e) => handleChange('smtp_from_name', e.target.value)}
              placeholder="CloudVault"
            />
          </label>
          
          <label className="checkbox-label full-width">
            <input 
              type="checkbox" 
              checked={settings.smtp_secure === 'true'}
              onChange={(e) => handleChange('smtp_secure', e.target.checked ? 'true' : 'false')}
            />
            <span>Use TLS/SSL</span>
          </label>
        </div>
        
        <button 
          type="button" 
          className="btn btn-secondary"
          onClick={testSmtp}
          disabled={testingSmtp}
        >
          {testingSmtp ? 'Testing...' : 'Test SMTP Connection'}
        </button>
      </div>

      {/* Sharing Defaults */}
      <div className="settings-section">
        <h4>Sharing Defaults</h4>
        <p className="text-muted">Default settings for new share links</p>
        
        <div className="settings-grid">
          <label>
            Default Expiry (hours)
            <input 
              type="number" 
              min="1"
              value={settings.share_default_expiry_hours || ''} 
              onChange={(e) => handleChange('share_default_expiry_hours', e.target.value)}
              placeholder="24"
            />
          </label>
          
          <label>
            Max Expiry (hours)
            <input 
              type="number" 
              min="1"
              value={settings.share_max_expiry_hours || ''} 
              onChange={(e) => handleChange('share_max_expiry_hours', e.target.value)}
              placeholder="720 (30 days)"
            />
          </label>
          
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={settings.share_require_email === 'true'}
              onChange={(e) => handleChange('share_require_email', e.target.checked ? 'true' : 'false')}
            />
            <span>Require email for shares</span>
          </label>
          
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={settings.share_send_notification === 'true'}
              onChange={(e) => handleChange('share_send_notification', e.target.checked ? 'true' : 'false')}
            />
            <span>Send email notifications</span>
          </label>
        </div>
      </div>

      {/* Security Settings */}
      <div className="settings-section">
        <h4>Security Settings</h4>
        <p className="text-muted">Configure security and access controls</p>
        
        <div className="settings-grid">
          <label>
            Session Timeout (minutes)
            <input 
              type="number" 
              min="5"
              value={settings.session_timeout_minutes || ''} 
              onChange={(e) => handleChange('session_timeout_minutes', e.target.value)}
              placeholder="60"
            />
          </label>
          
          <label>
            Max Login Attempts
            <input 
              type="number" 
              min="1"
              value={settings.max_login_attempts || ''} 
              onChange={(e) => handleChange('max_login_attempts', e.target.value)}
              placeholder="5"
            />
          </label>
          
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={settings.require_strong_passwords === 'true'}
              onChange={(e) => handleChange('require_strong_passwords', e.target.checked ? 'true' : 'false')}
            />
            <span>Require strong passwords</span>
          </label>
          
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={settings.log_all_downloads === 'true'}
              onChange={(e) => handleChange('log_all_downloads', e.target.checked ? 'true' : 'false')}
            />
            <span>Log all downloads</span>
          </label>
        </div>
      </div>

      {/* Branding */}
      <div className="settings-section">
        <h4>Branding</h4>
        <p className="text-muted">Customize the application appearance</p>
        
        <div className="settings-grid">
          <label>
            Application Name
            <input 
              type="text" 
              value={settings.app_name || ''} 
              onChange={(e) => handleChange('app_name', e.target.value)}
              placeholder="CloudVault"
            />
          </label>
          
          <label>
            Support Email
            <input 
              type="email" 
              value={settings.support_email || ''} 
              onChange={(e) => handleChange('support_email', e.target.value)}
              placeholder="support@yourdomain.com"
            />
          </label>
          
          <label className="full-width">
            Custom Footer Text
            <input 
              type="text" 
              value={settings.footer_text || ''} 
              onChange={(e) => handleChange('footer_text', e.target.value)}
              placeholder="© 2024 Your Company"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="settings-actions">
        <button 
          type="button" 
          className="btn btn-primary"
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from './api';

// SVG Cloud Provider Logos
const ProviderLogo = ({ type, size = 24 }) => {
  const logos = {
    gcp: (
      <svg viewBox="0 0 256 206" width={size} height={size}>
        <path fill="#EA4335" d="m170.252 56.819l22.253-22.253l1.483-9.37l-49.873-5.058C122.138 12.683 97.012 13.823 76.15 27.08C55.286 40.337 42.14 62.035 40.22 85.994l4.492 3.828l44.373-7.313s2.263-3.79 3.418-3.593c11.858-15.453 31.119-22.593 50.18-18.6l27.569-3.497Z"/>
        <path fill="#4285F4" d="M224.205 73.918a100.249 100.249 0 0 0-30.217-39.592l-31.232 31.232a55.82 55.82 0 0 1 20.53 44.1v5.544c15.35 0 27.797 12.445 27.797 27.796c0 15.352-12.446 27.485-27.797 27.485h-55.593l-5.544 5.857v33.253l5.544 5.544h55.593c40.259.315 73.327-31.86 73.642-72.119a72.9 72.9 0 0 0-32.723-69.1Z"/>
        <path fill="#34A853" d="M72.322 209.593h55.594v-44.652H72.322a27.374 27.374 0 0 1-11.4-2.498l-7.627 2.498l-22.566 22.253l-1.795 7.627c12.063 9.63 27.161 14.857 42.706 14.772Z"/>
        <path fill="#FBBC05" d="M72.322 64.792C32.063 65.107-.318 97.489.004 137.748a72.9 72.9 0 0 0 29.61 58.326l32.3-32.3a27.797 27.797 0 1 1 36.78-41.858l32.3-32.3A72.625 72.625 0 0 0 72.322 64.792Z"/>
      </svg>
    ),
    aws: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#FF9900" d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.806-.399l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.176 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z"/>
        <path fill="#FF9900" d="M21.725 17.845c-2.606 1.926-6.39 2.95-9.649 2.95-4.568 0-8.68-1.69-11.794-4.502-.244-.22-.025-.522.268-.35 3.358 1.953 7.513 3.132 11.806 3.132 2.895 0 6.078-.6 9.01-1.85.44-.187.812.29.36.62z"/>
        <path fill="#FF9900" d="M22.754 16.665c-.333-.427-2.2-.203-3.041-.102-.255.031-.295-.192-.064-.353 1.489-1.047 3.932-.745 4.217-.394.287.358-.075 2.826-1.472 4.006-.215.182-.42.085-.324-.155.315-.782 1.017-2.575.684-3.002z"/>
      </svg>
    ),
    azure: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#0089D6" d="M13.05 4.24l-4.26 4.01-5.98 10.44h4.72l5.52-14.45zm.87 1.63l-2.43 7.11 3.07 3.64-6.58 1.14h10.82l-4.88-11.89z"/>
      </svg>
    ),
    oracle: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#F80000" d="M7.076 7.076a6.5 6.5 0 1 0 9.848 0H7.076zM12 17.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
        <path fill="#F80000" d="M8.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zm1 0a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z"/>
      </svg>
    ),
    s3_compatible: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#C72C48" d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.08 5.1 7.63 12 4.18zM4 8.82l7 3.5v7.36l-7-3.5V8.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z"/>
      </svg>
    ),
  };
  
  return logos[type] || (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
    </svg>
  );
};

export function ProvidersAdmin() {
  const [providers, setProviders] = useState([]);
  const [providerTypes, setProviderTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [providersRes, typesRes] = await Promise.all([
        api.get('/admin/providers'),
        api.get('/admin/provider-types'),
      ]);
      setProviders(providersRes.providers || []);
      setProviderTypes(typesRes.types || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setModal({
      mode: 'add',
      type: '',
      name: '',
      config: {},
    });
    setTestResult(null);
  };

  const openEdit = (provider) => {
    setModal({
      mode: 'edit',
      id: provider.id,
      type: provider.type,
      name: provider.name,
      is_active: provider.is_active,
      config: {}, // Don't load existing config for security
    });
    setTestResult(null);
  };

  const closeModal = () => {
    setModal(null);
    setTestResult(null);
  };

  const handleTypeChange = (type) => {
    setModal({ ...modal, type, config: {} });
    setTestResult(null);
  };

  const handleConfigChange = (key, value) => {
    setModal({
      ...modal,
      config: { ...modal.config, [key]: value },
    });
    setTestResult(null);
  };

  const testConnection = async () => {
    if (!modal.type || Object.keys(modal.config).length === 0) {
      setTestResult({ success: false, message: 'Please fill in the configuration' });
      return;
    }
    
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/admin/providers/test', {
        type: modal.type,
        config: modal.config,
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const saveProvider = async () => {
    if (!modal.name || !modal.type) {
      setError('Name and type are required');
      return;
    }
    
    setError('');
    try {
      if (modal.mode === 'add') {
        await api.post('/admin/providers', {
          name: modal.name,
          type: modal.type,
          config: modal.config,
        });
      } else {
        const updates = { name: modal.name };
        if (Object.keys(modal.config).length > 0) {
          updates.config = modal.config;
        }
        if (typeof modal.is_active !== 'undefined') {
          updates.is_active = modal.is_active;
        }
        await api.patch(`/admin/providers/${modal.id}`, updates);
      }
      closeModal();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleActive = async (provider) => {
    try {
      await api.patch(`/admin/providers/${provider.id}`, {
        is_active: !provider.is_active,
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteProvider = async (provider) => {
    if (!confirm(`Delete "${provider.name}"? This will remove all user access to this provider.`)) {
      return;
    }
    
    try {
      await api.delete(`/admin/providers/${provider.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const getTypeSchema = (type) => {
    return providerTypes.find(t => t.type === type);
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
        <p style={{ marginTop: '1rem' }}>Loading providers...</p>
      </div>
    );
  }

  return (
    <div className="providers-admin">
      <div className="providers-header">
        <div>
          <h3>Cloud Providers</h3>
          <p className="text-muted">Connect your cloud storage accounts</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          Add Provider
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {providers.length === 0 ? (
        <div className="empty-state">
          <p>No cloud providers configured yet.</p>
          <p className="text-muted">Add a provider to start uploading files.</p>
        </div>
      ) : (
        <div className="providers-grid">
          {providers.map(provider => (
            <div key={provider.id} className={`provider-card ${provider.is_active ? '' : 'inactive'}`}>
              <div className="provider-card-header">
                <div className="provider-logo">
                  <ProviderLogo type={provider.type} size={32} />
                </div>
                <div className="provider-info">
                  <h4>{provider.name}</h4>
                  <span className="provider-type">{getTypeSchema(provider.type)?.name || provider.type}</span>
                </div>
                <span className={`status-indicator ${provider.is_active ? 'active' : 'inactive'}`}>
                  {provider.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="provider-card-actions">
                <button 
                  type="button" 
                  className="btn btn-small btn-ghost"
                  onClick={() => toggleActive(provider)}
                >
                  {provider.is_active ? 'Disable' : 'Enable'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-small btn-secondary"
                  onClick={() => openEdit(provider)}
                >
                  Edit
                </button>
                <button 
                  type="button" 
                  className="btn btn-small btn-danger"
                  onClick={() => deleteProvider(provider)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-provider" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.mode === 'add' ? 'Add Cloud Provider' : 'Edit Provider'}</h3>
              <button type="button" className="modal-close" onClick={closeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              {modal.mode === 'add' && (
                <div className="form-group">
                  <label className="form-label">Select Provider Type</label>
                  <div className="provider-type-grid">
                    {providerTypes.map(type => (
                      <button
                        key={type.type}
                        type="button"
                        className={`provider-type-btn ${modal.type === type.type ? 'selected' : ''}`}
                        onClick={() => handleTypeChange(type.type)}
                      >
                        <div className="provider-type-logo">
                          <ProviderLogo type={type.type} size={28} />
                        </div>
                        <span className="provider-type-name">{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={modal.name}
                  onChange={e => setModal({ ...modal, name: e.target.value })}
                  placeholder="e.g., Production GCP, Dev AWS"
                />
              </div>

              {modal.type && (
                <>
                  <div className="config-section">
                    <div className="config-header">
                      <h4>Credentials</h4>
                      <p className="text-muted">
                        {modal.mode === 'edit' 
                          ? 'Leave fields empty to keep existing credentials, or fill in to update.'
                          : 'Enter your cloud provider credentials.'}
                      </p>
                    </div>
                    
                    {getTypeSchema(modal.type)?.fields.map(field => (
                      <div className="form-group" key={field.key}>
                        <label className="form-label">
                          {field.label} {field.required && modal.mode === 'add' && <span className="required">*</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="form-textarea"
                            value={modal.config[field.key] || ''}
                            onChange={e => handleConfigChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            rows={5}
                          />
                        ) : field.type === 'checkbox' ? (
                          <div className="checkbox-wrapper">
                            <input
                              type="checkbox"
                              checked={modal.config[field.key] || false}
                              onChange={e => handleConfigChange(field.key, e.target.checked)}
                            />
                            <span>{field.placeholder || 'Enable'}</span>
                          </div>
                        ) : (
                          <input
                            type={field.type}
                            className="form-input"
                            value={modal.config[field.key] || ''}
                            onChange={e => handleConfigChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="test-connection">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={testConnection}
                      disabled={testing}
                    >
                      {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResult && (
                      <span className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                        {testResult.success ? 'Connection successful' : testResult.message}
                      </span>
                    )}
                  </div>
                </>
              )}

              {modal.mode === 'edit' && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={modal.is_active}
                      onChange={e => setModal({ ...modal, is_active: e.target.checked })}
                    />
                    <span>Provider is active</span>
                  </label>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={saveProvider}
                disabled={!modal.name || !modal.type || (modal.mode === 'add' && !testResult?.success)}
              >
                {modal.mode === 'add' ? 'Add Provider' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

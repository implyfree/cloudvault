import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';
import { FileBrowser } from './FileBrowser';
import { CostAnalytics } from './CostAnalytics';

// Searchable Select Component
function SearchableSelect({ options, value, onChange, placeholder, searchPlaceholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (opt) => {
    onChange(opt);
    setIsOpen(false);
    setSearch('');
  };

  const toggleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="searchable-select" ref={containerRef}>
      <button
        type="button"
        className={`searchable-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={toggleOpen}
      >
        <span className={value ? '' : 'placeholder'}>
          {value || placeholder}
        </span>
        <span className="select-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="searchable-select-dropdown">
          {options.length > 5 && (
            <div className="searchable-select-search">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearch('');
                  }
                  if (e.key === 'Enter' && filtered.length === 1) {
                    handleSelect(filtered[0]);
                  }
                }}
              />
            </div>
          )}
          <div className="searchable-select-options">
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">No matches found</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`searchable-select-option ${opt === value ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(opt);
                  }}
                >
                  {opt}
                  {opt === value && <span className="check">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// File type detection
function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const types = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff'],
    video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml'],
    data: ['csv', 'sql', 'db', 'sqlite'],
  };
  for (const [type, exts] of Object.entries(types)) {
    if (exts.includes(ext)) return type;
  }
  return 'file';
}

function getFileIcon(type) {
  const icons = {
    image: '◐',
    video: '▶',
    audio: '♪',
    document: '◧',
    archive: '▤',
    code: '</>',
    data: '⊞',
    file: '◇',
  };
  return icons[type] || icons.file;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
  return formatSize(bytesPerSecond) + '/s';
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Request notification permission
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

// SVG Cloud Provider Logos
const ProviderLogo = ({ type, size = 20 }) => {
  const logos = {
    gcp: (
      <svg viewBox="0 0 256 206" width={size} height={size}>
        <path fill="#EA4335" d="m170.252 56.819l22.253-22.253l1.483-9.37l-49.873-5.058C122.138 12.683 97.012 13.823 76.15 27.08C55.286 40.337 42.14 62.035 40.22 85.994l4.492 3.828l44.373-7.313s2.263-3.79 3.418-3.593c11.858-15.453 31.119-22.593 50.18-18.6l27.569-3.497Z" />
        <path fill="#4285F4" d="M224.205 73.918a100.249 100.249 0 0 0-30.217-39.592l-31.232 31.232a55.82 55.82 0 0 1 20.53 44.1v5.544c15.35 0 27.797 12.445 27.797 27.796c0 15.352-12.446 27.485-27.797 27.485h-55.593l-5.544 5.857v33.253l5.544 5.544h55.593c40.259.315 73.327-31.86 73.642-72.119a72.9 72.9 0 0 0-32.723-69.1Z" />
        <path fill="#34A853" d="M72.322 209.593h55.594v-44.652H72.322a27.374 27.374 0 0 1-11.4-2.498l-7.627 2.498l-22.566 22.253l-1.795 7.627c12.063 9.63 27.161 14.857 42.706 14.772Z" />
        <path fill="#FBBC05" d="M72.322 64.792C32.063 65.107-.318 97.489.004 137.748a72.9 72.9 0 0 0 29.61 58.326l32.3-32.3a27.797 27.797 0 1 1 36.78-41.858l32.3-32.3A72.625 72.625 0 0 0 72.322 64.792Z" />
      </svg>
    ),
    aws: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#FF9900" d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.806-.399l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.176 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z" />
        <path fill="#FF9900" d="M21.725 17.845c-2.606 1.926-6.39 2.95-9.649 2.95-4.568 0-8.68-1.69-11.794-4.502-.244-.22-.025-.522.268-.35 3.358 1.953 7.513 3.132 11.806 3.132 2.895 0 6.078-.6 9.01-1.85.44-.187.812.29.36.62z" />
        <path fill="#FF9900" d="M22.754 16.665c-.333-.427-2.2-.203-3.041-.102-.255.031-.295-.192-.064-.353 1.489-1.047 3.932-.745 4.217-.394.287.358-.075 2.826-1.472 4.006-.215.182-.42.085-.324-.155.315-.782 1.017-2.575.684-3.002z" />
      </svg>
    ),
    azure: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#0089D6" d="M13.05 4.24l-4.26 4.01-5.98 10.44h4.72l5.52-14.45zm.87 1.63l-2.43 7.11 3.07 3.64-6.58 1.14h10.82l-4.88-11.89z" />
      </svg>
    ),
    oracle: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#F80000" d="M7.076 7.076a6.5 6.5 0 1 0 9.848 0H7.076zM12 17.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z" />
        <path fill="#F80000" d="M8.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zm1 0a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z" />
      </svg>
    ),
    s3_compatible: (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="#C72C48" d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.08 5.1 7.63 12 4.18zM4 8.82l7 3.5v7.36l-7-3.5V8.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z" />
      </svg>
    ),
  };

  return logos[type] || (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
};

export function Upload({ user }) {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [buckets, setBuckets] = useState([]);
  const [bucket, setBucket] = useState('');
  const [bucketPermissions, setBucketPermissions] = useState({});
  const [prefix, setPrefix] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [providerLoading, setProviderLoading] = useState(true);
  const [bucketError, setBucketError] = useState('');
  const [bucketLoading, setBucketLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState('file');
  const [dragOver, setDragOver] = useState(false);
  const [uploadStats, setUploadStats] = useState({ speed: 0, eta: '' });
  const [uploadHistory, setUploadHistory] = useState([]);
  const [presets, setPresets] = useState([]);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [backgroundJobs, setBackgroundJobs] = useState([]);
  const [backgroundJobsLoading, setBackgroundJobsLoading] = useState(false);
  const [resumeJobId, setResumeJobId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [resumeModalJob, setResumeModalJob] = useState(null);
  const [resumeModalFile, setResumeModalFile] = useState(null);
  const [resumeModalError, setResumeModalError] = useState('');
  const [resumeModalProgress, setResumeModalProgress] = useState(null);
  const [resumeModalUploading, setResumeModalUploading] = useState(false);

  const fileInputRef = useRef(null);
  const resumeModalFileInputRef = useRef(null);
  const resumeModalClosedRef = useRef(false); // true when user closed modal without stopping – upload continues in background
  const toastTimerRef = useRef(null);
  const folderInputRef = useRef(null);
  const uploadStartTime = useRef(null);
  const currentJobIdRef = useRef(null);
  const currentFileLoadedRef = useRef(0);
  const pauseRequestedRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const progressDismissedRef = useRef(false);
  const abortController = useRef(null);

  // Per-upload tracking for concurrent uploads
  // Map<jobId, { loaded, abortFn, startTime }>
  const activeUploadsRef = useRef(new Map());
  const [activeUploadStats, setActiveUploadStats] = useState({});

  // Single source of truth for upload tabs – add a new entry here to add a new tab; path stays on refresh
  const UPLOAD_TABS = [
    { id: '', label: 'Upload' },
    { id: 'jobs', label: 'Background jobs' },
    { id: 'history', label: 'History' },
    { id: 'presets', label: 'Presets' },
    { id: 'cost', label: 'Cost', requireAdmin: true },
  ];
  const TAB_IDS = UPLOAD_TABS.map((t) => t.id);

  const getTabFromPath = useCallback(() => {
    const raw = (window.location.pathname || '/').trim() || '/';
    if (raw === '/' || raw === '') return '';
    const segment = raw.replace(/^\//, '').split('/')[0] || '';
    return TAB_IDS.includes(segment) ? segment : '';
  }, []);

  const [activeTabId, setActiveTabId] = useState(() => getTabFromPath());

  const navigateToTab = useCallback((tabId) => {
    const path = tabId ? `/${tabId}` : '/';
    window.history.pushState({}, '', path);
    setActiveTabId(tabId);
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveTabId(getTabFromPath());
    const onAppNavigate = () => setActiveTabId(getTabFromPath());
    window.addEventListener('popstate', onPopState);
    window.addEventListener('app-navigate', onAppNavigate);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('app-navigate', onAppNavigate);
    };
  }, [getTabFromPath]);

  useEffect(() => {
    setActiveTabId(getTabFromPath());
  }, [getTabFromPath]);

  const showHistory = activeTabId === 'history';
  const showPresets = activeTabId === 'presets';
  const showCostAnalytics = activeTabId === 'cost';
  const showBackgroundJobs = activeTabId === 'jobs';

  // Load saved preferences
  useEffect(() => {
    const savedProviderId = localStorage.getItem('lastProviderId');
    const savedBucket = localStorage.getItem('lastBucket');
    const savedPrefix = localStorage.getItem('lastPrefix');
    const savedHistory = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
    const savedPresets = JSON.parse(localStorage.getItem('uploadPresets') || '[]');

    if (savedProviderId) setProviderId(savedProviderId);
    if (savedBucket) setBucket(savedBucket);
    if (savedPrefix) setPrefix(savedPrefix);
    setUploadHistory(savedHistory.slice(0, 50)); // Keep last 50
    setPresets(savedPresets);

    requestNotificationPermission();
  }, []);

  // Save preferences
  useEffect(() => {
    if (providerId) localStorage.setItem('lastProviderId', providerId);
  }, [providerId]);

  useEffect(() => {
    if (bucket) localStorage.setItem('lastBucket', bucket);
  }, [bucket]);

  useEffect(() => {
    localStorage.setItem('lastPrefix', prefix);
  }, [prefix]);

  // Load providers
  const loadProviders = () => {
    setProviderLoading(true);
    api.get('/providers')
      .then(({ providers: p }) => {
        setProviders(p || []);
        if (p?.length) {
          const savedProviderId = localStorage.getItem('lastProviderId');
          if (savedProviderId && p.some(pr => pr.id === Number(savedProviderId))) {
            setProviderId(savedProviderId);
          } else {
            setProviderId(String(p[0].id));
          }
        }
      })
      .catch((err) => {
        setProviders([]);
        setError(err.message || 'Could not load providers');
      })
      .finally(() => setProviderLoading(false));
  };

  useEffect(() => {
    loadProviders();
  }, [user?.id]);

  // Load buckets when provider changes
  const loadBuckets = () => {
    if (!providerId) {
      setBuckets([]);
      setBucketPermissions({});
      return;
    }

    setBucketError('');
    setBucketLoading(true);
    setBucket('');
    setBucketPermissions({});

    api.get(`/providers/${providerId}/buckets`)
      .then(({ buckets: b }) => {
        // Extract bucket names and permissions
        const bucketList = [];
        const permMap = {};

        for (const bucket of (b || [])) {
          const name = typeof bucket === 'string' ? bucket : bucket.name;
          bucketList.push(name);
          if (bucket.permissions) {
            permMap[name] = bucket.permissions;
          }
        }

        setBuckets(bucketList);
        setBucketPermissions(permMap);

        if (bucketList.length) {
          const savedBucket = localStorage.getItem('lastBucket');
          if (savedBucket && bucketList.includes(savedBucket)) {
            setBucket(savedBucket);
          } else {
            setBucket(bucketList[0]);
          }
        }
      })
      .catch((err) => {
        setBuckets([]);
        setBucket('');
        setBucketPermissions({});
        setBucketError(err.message || 'Could not load buckets');
      })
      .finally(() => setBucketLoading(false));
  };

  useEffect(() => {
    loadBuckets();
  }, [providerId]);

  const onFileChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    setFiles(fileList.map(f => ({
      file: f,
      relativePath: f.name,
      id: Math.random().toString(36).substr(2, 9),
      type: getFileType(f.name),
    })));
    setError('');
  };

  const onFolderChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const filesWithPaths = fileList.map(f => ({
      file: f,
      relativePath: f.webkitRelativePath || f.name,
      id: Math.random().toString(36).substr(2, 9),
      type: getFileType(f.name),
    }));
    setFiles(filesWithPaths);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (items) {
      const fileList = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            fileList.push({
              file,
              relativePath: file.name,
              id: Math.random().toString(36).substr(2, 9),
              type: getFileType(file.name),
            });
          }
        }
      }
      if (fileList.length > 0) {
        setFiles(fileList);
        setError('');
      }
    }
  };

  const removeFile = (id) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const clearFiles = () => {
    setFiles([]);
    setProgress(null);
    setUploadStats({ speed: 0, eta: '' });
    setCancelRequested(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const addToHistory = (entry) => {
    const newHistory = [entry, ...uploadHistory].slice(0, 50);
    setUploadHistory(newHistory);
    localStorage.setItem('uploadHistory', JSON.stringify(newHistory));
  };

  const clearHistory = () => {
    setUploadHistory([]);
    localStorage.removeItem('uploadHistory');
  };

  const savePreset = () => {
    if (!bucket) return;
    const name = prompt('Preset name:', `${bucket}${prefix ? '/' + prefix : ''}`);
    if (!name) return;

    const newPreset = { id: Date.now(), name, bucket, prefix };
    const newPresets = [...presets, newPreset];
    setPresets(newPresets);
    localStorage.setItem('uploadPresets', JSON.stringify(newPresets));
  };

  const loadPreset = (preset) => {
    setBucket(preset.bucket);
    setPrefix(preset.prefix);
    navigateToTab('');
  };

  const deletePreset = (id) => {
    const newPresets = presets.filter(p => p.id !== id);
    setPresets(newPresets);
    localStorage.setItem('uploadPresets', JSON.stringify(newPresets));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast here
    });
  };

  const showToast = useCallback((message, durationMs = 5000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB for resumable chunked uploads
  const RESUMABLE_THRESHOLD = 100 * 1024 * 1024; // 100MB – use resumable when supported

  const isResumableUrl = (url) => typeof url === 'string' && (url.includes('uploadType=resumable') || url.includes('upload_id='));

  const CHUNK_RETRIES = 3;
  const CHUNK_RETRIES_FINAL = 6; // extra retries for final chunk (server may be slow to commit)
  const CHUNK_TIMEOUT_MS = 120000; // 2 min per chunk

  const uploadSingleFileResumable = async (file, uploadUrl, jobId, objectName, onProgress, startOffset = 0) => {
    const total = file.size;
    let offset = startOffset;
    const reportProgress = (bytesUploaded) => {
      if (onProgress) onProgress(bytesUploaded, total);
      if (jobId) api.patch(`/jobs/${jobId}/progress`, { bytes_uploaded: bytesUploaded, status: 'uploading' }).catch(() => { });
    };
    if (offset > 0) reportProgress(offset);
    while (offset < total) {
      if (cancelRequestedRef.current) throw new Error('Upload cancelled');
      if (pauseRequestedRef.current) throw new Error('Upload cancelled');
      const end = Math.min(offset + CHUNK_SIZE, total);
      const chunk = file.slice(offset, end);
      const isLastChunk = end >= total;
      const maxAttempts = isLastChunk ? CHUNK_RETRIES_FINAL : CHUNK_RETRIES;
      let lastError;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          let xhrRef;
          const uploadPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhrRef = xhr;
            abortController.current = { abort: () => xhr.abort() };
            // Update abort in per-upload map
            if (jobId && activeUploadsRef.current.has(jobId)) {
              activeUploadsRef.current.get(jobId).abortFn = () => xhr.abort();
            }
            // Report granular progress during each chunk
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable && onProgress) {
                onProgress(offset + e.loaded, total);
              }
            });
            xhr.addEventListener('load', () => resolve({ status: xhr.status, response: xhr.responseText }));
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Range', `bytes ${offset}-${end - 1}/${total}`);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.send(chunk);
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => {
              if (xhrRef) xhrRef.abort();
              reject(new Error('Request timeout – server took too long to respond. Retrying…'));
            }, CHUNK_TIMEOUT_MS)
          );
          const { status, response } = await Promise.race([uploadPromise, timeoutPromise]);
          if (status === 404 || status === 410) {
            if (jobId) {
              await api.patch(`/jobs/${jobId}/progress`, { status: 'failed', error_message: 'Resume session expired. Start a new upload with the same file.' }).catch(() => { });
            }
            throw new Error('Resume session expired. Start a new upload with the same file.');
          }
          if (status === 200 || status === 201) return;
          if (status !== 308) throw new Error(response || `Upload failed: ${status}`);
          if (isLastChunk) {
            throw new Error('Final chunk not accepted (308). Retrying…');
          }
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (err.message === 'Upload cancelled' || err.message?.includes('Paused') || pauseRequestedRef.current || cancelRequestedRef.current) throw err;
          // If this is the last chunk and we got a network error, the file
          // is very likely already committed in the bucket. Treat as success.
          if (isLastChunk && err.message === 'Network error') {
            console.warn('Last chunk network error — file likely committed. Treating as success.');
            reportProgress(total);
            return;
          }
          if (attempt < maxAttempts - 1) {
            const delay = isLastChunk ? 3000 * (attempt + 1) : 1500 * (attempt + 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (lastError) {
        // One more safety check: if all bytes were sent, treat as success
        if (end >= total && lastError.message === 'Network error') {
          console.warn('All bytes sent but got network error — treating as success.');
          reportProgress(total);
          return;
        }
        throw lastError;
      }
      offset = end;
      reportProgress(offset);
    }
  };

  const uploadSingleFile = async (file, objectName, onProgress, onJobCreated) => {
    const payload = {
      bucket,
      objectName,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
      fileName: file.name,
      resumable: file.size >= RESUMABLE_THRESHOLD,
    };
    const { uploadUrl, jobId } = await api.post(`/providers/${providerId}/upload-url`, payload);
    if (onJobCreated && jobId) onJobCreated(jobId);
    abortController.current = { abort: () => { } };
    // Update abort function in the per-upload map
    if (jobId && activeUploadsRef.current.has(jobId)) {
      activeUploadsRef.current.get(jobId).abortFn = abortController.current.abort;
    }
    if (jobId && isResumableUrl(uploadUrl)) {
      try {
        await uploadSingleFileResumable(file, uploadUrl, jobId, objectName, onProgress);
        return jobId;
      } catch (err) {
        if (pauseRequestedRef.current && jobId) {
          await api.patch(`/jobs/${jobId}/progress`, {
            bytes_uploaded: currentFileLoadedRef.current,
            status: 'paused',
          }).catch(() => { });
          const e = new Error('Paused');
          e.paused = true;
          throw e;
        }
        const e = err instanceof Error ? err : new Error(String(err));
        e.jobId = jobId;
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      abortController.current = { abort: () => xhr.abort() };
      // Update abort function in per-upload map
      if (jobId && activeUploadsRef.current.has(jobId)) {
        activeUploadsRef.current.get(jobId).abortFn = () => xhr.abort();
      }
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
        if (jobId && e.loaded > 0) {
          api.patch(`/jobs/${jobId}/progress`, { bytes_uploaded: e.loaded }).catch(() => { });
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(jobId);
        } else {
          const err = new Error(xhr.responseText || `Upload failed: ${xhr.status}`);
          err.jobId = jobId;
          reject(err);
        }
      });
      xhr.addEventListener('error', () => {
        // If all bytes were sent (progress reported 100%), the file is likely
        // already in the bucket — the connection just dropped before the
        // server's response came back.  Treat it as success.
        if (currentFileLoadedRef.current >= file.size) {
          console.warn('XHR error after 100% — treating as success (file likely in bucket)');
          resolve(jobId);
          return;
        }
        const err = new Error('Network error');
        err.jobId = jobId;
        reject(err);
      });
      xhr.addEventListener('abort', () => {
        const err = new Error('Upload cancelled');
        err.jobId = jobId;
        reject(err);
      });
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
  };

  const startUpload = async () => {
    if (!providerId || !bucket || files.length === 0) {
      setError('Select provider, bucket, and file(s).');
      return;
    }
    setError('');
    setLoading(true);
    setCancelRequested(false);
    cancelRequestedRef.current = false;
    currentJobIdRef.current = null;
    currentFileLoadedRef.current = 0;
    pauseRequestedRef.current = false;
    progressDismissedRef.current = false;
    const myStartTime = Date.now();
    uploadStartTime.current = myStartTime;
    let myJobId = null; // Local to this upload closure

    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    let uploadedSize = 0;
    let completedFiles = 0;
    const failed = [];
    const succeeded = [];

    setProgress({
      phase: 'Preparing upload...',
      percent: 0,
      loaded: 0,
      total: totalSize,
      currentFile: '',
      completedFiles: 0,
      totalFiles,
    });

    const normalizePath = (p) => (p || '').replace(/\/+$/, '').replace(/^\/+/, '');

    try {
      if (resumeJobId && files.length === 1) {
        const { file, relativePath } = files[0];
        const objectName = prefix ? `${prefix.replace(/\/+$/, '')}/${relativePath}` : relativePath;
        const objectUrl = `gs://${bucket}/${objectName}`;
        try {
          const detail = await api.get(`/jobs/${resumeJobId}`);
          const pathMatch = normalizePath(detail.object_path) === normalizePath(objectName);
          const fileMatch = (detail.file_name || '').replace(/^.*\//, '') === (relativePath || '').replace(/^.*\//, '');
          if (detail.canResume && detail.uploadUrl && fileMatch && Number(detail.file_size) === file.size && detail.bucket === bucket && pathMatch) {
            const startOffset = Number(detail.bytes_uploaded) || 0;
            currentJobIdRef.current = detail.id;
            currentFileLoadedRef.current = startOffset;
            await uploadSingleFileResumable(file, detail.uploadUrl, detail.id, objectName, (loaded, total) => {
              currentFileLoadedRef.current = loaded;
              const pct = Math.round((loaded / totalSize) * 100);
              const elapsed = (Date.now() - uploadStartTime.current) / 1000;
              const speed = loaded / elapsed;
              setUploadStats({ speed, eta: formatETA((totalSize - loaded) / speed) });
              setProgress({ phase: pct >= 99 ? 'Finalizing upload...' : 'Resuming upload...', percent: pct >= 100 ? 99.9 : pct, loaded, total: totalSize, currentFile: file.name, completedFiles: 0, totalFiles: 1 });
            }, startOffset);
            uploadedSize += file.size;
            completedFiles = 1;
            succeeded.push({ name: relativePath, url: objectUrl, size: file.size });
            api.post('/upload-complete', { bucket, objectName, status: 'success', jobId: detail.id }).catch(() => { });
            addToHistory({ id: Date.now() + Math.random(), name: relativePath, bucket, path: objectName, url: objectUrl, size: file.size, date: new Date().toISOString(), status: 'success' });
            setResumeJobId(null);
            setProgress({ phase: 'Upload complete! Resumed upload finished.', percent: 100, loaded: totalSize, total: totalSize, completedFiles: 1, totalFiles: 1, success: true, succeeded });
            showNotification('Resume complete', 'Upload finished successfully.');
            setFiles([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (folderInputRef.current) folderInputRef.current.value = '';
            return;
          }
          showNotification('Cannot resume', 'Select the same file (same name and size) and click Upload to retry.');
        } catch (resumeErr) {
          const msg = resumeErr?.message || 'Resume failed';
          if (msg.includes('session expired') || msg.includes('Session expired')) {
            showNotification('Session expired', 'Start a new upload with the same file.');
          } else if (msg !== 'Upload cancelled' && !pauseRequestedRef.current) {
            showNotification('Resume failed', msg);
          }
          setResumeJobId(null);
          setLoading(false);
          return;
        }
        setResumeJobId(null);
      }

      for (const { file, relativePath } of files) {
        if (cancelRequestedRef.current) {
          failed.push({ name: relativePath, error: 'Cancelled' });
          continue;
        }

        const objectName = prefix ? `${prefix.replace(/\/+$/, '')}/${relativePath}` : relativePath;
        const objectUrl = `gs://${bucket}/${objectName}`;

        try {
          const jobId = await uploadSingleFile(
            file,
            objectName,
            (loaded, total) => {
              currentFileLoadedRef.current = loaded;
              const currentProgress = uploadedSize + loaded;
              const pct = Math.round((currentProgress / totalSize) * 100);
              const elapsed = (Date.now() - myStartTime) / 1000;
              const speed = currentProgress / elapsed;
              const remaining = (totalSize - currentProgress) / speed;

              // Update per-job tracking
              if (myJobId) {
                const entry = activeUploadsRef.current.get(myJobId);
                if (entry) entry.loaded = Math.min(loaded, file.size);
                setActiveUploadStats(prev => ({
                  ...prev,
                  [myJobId]: { speed, eta: remaining > 0 ? formatETA(remaining) : '' },
                }));
              }

              // Only update shared inline state for the latest upload
              if (myJobId === currentJobIdRef.current) {
                setUploadStats({ speed, eta: remaining > 0 ? formatETA(remaining) : '' });
                if (!progressDismissedRef.current) {
                  setProgress({
                    phase: pct >= 99 ? `Finalizing upload...` : `Uploading ${completedFiles + 1}/${totalFiles}`,
                    percent: pct >= 100 ? 99.9 : pct,
                    loaded: currentProgress,
                    total: totalSize,
                    currentFile: file.name,
                    completedFiles,
                    totalFiles,
                  });
                }
              }
            },
            (jid) => {
              myJobId = jid;
              currentJobIdRef.current = jid;
              // Register in active uploads map
              activeUploadsRef.current.set(jid, {
                loaded: 0,
                abortFn: abortController.current?.abort,
                startTime: myStartTime,
              });
              if (file.size >= RESUMABLE_THRESHOLD) {
                showToast(`Upload tracking '${file.name}' in background. You can close this page.`, 8000);
              }
            }
          );

          uploadedSize += file.size;
          completedFiles++;
          // Note: per-job Map cleanup happens in the finally block, NOT here —
          // the server confirmation (api.post('/upload-complete')) hasn't run yet.

          // Check if user hit Stop while the upload was finishing (race condition)
          if (cancelRequestedRef.current) {
            const jid = jobId || currentJobIdRef.current;
            if (jid) {
              await api.patch(`/jobs/${jid}/progress`, {
                bytes_uploaded: file.size,
                status: 'failed',
                error_message: 'Stopped by user',
              }).catch(() => { });
            }
            api.post('/upload-complete', { bucket, objectName, status: 'failed', error: 'Stopped by user', jobId: jid || undefined }).catch(() => { });
            addToHistory({
              id: Date.now() + Math.random(),
              name: relativePath,
              bucket,
              path: objectName,
              size: file.size,
              date: new Date().toISOString(),
              status: 'failed',
              error: 'Stopped by user',
            });
            break;
          }

          succeeded.push({ name: relativePath, url: objectUrl, size: file.size });

          // Mark job as completed on server — use both endpoints for reliability
          const jid = jobId || myJobId;
          api.post('/upload-complete', { bucket, objectName, status: 'success', jobId: jid || undefined }).catch(() => { });
          if (jid) {
            api.patch(`/jobs/${jid}/progress`, {
              bytes_uploaded: file.size,
              status: 'completed',
            }).catch(() => { });
          }
          // Refresh background jobs list so UI updates immediately
          loadBackgroundJobs();

          // Add to history
          addToHistory({
            id: Date.now() + Math.random(),
            name: relativePath,
            bucket,
            path: objectName,
            url: objectUrl,
            size: file.size,
            date: new Date().toISOString(),
            status: 'success',
          });
        } catch (err) {
          if (err.paused || pauseRequestedRef.current) {
            if (!err.paused && (err.jobId || currentJobIdRef.current)) {
              const jid = err.jobId || currentJobIdRef.current;
              await api.patch(`/jobs/${jid}/progress`, {
                bytes_uploaded: currentFileLoadedRef.current,
                status: 'paused',
              }).catch(() => { });
            }
            setProgress({
              phase: 'Paused. Resume from Background jobs.',
              percent: progress?.percent ?? 0,
              loaded: progress?.loaded ?? 0,
              total: progress?.total ?? totalSize,
              currentFile: file.name,
              completedFiles,
              totalFiles,
            });
            setLoading(false);
            pauseRequestedRef.current = false;
            // Clean up per-job tracking on pause
            if (myJobId) {
              activeUploadsRef.current.delete(myJobId);
              setActiveUploadStats(prev => { const n = { ...prev }; delete n[myJobId]; return n; });
            }
            return;
          }
          if (cancelRequestedRef.current && err.jobId) {
            await api.patch(`/jobs/${err.jobId}/progress`, {
              status: 'failed',
              error_message: 'Stopped by user',
            }).catch(() => { });
          }
          failed.push({ name: relativePath, error: err.message });
          api.post('/upload-complete', { bucket, objectName, status: 'failed', error: err.message, jobId: err.jobId }).catch(() => { });

          // Clean up per-job tracking on failure
          const failedJobId = err.jobId || myJobId;
          if (failedJobId) {
            activeUploadsRef.current.delete(failedJobId);
            setActiveUploadStats(prev => { const n = { ...prev }; delete n[failedJobId]; return n; });
          }

          addToHistory({
            id: Date.now() + Math.random(),
            name: relativePath,
            bucket,
            path: objectName,
            size: file.size,
            date: new Date().toISOString(),
            status: 'failed',
            error: err.message,
          });
        }
      }

      const elapsed = ((Date.now() - myStartTime) / 1000).toFixed(1);

      if (failed.length === 0) {
        setProgress({
          phase: `Upload complete! ${totalFiles} file${totalFiles !== 1 ? 's' : ''} in ${elapsed}s`,
          percent: 100,
          loaded: totalSize,
          total: totalSize,
          completedFiles: totalFiles,
          totalFiles,
          success: true,
          succeeded,
        });
        showNotification('Upload Complete', `${totalFiles} file${totalFiles !== 1 ? 's' : ''} uploaded successfully`);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (folderInputRef.current) folderInputRef.current.value = '';
      } else if (failed.length < totalFiles) {
        setProgress({
          phase: `Completed with ${failed.length} error${failed.length !== 1 ? 's' : ''}`,
          percent: 100,
          completedFiles,
          totalFiles,
          failed,
          succeeded,
        });
        setError(`Failed: ${failed.map(f => f.name).join(', ')}`);
        showNotification('Upload Completed with Errors', `${completedFiles}/${totalFiles} files uploaded`);
      } else {
        setProgress(null);
        if (cancelRequestedRef.current) {
          setError('Upload stopped.');
        } else {
          setError('Upload failed. Please check your network connection and cloud provider permissions, then try again.');
        }
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
      setProgress(null);
    } finally {
      setLoading(false);
      setCancelRequested(false);
      cancelRequestedRef.current = false;
      // Clean up any remaining entries for this upload
      if (myJobId) {
        activeUploadsRef.current.delete(myJobId);
        setActiveUploadStats(prev => { const n = { ...prev }; delete n[myJobId]; return n; });
      }
    }
  };

  const cancelUpload = () => {
    cancelRequestedRef.current = true;
    setCancelRequested(true);
    if (abortController.current) {
      abortController.current.abort();
    }
  };

  const openResumeModal = async (job) => {
    try {
      const detail = await api.get(`/jobs/${job.id}`);
      if (!detail.canResume || !detail.uploadUrl) {
        showNotification('Cannot resume', 'Session may have expired. Start a new upload from the Upload tab.');
        return;
      }
      resumeModalClosedRef.current = false;
      setResumeModalJob(job);
      setResumeModalFile(null);
      setResumeModalError('');
      setResumeModalProgress(null);
      setResumeModalUploading(false);
      if (resumeModalFileInputRef.current) resumeModalFileInputRef.current.value = '';
    } catch (e) {
      showNotification('Error', e.message || 'Could not load job');
    }
  };

  /** Close resume modal only – do NOT abort; upload continues in background */
  const closeResumeModalOnly = () => {
    resumeModalClosedRef.current = true;
    setResumeModalJob(null);
    setResumeModalFile(null);
    setResumeModalError('');
    setResumeModalProgress(null);
    setResumeModalUploading(false);
    loadBackgroundJobs();
  };

  const handleResumeInModal = async (file) => {
    const job = resumeModalJob;
    if (!job) return;
    setResumeModalUploading(true);
    setResumeModalError('');
    setResumeModalProgress({ phase: 'Preparing...', percent: 0, loaded: 0, total: Number(job.file_size) || 0 });
    pauseRequestedRef.current = false;
    cancelRequestedRef.current = false;
    try {
      const detail = await api.get(`/jobs/${job.id}`);
      if (!detail.canResume || !detail.uploadUrl) {
        showNotification('Cannot resume', 'Session may have expired.');
        setResumeModalUploading(false);
        return;
      }
      const totalSize = Number(detail.file_size) || file.size;
      const startOffset = Number(detail.bytes_uploaded) || 0;
      currentJobIdRef.current = detail.id;
      currentFileLoadedRef.current = startOffset;
      abortController.current = { abort: () => { } };
      await uploadSingleFileResumable(file, detail.uploadUrl, detail.id, detail.object_path, (loaded, total) => {
        currentFileLoadedRef.current = loaded;
        if (!resumeModalClosedRef.current) setResumeModalProgress({ phase: 'Resuming upload...', percent: Math.min(99, Math.round((loaded / totalSize) * 100)), loaded, total: totalSize });
      }, startOffset);
      const objectUrl = `gs://${detail.bucket}/${detail.object_path}`;
      await api.post('/upload-complete', { bucket: detail.bucket, objectName: detail.object_path, status: 'success', jobId: detail.id }).catch(() => { });
      addToHistory({ id: Date.now() + Math.random(), name: detail.file_name, bucket: detail.bucket, path: detail.object_path, url: objectUrl, size: file.size, date: new Date().toISOString(), status: 'success' });
      resumeModalClosedRef.current = false;
      setResumeModalJob(null);
      setResumeModalProgress(null);
      setResumeModalUploading(false);
      loadBackgroundJobs();
      showNotification('Resume complete', 'Upload finished successfully.');
    } catch (err) {
      if (err.paused || pauseRequestedRef.current) {
        if (!err.paused && (err.jobId || currentJobIdRef.current)) {
          const jid = err.jobId || currentJobIdRef.current;
          await api.patch(`/jobs/${jid}/progress`, { bytes_uploaded: currentFileLoadedRef.current, status: 'paused' }).catch(() => { });
        }
        setResumeModalJob(null);
        setResumeModalProgress(null);
        setResumeModalUploading(false);
        loadBackgroundJobs();
        showNotification('Paused', 'Resume again from Background jobs when ready.');
        return;
      }
      if (cancelRequestedRef.current && (err.jobId || currentJobIdRef.current)) {
        await api.patch(`/jobs/${err.jobId || currentJobIdRef.current}/progress`, { status: 'failed', error_message: 'Stopped by user' }).catch(() => { });
      }
      resumeModalClosedRef.current = false;
      setResumeModalJob(null);
      setResumeModalProgress(null);
      setResumeModalUploading(false);
      loadBackgroundJobs();
      if (err.message && !err.message.includes('cancelled')) showNotification('Resume failed', err.message);
    }
  };

  const handleResumeModalFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !resumeModalJob) return;
    const job = resumeModalJob;
    const nameMatch = (file.name || '') === (job.file_name || '');
    const sizeMatch = Number(file.size) === Number(job.file_size);
    if (nameMatch && sizeMatch) {
      setResumeModalError('');
      setResumeModalFile(file);
      handleResumeInModal(file);
    } else {
      setResumeModalFile(file);
      setResumeModalError('new');
    }
  };

  const retryFailed = async () => {
    if (!progress?.failed?.length) return;

    const failedFiles = files.filter(f =>
      progress.failed.some(failed => failed.name === f.relativePath)
    );

    if (failedFiles.length > 0) {
      setFiles(failedFiles);
      setProgress(null);
      // Will need to click upload again
    }
  };

  const formatETA = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const loadBackgroundJobs = () => {
    setBackgroundJobsLoading(true);
    api.get('/jobs')
      .then(({ jobs }) => setBackgroundJobs(jobs || []))
      .catch(() => setBackgroundJobs([]))
      .finally(() => setBackgroundJobsLoading(false));
  };

  // Load background jobs on mount and when switching to the tab
  useEffect(() => {
    loadBackgroundJobs();
  }, []);

  useEffect(() => {
    if (showBackgroundJobs) loadBackgroundJobs();
  }, [showBackgroundJobs]);

  const hasActiveJobs = backgroundJobs.some((j) => j.status === 'uploading' || j.status === 'pending');
  // Track if THIS browser tab has an active upload running (inline or backgrounded)
  const isActivelyUploading = (loading && !progress?.success) || hasActiveJobs;
  useEffect(() => {
    if (!hasActiveJobs) return;
    // Auto-refresh when there are active jobs (regardless of which tab is open)
    const interval = setInterval(loadBackgroundJobs, showBackgroundJobs ? 4000 : 15000);
    return () => clearInterval(interval);
  }, [showBackgroundJobs, hasActiveJobs]);

  // Notify App.jsx of upload status (for the global banner)
  useEffect(() => {
    // Find the best available speed/ETA from any active upload
    let bestSpeed = '';
    let bestEta = '';
    const statEntries = Object.values(activeUploadStats);
    if (statEntries.length > 0) {
      // Sum speeds across all active uploads
      const totalSpeed = statEntries.reduce((sum, s) => sum + (s.speed || 0), 0);
      if (totalSpeed > 0) {
        bestSpeed = formatSpeed(totalSpeed);
        // Use the longest ETA
        bestEta = statEntries.reduce((longest, s) => {
          return (s.eta && s.eta.length > longest.length) ? s.eta : longest;
        }, '');
      }
    } else if (uploadStats.speed > 0) {
      bestSpeed = formatSpeed(uploadStats.speed);
      bestEta = uploadStats.eta || '';
    }
    window.dispatchEvent(new CustomEvent('upload-status-change', {
      detail: {
        active: isActivelyUploading,
        speed: bestSpeed,
        eta: bestEta,
      },
    }));
  }, [isActivelyUploading, uploadStats, activeUploadStats]);

  const formatDuration = (start, end) => {
    if (!start) return '—';
    const s = start instanceof Date ? start : new Date(start);
    const e = end ? (end instanceof Date ? end : new Date(end)) : new Date();
    const sec = Math.round((e - s) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const folderName = files.length > 0 && files[0].relativePath.includes('/')
    ? files[0].relativePath.split('/')[0]
    : null;

  // Group files by type for summary
  const fileTypeSummary = files.reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="upload-section">
      <div className="section-header">
        <div>
          <h2>Cloud Upload</h2>
          <p>Securely upload files and folders to your cloud storage</p>
        </div>
        <div className="section-actions">
          {UPLOAD_TABS.filter((t) => !t.requireAdmin || user.is_admin || user.is_cost_manager).map((tab) => (
            <button
              key={tab.id || 'upload'}
              type="button"
              className={`btn btn-small ${activeTabId === tab.id ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => {
                if (tab.id === '') setResumeJobId(null);
                navigateToTab(tab.id);
              }}
            >
              {tab.id === 'history' && uploadHistory.length > 0
                ? `History (${uploadHistory.length})`
                : tab.id === 'presets' && presets.length > 0
                  ? `Presets (${presets.length})`
                  : tab.id === 'jobs' && backgroundJobs.filter(j => j.status === 'uploading' || j.status === 'pending' || j.status === 'paused').length > 0
                    ? <>{tab.label} <span className="tab-badge">{backgroundJobs.filter(j => j.status === 'uploading' || j.status === 'pending' || j.status === 'paused').length}</span></>
                    : tab.label
              }
            </button>
          ))}
          {providerId && bucket && bucketPermissions[bucket]?.can_view && (
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => setShowFileBrowser(true)}
            >
              Browse Files
            </button>
          )}
        </div>
      </div>

      {/* On-screen toast when upload runs as background job */}
      {toastMessage && (
        <div
          className="upload-toast"
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 12,
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-glow)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontSize: 14,
          }}
        >
          <span>{toastMessage}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => { setToastMessage(null); if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); toastTimerRef.current = null; } navigateToTab('jobs'); }}
            >
              View in Background jobs
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => { setToastMessage(null); if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); toastTimerRef.current = null; } }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Presets Panel */}
      {showPresets && (
        <div className="panel presets-panel">
          <div className="panel-header">
            <h4>Saved Presets</h4>
            <button type="button" className="btn btn-small btn-primary" onClick={savePreset} disabled={!bucket}>
              Save Current
            </button>
          </div>
          {presets.length === 0 ? (
            <p className="text-muted panel-empty">No presets saved. Save your frequently used bucket + prefix combinations.</p>
          ) : (
            <div className="presets-list">
              {presets.map(p => (
                <div key={p.id} className="preset-item">
                  <button type="button" className="preset-load" onClick={() => loadPreset(p)}>
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-path">{p.bucket}/{p.prefix || ''}</span>
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => deletePreset(p.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="panel history-panel">
          <div className="panel-header">
            <h4>Upload History</h4>
            {uploadHistory.length > 0 && (
              <button type="button" className="btn btn-small btn-ghost" onClick={clearHistory}>
                Clear All
              </button>
            )}
          </div>
          {uploadHistory.length === 0 ? (
            <p className="text-muted panel-empty">No upload history yet.</p>
          ) : (
            <div className="history-list">
              {uploadHistory.map(h => (
                <div key={h.id} className={`history-item ${h.status}`}>
                  <div className="history-info">
                    <span className="history-name">{h.name}</span>
                    <span className="history-meta">
                      {h.bucket} • {formatSize(h.size)} • {formatDate(new Date(h.date))}
                    </span>
                  </div>
                  <div className="history-actions">
                    {h.status === 'success' && (
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() => copyToClipboard(h.url)}
                        title="Copy URL"
                      >
                        Copy
                      </button>
                    )}
                    <span className={`status-badge ${h.status}`}>
                      {h.status === 'success' ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Background Jobs Panel */}
      {showBackgroundJobs && (
        <div className="panel history-panel background-jobs-panel">
          <div className="panel-header">
            <h4>Background jobs</h4>
            <button type="button" className="btn btn-small btn-ghost" onClick={loadBackgroundJobs} disabled={backgroundJobsLoading}>
              {backgroundJobsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {resumeJobId && (
            <div className="jobs-resume-banner" style={{ padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 8, marginBottom: 12 }}>
              <strong>Resume upload:</strong> Select the same file below and click Upload to continue from where you left off.
              <button type="button" className="btn btn-small btn-ghost" style={{ marginLeft: 8 }} onClick={() => setResumeJobId(null)}>Cancel</button>
            </div>
          )}
          {backgroundJobsLoading && backgroundJobs.length === 0 ? (
            <p className="text-muted panel-empty">Loading jobs…</p>
          ) : backgroundJobs.length === 0 ? (
            <p className="text-muted panel-empty">No background jobs yet. Large uploads (100MB+) are tracked here and can be resumed if interrupted.</p>
          ) : (
            <>
              {/* Summary status bar */}
              <div className="jobs-status-bar">
                <span className="jobs-status-count">
                  {backgroundJobs.length} job{backgroundJobs.length !== 1 ? 's' : ''}
                </span>
                <span className="jobs-status-active">
                  {backgroundJobs.filter((j) => j.status === 'uploading' || j.status === 'pending').length} active
                </span>
                <span className="jobs-status-done">
                  {backgroundJobs.filter((j) => j.status === 'completed').length} completed
                </span>
                {backgroundJobs.some((j) => j.status === 'failed') && (
                  <span className="jobs-status-failed">
                    {backgroundJobs.filter((j) => j.status === 'failed').length} failed
                  </span>
                )}
              </div>
              <div className="history-list jobs-list">
                {backgroundJobs.map((j) => {
                  const liveEntry = activeUploadsRef.current.get(j.id);
                  const isTracked = !!liveEntry; // We can control this upload
                  const fileSize = Number(j.file_size) || 0;
                  // Use real-time client data for tracked uploads, server data for others
                  const rawBytes = isTracked && liveEntry.loaded > 0
                    ? liveEntry.loaded
                    : Number(j.bytes_uploaded) || 0;
                  const bytesUploaded = fileSize > 0 ? Math.min(rawBytes, fileSize) : rawBytes;
                  const pct = fileSize > 0 ? Math.min(100, Math.round((bytesUploaded / fileSize) * 1000) / 10) : (Math.min(100, Number(j.progress_pct) || 0));
                  const isActive = j.status === 'uploading' || j.status === 'pending' || j.status === 'paused';
                  const jobStats = activeUploadStats[j.id];
                  return (
                    <div key={j.id} className={`job-card job-card--${j.status}`}>
                      <div className="job-card-header">
                        <span className="job-card-name" title={j.file_name}>{j.file_name}</span>
                        <span className={`status-badge status-badge--${j.status}`}>
                          {j.status === 'completed' ? '✓ Done' : j.status === 'failed' ? '✗ Failed' : j.status === 'uploading' && pct >= 99 ? 'Finalizing...' : j.status === 'uploading' ? 'Uploading…' : j.status === 'paused' ? 'Paused' : 'Pending'}
                        </span>
                      </div>
                      <div className="job-card-meta">
                        {j.provider_name} • {j.bucket} • {formatSize(fileSize)}
                        {j.started_at && (
                          <> • {j.completed_at ? formatDuration(j.started_at, j.completed_at) : `Started ${formatDuration(j.started_at, null)} ago`}</>
                        )}
                        {j.created_at && !j.started_at && <> • Queued {formatDate(new Date(j.created_at))}</>}
                      </div>
                      {isActive && fileSize > 0 && (
                        <div className="job-card-progress">
                          <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="job-card-stats">
                            <span>{formatSize(bytesUploaded)} / {formatSize(fileSize)}</span>
                            <span className="job-card-pct">{pct.toFixed(1)}%</span>
                          </div>
                          {jobStats && jobStats.speed > 0 && (
                            <div className="job-card-speed">
                              {formatSpeed(jobStats.speed)} • ETA: {jobStats.eta || 'calculating...'}
                            </div>
                          )}
                        </div>
                      )}
                      {j.status === 'completed' && (
                        <div className="job-card-progress job-card-progress--done">
                          <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${bytesUploaded > 0 && fileSize > 0 ? Math.min(100, Math.round((bytesUploaded / fileSize) * 100)) : 100}%` }} />
                          </div>
                          <div className="job-card-stats">
                            <span>{formatSize(bytesUploaded || fileSize)} uploaded</span>
                            <span className="job-card-pct">{bytesUploaded > 0 && fileSize > 0 ? Math.min(100, Math.round((bytesUploaded / fileSize) * 100)) : 100}%</span>
                          </div>
                        </div>
                      )}
                      {j.status === 'failed' && fileSize > 0 && (
                        <div className="job-card-progress job-card-progress--failed">
                          <div className="progress-bar-container">
                            <div className="progress-bar-fill progress-bar-fill--failed" style={{ width: `${bytesUploaded > 0 ? Math.min(100, Math.round((bytesUploaded / fileSize) * 100)) : 0}%` }} />
                          </div>
                          <div className="job-card-stats">
                            <span>{formatSize(bytesUploaded)} / {formatSize(fileSize)}</span>
                            <span className="job-card-pct">{bytesUploaded > 0 ? Math.round((bytesUploaded / fileSize) * 100) : 0}%</span>
                          </div>
                        </div>
                      )}
                      {j.status === 'failed' && j.error_message && (
                        <div className="job-card-error form-error">{j.error_message}</div>
                      )}
                      <div className="job-card-actions">
                        {j.status === 'uploading' && isTracked ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => {
                                pauseRequestedRef.current = true;
                                const entry = activeUploadsRef.current.get(j.id);
                                if (entry?.abortFn) entry.abortFn();
                              }}
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => {
                                cancelRequestedRef.current = true;
                                setCancelRequested(true);
                                const entry = activeUploadsRef.current.get(j.id);
                                if (entry?.abortFn) entry.abortFn();
                              }}
                            >
                              Stop
                            </button>
                          </>
                        ) : j.status === 'uploading' && pct >= 99 ? (
                          <span className="status-badge status-badge--uploading" style={{ fontSize: '0.75rem' }}>Server confirming...</span>
                        ) : j.status === 'uploading' ? (
                          <span className="status-badge status-badge--uploading" style={{ fontSize: '0.75rem' }}>Running in background</span>
                        ) : (j.status === 'paused' || j.status === 'pending') && (
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            onClick={() => openResumeModal(j)}
                          >
                            Resume
                          </button>
                        )}
                        {j.status === 'failed' && j.error_message && !j.error_message.includes('Stopped by user') && (
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            onClick={() => openResumeModal(j)}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cost Analytics Panel */}
      {showCostAnalytics && (
        <div className="panel cost-panel">
          <CostAnalytics />
        </div>
      )}

      {/* Upload Form - only show when not viewing History, Presets, Cost, or Background jobs */}
      {!showHistory && !showPresets && !showCostAnalytics && !showBackgroundJobs && (
        <div className="upload-form">
          {/* Provider Selection */}
          <label>
            Cloud Provider
            {providerLoading ? (
              <div className="loading-inline">
                <div className="progress-spinner" style={{ width: 16, height: 16 }}></div>
                <span className="text-muted">Loading providers...</span>
              </div>
            ) : providers.length === 0 ? (
              <div className="empty-provider-notice">
                <p className="text-muted">No cloud providers configured.</p>
                {user?.is_admin && <p className="text-muted">Go to Admin → Providers to add one.</p>}
              </div>
            ) : (
              <div className="provider-select-grid">
                {providers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`provider-select-btn ${String(p.id) === String(providerId) ? 'selected' : ''}`}
                    onClick={() => setProviderId(String(p.id))}
                  >
                    <span className="provider-select-logo">
                      <ProviderLogo type={p.type} size={20} />
                    </span>
                    <span className="provider-name">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </label>

          {/* Bucket Selection */}
          {providerId && (
            <label>
              Destination Bucket
              {bucketLoading ? (
                <div className="loading-inline">
                  <div className="progress-spinner" style={{ width: 16, height: 16 }}></div>
                  <span className="text-muted">Loading buckets...</span>
                </div>
              ) : bucketError ? (
                <div className="bucket-error">
                  <span className="form-error">{bucketError}</span>
                  <button type="button" className="btn btn-small btn-secondary" onClick={loadBuckets}>
                    Retry
                  </button>
                </div>
              ) : buckets.length === 0 ? (
                <p className="text-muted">No buckets available in this provider.</p>
              ) : (
                <SearchableSelect
                  options={buckets}
                  value={bucket}
                  onChange={setBucket}
                  placeholder="Select a bucket"
                  searchPlaceholder="Search buckets..."
                />
              )}
            </label>
          )}

          {/* Prefix */}
          <label>
            Path Prefix <span className="label-hint">(leave empty if not sure)</span>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g., backups/2024/january"
            />
            <span className="hint">
              → {bucket || 'bucket'}/{prefix ? prefix.replace(/\/+$/, '') + '/' : ''}{files.length > 0 ? (folderName || files[0]?.relativePath || '...') : 'your-file.ext'}
            </span>
          </label>

          {/* Upload Mode Toggle */}
          <div className="upload-mode-toggle">
            <button
              type="button"
              className={`btn ${uploadMode === 'file' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setUploadMode('file'); clearFiles(); }}
            >
              Files
            </button>
            <button
              type="button"
              className={`btn ${uploadMode === 'folder' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setUploadMode('folder'); clearFiles(); }}
            >
              Folder
            </button>
          </div>

          {/* Drop Zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploadMode === 'file' ? (
              <input
                type="file"
                multiple
                onChange={onFileChange}
                ref={fileInputRef}
              />
            ) : (
              <input
                type="file"
                webkitdirectory=""
                directory=""
                onChange={onFolderChange}
                ref={folderInputRef}
              />
            )}
            <div className="drop-zone-content">
              <div className="drop-zone-icon">
                ↑
              </div>
              <p className="drop-zone-text">
                {dragOver ? 'Drop files here' : uploadMode === 'file' ? 'Click or drag files here' : 'Click to select a folder'}
              </p>
              <p className="drop-zone-hint">
                {uploadMode === 'file' ? 'Select multiple files or drag & drop' : 'All files in the folder will be uploaded'}
              </p>
            </div>
          </div>

          {/* Selected Files */}
          {files.length > 0 && !progress && (
            <div className="selected-files">
              <div className="selected-files-header">
                <div className="selected-files-info">
                  <div className="files-count">{files.length}</div>
                  <div className="files-meta">
                    <strong>{files.length} file{files.length !== 1 ? 's' : ''} selected</strong>
                    <span>{formatSize(totalSize)} total</span>
                  </div>
                  {folderName && (
                    <span className="folder-badge">{folderName}</span>
                  )}
                </div>
                <button type="button" className="btn btn-small btn-ghost" onClick={clearFiles}>
                  Clear All
                </button>
              </div>

              {/* File type summary */}
              {Object.keys(fileTypeSummary).length > 1 && (
                <div className="file-type-summary">
                  {Object.entries(fileTypeSummary).map(([type, count]) => (
                    <span key={type} className="type-badge">
                      {getFileIcon(type)} {count} {type}
                    </span>
                  ))}
                </div>
              )}

              <ul className="file-list">
                {files.slice(0, 10).map((f) => (
                  <li key={f.id}>
                    <span className="file-icon">{getFileIcon(f.type)}</span>
                    <span className="file-name">{f.relativePath}</span>
                    <span className="file-size">{formatSize(f.file.size)}</span>
                    <button
                      type="button"
                      className="file-remove"
                      onClick={() => removeFile(f.id)}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              {files.length > 10 && (
                <div className="files-overflow">
                  +{files.length - 10} more files
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className={`progress-container ${progress.success ? 'progress-success' : ''}`}>
              <div className="progress-header">
                <div className="progress-status">
                  {progress.success ? (
                    <div className="success-icon"></div>
                  ) : (
                    <div className="progress-spinner"></div>
                  )}
                  <span className="progress-phase">{progress.phase}</span>
                </div>
                <span className="progress-percent">{progress.percent}%</span>
              </div>

              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>

              <div className="progress-details">
                <span>
                  {progress.loaded != null && progress.total != null
                    ? `${formatSize(progress.loaded)} / ${formatSize(progress.total)}`
                    : `${progress.completedFiles || 0} / ${progress.totalFiles || 0} files`
                  }
                </span>
                {!progress.success && uploadStats.speed > 0 && (
                  <span>
                    {formatSpeed(uploadStats.speed)} • ETA: {uploadStats.eta || 'calculating...'}
                  </span>
                )}
              </div>

              {progress.currentFile && !progress.success && (
                <div className="current-file">
                  Current: {progress.currentFile}
                </div>
              )}


              {/* Success actions */}
              {progress.success && progress.succeeded && (
                <div className="success-actions">
                  {progress.succeeded.length === 1 && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => copyToClipboard(progress.succeeded[0].url)}
                    >
                      Copy URL
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setProgress(null)}
                    style={{ flex: 1 }}
                  >
                    Start New Upload
                  </button>
                </div>
              )}

              {/* Failed files with retry */}
              {progress.failed && progress.failed.length > 0 && (
                <div className="failed-files">
                  <p className="failed-title">Failed uploads:</p>
                  <ul>
                    {progress.failed.map((f, i) => (
                      <li key={i}>{f.name}: {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {loading && !progress.success && (
                <div className="upload-warning-banner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Do not close or refresh this page during upload
                </div>
              )}

              {/* Pause, Stop during upload */}
              {loading && !progress.success && (
                <div className="progress-actions">
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => {
                      pauseRequestedRef.current = true;
                      if (abortController.current) abortController.current.abort();
                    }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-danger cancel-btn"
                    onClick={cancelUpload}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => {
                      // Dismiss inline progress — upload continues in its async closure
                      progressDismissedRef.current = true;
                      setProgress(null);
                      setLoading(false); // Re-enable Upload button for new uploads
                      setError('');
                      setFiles([]);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      if (folderInputRef.current) folderInputRef.current.value = '';
                      navigateToTab('jobs');
                    }}
                    style={{ marginLeft: 'auto' }}
                  >
                    View in Background jobs →
                  </button>
                </div>
              )}

              {/* Show link to background jobs when paused */}
              {!loading && progress?.phase?.startsWith?.('Paused') && (
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => navigateToTab('jobs')}
                >
                  View in Background jobs →
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && <p className="form-error">{error}</p>}

          {/* Upload Button */}
          {!progress && (
            <button
              type="button"
              className="btn btn-primary upload-btn"
              onClick={startUpload}
              disabled={loading || !providerId || !bucket || files.length === 0}
            >
              {loading
                ? 'Uploading...'
                : files.length > 0
                  ? `Upload ${files.length} file${files.length !== 1 ? 's' : ''} (${formatSize(totalSize)})`
                  : 'Select files to upload'
              }
            </button>
          )}
        </div>
      )}

      {/* Resume upload modal */}
      {resumeModalJob && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeResumeModalOnly(); }}
          title="Close (upload continues in background)"
        >
          <div className="modal modal-resume" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Resume upload</h3>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                style={{ fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem 0.5rem' }}
                aria-label="Close"
                title="Close (upload continues in background)"
                onClick={closeResumeModalOnly}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }} title={resumeModalJob.file_name}>
              {resumeModalJob.file_name?.length > 50 ? resumeModalJob.file_name.slice(0, 50) + '…' : resumeModalJob.file_name}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Select the same file to continue from where you left off.
            </p>
            {!resumeModalUploading && !resumeModalError && (
              <>
                <input
                  ref={resumeModalFileInputRef}
                  type="file"
                  accept="*"
                  style={{ display: 'none' }}
                  onChange={handleResumeModalFileSelect}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => resumeModalFileInputRef.current?.click()}
                  style={{ marginBottom: 16 }}
                >
                  Select file
                </button>
              </>
            )}
            {resumeModalError === 'new' && resumeModalFile && !resumeModalUploading && (
              <div style={{ marginTop: 12 }}>
                <p className="form-error" style={{ marginBottom: 12 }}>New file detected. Do you want to upload this as a new upload?</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setFiles([{ file: resumeModalFile, relativePath: resumeModalFile.name }]);
                      setProviderId(String(resumeModalJob.provider_id));
                      setBucket(resumeModalJob.bucket || bucket);
                      const path = resumeModalJob.object_path || '';
                      const fileName = resumeModalJob.file_name || '';
                      setPrefix(path.endsWith(fileName) ? path.slice(0, -fileName.length).replace(/\/$/, '') : '');
                      setResumeModalJob(null);
                      setResumeModalFile(null);
                      setResumeModalError('');
                      navigateToTab('');
                    }}
                  >
                    Upload as new
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setResumeModalFile(null);
                      setResumeModalError('');
                      if (resumeModalFileInputRef.current) resumeModalFileInputRef.current.value = '';
                    }}
                  >
                    Choose another file
                  </button>
                </div>
              </div>
            )}
            {resumeModalProgress && resumeModalUploading && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>{resumeModalProgress.phase}</span>
                  <span>{resumeModalProgress.percent}%</span>
                </div>
                <div className="progress-bar-container" style={{ marginBottom: 12 }}>
                  <div className="progress-bar-fill" style={{ width: `${resumeModalProgress.percent}%` }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {formatSize(resumeModalProgress.loaded)} / {formatSize(resumeModalProgress.total)}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-small btn-secondary" onClick={() => { pauseRequestedRef.current = true; if (abortController.current) abortController.current.abort(); }}>Pause</button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => { cancelRequestedRef.current = true; setCancelRequested(true); if (abortController.current) abortController.current.abort(); }}>Stop</button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    style={{ marginLeft: 'auto' }}
                    title="Close (upload continues in background)"
                    onClick={closeResumeModalOnly}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Browser Modal */}
      {showFileBrowser && (
        <div className="modal-overlay" onClick={() => setShowFileBrowser(false)}>
          <div className="modal modal-file-browser" onClick={(e) => e.stopPropagation()}>
            <FileBrowser
              providerId={providerId}
              bucket={bucket}
              onClose={() => setShowFileBrowser(false)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

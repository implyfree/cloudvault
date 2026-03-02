import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';

// ============ UTILITY FUNCTIONS ============
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatCurrency(amount) {
  if (!amount || amount < 0.0001) return '$0.00';
  if (amount >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (amount >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatDate(dateStr) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();

  // If same year, show "Jan 5", otherwise show "Jan 5, 2025"
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

function formatChartDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // Always show month and year for chart axis: "Jan '25"
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
}

function formatNumber(num) {
  if (!num) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

const PROVIDER_COLORS = {
  gcp: '#4285F4',
  aws: '#FF9900',
  azure: '#0089D6',
  oracle: '#F80000',
  s3_compatible: '#C72C48',
};

const TIME_RANGES = [
  { label: 'Last 15 minutes', value: '15m', days: 0.01 },
  { label: 'Last 1 hour', value: '1h', days: 0.042 },
  { label: 'Last 6 hours', value: '6h', days: 0.25 },
  { label: 'Last 12 hours', value: '12h', days: 0.5 },
  { label: 'Last 24 hours', value: '24h', days: 1 },
  { label: 'Last 7 days', value: '7d', days: 7 },
  { label: 'Last 30 days', value: '30d', days: 30 },
  { label: 'Last 90 days', value: '90d', days: 90 },
  { label: 'Last 1 year', value: '1y', days: 365 },
  { label: 'All time', value: 'all', days: null },
];

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
  { label: '15m', value: 900000 },
  { label: '30m', value: 1800000 },
  { label: '1h', value: 3600000 },
];

// ============ MINI CHART COMPONENT ============
function MiniChart({ data, color, height = 40 }) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map(d => d.value), 1);
  const width = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - (d.value / max) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#gradient-${color})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ============ LINE CHART COMPONENT ============
function LineChart({ data, title, valueFormatter = formatSize, color = '#6366f1', height = 200, emptyMessage = 'No historical data available' }) {
  const [hoverInfo, setHoverInfo] = useState(null);
  const graphRef = useRef(null);

  if (!data || data.length === 0) {
    return (
      <div className="line-chart" style={{ height }}>
        <div className="line-chart-title">{title}</div>
        <div className="chart-empty">
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  // If only 1 data point, show as a single value display
  if (data.length === 1) {
    return (
      <div className="line-chart" style={{ height }}>
        <div className="line-chart-title">{title}</div>
        <div className="chart-single-value">
          <span className="single-value">{valueFormatter(data[0].value)}</span>
          <span className="single-date">{formatShortDate(data[0].date)}</span>
        </div>
      </div>
    );
  }

  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const width = 100;
  const chartHeight = 70; // percentage
  const padding = 5;

  // Calculate point positions
  const pointsData = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
    const y = (100 - padding) - ((d.value - min) / range) * chartHeight;
    return { x, y, date: d.date, value: d.value };
  });

  const points = pointsData.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${padding},${100 - padding} ${points} ${width - padding},${100 - padding}`;

  // Generate Y-axis labels
  const yLabels = [max, (max + min) / 2, min].map(v => valueFormatter(v));

  // Generate X-axis labels (show 5 evenly spaced dates with year)
  const xLabels = [];
  const numLabels = Math.min(5, data.length);
  for (let i = 0; i < numLabels; i++) {
    const idx = Math.floor(i * (data.length - 1) / (numLabels - 1));
    xLabels.push(formatChartDate(data[idx].date));
  }

  // Handle mouse move for hover tooltip
  const handleMouseMove = (e) => {
    if (!graphRef.current) return;
    const rect = graphRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Calculate position within the chart area (accounting for padding)
    const chartStartX = (padding / 100) * rect.width;
    const chartEndX = ((100 - padding) / 100) * rect.width;
    const chartWidth = chartEndX - chartStartX;

    // Clamp mouse position to chart area
    const clampedMouseX = Math.max(chartStartX, Math.min(chartEndX, mouseX));
    const percentInChart = (clampedMouseX - chartStartX) / chartWidth;

    // Find closest data point
    const idx = Math.round(percentInChart * (data.length - 1));
    const clampedIdx = Math.max(0, Math.min(data.length - 1, idx));
    const point = pointsData[clampedIdx];

    // Convert SVG coordinates to pixel coordinates
    const pixelX = (point.x / 100) * rect.width;
    const pixelY = (point.y / 100) * rect.height;

    setHoverInfo({
      x: pixelX,
      y: pixelY,
      date: point.date,
      value: point.value,
      idx: clampedIdx,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div className="line-chart" style={{ height: height + 40 }}>
      <div className="line-chart-title">{title}</div>
      <div className="line-chart-container">
        <div className="line-chart-y-axis">
          {yLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div
          className="line-chart-graph"
          ref={graphRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`line-gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            <line x1={padding} y1={100 - padding - chartHeight} x2={width - padding} y2={100 - padding - chartHeight} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="2,2" />
            <line x1={padding} y1={100 - padding - chartHeight / 2} x2={width - padding} y2={100 - padding - chartHeight / 2} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="2,2" />
            <line x1={padding} y1={100 - padding} x2={width - padding} y2={100 - padding} stroke="var(--border)" strokeWidth="0.3" />
            {/* Area fill - subtle */}
            <polygon points={areaPoints} fill={`url(#line-gradient-${color.replace('#', '')})`} />
            {/* Line - thin and smooth */}
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Hover tooltip */}
          {hoverInfo && (
            <>
              <div
                className="chart-hover-line"
                style={{ left: `${hoverInfo.x}px` }}
              />
              <div
                className="chart-hover-dot"
                style={{
                  left: `${hoverInfo.x}px`,
                  top: `${hoverInfo.y}px`,
                  background: color
                }}
              />
              <div
                className="chart-tooltip"
                style={{
                  left: hoverInfo.idx > data.length / 2 ? `${hoverInfo.x - 110}px` : `${hoverInfo.x + 15}px`,
                  top: `${Math.max(10, hoverInfo.y - 20)}px`,
                }}
              >
                <div className="tooltip-value">{valueFormatter(hoverInfo.value)}</div>
                <div className="tooltip-date">{formatShortDate(hoverInfo.date)}</div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="line-chart-x-axis">
        {xLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}

// ============ BAR CHART COMPONENT ============
function BarChart({ data, title, valueFormatter = formatCurrency, color = '#6366f1' }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <span>No data available</span>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="bar-chart">
      <div className="bar-chart-title">{title}</div>
      <div className="bar-chart-bars">
        {data.slice(0, 10).map((item, i) => (
          <div key={i} className="bar-item">
            <div className="bar-label" title={item.label}>{item.label}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: item.color || color
                }}
              />
            </div>
            <div className="bar-value">{valueFormatter(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ DONUT CHART COMPONENT ============
function DonutChart({ data, title, size = 120 }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-chart">
      <div className="donut-chart-title">{title}</div>
      <div className="donut-container">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {data.map((item, i) => {
            const percentage = item.value / total;
            const strokeDasharray = `${percentage * circumference} ${circumference}`;
            const strokeDashoffset = -offset * circumference;
            offset += percentage;

            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="12"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <div className="donut-total">{formatCurrency(total)}</div>
          <div className="donut-label">Total</div>
        </div>
      </div>
      <div className="donut-legend">
        {data.map((item, i) => (
          <div key={i} className="legend-item">
            <span className="legend-dot" style={{ background: item.color }}></span>
            <span className="legend-label">{item.label}</span>
            <span className="legend-value">{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ STAT CARD COMPONENT ============
function StatCard({ icon, label, value, subValue, trend, color, sparkData }) {
  return (
    <div className="stat-card" style={{ '--stat-color': color }}>
      <div className="stat-card-header">
        <div className="stat-icon">{icon}</div>
        <div className="stat-trend" data-trend={trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral'}>
          {trend !== undefined && (
            <>
              {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
              {Math.abs(trend).toFixed(1)}%
            </>
          )}
        </div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {subValue && <div className="stat-sub">{subValue}</div>}
      {sparkData && sparkData.length > 0 && (
        <div className="stat-spark">
          <MiniChart data={sparkData} color={color} height={30} />
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export function CostAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('30d');
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('');
  const [providers, setProviders] = useState([]);
  const [allBuckets, setAllBuckets] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false);
  const [showRefreshDropdown, setShowRefreshDropdown] = useState(false);

  const refreshIntervalRef = useRef(null);
  const timeRangeRef = useRef(null);
  const refreshRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (timeRangeRef.current && !timeRangeRef.current.contains(e.target)) {
        setShowTimeRangeDropdown(false);
      }
      if (refreshRef.current && !refreshRef.current.contains(e.target)) {
        setShowRefreshDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  // Load costs when filters change
  useEffect(() => {
    loadCosts();
  }, [timeRange, selectedProvider, selectedBucket]);

  // Auto-refresh (also triggers Calculate Sizes)
  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    if (autoRefresh > 0) {
      refreshIntervalRef.current = setInterval(async () => {
        // First trigger bucket size calculation
        if (!refreshing) {
          try {
            await api.post('/admin/bucket-size/refresh-all');
          } catch (e) {
            console.error('Auto-refresh calculate sizes failed:', e);
          }
        }
        // Then reload cost data
        loadCosts(true);
      }, autoRefresh);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, timeRange, selectedProvider, selectedBucket, refreshing]);

  // Poll for refresh status when refreshing
  useEffect(() => {
    if (!refreshing) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.get('/admin/bucket-size/status');
        setRefreshStatus(status);

        if (status.calculating === 0) {
          setRefreshing(false);
          loadCosts();
        }
      } catch (e) {
        console.error('Failed to get refresh status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [refreshing]);

  const loadProviders = async () => {
    try {
      const res = await api.get('/admin/providers');
      const providerList = res.providers || [];
      setProviders(providerList);

      const bucketSet = new Set();
      for (const provider of providerList.filter(p => p.is_active)) {
        try {
          const bucketsRes = await api.get(`/providers/${provider.id}/buckets`);
          const buckets = bucketsRes.buckets || [];
          for (const b of buckets) {
            const name = typeof b === 'string' ? b : b.name;
            bucketSet.add(`${provider.id}:${name}:${provider.name}:${provider.type}`);
          }
        } catch (e) {
          console.error(`Failed to load buckets for provider ${provider.name}:`, e);
        }
      }
      setAllBuckets(Array.from(bucketSet).map(s => {
        const [providerId, name, providerName, providerType] = s.split(':');
        return { providerId, name, providerName, providerType };
      }).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error('Failed to load providers:', e);
    }
  };

  const loadCosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      const range = TIME_RANGES.find(r => r.value === timeRange);
      if (range && range.days !== null) {
        const dateTo = new Date().toISOString().split('T')[0];
        const dateFrom = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.set('dateFrom', dateFrom);
        params.set('dateTo', dateTo);
      }

      if (selectedProvider) params.set('providerId', selectedProvider);
      if (selectedBucket) params.set('bucket', selectedBucket);

      const res = await api.get(`/admin/costs?${params}`);
      setData(res);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [timeRange, selectedProvider, selectedBucket]);

  const refreshAllSizes = async () => {
    setRefreshing(true);
    setRefreshStatus(null);
    try {
      await api.post('/admin/bucket-size/refresh-all');
    } catch (e) {
      setError(e.message);
      setRefreshing(false);
    }
  };

  // Get filtered buckets
  const filteredBuckets = selectedProvider
    ? allBuckets.filter(b => b.providerId === selectedProvider)
    : allBuckets;

  // Prepare chart data
  const prepareChartData = () => {
    if (!data) return {};

    // Cost by provider
    const costByProvider = providers.filter(p => p.is_active).map(p => {
      const providerBuckets = data.byBucket.filter(b => b.provider_id === p.id);
      const totalCost = providerBuckets.reduce((sum, b) => sum + (b.total_cost || 0), 0);
      return {
        label: p.name,
        value: totalCost,
        color: PROVIDER_COLORS[p.type] || '#666',
      };
    }).filter(p => p.value > 0);

    // Storage by bucket (top 10)
    const storageByBucket = data.byBucket
      .map(b => ({
        label: b.bucket,
        value: b.storage_bytes || b.upload_bytes || 0,
        color: PROVIDER_COLORS[b.provider_type] || '#666',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Cost by bucket (top 10)
    const costByBucket = data.byBucket
      .map(b => ({
        label: b.bucket,
        value: b.total_cost || 0,
        color: PROVIDER_COLORS[b.provider_type] || '#666',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Historical storage from snapshots (actual bucket sizes over time)
    const storageHistory = (data.storageHistory || []).map(d => ({
      date: d.date,
      value: d.total_bytes || 0,
    }));

    // Cumulative uploads via CloudVault
    const storageGrowth = (data.storageGrowth || []).map(d => ({
      date: d.date,
      value: d.cumulative_bytes || 0,
    }));

    // Daily uploads from backend
    const dailyUploads = (data.dailyUploads || []).map(d => ({
      date: d.date,
      value: d.bytes || 0,
    }));

    // Daily downloads from backend
    const dailyDownloads = (data.dailyDownloads || []).map(d => ({
      date: d.date,
      value: d.bytes || 0,
    }));

    // Sparkline trends for stat cards (last 14 days)
    const uploadTrend = dailyUploads.slice(-14);
    const downloadTrend = dailyDownloads.slice(-14);

    return {
      costByProvider,
      storageByBucket,
      costByBucket,
      storageHistory,
      storageGrowth,
      dailyUploads,
      dailyDownloads,
      uploadTrend,
      downloadTrend
    };
  };

  const chartData = prepareChartData();

  if (loading && !data) {
    return (
      <div className="cost-dashboard">
        <div className="cost-loading">
          <div className="spinner"></div>
          <p>Loading cost analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="cost-dashboard">
        <div className="cost-error">
          <div className="error-icon">!</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => loadCosts()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentTimeRange = TIME_RANGES.find(r => r.value === timeRange);
  const currentAutoRefresh = AUTO_REFRESH_OPTIONS.find(r => r.value === autoRefresh);

  return (
    <div className="cost-dashboard">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h2>Cost Analytics</h2>
          <span className="dashboard-subtitle">Cloud Storage Cost Monitoring</span>
        </div>

        <div className="dashboard-controls">
          <select
            className="dashboard-select"
            value={selectedProvider}
            onChange={(e) => { setSelectedProvider(e.target.value); setSelectedBucket(''); }}
          >
            <option value="">All Providers</option>
            {providers.filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            className="dashboard-select bucket-select"
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
          >
            <option value="">All Buckets ({filteredBuckets.length})</option>
            {filteredBuckets.map(b => (
              <option key={`${b.providerId}-${b.name}`} value={b.name}>{b.name}</option>
            ))}
          </select>

          <div className="dropdown-container" ref={timeRangeRef}>
            <button
              className="dashboard-btn"
              onClick={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
            >
              {currentTimeRange?.label}
              <span className="dropdown-arrow">▼</span>
            </button>
            {showTimeRangeDropdown && (
              <div className="dropdown-menu">
                {TIME_RANGES.map(range => (
                  <button
                    key={range.value}
                    className={`dropdown-item ${timeRange === range.value ? 'active' : ''}`}
                    onClick={() => { setTimeRange(range.value); setShowTimeRangeDropdown(false); }}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dropdown-container" ref={refreshRef}>
            <button
              className={`dashboard-btn ${autoRefresh > 0 ? 'active' : ''}`}
              onClick={() => setShowRefreshDropdown(!showRefreshDropdown)}
            >
              <svg className={`btn-icon-svg ${autoRefresh > 0 ? 'spinning' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {currentAutoRefresh?.label}
              <span className="dropdown-arrow">▼</span>
            </button>
            {showRefreshDropdown && (
              <div className="dropdown-menu">
                {AUTO_REFRESH_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`dropdown-item ${autoRefresh === opt.value ? 'active' : ''}`}
                    onClick={() => { setAutoRefresh(opt.value); setShowRefreshDropdown(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`dashboard-btn calculate-btn ${refreshing ? 'calculating' : ''}`}
            onClick={refreshAllSizes}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <span className="spinner-small"></span>
                Calculating... {refreshStatus?.completed || 0}/{refreshStatus?.total || '?'}
              </>
            ) : (
              'Calculate Sizes'
            )}
          </button>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="dashboard-status">
          <span className="status-dot"></span>
          <span>Last updated: {formatDate(lastUpdated)}</span>
          {autoRefresh > 0 && <span className="auto-refresh-badge">Auto-refresh: {currentAutoRefresh?.label}</span>}
        </div>
      )}

      {/* View Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`dashboard-tab ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`dashboard-tab ${activeView === 'buckets' ? 'active' : ''}`}
          onClick={() => setActiveView('buckets')}
        >
          Buckets
        </button>
        <button
          className={`dashboard-tab ${activeView === 'uploads' ? 'active' : ''}`}
          onClick={() => setActiveView('uploads')}
        >
          Uploads
        </button>
        <button
          className={`dashboard-tab ${activeView === 'downloads' ? 'active' : ''}`}
          onClick={() => setActiveView('downloads')}
        >
          Downloads
        </button>
        <button
          className={`dashboard-tab ${activeView === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveView('pricing')}
        >
          Pricing
        </button>
      </div>

      {/* Dashboard View */}
      {activeView === 'dashboard' && (
        <div className="dashboard-content">
          {/* Stat Cards Row */}
          <div className="stats-row">
            <StatCard
              icon="$"
              label="Storage Cost"
              value={formatCurrency(data.summary.total_storage_cost_monthly)}
              subValue="per month (current)"
              color="#6366f1"
            />
            <StatCard
              icon="TB"
              label="Total Storage"
              value={formatSize(data.summary.total_storage_bytes)}
              subValue="current size"
              color="#10b981"
            />
            <StatCard
              icon="↑"
              label={data.summary.is_filtered ? `Uploads (${currentTimeRange?.label})` : 'Total Uploads'}
              value={formatNumber(data.summary.total_upload_count)}
              subValue={`${formatSize(data.summary.total_upload_bytes)} • ${formatCurrency(data.summary.total_upload_cost)}`}
              color="#3b82f6"
              sparkData={chartData.uploadTrend}
            />
            <StatCard
              icon="↓"
              label={data.summary.is_filtered ? `Downloads (${currentTimeRange?.label})` : 'Total Downloads'}
              value={formatNumber(data.summary.total_download_count)}
              subValue={`${formatSize(data.summary.total_download_bytes)} • ${formatCurrency(data.summary.total_download_cost)}`}
              color="#f59e0b"
              sparkData={chartData.downloadTrend}
            />
          </div>

          {/* Historical Charts Row */}
          <div className="charts-row full-width">
            <div className="chart-panel">
              <LineChart
                data={chartData.storageHistory}
                title={`Storage Growth (${currentTimeRange?.label || 'All Time'})`}
                valueFormatter={formatSize}
                color="#10b981"
                height={220}
                emptyMessage={timeRange === 'all' ? "Click 'Calculate Sizes' to build storage history" : `No storage data in ${currentTimeRange?.label?.toLowerCase() || 'selected period'}`}
              />
            </div>
            <div className="chart-panel">
              <LineChart
                data={chartData.dailyUploads}
                title={`Upload Volume (${currentTimeRange?.label || 'All Time'})`}
                valueFormatter={formatSize}
                color="#3b82f6"
                height={220}
                emptyMessage={`No uploads in ${currentTimeRange?.label?.toLowerCase() || 'selected period'}`}
              />
            </div>
          </div>

          {/* Summary Charts Row */}
          <div className="charts-row summary-charts">
            <div className="chart-panel donut-panel">
              <DonutChart
                data={chartData.costByProvider}
                title="Cost by Provider"
                size={160}
              />
            </div>

            <div className="chart-panel wide">
              <BarChart
                data={chartData.storageByBucket}
                title="Storage by Bucket (Top 10)"
                valueFormatter={formatSize}
                color="#10b981"
              />
            </div>

            <div className="chart-panel wide">
              <BarChart
                data={chartData.costByBucket}
                title="Cost by Bucket (Top 10)"
                valueFormatter={formatCurrency}
                color="#6366f1"
              />
            </div>
          </div>

          {/* Source Breakdown */}
          <div className="source-breakdown">
            <h3>Traffic Source Breakdown</h3>
            <div className="source-grid">
              <div className="source-panel cloudvault">
                <div className="source-header">
                  <span className="source-icon cv-icon">CV</span>
                  <span className="source-title">CloudVault Traffic</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-label">Uploads</span>
                    <span className="stat-value">{formatNumber(data.summary.cloudvault_upload_count)}</span>
                    <span className="stat-detail">{formatSize(data.summary.cloudvault_upload_bytes)}</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-label">Downloads</span>
                    <span className="stat-value">{formatNumber(data.summary.cloudvault_download_count)}</span>
                    <span className="stat-detail">{formatSize(data.summary.cloudvault_download_bytes)}</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-label">Egress Cost</span>
                    <span className="stat-value">{formatCurrency(data.summary.cloudvault_download_bytes / (1024 * 1024 * 1024) * 0.12)}</span>
                  </div>
                </div>
              </div>

              <div className="source-panel cloud">
                <div className="source-header">
                  <span className="source-icon cloud-icon">DC</span>
                  <span className="source-title">Direct Cloud Traffic</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-label">Uploads</span>
                    <span className="stat-value">{formatNumber(data.summary.total_upload_count - data.summary.cloudvault_upload_count)}</span>
                    <span className="stat-detail">{formatSize(data.summary.total_upload_bytes - data.summary.cloudvault_upload_bytes)}</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-label">Downloads</span>
                    <span className="stat-value">{formatNumber(data.summary.total_download_count - data.summary.cloudvault_download_count)}</span>
                    <span className="stat-detail">{formatSize(data.summary.total_download_bytes - data.summary.cloudvault_download_bytes)}</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-label">Egress Cost</span>
                    <span className="stat-value">{formatCurrency((data.summary.total_download_bytes - data.summary.cloudvault_download_bytes) / (1024 * 1024 * 1024) * 0.12)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buckets View */}
      {activeView === 'buckets' && (
        <div className="buckets-view">
          <div className="buckets-header">
            <h3>Bucket Details</h3>
            <span className="bucket-count">{data.byBucket.length} buckets</span>
          </div>

          {data.byBucket.length === 0 ? (
            <div className="empty-state">
              <p>No bucket data available</p>
              <button className="btn btn-primary" onClick={refreshAllSizes}>
                Calculate Bucket Sizes
              </button>
            </div>
          ) : (
            <div className="buckets-grid">
              {data.byBucket.map((b, i) => (
                <div key={i} className="bucket-card">
                  <div className="bucket-card-header">
                    <span
                      className="provider-tag"
                      style={{ background: PROVIDER_COLORS[b.provider_type] || '#666' }}
                    >
                      {b.provider_name}
                    </span>
                    <span className="bucket-name">{b.bucket}</span>
                    {b.is_calculating && <span className="calculating-badge">Calculating...</span>}
                  </div>

                  <div className="bucket-card-body">
                    <div className="bucket-metric main">
                      <div className="metric-content">
                        <span className="metric-value">{formatSize(b.storage_bytes || b.upload_bytes)}</span>
                        <span className="metric-label">
                          Storage
                          {b.has_cached_size ? ' (actual)' : ' (tracked)'}
                        </span>
                      </div>
                      <div className="metric-cost">
                        <span>{formatCurrency(b.storage_cost_monthly)}/mo</span>
                        <span className="daily">{formatCurrency(b.storage_cost_daily)}/day</span>
                      </div>
                    </div>

                    <div className="bucket-metrics-grid">
                      <div className="bucket-metric small">
                        <span className="metric-label">Objects</span>
                        <span className="metric-value">{formatNumber(b.object_count || 0)}</span>
                      </div>
                      <div className="bucket-metric small">
                        <span className="metric-label">Uploads</span>
                        <span className="metric-value">{formatNumber(b.upload_count)}</span>
                      </div>
                      <div className="bucket-metric small">
                        <span className="metric-label">Downloads</span>
                        <span className="metric-value">{formatNumber(b.download_count)}</span>
                      </div>
                      <div className="bucket-metric small">
                        <span className="metric-label">Egress Cost</span>
                        <span className="metric-value">{formatCurrency(b.download_cost)}</span>
                      </div>
                    </div>

                    <div className="bucket-sources">
                      <div className="source-item">
                        <span className="source-dot cloudvault"></span>
                        <span>CloudVault: {b.cloudvault_upload_count} uploads, {b.cloudvault_download_count} downloads</span>
                      </div>
                      <div className="source-item">
                        <span className="source-dot cloud"></span>
                        <span>Direct: {b.cloud_upload_count} uploads</span>
                      </div>
                    </div>
                  </div>

                  <div className="bucket-card-footer">
                    <span className="total-cost">Total: {formatCurrency(b.total_cost)}</span>
                    {b.last_calculated && (
                      <span className="last-calc">Updated: {formatShortDate(b.last_calculated)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Uploads View */}
      {activeView === 'uploads' && (
        <div className="table-view">
          <h3>Recent Uploads (Ingress)</h3>
          {data.recentUploads.length === 0 ? (
            <div className="empty-state">
              <p>No upload data available for this time range</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Source</th>
                    <th>File</th>
                    <th>Bucket</th>
                    <th>Size</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentUploads.map((row, i) => (
                    <tr key={i}>
                      <td className="time-cell">{formatDate(row.created_at)}</td>
                      <td>{row.username}</td>
                      <td>
                        <span className={`source-tag ${row.upload_source}`}>
                          {row.upload_source === 'cloudvault' ? 'CloudVault' : 'Direct'}
                        </span>
                      </td>
                      <td className="file-cell" title={row.file_name}>{row.file_name}</td>
                      <td>{row.bucket}</td>
                      <td>{formatSize(row.file_size)}</td>
                      <td className="cost-cell">{formatCurrency(row.ingress_cost + row.operation_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Downloads View */}
      {activeView === 'downloads' && (
        <div className="table-view">
          <h3>Recent Downloads (Egress)</h3>
          {data.recentDownloads.length === 0 ? (
            <div className="empty-state">
              <p>No download data available for this time range</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Source</th>
                    <th>File</th>
                    <th>Bucket</th>
                    <th>Size</th>
                    <th>Egress Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentDownloads.map((row, i) => (
                    <tr key={i}>
                      <td className="time-cell">{formatDate(row.created_at)}</td>
                      <td>{row.username || '-'}</td>
                      <td>
                        <span className={`source-tag ${row.download_source}`}>
                          {row.download_source === 'cloudvault' ? 'CloudVault' : 'Direct'}
                        </span>
                      </td>
                      <td className="file-cell" title={row.file_name}>{row.file_name}</td>
                      <td>{row.bucket}</td>
                      <td>{formatSize(row.file_size)}</td>
                      <td className="cost-cell">{formatCurrency(row.egress_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pricing View */}
      {activeView === 'pricing' && (
        <div className="pricing-view">
          <h3>Cloud Provider Pricing Reference</h3>
          <p className="pricing-note">Estimated costs per GB (actual costs may vary by region and volume)</p>

          <div className="pricing-cards">
            {Object.entries(data.pricing).map(([provider, pricing]) => (
              <div key={provider} className="pricing-card">
                <div
                  className="pricing-card-header"
                  style={{ background: PROVIDER_COLORS[provider] || '#666' }}
                >
                  <span className="provider-name">{provider.toUpperCase().replace('_', ' ')}</span>
                </div>

                <div className="pricing-card-body">
                  <div className="pricing-item">
                    <span className="pricing-label">Storage</span>
                    <span className="pricing-value">${pricing.storage_per_gb_month}/GB/mo</span>
                  </div>
                  <div className="pricing-item">
                    <span className="pricing-label">Egress</span>
                    <span className="pricing-value">${pricing.egress_per_gb}/GB</span>
                  </div>
                  <div className="pricing-item">
                    <span className="pricing-label">Ingress</span>
                    <span className="pricing-value free">Free</span>
                  </div>
                  <div className="pricing-item">
                    <span className="pricing-label">PUT/POST (10K ops)</span>
                    <span className="pricing-value">${pricing.class_a_ops_per_10k}</span>
                  </div>
                  <div className="pricing-item">
                    <span className="pricing-label">GET (10K ops)</span>
                    <span className="pricing-value">${pricing.class_b_ops_per_10k}</span>
                  </div>
                </div>

                <div className="pricing-card-footer">
                  <div className="example-cost">
                    <span>1 TB storage:</span>
                    <span>${(pricing.storage_per_gb_month * 1024).toFixed(2)}/mo</span>
                  </div>
                  <div className="example-cost">
                    <span>100 GB download:</span>
                    <span>${(pricing.egress_per_gb * 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

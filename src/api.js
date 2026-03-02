const BASE = '/api';
const TIMEOUT_MS = 15000;

function getToken() {
  return localStorage.getItem('token');
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timeout))
    .catch((err) => {
      if (err.name === 'AbortError') throw new Error('Request timed out. Is the server running?');
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError'))
        throw new Error('Cannot reach server. Start it with: npm run dev');
      throw err;
    });
}

export const api = {
  async get(path) {
    const r = await fetchWithTimeout(BASE + path, { headers: headers() });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  async post(path, body) {
    const r = await fetchWithTimeout(BASE + path, {
      method: 'POST',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  async patch(path, body) {
    const r = await fetchWithTimeout(BASE + path, {
      method: 'PATCH',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  async put(path, body) {
    const r = await fetchWithTimeout(BASE + path, {
      method: 'PUT',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  async delete(path, body) {
    const r = await fetchWithTimeout(BASE + path, {
      method: 'DELETE',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
};

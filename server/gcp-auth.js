/**
 * GCP auth using jose for JWT signing (avoids Node crypto DECODER error on some setups).
 * We get an access token and call Storage REST API for list buckets.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SignJWT, importPKCS8 } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadCreds() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_JSON not set');
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  let json = trimmed;
  if (trimmed && !trimmed.startsWith('{')) {
    const keyPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(root, trimmed);
    if (!fs.existsSync(keyPath)) throw new Error('GCP key file not found: ' + trimmed);
    json = fs.readFileSync(keyPath, 'utf8');
  }
  const creds = JSON.parse(json);
  if (creds.private_key && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }
  return creds;
}

let _creds = null;
let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;
  const creds = _creds || loadCreds();
  _creds = creds;
  const key = await importPKCS8(creds.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(creds.client_email)
    .setSubject(creds.client_email)
    .setAudience(creds.token_uri || 'https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const tokenUri = creds.token_uri || 'https://oauth2.googleapis.com/token';
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
      scope: 'https://www.googleapis.com/auth/devstorage.full_control',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('GCP token failed: ' + (t || res.status));
  }
  const data = await res.json();
  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _accessToken;
}

export async function listBucketsRest() {
  const creds = _creds || loadCreds();
  _creds = creds;
  const token = await getAccessToken();
  const project = creds.project_id;
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(project)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'Failed to list buckets');
  }
  const data = await res.json();
  const items = data.items || [];
  return items.map((b) => ({ name: b.name }));
}

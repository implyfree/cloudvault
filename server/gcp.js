import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Storage } from '@google-cloud/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let _tempKeyPath = null;

// Normalize private key: real newlines, no CRLF. Write to a temp file so the Google
// client reads it (avoids DECODER routines::unsupported on some Node/OpenSSL combos).
function ensureKeyPath() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_JSON not set');
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || trimmed.startsWith('{')) return null;

  const keyPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(root, trimmed);
  if (!fs.existsSync(keyPath)) throw new Error('GCP key file not found: ' + trimmed);

  // Read and normalize: fix line endings so OpenSSL decoder accepts the key
  const json = fs.readFileSync(keyPath, 'utf8');
  let creds;
  try {
    creds = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid GCP key JSON');
  }
  if (creds.private_key && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }
  const tempPath = path.join(os.tmpdir(), `gcp-key-${process.pid}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(creds), 'utf8');
  _tempKeyPath = tempPath;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
  return tempPath;
}

function getCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_JSON not set');
  let json = raw;
  if (typeof raw === 'string' && !raw.trimStart().startsWith('{')) {
    const keyPath = path.isAbsolute(raw) ? raw : path.join(root, raw);
    if (!fs.existsSync(keyPath)) throw new Error('GCP key file not found: ' + keyPath);
    json = fs.readFileSync(keyPath, 'utf8');
  }
  try {
    const creds = typeof json === 'string' ? JSON.parse(json) : json;
    if (creds.private_key && typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    return creds;
  } catch (e) {
    throw new Error('Invalid GCP_SERVICE_ACCOUNT_JSON');
  }
}

export function getStorage() {
  const keyPath = ensureKeyPath();
  if (keyPath) {
    return new Storage();
  }
  const credentials = getCredentials();
  return new Storage({ credentials });
}

try {
  ensureKeyPath();
} catch (_) {}

export async function listBuckets() {
  // Prefer jose + REST to avoid DECODER error when Storage client parses the key
  try {
    const { listBucketsRest } = await import('./gcp-auth.js');
    return await listBucketsRest();
  } catch (restErr) {
    // Fallback to @google-cloud/storage
    const storage = getStorage();
    const [buckets] = await storage.getBuckets();
    return buckets.map(b => ({ name: b.name }));
  }
}

export async function createSignedUploadUrl(bucketName, objectName, contentType) {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  
  // Use signed URL with XML API (v4) - this respects bucket CORS settings
  // Unlike JSON API resumable uploads, XML API honors CORS
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType: contentType || 'application/octet-stream',
  });
  
  return signedUrl;
}

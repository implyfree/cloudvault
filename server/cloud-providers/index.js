// Unified Cloud Storage Abstraction Layer
// Supports: GCP, AWS S3, Azure Blob, Oracle Cloud, S3-Compatible (MinIO, etc.)

import { query, queryOne, decrypt } from '../db.js';

// Provider implementations
import { GCPProvider } from './gcp.js';
import { AWSProvider } from './aws.js';
import { AzureProvider } from './azure.js';
import { OracleProvider } from './oracle.js';
import { S3CompatibleProvider } from './s3-compatible.js';

const providerClasses = {
  gcp: GCPProvider,
  aws: AWSProvider,
  azure: AzureProvider,
  oracle: OracleProvider,
  s3_compatible: S3CompatibleProvider,
};

// Cache provider instances
const providerCache = new Map();

export async function getProviderInstance(providerId) {
  if (providerCache.has(providerId)) {
    return providerCache.get(providerId);
  }
  
  const provider = await queryOne('SELECT * FROM cloud_providers WHERE id = ? AND is_active = TRUE', [providerId]);
  
  if (!provider) {
    throw new Error('Provider not found or inactive');
  }
  
  const ProviderClass = providerClasses[provider.type];
  if (!ProviderClass) {
    throw new Error(`Unsupported provider type: ${provider.type}`);
  }
  
  // Decrypt and parse config
  const configJson = decrypt(provider.config);
  if (!configJson) {
    throw new Error('Failed to decrypt provider configuration');
  }
  
  const config = JSON.parse(configJson);
  const instance = new ProviderClass(provider.id, provider.name, config);
  
  providerCache.set(providerId, instance);
  return instance;
}

export function clearProviderCache(providerId) {
  if (providerId) {
    providerCache.delete(providerId);
  } else {
    providerCache.clear();
  }
}

export async function getActiveProviders() {
  return await query('SELECT id, name, type, is_active, created_at FROM cloud_providers WHERE is_active = TRUE ORDER BY name');
}

export async function getAllProviders() {
  return await query('SELECT id, name, type, is_active, created_at, updated_at FROM cloud_providers ORDER BY name');
}

export async function testProviderConnection(type, config) {
  const ProviderClass = providerClasses[type];
  if (!ProviderClass) {
    throw new Error(`Unsupported provider type: ${type}`);
  }
  
  const instance = new ProviderClass(0, 'test', config);
  return await instance.testConnection();
}

// Get provider types with their configuration schema
export function getProviderTypes() {
  return [
    {
      type: 'gcp',
      name: 'Google Cloud Storage',
      icon: 'gcp',
      fields: [
        { key: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true, placeholder: 'Paste your service account JSON key here' },
      ],
    },
    {
      type: 'aws',
      name: 'Amazon S3',
      icon: 'aws',
      fields: [
        { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
        { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
        { key: 'region', label: 'Region', type: 'text', required: true, placeholder: 'us-east-1' },
      ],
    },
    {
      type: 'azure',
      name: 'Azure Blob Storage',
      icon: 'azure',
      fields: [
        { key: 'account_name', label: 'Storage Account Name', type: 'text', required: true },
        { key: 'account_key', label: 'Account Key', type: 'password', required: true },
      ],
    },
    {
      type: 'oracle',
      name: 'Oracle Cloud Object Storage',
      icon: 'oracle',
      fields: [
        { key: 'tenancy_ocid', label: 'Tenancy OCID', type: 'text', required: true },
        { key: 'user_ocid', label: 'User OCID', type: 'text', required: true },
        { key: 'fingerprint', label: 'API Key Fingerprint', type: 'text', required: true },
        { key: 'private_key', label: 'Private Key (PEM)', type: 'textarea', required: true },
        { key: 'region', label: 'Region', type: 'text', required: true, placeholder: 'us-ashburn-1' },
        { key: 'namespace', label: 'Namespace', type: 'text', required: true },
      ],
    },
    {
      type: 's3_compatible',
      name: 'S3-Compatible (MinIO, Wasabi, etc.)',
      icon: 's3',
      fields: [
        { key: 'endpoint', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://s3.example.com' },
        { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
        { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
        { key: 'region', label: 'Region', type: 'text', required: false, placeholder: 'us-east-1 (optional)' },
        { key: 'force_path_style', label: 'Force Path Style', type: 'checkbox', required: false },
      ],
    },
  ];
}

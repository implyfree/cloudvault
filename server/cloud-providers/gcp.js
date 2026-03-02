// Google Cloud Storage Provider

import { Storage } from '@google-cloud/storage';
import { BaseProvider } from './base.js';

export class GCPProvider extends BaseProvider {
  constructor(id, name, config) {
    super(id, name, config);
    this._storage = null;
  }

  _getStorage() {
    if (this._storage) return this._storage;

    let credentials;
    
    // Parse the service account JSON
    if (typeof this.config.service_account_json === 'string') {
      try {
        credentials = JSON.parse(this.config.service_account_json);
      } catch (e) {
        throw new Error('Invalid service account JSON');
      }
    } else {
      credentials = this.config.service_account_json;
    }

    // Normalize private key newlines
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    }

    // Use in-memory credentials instead of temp file for security
    this._storage = new Storage({
      projectId: credentials.project_id,
      credentials: credentials,
    });
    return this._storage;
  }

  async testConnection() {
    try {
      const storage = this._getStorage();
      await storage.getBuckets({ maxResults: 1 });
      return { success: true, message: 'Connection successful' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async listBuckets() {
    const storage = this._getStorage();
    const [buckets] = await storage.getBuckets();
    return buckets.map(b => ({
      name: b.name,
      created: b.metadata.timeCreated,
      location: b.metadata.location,
      storageClass: b.metadata.storageClass,
    }));
  }

  async listObjects(bucket, prefix = '', options = {}) {
    const storage = this._getStorage();
    const { maxResults = 1000, delimiter, pageToken } = options;
    
    const queryOptions = {
      prefix: prefix || '',
      maxResults,
      autoPaginate: false,
    };
    
    // Use delimiter to get folder-like structure (only if explicitly set and not null)
    // delimiter: null or undefined = list ALL objects recursively
    // delimiter: '/' = list only at current level with folder prefixes
    if (delimiter !== null && delimiter !== undefined) {
      queryOptions.delimiter = delimiter;
    } else if (options.delimiter === undefined) {
      // Default to '/' for backwards compatibility when not explicitly set
      queryOptions.delimiter = '/';
    }
    // If delimiter is explicitly null, don't set it (lists all objects recursively)
    
    if (pageToken) {
      queryOptions.pageToken = pageToken;
    }
    
    const [files, nextQuery, apiResponse] = await storage.bucket(bucket).getFiles(queryOptions);
    
    // Extract folders (prefixes) from the response
    const folders = (apiResponse?.prefixes || []).map(p => ({
      name: p,
      isFolder: true,
    }));
    
    // Map files
    const fileList = files.map(f => ({
      name: f.name,
      size: parseInt(f.metadata.size, 10) || 0,
      updated: f.metadata.updated,
      created: f.metadata.timeCreated,
      contentType: f.metadata.contentType,
      isFolder: false,
    }));
    
    return {
      files: fileList,
      folders,
      nextPageToken: nextQuery?.pageToken || null,
    };
  }

  async getSignedUploadUrl(bucket, objectName, contentType, expiresIn = 3600) {
    const storage = this._getStorage();
    const file = storage.bucket(bucket).file(objectName);
    
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType: contentType || 'application/octet-stream',
    });
    
    return url;
  }

  async createResumableUpload(bucket, objectName, contentType, fileSize) {
    const storage = this._getStorage();
    const file = storage.bucket(bucket).file(objectName);
    const [uploadUri] = await file.createResumableUpload({
      metadata: { contentType: contentType || 'application/octet-stream' },
      validation: false,
    });
    return { uploadUri };
  }

  async getSignedDownloadUrl(bucket, objectName, expiresIn = 3600) {
    const storage = this._getStorage();
    const file = storage.bucket(bucket).file(objectName);
    
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });
    
    return url;
  }

  async deleteObject(bucket, objectName) {
    const storage = this._getStorage();
    await storage.bucket(bucket).file(objectName).delete();
    return { success: true };
  }

  async getObjectMetadata(bucket, objectName) {
    const storage = this._getStorage();
    const [metadata] = await storage.bucket(bucket).file(objectName).getMetadata();
    return {
      name: metadata.name,
      size: parseInt(metadata.size, 10),
      contentType: metadata.contentType,
      created: metadata.timeCreated,
      updated: metadata.updated,
      md5: metadata.md5Hash,
    };
  }

  async getBucketInfo(bucket) {
    const storage = this._getStorage();
    const [metadata] = await storage.bucket(bucket).getMetadata();
    return {
      name: metadata.name,
      location: metadata.location,
      storageClass: metadata.storageClass,
      created: metadata.timeCreated,
    };
  }

  async copyObject(bucket, sourcePath, destPath) {
    const storage = this._getStorage();
    await storage.bucket(bucket).file(sourcePath).copy(storage.bucket(bucket).file(destPath));
    return { success: true };
  }

  async deleteObjects(bucket, objectNames) {
    const storage = this._getStorage();
    const results = [];
    
    // GCP supports batch delete
    for (const name of objectNames) {
      try {
        await storage.bucket(bucket).file(name).delete();
        results.push({ name, success: true });
      } catch (e) {
        results.push({ name, success: false, error: e.message });
      }
    }
    
    return results;
  }

  getProviderType() {
    return 'gcp';
  }
}

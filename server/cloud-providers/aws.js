// Amazon S3 Provider

import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, CopyObjectCommand, HeadObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseProvider } from './base.js';

export class AWSProvider extends BaseProvider {
  constructor(id, name, config) {
    super(id, name, config);
    this._client = null;
  }

  _getClient() {
    if (this._client) return this._client;

    this._client = new S3Client({
      region: this.config.region || 'us-east-1',
      credentials: {
        accessKeyId: this.config.access_key_id,
        secretAccessKey: this.config.secret_access_key,
      },
    });

    return this._client;
  }

  async testConnection() {
    try {
      const client = this._getClient();
      await client.send(new ListBucketsCommand({}));
      return { success: true, message: 'Connection successful' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async listBuckets() {
    const client = this._getClient();
    const response = await client.send(new ListBucketsCommand({}));
    return (response.Buckets || []).map(b => ({
      name: b.Name,
      created: b.CreationDate?.toISOString(),
    }));
  }

  async listObjects(bucket, prefix = '', options = {}) {
    const client = this._getClient();
    const { maxResults = 1000, delimiter, pageToken } = options;
    
    const params = {
      Bucket: bucket,
      Prefix: prefix || '',
      MaxKeys: maxResults,
    };
    
    // Use delimiter to get folder-like structure (only if explicitly set and not null)
    // delimiter: null or undefined = list ALL objects recursively
    // delimiter: '/' = list only at current level with folder prefixes
    if (delimiter !== null && delimiter !== undefined) {
      params.Delimiter = delimiter;
    } else if (options.delimiter === undefined) {
      // Default to '/' for backwards compatibility when not explicitly set
      params.Delimiter = '/';
    }
    // If delimiter is explicitly null, don't set it (lists all objects recursively)
    
    if (pageToken) {
      params.ContinuationToken = pageToken;
    }
    
    const response = await client.send(new ListObjectsV2Command(params));
    
    // Extract folders (common prefixes)
    const folders = (response.CommonPrefixes || []).map(p => ({
      name: p.Prefix,
      isFolder: true,
    }));
    
    // Map files
    const files = (response.Contents || []).map(obj => ({
      name: obj.Key,
      size: obj.Size || 0,
      updated: obj.LastModified?.toISOString(),
      isFolder: false,
    }));
    
    return {
      files,
      folders,
      nextPageToken: response.NextContinuationToken || null,
    };
  }

  async getSignedUploadUrl(bucket, objectName, contentType, expiresIn = 3600) {
    const client = this._getClient();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectName,
      ContentType: contentType || 'application/octet-stream',
    });
    return await getSignedUrl(client, command, { expiresIn });
  }

  async getSignedDownloadUrl(bucket, objectName, expiresIn = 3600) {
    const client = this._getClient();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
    });
    return await getSignedUrl(client, command, { expiresIn });
  }

  async deleteObject(bucket, objectName) {
    const client = this._getClient();
    await client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }));
    return { success: true };
  }

  async deleteObjects(bucket, objectNames) {
    const client = this._getClient();
    
    // AWS supports batch delete up to 1000 objects
    const results = [];
    const chunks = [];
    for (let i = 0; i < objectNames.length; i += 1000) {
      chunks.push(objectNames.slice(i, i + 1000));
    }
    
    for (const chunk of chunks) {
      try {
        const response = await client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map(key => ({ Key: key })),
          },
        }));
        
        // Track successful deletions
        for (const deleted of (response.Deleted || [])) {
          results.push({ name: deleted.Key, success: true });
        }
        
        // Track errors
        for (const error of (response.Errors || [])) {
          results.push({ name: error.Key, success: false, error: error.Message });
        }
      } catch (e) {
        // If batch fails, mark all as failed
        for (const key of chunk) {
          results.push({ name: key, success: false, error: e.message });
        }
      }
    }
    
    return results;
  }

  async copyObject(bucket, sourcePath, destPath) {
    const client = this._getClient();
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourcePath}`,
      Key: destPath,
    }));
    return { success: true };
  }

  async getObjectMetadata(bucket, objectName) {
    const client = this._getClient();
    const response = await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }));
    return {
      name: objectName,
      size: response.ContentLength,
      contentType: response.ContentType,
      updated: response.LastModified?.toISOString(),
      etag: response.ETag,
    };
  }

  async getBucketInfo(bucket) {
    const client = this._getClient();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return {
      name: bucket,
      region: this.config.region,
    };
  }

  getProviderType() {
    return 'aws';
  }
}

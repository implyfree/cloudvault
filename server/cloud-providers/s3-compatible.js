// S3-Compatible Storage Provider (MinIO, Wasabi, DigitalOcean Spaces, etc.)

import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseProvider } from './base.js';

export class S3CompatibleProvider extends BaseProvider {
  constructor(id, name, config) {
    super(id, name, config);
    this._client = null;
  }

  _getClient() {
    if (this._client) return this._client;

    this._client = new S3Client({
      region: this.config.region || 'us-east-1',
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.access_key_id,
        secretAccessKey: this.config.secret_access_key,
      },
      forcePathStyle: this.config.force_path_style !== false, // Default to true for most S3-compatible services
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

  async listObjects(bucket, prefix = '', maxResults = 1000) {
    const client = this._getClient();
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxResults,
    }));
    return (response.Contents || []).map(obj => ({
      name: obj.Key,
      size: obj.Size,
      updated: obj.LastModified?.toISOString(),
    }));
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
      endpoint: this.config.endpoint,
    };
  }
}

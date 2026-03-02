// Oracle Cloud Object Storage Provider
// Uses S3-compatible API

import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseProvider } from './base.js';
import crypto from 'crypto';

export class OracleProvider extends BaseProvider {
  constructor(id, name, config) {
    super(id, name, config);
    this._client = null;
  }

  _getClient() {
    if (this._client) return this._client;

    // Oracle Cloud uses S3-compatible API
    const endpoint = `https://${this.config.namespace}.compat.objectstorage.${this.config.region}.oraclecloud.com`;

    this._client = new S3Client({
      region: this.config.region,
      endpoint,
      credentials: {
        accessKeyId: this.config.access_key || this._generateAccessKey(),
        secretAccessKey: this.config.secret_key || this._generateSecretKey(),
      },
      forcePathStyle: true,
    });

    return this._client;
  }

  // For Oracle, if using API keys instead of S3 credentials
  _generateAccessKey() {
    // Access key format: <tenancy_ocid>/<user_ocid>
    return `${this.config.tenancy_ocid}/${this.config.user_ocid}`;
  }

  _generateSecretKey() {
    // This would need proper OCI SDK signing - simplified here
    return this.config.fingerprint;
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
    };
  }

  async getBucketInfo(bucket) {
    return {
      name: bucket,
      namespace: this.config.namespace,
      region: this.config.region,
    };
  }
}

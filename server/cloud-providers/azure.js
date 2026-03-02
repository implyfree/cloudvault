// Azure Blob Storage Provider

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { BaseProvider } from './base.js';

export class AzureProvider extends BaseProvider {
  constructor(id, name, config) {
    super(id, name, config);
    this._client = null;
    this._credential = null;
  }

  _getClient() {
    if (this._client) return this._client;

    this._credential = new StorageSharedKeyCredential(
      this.config.account_name,
      this.config.account_key
    );

    this._client = new BlobServiceClient(
      `https://${this.config.account_name}.blob.core.windows.net`,
      this._credential
    );

    return this._client;
  }

  async testConnection() {
    try {
      const client = this._getClient();
      // List containers to test connection
      const iter = client.listContainers({ maxPageSize: 1 });
      await iter.next();
      return { success: true, message: 'Connection successful' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async listBuckets() {
    const client = this._getClient();
    const containers = [];
    for await (const container of client.listContainers()) {
      containers.push({
        name: container.name,
        created: container.properties.lastModified?.toISOString(),
      });
    }
    return containers;
  }

  async listObjects(bucket, prefix = '', maxResults = 1000) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const objects = [];
    let count = 0;
    
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      if (count >= maxResults) break;
      objects.push({
        name: blob.name,
        size: blob.properties.contentLength,
        updated: blob.properties.lastModified?.toISOString(),
        contentType: blob.properties.contentType,
      });
      count++;
    }
    return objects;
  }

  async getSignedUploadUrl(bucket, objectName, contentType, expiresIn = 3600) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const blobClient = containerClient.getBlockBlobClient(objectName);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sasToken = generateBlobSASQueryParameters({
      containerName: bucket,
      blobName: objectName,
      permissions: BlobSASPermissions.parse('cw'), // create, write
      startsOn,
      expiresOn,
      contentType: contentType || 'application/octet-stream',
    }, this._credential).toString();

    return `${blobClient.url}?${sasToken}`;
  }

  async getSignedDownloadUrl(bucket, objectName, expiresIn = 3600) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(objectName);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sasToken = generateBlobSASQueryParameters({
      containerName: bucket,
      blobName: objectName,
      permissions: BlobSASPermissions.parse('r'), // read
      startsOn,
      expiresOn,
    }, this._credential).toString();

    return `${blobClient.url}?${sasToken}`;
  }

  async deleteObject(bucket, objectName) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(objectName);
    await blobClient.delete();
    return { success: true };
  }

  async getObjectMetadata(bucket, objectName) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(objectName);
    const properties = await blobClient.getProperties();
    return {
      name: objectName,
      size: properties.contentLength,
      contentType: properties.contentType,
      updated: properties.lastModified?.toISOString(),
      etag: properties.etag,
    };
  }

  async getBucketInfo(bucket) {
    const client = this._getClient();
    const containerClient = client.getContainerClient(bucket);
    const properties = await containerClient.getProperties();
    return {
      name: bucket,
      lastModified: properties.lastModified?.toISOString(),
    };
  }
}

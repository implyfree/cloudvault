// Base class for all cloud storage providers

export class BaseProvider {
  constructor(id, name, config) {
    this.id = id;
    this.name = name;
    this.config = config;
  }

  // Test if the connection/credentials are valid
  async testConnection() {
    throw new Error('testConnection() must be implemented');
  }

  // List all buckets/containers
  async listBuckets() {
    throw new Error('listBuckets() must be implemented');
  }

  // List objects in a bucket with folder support
  // Returns { files: [], folders: [], nextPageToken }
  async listObjects(bucket, prefix = '', options = {}) {
    throw new Error('listObjects() must be implemented');
  }

  // Generate a signed URL for upload
  async getSignedUploadUrl(bucket, objectName, contentType, expiresIn = 3600) {
    throw new Error('getSignedUploadUrl() must be implemented');
  }

  // Create resumable upload session (for chunked/large uploads). Returns { uploadUri } or null if not supported.
  async createResumableUpload(bucket, objectName, contentType, fileSize) {
    return null;
  }

  // Generate a signed URL for download
  async getSignedDownloadUrl(bucket, objectName, expiresIn = 3600) {
    throw new Error('getSignedDownloadUrl() must be implemented');
  }

  // Delete an object
  async deleteObject(bucket, objectName) {
    throw new Error('deleteObject() must be implemented');
  }

  // Delete multiple objects
  async deleteObjects(bucket, objectNames) {
    // Default implementation: delete one by one
    const results = [];
    for (const name of objectNames) {
      try {
        await this.deleteObject(bucket, name);
        results.push({ name, success: true });
      } catch (e) {
        results.push({ name, success: false, error: e.message });
      }
    }
    return results;
  }

  // Copy/move an object
  async copyObject(bucket, sourcePath, destPath) {
    throw new Error('copyObject() must be implemented');
  }

  // Rename an object
  async renameObject(bucket, oldPath, newPath) {
    await this.copyObject(bucket, oldPath, newPath);
    await this.deleteObject(bucket, oldPath);
    return { success: true };
  }

  // Get object metadata
  async getObjectMetadata(bucket, objectName) {
    throw new Error('getObjectMetadata() must be implemented');
  }

  // Get bucket info/metadata
  async getBucketInfo(bucket) {
    throw new Error('getBucketInfo() must be implemented');
  }

  // Get bucket storage usage (for cost estimation)
  async getBucketUsage(bucket) {
    // Default: not supported, return null
    return null;
  }

  // Get provider type for cost calculation
  getProviderType() {
    return 'unknown';
  }
}

# Changelog

All notable changes to CloudVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2025-02-05

### Added

#### File Browser
- **Browse bucket contents** - Navigate folders and view files directly in the app
- **File operations** - Download, delete, rename files with permission checks
- **Grid/List view** - Toggle between grid and list view modes
- **Context menu** - Right-click for quick actions on files
- **Sorting** - Sort by name, size, or date

#### Granular Access Control
- **Per-bucket permissions** - Assign specific permissions per user per bucket
- **Permission types** - View, Upload, Download, Delete, Share, Edit
- **Admin override** - Admins retain full access to all resources
- **Legacy support** - Existing user-provider assignments continue to work

#### File Sharing System
- **Share links** - Generate shareable URLs for files and folders
- **Password protection** - Optional password for share links
- **Expiry control** - Set custom expiration times (1 hour to 30 days)
- **Download limits** - Optional maximum download count
- **Email sharing** - Share with specific email addresses
- **Public access page** - Beautiful shared file access UI

#### Cost Analytics Dashboard
- **Usage tracking** - Track storage and uploads per bucket
- **Cost estimation** - Estimated costs based on cloud provider pricing
- **Daily trends** - Visual chart of daily costs
- **Per-bucket breakdown** - See costs by bucket
- **Multi-provider support** - GCP, AWS, Azure pricing

#### Admin Settings
- **SMTP configuration** - Configure email settings for notifications
- **Sharing defaults** - Set default expiry times and limits
- **Security settings** - Session timeout, login attempts
- **Branding options** - Customize app name and support email

### Database
- New tables: `bucket_permissions`, `shared_links`, `share_access_logs`, `app_settings`, `bucket_usage`
- Indexes for performance optimization

## [0.0.2] - 2025-02-05

### Added

#### Multi-Cloud Storage Support
- **GCP Cloud Storage** - Upload files directly to Google Cloud Storage buckets
- **AWS S3** - Full Amazon S3 integration with signed URL uploads
- **Azure Blob Storage** - Microsoft Azure blob container support
- **Oracle Cloud Object Storage** - Oracle Cloud Infrastructure integration
- **S3-Compatible Storage** - Support for MinIO, Wasabi, and other S3-compatible services

#### Admin Dashboard
- User management (create, edit, delete users)
- Provider management with credential encryption (AES-256)
- User-to-provider access control assignments
- Upload history logs with filtering and Excel export

#### Security Features
- JWT-based authentication
- Password hashing with bcrypt
- API rate limiting
- Encrypted cloud credentials storage
- Non-root Docker container
- Kubernetes security contexts

#### Deployment Options
- **Docker** - Production-ready Dockerfile with multi-stage build
- **Kubernetes** - Complete k8s manifests (deployment, service, secrets, configmap, HPA)
- **Helm Chart** - Packaged Helm chart with PostgreSQL dependency
- **Istio Gateway** - Service mesh gateway configuration

#### Frontend
- Modern React UI with Vite
- Dark/Light theme toggle
- Responsive design
- File upload progress tracking
- Error boundary handling

#### Backend
- Express.js REST API
- PostgreSQL database support
- Modular cloud provider architecture
- Health check endpoints
- Horizontal Pod Autoscaler (HPA) ready

## [0.0.1] - 2025-02-05

### Added
- Initial project structure
- Basic repository setup

---

[0.0.3]: https://github.com/agi-engg/cloudvault/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/agi-engg/cloudvault/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/agi-engg/cloudvault/releases/tag/v0.0.1

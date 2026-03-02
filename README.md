# CloudVault - Multi-Cloud Storage Manager

[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/cloudvault)](https://artifacthub.io/packages/search?repo=cloudvault)
[![Docker](https://img.shields.io/docker/v/shyamkrishna21/cloudvault?label=Docker%20Hub&sort=semver)](https://hub.docker.com/r/shyamkrishna21/cloudvault)

Self-hosted multi-cloud storage manager with granular permissions, resumable uploads, and cost analytics. Supports **GCP, AWS, Azure, Oracle Cloud, and S3-compatible** providers.

## Features

- **Multi-Cloud Support**: GCP Cloud Storage, AWS S3, Azure Blob, Oracle Cloud, S3-Compatible (MinIO, Wasabi, etc.)
- **Resumable Uploads**: Large file uploads (100MB+) survive network interruptions
- **Concurrent Uploads**: Upload multiple files simultaneously with per-upload tracking
- **Background Jobs**: Dismiss uploads to background, start new ones — real-time progress on all
- **Admin Dashboard**: Manage users, providers, permissions, and view upload/download logs
- **Granular Permissions**: Per-user, per-bucket permissions (view, upload, download, delete, share, edit)
- **Permission Groups**: Bulk-assign permissions to user groups
- **File Browser**: Browse, download, delete, and manage files in connected buckets
- **File Sharing**: Generate expiring share links with optional password protection
- **Cost Analytics**: Storage size tracking, historical graphs, cost estimation
- **Modern UI**: Dark/light theme, responsive design, real-time progress

## Security

- Cloud provider credentials encrypted at rest (AES-256)
- Encryption key persisted in database — survives pod restarts
- Passwords hashed with bcrypt
- JWT session tokens
- Rate limiting on all API endpoints
- Security headers (CSP, X-Frame-Options, HSTS)
- Non-root Docker container with dropped capabilities

## Quick Start

### Docker Compose (Easiest)

```bash
docker-compose up -d
# Open http://localhost:3001
```

### Manual Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start PostgreSQL**
   ```bash
   docker run -d --name cloudvault-db \
     -e POSTGRES_DB=cloudvault \
     -e POSTGRES_USER=cloudvault \
     -e POSTGRES_PASSWORD=localdev \
     -p 5432:5432 \
     postgres:16-alpine
   ```

3. **Set environment variables**
   ```bash
   export DATABASE_URL=postgresql://cloudvault:localdev@localhost:5432/cloudvault
   export JWT_SECRET=your-random-secret-here
   export ADMIN_PASSWORD=your-admin-password
   ```

4. **Run the application**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

5. **Login as admin** → Username: `admin` / Password: `admin`

6. **Add cloud providers** → Admin → Providers → Add Provider

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | **Yes** |
| `PORT` | Server port | No (default: 3001) |
| `JWT_SECRET` | Secret for JWT tokens | No (auto-generated) |
| `ADMIN_PASSWORD` | Initial admin password | No (default: admin) |
| `ENCRYPTION_KEY` | 64-char hex key for credential encryption | No (auto-generated) |

## Docker

```bash
docker pull shyamkrishna21/cloudvault:v1.0.0
```

Multi-arch image supporting `linux/amd64` and `linux/arm64`.

```bash
docker run -d \
  --name cloudvault \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/cloudvault \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_PASSWORD=secure-password \
  shyamkrishna21/cloudvault:v1.0.0
```

## Helm Chart (Kubernetes)

### Install

```bash
# Add the Helm repo
helm repo add cloudvault https://implyfree.github.io/cloudvault
helm repo update

# Install with bundled PostgreSQL
helm install cloudvault cloudvault/cloudvault \
  --namespace cloudvault \
  --create-namespace

# Or install from source
helm install cloudvault ./helm/cloudvault \
  --namespace cloudvault \
  --create-namespace
```

### What Helm Does Automatically

- **Waits for PostgreSQL** to be ready (init container)
- **Runs database migrations** via `db-migrate` init container (idempotent)
- **Auto-generates secrets** (JWT_SECRET, ENCRYPTION_KEY) on first install
- **Preserves secrets** across `helm upgrade` (uses `lookup` + `helm.sh/resource-policy: keep`)
- **Creates PodDisruptionBudget** for high availability
- **Sets up HPA** (2-10 replicas based on CPU/memory)

### Production Values

```bash
helm install cloudvault cloudvault/cloudvault \
  --namespace cloudvault \
  --create-namespace \
  --set app.adminPassword=secure-password \
  --set app.jwtSecret=$(openssl rand -hex 32) \
  --set app.encryptionKey=$(openssl rand -hex 32) \
  --set postgresql.auth.password=secure-db-password
```

### Kubernetes Files (raw manifests)

| File | Description |
|------|-------------|
| `k8s/namespace.yaml` | Creates the `cloudvault` namespace |
| `k8s/secret.yaml` | JWT secret, encryption key, admin password |
| `k8s/configmap.yaml` | Non-sensitive configuration |
| `k8s/postgres.yaml` | PostgreSQL database with PVC |
| `k8s/deployment.yaml` | Main deployment with health checks |
| `k8s/service.yaml` | ClusterIP service |
| `k8s/gateway.yaml` | GKE Gateway API (optional) |
| `k8s/hpa.yaml` | Horizontal Pod Autoscaler |

## Adding Cloud Providers

After deployment, add providers through the Admin UI:

| Provider | Credentials Required |
|----------|---------------------|
| **GCP** | Service Account JSON key |
| **AWS S3** | Access Key ID + Secret Access Key + Region |
| **Azure Blob** | Storage Account name + Access Key |
| **Oracle Cloud** | Tenancy OCID, User OCID, Fingerprint, Private Key |
| **S3-Compatible** | Endpoint URL + Access Key + Secret Key |

## Architecture

### Upload Flow (Zero Server Load)
```
┌──────────┐  1. Get signed URL (~1KB)  ┌──────────┐
│  Browser │ ────────────────────────▶  │   Pod    │
└──────────┘                            └──────────┘
     │                                       │
     │                                       │ 2. Log to DB
     │                                       ▼
     │                              ┌──────────────────┐
     │                              │   PostgreSQL     │
     │                              └──────────────────┘
     │
     │  3. Upload DIRECTLY to cloud (bypasses your infra!)
     │
     └──────────────────────────────────────────────────▶  ☁️ Cloud Storage
```

**For a 1TB upload, your pods only handle ~1KB of metadata!**

### Kubernetes Architecture
```
                    ┌─────────────────┐
                    │  Gateway/Ingress│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     Service     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │  Pod 1  │        │  Pod 2  │   ...  │  Pod N  │
    └────┬────┘        └────┬────┘        └────┬────┘
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    └─────────────────┘

    HPA: 2-10 replicas based on CPU/Memory
    PDB: minAvailable=1 for zero-downtime upgrades
```

## License

MIT

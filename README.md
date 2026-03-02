# CloudVault - Multi-Cloud Storage Uploader

Enterprise-grade web application for uploading files to multiple cloud storage providers (GCP, AWS, Azure, Oracle, S3-compatible) with **admin-controlled access management**.

## Features

- **Multi-Cloud Support**: GCP Cloud Storage, AWS S3, Azure Blob, Oracle Cloud, S3-Compatible (MinIO, Wasabi, etc.)
- **Admin Dashboard**: Manage users, providers, permissions, and view upload logs
- **User Access Control**: Assign users to specific providers and buckets
- **Secure Uploads**: Direct uploads via signed URLs (supports 10TB+ files)
- **Upload History**: Track all uploads with filtering, export to Excel
- **Modern UI**: Dark/light theme, responsive design

## Security

- Cloud provider credentials encrypted in database (AES-256)
- Passwords hashed with bcrypt
- JWT session tokens
- Rate limiting on API
- Non-root Docker container
- Kubernetes security contexts

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start PostgreSQL** (required)
   ```bash
   # Using Docker
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

5. **Login as admin**
   - Username: `admin`
   - Password: `admin` (or your `ADMIN_PASSWORD`)

6. **Add cloud providers**
   - Go to Admin → Providers → Add Provider
   - Select your cloud (GCP, AWS, Azure, etc.)
   - Enter credentials and test connection

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | **Yes** |
| `PORT` | Server port | No (default: 3001) |
| `JWT_SECRET` | Secret for JWT tokens | No (auto-generated) |
| `ADMIN_PASSWORD` | Initial admin password | No (default: admin) |
| `ENCRYPTION_KEY` | Key for encrypting credentials | No (derived from JWT_SECRET) |

## Docker

```bash
# Create a network
docker network create cloudvault-net

# Run PostgreSQL
docker run -d \
  --name cloudvault-db \
  --network cloudvault-net \
  -e POSTGRES_DB=cloudvault \
  -e POSTGRES_USER=cloudvault \
  -e POSTGRES_PASSWORD=secure-db-password \
  -v cloudvault-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine

# Build the app
docker build -t cloudvault:latest .

# Run the app
docker run -d \
  --name cloudvault \
  --network cloudvault-net \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://cloudvault:secure-db-password@cloudvault-db:5432/cloudvault \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_PASSWORD=secure-password \
  cloudvault:latest

# Open http://localhost:3001
```

## Kubernetes Deployment

### 1. Generate secrets
```bash
# Generate random secrets
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "JWT_SECRET: $JWT_SECRET"
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"
```

### 2. Update k8s/secret.yaml
Edit `k8s/secret.yaml` and replace placeholder values with your generated secrets.

### 3. Build and push image
```bash
# Build
docker build -t your-registry/cloudvault:latest .

# Push to your registry
docker push your-registry/cloudvault:latest
```

### 4. Update deployment
Edit `k8s/deployment.yaml` and set your image:
```yaml
image: your-registry/cloudvault:latest
```

### 5. Deploy
```bash
# Using kustomize (recommended)
kubectl apply -k k8s/

# Or apply individually
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 6. Access the application
```bash
# Port forward for local access
kubectl -n bucket-uploader port-forward svc/bucket-uploader 8080:80

# Open http://localhost:8080
```

### Kubernetes Files

| File | Description |
|------|-------------|
| `k8s/namespace.yaml` | Creates the `bucket-uploader` namespace |
| `k8s/secret.yaml` | JWT secret, encryption key, admin password |
| `k8s/configmap.yaml` | Non-sensitive configuration |
| `k8s/postgres.yaml` | PostgreSQL database with RWO PVC |
| `k8s/deployment.yaml` | Main deployment with health checks |
| `k8s/service.yaml` | ClusterIP service (+ optional Ingress) |
| `k8s/kustomization.yaml` | Kustomize config for easy deployment |

### Production Checklist

- [ ] Generate strong `JWT_SECRET` and `ENCRYPTION_KEY`
- [ ] Set a secure `ADMIN_PASSWORD`
- [ ] Push Docker image to your private registry
- [ ] Configure Ingress for external access
- [ ] Set up TLS/HTTPS
- [ ] Configure backup for PostgreSQL (pg_dump or managed DB snapshots)
- [ ] Consider external database (PostgreSQL) for high availability

## Adding Cloud Providers

After deployment, add cloud providers through the Admin UI:

### Google Cloud Storage (GCP)
- Create a service account with Storage Admin role
- Download JSON key
- Paste the entire JSON in the "Service Account JSON" field

### Amazon S3 (AWS)
- Create IAM user with S3 access
- Generate access keys
- Enter Access Key ID, Secret Access Key, and Region

### Azure Blob Storage
- Get Storage Account name and Access Key from Azure Portal
- Enter both in the provider configuration

### Oracle Cloud Object Storage
- Get tenancy OCID, user OCID, fingerprint, and private key
- Enter namespace and region

### S3-Compatible (MinIO, Wasabi, etc.)
- Enter endpoint URL, access key, secret key
- Enable "Force Path Style" if required

## Architecture

### Upload Flow (Zero Load on Your Servers!)
```
┌──────────┐  1. Get signed URL (~1KB)  ┌──────────┐
│  Browser │ ────────────────────────▶  │   Pod    │
└──────────┘                            └──────────┘
     │                                       │
     │                                       │ 2. Log to DB (~500 bytes)
     │                                       ▼
     │                              ┌──────────────────┐
     │                              │   PostgreSQL     │
     │                              └──────────────────┘
     │
     │  3. Upload file DIRECTLY to cloud (bypasses your infrastructure!)
     │
     └──────────────────────────────────────────────────▶  ☁️ Cloud Storage
```

**For a 1TB upload, your pods only handle ~1KB of data!**

### Kubernetes (PostgreSQL + HPA)
```
                    ┌─────────────────┐
                    │     Ingress     │
                    │   (optional)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     Service     │
                    │   (ClusterIP)   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │  Pod 1  │        │  Pod 2  │        │  Pod N  │
    │  (App)  │        │  (App)  │   ...  │  (App)  │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    │   (RWO PVC)     │
                    └─────────────────┘

    HPA: 2-10 replicas based on CPU/Memory
```

## Scalability

| Component | Scalable | Details |
|-----------|----------|---------|
| App Pods | ✅ Yes | Stateless, scales 2-10 via HPA |
| PostgreSQL | ✅ Yes* | Single instance, can upgrade to managed DB |
| Uploads | ✅ Yes | Direct to cloud via signed URLs |

*For high availability, consider managed PostgreSQL (Cloud SQL, RDS, Azure Database).

## License

MIT

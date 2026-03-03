# CloudVault Helm Chart

[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/cloudvault)](https://artifacthub.io/packages/helm/cloudvault/cloudvault)

Self-hosted multi-cloud storage manager with granular permissions, resumable uploads, and cost analytics.

## Quick Install

```bash
helm repo add cloudvault https://implyfree.github.io/cloudvault
helm repo update

helm install cloudvault cloudvault/cloudvault -n cloudvault --create-namespace
```

Or install from source:

```bash
helm install cloudvault ./helm/cloudvault -n cloudvault --create-namespace
```

## Install with Custom Values

```bash
helm install cloudvault cloudvault/cloudvault -n cloudvault --create-namespace \
  --set app.adminPassword=your-secure-password \
  --set postgresql.auth.password=your-db-password
```

## Install with Ingress

```bash
helm install cloudvault cloudvault/cloudvault -n cloudvault --create-namespace \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=cloudvault.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

## Access the Application

```bash
# Port forward
kubectl -n cloudvault port-forward svc/cloudvault 8080:80

# Open http://localhost:8080
# Login: admin / admin
```

## Configuration

### Application Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `app.adminUsername` | Initial admin username | `admin` |
| `app.adminPassword` | Initial admin password | `admin` |
| `app.jwtSecret` | JWT secret (auto-generated if empty) | `""` |
| `app.encryptionKey` | Encryption key (auto-generated if empty) | `""` |

### Image Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Image repository | `shyamkrishna21/cloudvault` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Pull policy | `IfNotPresent` |

### PostgreSQL Settings (Official Image)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Enable bundled PostgreSQL | `true` |
| `postgresql.image.repository` | PostgreSQL image | `postgres` |
| `postgresql.image.tag` | PostgreSQL version | `18.3-alpine` |
| `postgresql.auth.username` | Database username | `cloudvault` |
| `postgresql.auth.password` | Database password | `cloudvault-db-password` |
| `postgresql.auth.database` | Database name | `cloudvault` |
| `postgresql.primary.persistence.size` | PVC size | `5Gi` |

### External Database (if `postgresql.enabled=false`)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `externalDatabase.host` | Database host | `""` |
| `externalDatabase.port` | Database port | `5432` |
| `externalDatabase.username` | Database username | `cloudvault` |
| `externalDatabase.password` | Database password | `""` |
| `externalDatabase.database` | Database name | `cloudvault` |

### Autoscaling

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | CPU threshold | `70` |

### Ingress

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class | `""` |
| `ingress.hosts` | Ingress hosts | `[]` |
| `ingress.tls` | TLS configuration | `[]` |

## Upgrading

```bash
helm upgrade cloudvault cloudvault/cloudvault -n cloudvault
```

## Uninstalling

```bash
helm uninstall cloudvault -n cloudvault
```

> **Note:** This will not delete the PVC. To fully clean up:
> ```bash
> kubectl delete pvc -n cloudvault -l app.kubernetes.io/instance=cloudvault
> ```

## Using External PostgreSQL

```bash
helm install cloudvault cloudvault/cloudvault -n cloudvault --create-namespace \
  --set postgresql.enabled=false \
  --set externalDatabase.host=your-postgres-host \
  --set externalDatabase.password=your-password
```

## Production Checklist

- [ ] Change `app.adminPassword` to a secure password
- [ ] Change `postgresql.auth.password` to a secure password
- [ ] Set `app.jwtSecret` and `app.encryptionKey` explicitly
- [ ] Configure Ingress with TLS
- [ ] Set appropriate resource limits
- [ ] Configure backup for PostgreSQL PVC

# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |
| < 1.0   | ❌ No     |

## Reporting a Vulnerability

If you discover a security vulnerability in CloudVault, please report it responsibly.

**⚠️ Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** Send details to **shyam21091996@gmail.com**
2. **Subject:** `[SECURITY] CloudVault - Brief description`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 1 week |
| Fix release | Within 2 weeks (critical) |

### What Happens Next

1. We will acknowledge your report within 48 hours
2. We will investigate and assess the severity
3. We will develop and test a fix
4. We will release a patch and credit you (unless you prefer anonymity)

## Security Best Practices

When deploying CloudVault:

- [ ] Use strong, unique PostgreSQL passwords
- [ ] Set a strong `JWT_SECRET` and `ENCRYPTION_KEY`
- [ ] Change the default admin password immediately
- [ ] Keep Docker images updated to latest version
- [ ] Enable TLS/HTTPS via Ingress in Kubernetes
- [ ] Restrict network access to PostgreSQL port
- [ ] Use Kubernetes secrets for sensitive configuration
- [ ] Enable Kubernetes RBAC and network policies
- [ ] Regularly rotate cloud provider credentials

## Security Features

CloudVault includes these security measures:

- **AES-256 Encryption** — Cloud provider credentials encrypted at rest
- **bcrypt** — Password hashing with salt
- **JWT** — Secure session tokens
- **Helmet.js** — HTTP security headers (CSP, HSTS, X-Frame-Options)
- **Rate Limiting** — API rate limiting per IP
- **Non-root Container** — Runs as unprivileged user
- **Dropped Capabilities** — All Linux capabilities dropped
- **No Privilege Escalation** — Explicitly disabled
- **Granular RBAC** — Per-user, per-bucket permissions

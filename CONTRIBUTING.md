# Contributing to CloudVault

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cloudvault.git
   cd cloudvault
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start PostgreSQL:**
   ```bash
   docker-compose up -d postgres
   ```
5. **Run the dev server:**
   ```bash
   npm run dev
   ```

## Development

- **Frontend:** React (Vite) at `src/` → runs on http://localhost:5173
- **Backend:** Express.js at `server/` → runs on http://localhost:3001
- **Database:** PostgreSQL — schema auto-migrated on startup via `server/db.js`

## Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test locally — ensure the app builds:
   ```bash
   npm run build
   ```
4. Commit with a clear message:
   ```bash
   git commit -m "Add: brief description of your change"
   ```
5. Push and open a Pull Request

## Pull Request Guidelines

- **One PR per feature/fix** — keep changes focused
- **Describe what and why** in the PR description
- **Test your changes** — make sure the app builds and works
- **No secrets** — never commit credentials, keys, or `.env` files
- **Follow existing code style** — consistent formatting

## Reporting Bugs

Open an [issue](https://github.com/implyfree/cloudvault/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS info
- Screenshots if applicable

## Feature Requests

Open an [issue](https://github.com/implyfree/cloudvault/issues) with the `enhancement` label describing:
- What you'd like
- Why it's useful
- Any implementation ideas

## Project Structure

```
cloudvault/
├── src/              # React frontend (Vite)
├── server/           # Express.js backend
│   ├── cloud-providers/  # GCP, AWS, Azure, OCI, S3 adapters
│   ├── db.js             # Database schema & migrations
│   ├── routes.js         # API routes
│   └── index.js          # Server entry point
├── helm/             # Helm chart for Kubernetes
├── k8s/              # Raw Kubernetes manifests
├── Dockerfile        # Multi-stage Docker build
└── docker-compose.yml
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

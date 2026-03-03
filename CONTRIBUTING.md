# Contributing to CloudVault

Thank you for your interest in contributing to CloudVault! We welcome contributions from the community.

## 📋 Rules

1. **Only maintainers** (`shyamkrishna21`) can push directly to the `main` branch.
2. **All other contributors** must fork the repository and submit a Pull Request (PR).
3. PRs require at least **1 approval** before merging.
4. All PRs must pass CI checks before merging.
5. Follow the existing code style and conventions.

## 🚀 Getting Started

### 1. Fork & Clone

```bash
# Fork via GitHub UI, then:
git clone https://github.com/<your-username>/cloudvault.git
cd cloudvault
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

> **Never** work directly on the `main` branch.

### 3. Set Up Development Environment

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker run -d --name cloudvault-db \
  -e POSTGRES_DB=cloudvault \
  -e POSTGRES_USER=cloudvault \
  -e POSTGRES_PASSWORD=localdev \
  -p 5432:5432 \
  postgres:16-alpine

# Set environment
export DATABASE_URL="postgresql://cloudvault:localdev@localhost:5432/cloudvault"
export JWT_SECRET="dev-secret"
export ADMIN_PASSWORD="admin"

# Start development servers
npm run dev
```

### 4. Make Your Changes

- Write clean, well-documented code
- Follow existing patterns and conventions
- Add comments for complex logic
- Update documentation if needed

### 5. Test Your Changes

- Ensure the application builds: `npm run build`
- Verify the app runs without errors
- Test both the UI and API endpoints
- Test with Docker: `docker compose up --build`

### 6. Commit & Push

```bash
git add .
git commit -m "feat: description of your change"
git push origin feature/your-feature-name
```

#### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `style:` | Formatting, no code change |
| `refactor:` | Code restructuring |
| `perf:` | Performance improvement |
| `test:` | Adding tests |
| `chore:` | Maintenance tasks |

### 7. Open a Pull Request

1. Go to [CloudVault PRs](https://github.com/implyfree/cloudvault/pulls)
2. Click **"New Pull Request"**
3. Select your fork and branch
4. Fill in the PR template
5. Request review from `@shyamkrishna21`

## 📐 Code Style

- **JavaScript**: ES modules, modern syntax
- **React**: Functional components with hooks
- **CSS**: Vanilla CSS with CSS custom properties
- **Naming**: camelCase for variables/functions, PascalCase for components

## 🔒 Security Issues

If you discover a security vulnerability, please **do not** open a public issue.
Instead, email **shyam21091996@gmail.com** directly. See [SECURITY.md](SECURITY.md).

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for helping make CloudVault better! 🎉

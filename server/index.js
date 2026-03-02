import 'dotenv/config';
import './gcp.js'; // set GOOGLE_APPLICATION_CREDENTIALS from key file path at load
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { initDb } from './db.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const app = express();

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.googleapis.com https://*.amazonaws.com https://*.blob.core.windows.net https://*.oraclecloud.com");
  next();
});

// CORS - restrict in production, allow all in development
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // In development or if no origins configured, allow all
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.length === 0) {
      return callback(null, true);
    }
    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
}));

app.use('/api', routes);
// Serve SPA static files (must be before catch-all)
app.use(express.static(path.join(root, 'dist'), { index: false }));
// SPA fallback: serve index.html for any non-API GET so client router works
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(root, 'dist', 'index.html'));
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await initDb();
    console.log('PostgreSQL database initialized');
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    if (!process.env.DATABASE_URL) {
      console.error('Hint: Set DATABASE_URL environment variable');
      console.error('Example: DATABASE_URL=postgresql://user:password@localhost:5432/cloudvault');
    }
    process.exit(1);
  }
}

start();

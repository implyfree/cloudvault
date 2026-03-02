import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_EXPIRY = '7d';

// Warn if using default JWT secret in production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'change-me-in-production') {
  console.error('WARNING: Using default JWT_SECRET in production! This is a security risk.');
  console.error('Set a strong JWT_SECRET environment variable (e.g., openssl rand -hex 32)');
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: !!user.is_admin, is_cost_manager: !!user.is_cost_manager },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

export function requireCostAccess(req, res, next) {
  if (!req.user?.is_admin && !req.user?.is_cost_manager) {
    return res.status(403).json({ error: 'Cost access required' });
  }
  next();
}

export async function getUserBuckets(userId) {
  const rows = await query('SELECT bucket_name FROM user_buckets WHERE user_id = ?', [userId]);
  return rows.map(r => r.bucket_name);
}

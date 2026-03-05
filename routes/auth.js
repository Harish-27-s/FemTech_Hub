// routes/auth.js
// Authentication: signup, login, profile, delete account

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'femtech_hub_secret_2024';

// ── Middleware: verify JWT ───────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required' });

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  db.prepare(
    'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, name, email, password_hash);

  const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { id, name, email } });
  console.log("All users:", db.prepare("SELECT * FROM users").all());
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, is_premium: user.is_premium },
  });
});

// ── GET /api/auth/profile ────────────────────────────────────────────────────
router.get('/profile', authMiddleware, (req, res) => {
  const db = getDB();
  const user = db
    .prepare('SELECT id, name, email, privacy_mode, is_premium, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── PATCH /api/auth/privacy ──────────────────────────────────────────────────
router.patch('/privacy', authMiddleware, (req, res) => {
  const { privacy_mode } = req.body;
  const db = getDB();
  db.prepare('UPDATE users SET privacy_mode = ? WHERE id = ?').run(
    privacy_mode ? 1 : 0,
    req.user.id
  );
  res.json({ success: true, privacy_mode: !!privacy_mode });
});

// ── DELETE /api/auth/account ─────────────────────────────────────────────────
router.delete('/account', authMiddleware, (req, res) => {
  const db = getDB();
  const uid = req.user.id;
  // Delete all user data (GDPR-style)
  ['location_logs', 'alerts', 'cycle_logs', 'symptoms', 'mood_logs', 'community_posts'].forEach(
    (table) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(uid)
  );
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  res.json({ success: true, message: 'Account and all data deleted' });
});

module.exports = { router, authMiddleware };

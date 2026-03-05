// routes/community.js
// Community module: forum posts, emergency alerts, abuse reports

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/db');
const { authMiddleware } = require('./auth');

const router = express.Router();

let _io = null;
function setIO(io) { _io = io; }

// ── POST /api/community/post ─────────────────────────────────────────────────
router.post('/post', authMiddleware, (req, res) => {
  const { content, anonymous, emergency } = req.body;
  if (!content || content.trim().length === 0)
    return res.status(400).json({ error: 'content is required' });

  const db = getDB();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO community_posts (id, user_id, content, anonymous, emergency)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.user.id, content.trim(), anonymous ? 1 : 0, emergency ? 1 : 0);

  // Fetch the post with author info for broadcast
  const post = db
    .prepare(
      `SELECT cp.*, CASE WHEN cp.anonymous = 1 THEN 'Anonymous' ELSE u.name END as author_name
       FROM community_posts cp JOIN users u ON cp.user_id = u.id
       WHERE cp.id = ?`
    )
    .get(id);

  // Broadcast to all connected clients
  if (_io) {
    if (emergency) {
      _io.emit('emergency_alert', { ...post, message: `🚨 EMERGENCY: ${content}` });
    } else {
      _io.emit('receive_post', post);
    }
  }

  res.status(201).json({ success: true, post });
});

// ── GET /api/community/posts ─────────────────────────────────────────────────
// Paginated list of posts (most recent first)
router.get('/posts', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = parseInt(req.query.offset) || 0;

  const db = getDB();
  const posts = db
    .prepare(
      `SELECT cp.id, cp.content, cp.anonymous, cp.emergency, cp.reported,
              cp.timestamp,
              CASE WHEN cp.anonymous = 1 THEN 'Anonymous' ELSE u.name END as author_name
       FROM community_posts cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.reported = 0
       ORDER BY cp.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  res.json(posts);
});

// ── POST /api/community/report/:id ──────────────────────────────────────────
router.post('/report/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const result = db
    .prepare('UPDATE community_posts SET reported = 1 WHERE id = ?')
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Post not found' });
  res.json({ success: true, message: 'Post reported. Our team will review it shortly.' });
});

// ── POST /api/community/emergency ────────────────────────────────────────────
// Broadcast a community emergency alert (crowd safety)
router.post('/emergency', authMiddleware, (req, res) => {
  const { message, latitude, longitude } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  if (_io) {
    _io.emit('emergency_alert', {
      userId: req.user.id,
      userName: req.user.name,
      message: `🚨 COMMUNITY ALERT: ${message}`,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    });
  }

  res.json({ success: true, message: 'Emergency alert broadcast to all users.' });
});

module.exports = { router, setIO };

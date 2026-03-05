// routes/safety.js
// Safety module: SOS alerts, location logs, unsafe zone checks

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/db');
const { authMiddleware } = require('./auth');
const { updateUnsafeZones, checkUnsafeZone, getAllUnsafeZones, safetyRecommendations } = require('../ai/ai_engine');

const router = express.Router();

// io is injected by server.js so we can emit Socket.IO events from routes
let _io = null;
function setIO(io) { _io = io; }

// ── POST /api/safety/sos ─────────────────────────────────────────────────────
// Triggered when user presses the SOS button on their phone
router.post('/sos', authMiddleware, (req, res) => {
  const { latitude, longitude } = req.body;
  if (latitude === undefined || longitude === undefined)
    return res.status(400).json({ error: 'latitude and longitude are required' });

  const db = getDB();
  const alertId = uuidv4();
  db.prepare(
    'INSERT INTO alerts (id, user_id, type, latitude, longitude) VALUES (?, ?, ?, ?, ?)'
  ).run(alertId, req.user.id, 'SOS', latitude, longitude);

  // Also log location
  db.prepare(
    'INSERT INTO location_logs (id, user_id, latitude, longitude) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), req.user.id, latitude, longitude);

  // Update AI unsafe zone map
  updateUnsafeZones();

  // Broadcast SOS to ALL connected clients (live alert)
  if (_io) {
    _io.emit('sos_alert', {
      alertId,
      userId: req.user.id,
      userName: req.user.name,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
      message: `🚨 SOS Alert from ${req.user.name}!`,
    });
  }

  res.status(201).json({ success: true, alertId, message: 'SOS sent. Help is on the way.' });
});

// ── GET /api/safety/alerts ───────────────────────────────────────────────────
// Get recent SOS alerts (last 50) for admin/dashboard view
router.get('/alerts', authMiddleware, (req, res) => {
  const db = getDB();
  const alerts = db
    .prepare(
      `SELECT a.*, u.name as user_name
       FROM alerts a JOIN users u ON a.user_id = u.id
       ORDER BY a.timestamp DESC LIMIT 50`
    )
    .all();
  res.json(alerts);
});

// ── POST /api/safety/location ────────────────────────────────────────────────
// Store a single location log (REST fallback for Walk With Me)
router.post('/location', authMiddleware, (req, res) => {
  const { latitude, longitude } = req.body;
  if (latitude === undefined || longitude === undefined)
    return res.status(400).json({ error: 'latitude and longitude are required' });

  const db = getDB();
  db.prepare(
    'INSERT INTO location_logs (id, user_id, latitude, longitude) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), req.user.id, latitude, longitude);

  // Check if user is near a high-risk zone
  const zoneCheck = checkUnsafeZone(latitude, longitude);

  res.json({ success: true, zoneCheck });
});

// ── GET /api/safety/unsafe-zones ─────────────────────────────────────────────
router.get('/unsafe-zones', authMiddleware, (req, res) => {
  res.json(getAllUnsafeZones());
});

// ── GET /api/safety/check-zone ───────────────────────────────────────────────
// Check if a lat/lon is in an unsafe zone
router.get('/check-zone', authMiddleware, (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });
  res.json(checkUnsafeZone(parseFloat(lat), parseFloat(lon)));
});

// ── GET /api/safety/recommendations ─────────────────────────────────────────
router.get('/recommendations', authMiddleware, (req, res) => {
  res.json(safetyRecommendations(req.user.id));
});

module.exports = { router, setIO };

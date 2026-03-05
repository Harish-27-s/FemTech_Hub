// routes/health.js
// Health & Hormonal module: period tracking, symptom logging, AI predictions

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/db');
const { authMiddleware } = require('./auth');
const { analyseCycle } = require('../ai/ai_engine');

const router = express.Router();

// ── POST /api/health/cycle ───────────────────────────────────────────────────
// Log a new period entry
router.post('/cycle', authMiddleware, (req, res) => {
  const { date, flow_level, pain_level, cycle_length } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const db = getDB();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO cycle_logs (id, user_id, date, flow_level, pain_level, cycle_length)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.user.id, date, flow_level || 0, pain_level || 0, cycle_length || 28);

  res.status(201).json({ success: true, id });
});

// ── GET /api/health/cycle ────────────────────────────────────────────────────
// Get cycle history for calendar display
router.get('/cycle', authMiddleware, (req, res) => {
  const db = getDB();
  const logs = db
    .prepare(
      'SELECT * FROM cycle_logs WHERE user_id = ? ORDER BY date DESC LIMIT 24'
    )
    .all(req.user.id);
  res.json(logs);
});

// ── POST /api/health/symptom ─────────────────────────────────────────────────
router.post('/symptom', authMiddleware, (req, res) => {
  const { symptom, severity, date } = req.body;
  if (!symptom || !date) return res.status(400).json({ error: 'symptom and date are required' });

  const db = getDB();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO symptoms (id, user_id, symptom, severity, date) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, symptom, severity || 1, date);

  res.status(201).json({ success: true, id });
});

// ── GET /api/health/symptoms ─────────────────────────────────────────────────
router.get('/symptoms', authMiddleware, (req, res) => {
  const db = getDB();
  const symptoms = db
    .prepare(
      'SELECT * FROM symptoms WHERE user_id = ? ORDER BY date DESC LIMIT 50'
    )
    .all(req.user.id);
  res.json(symptoms);
});

// ── GET /api/health/analysis ─────────────────────────────────────────────────
// AI cycle analysis: predictions, PCOS risk, recommendations
router.get('/analysis', authMiddleware, (req, res) => {
  const result = analyseCycle(req.user.id);
  res.json(result);
});

// ── GET /api/health/tips ─────────────────────────────────────────────────────
// General health tips (static content, extended by AI context)
router.get('/tips', authMiddleware, (req, res) => {
  res.json({
    dietTips: [
      '🥗 Eat iron-rich foods during your period: spinach, lentils, tofu, red meat.',
      '🫐 Antioxidant-rich berries help reduce inflammation and bloating.',
      '🥑 Healthy fats (avocado, nuts, olive oil) support hormone production.',
      '🚫 Limit caffeine and alcohol during your luteal phase to reduce PMS symptoms.',
      '💧 Drink 2–3 litres of water daily for hormonal balance.',
    ],
    exerciseTips: [
      '🧘 Yoga and stretching reduce cramps and improve mood during menstruation.',
      '🏊 Swimming is gentle on joints and great for all cycle phases.',
      '🏃 Cardio in the follicular phase (after period ends) boosts energy and performance.',
      '💪 Strength training is most effective in the ovulatory phase.',
      '😴 Rest and light walks are best during the late luteal phase.',
    ],
  });
});

module.exports = router;

// routes/wellness.js
// Mental Wellness module: mood tracking, stress analysis, recommendations

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../database/db');
const { authMiddleware } = require('./auth');
const { analyseMood } = require('../ai/ai_engine');

const router = express.Router();

// ── POST /api/wellness/mood ──────────────────────────────────────────────────
// Log a mood entry
router.post('/mood', authMiddleware, (req, res) => {
  const { mood, stress_level, notes } = req.body;
  if (!mood) return res.status(400).json({ error: 'mood is required' });

  const validMoods = ['happy', 'calm', 'neutral', 'anxious', 'sad', 'angry', 'depressed'];
  if (!validMoods.includes(mood))
    return res.status(400).json({ error: `mood must be one of: ${validMoods.join(', ')}` });

  const db = getDB();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO mood_logs (id, user_id, mood, stress_level, notes)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.user.id, mood, stress_level || 1, notes || '');

  res.status(201).json({ success: true, id });
});

// ── GET /api/wellness/mood ───────────────────────────────────────────────────
router.get('/mood', authMiddleware, (req, res) => {
  const db = getDB();
  const logs = db
    .prepare(
      'SELECT * FROM mood_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 30'
    )
    .all(req.user.id);
  res.json(logs);
});

// ── GET /api/wellness/analysis ───────────────────────────────────────────────
// AI mood & stress analysis: trends, weekly report, recommendations
router.get('/analysis', authMiddleware, (req, res) => {
  const result = analyseMood(req.user.id);
  res.json(result);
});

// ── GET /api/wellness/exercises ──────────────────────────────────────────────
// Guided breathing / meditation exercises
router.get('/exercises', authMiddleware, (req, res) => {
  res.json([
    {
      id: 'box_breathing',
      title: 'Box Breathing',
      duration: '5 minutes',
      steps: [
        'Sit comfortably with your back straight.',
        'Breathe IN for 4 counts.',
        'HOLD your breath for 4 counts.',
        'Breathe OUT for 4 counts.',
        'HOLD for 4 counts.',
        'Repeat 4–8 times.',
      ],
      benefit: 'Reduces acute stress and anxiety',
    },
    {
      id: '478_breathing',
      title: '4-7-8 Breathing',
      duration: '3 minutes',
      steps: [
        'Close your eyes and relax your shoulders.',
        'Breathe IN through your nose for 4 counts.',
        'HOLD your breath for 7 counts.',
        'Breathe OUT through your mouth for 8 counts.',
        'Repeat 4 cycles.',
      ],
      benefit: 'Calms the nervous system, aids sleep',
    },
    {
      id: 'body_scan',
      title: 'Body Scan Meditation',
      duration: '10 minutes',
      steps: [
        'Lie down or sit comfortably.',
        'Close your eyes and breathe naturally.',
        'Focus attention on your feet. Notice any sensations.',
        'Slowly move attention up: legs, hips, abdomen, chest, arms, neck, face.',
        'If your mind wanders, gently return to the body part.',
        'End with 3 deep breaths.',
      ],
      benefit: 'Reduces tension and improves body awareness',
    },
    {
      id: 'gratitude',
      title: 'Gratitude Practice',
      duration: '5 minutes',
      steps: [
        'Find a quiet spot and take 3 deep breaths.',
        'Think of 3 things you are grateful for today.',
        'For each one, feel the appreciation in your body.',
        'Write them down if possible.',
      ],
      benefit: 'Boosts mood and shifts focus to the positive',
    },
  ]);
});

module.exports = router;

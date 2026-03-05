// ai/ai_engine.js
// Rule-based AI engine for FemTech Hub
// Handles: unsafe zone detection, cycle analysis, stress pattern analysis

const { getDB } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lon points in metres */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.  SAFE ZONE / UNSAFE ZONE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called every time a new SOS alert is saved.
 * Clusters SOS locations and marks zones with ≥2 alerts as high-risk.
 */
function updateUnsafeZones() {
  const db = getDB();
  const alerts = db.prepare('SELECT latitude, longitude FROM alerts').all();

  alerts.forEach((alert) => {
    const existing = db
      .prepare(
        `SELECT * FROM high_risk_zones
         WHERE ABS(latitude - ?) < 0.002 AND ABS(longitude - ?) < 0.002`
      )
      .get(alert.latitude, alert.longitude);

    if (existing) {
      db.prepare(
        `UPDATE high_risk_zones
         SET alert_count = alert_count + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(existing.id);
    } else {
      db.prepare(
        `INSERT INTO high_risk_zones (id, latitude, longitude)
         VALUES (?, ?, ?)`
      ).run(uuidv4(), alert.latitude, alert.longitude);
    }
  });
}

/**
 * Returns high-risk zones with ≥2 SOS events within radius.
 * Clients call this on location update to check if they are in danger.
 */
function checkUnsafeZone(latitude, longitude) {
  const db = getDB();
  const zones = db
    .prepare('SELECT * FROM high_risk_zones WHERE alert_count >= 2')
    .all();

  for (const zone of zones) {
    const dist = haversineDistance(latitude, longitude, zone.latitude, zone.longitude);
    if (dist <= zone.radius_m) {
      return {
        unsafe: true,
        zone,
        distance: Math.round(dist),
        message: `⚠️ Warning: You are near a high-risk zone (${Math.round(dist)}m away). ${zone.alert_count} SOS alerts recorded here. Stay alert!`,
      };
    }
  }
  return { unsafe: false };
}

/** Returns all high-risk zones for map display */
function getAllUnsafeZones() {
  const db = getDB();
  return db.prepare('SELECT * FROM high_risk_zones WHERE alert_count >= 2').all();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  MENSTRUAL CYCLE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyses cycle logs for a user.
 * Detects: irregular cycles (PCOS risk), predicts next period & ovulation,
 * returns diet and exercise tips.
 */
function analyseCycle(userId) {
  const db = getDB();
  const logs = db
    .prepare(
      `SELECT date, flow_level, pain_level, cycle_length
       FROM cycle_logs WHERE user_id = ? ORDER BY date DESC LIMIT 12`
    )
    .all(userId);

  if (logs.length === 0) {
    return {
      prediction: null,
      irregularCycle: false,
      pcosRisk: false,
      recommendations: ['Start logging your cycle to receive personalised insights.'],
    };
  }

  // Average cycle length
  const avgCycle =
    logs.reduce((s, l) => s + (l.cycle_length || 28), 0) / logs.length;

  // Irregular if std-dev of cycle lengths > 7 days
  const lengths = logs.map((l) => l.cycle_length || 28);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(
    lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length
  );
  const irregularCycle = stdDev > 7 || avgCycle < 21 || avgCycle > 35;

  // Average pain
  const avgPain = logs.reduce((s, l) => s + (l.pain_level || 0), 0) / logs.length;

  // PCOS risk: irregular + high pain + low flow
  const avgFlow = logs.reduce((s, l) => s + (l.flow_level || 0), 0) / logs.length;
  const pcosRisk = irregularCycle && avgPain >= 6 && avgFlow <= 2;

  // Predict next period
  const lastDate = new Date(logs[0].date);
  const nextPeriod = new Date(lastDate);
  nextPeriod.setDate(nextPeriod.getDate() + Math.round(avgCycle));

  // Ovulation ≈ 14 days before next period
  const ovulation = new Date(nextPeriod);
  ovulation.setDate(ovulation.getDate() - 14);

  const recommendations = [];

  if (pcosRisk) {
    recommendations.push(
      '🩺 Your cycle data suggests possible PCOS risk. Please consult a gynaecologist.',
      '🥗 Low-glycaemic diet (whole grains, vegetables, lean protein) can help manage PCOS.',
      '🏃 Regular moderate exercise (30 min/day) helps regulate hormones.'
    );
  } else if (irregularCycle) {
    recommendations.push(
      '📅 Your cycles appear irregular. Tracking consistently will help identify patterns.',
      '💤 Prioritise 7–9 hours of sleep to support hormonal balance.',
      '🧘 Stress reduction techniques like yoga may help regulate your cycle.'
    );
  } else {
    recommendations.push(
      '✅ Your cycle appears regular – great!',
      '🥦 Maintain iron-rich foods during menstruation (spinach, lentils, red meat).',
      '💧 Stay hydrated – at least 8 glasses of water per day.'
    );
  }

  if (avgPain >= 7) {
    recommendations.push(
      '💊 High pain levels detected. Consult a doctor if pain is severe or interferes with daily life.',
      '🌡️ A heating pad or warm bath can help ease menstrual cramps.'
    );
  }

  return {
    prediction: {
      nextPeriod: nextPeriod.toISOString().split('T')[0],
      ovulation: ovulation.toISOString().split('T')[0],
      averageCycleLength: Math.round(avgCycle),
    },
    irregularCycle,
    pcosRisk,
    stdDev: Math.round(stdDev * 10) / 10,
    recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  STRESS / MOOD PATTERN ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

const MOOD_SCORE = {
  happy: 5, calm: 4, neutral: 3, anxious: 2, sad: 2, angry: 1, depressed: 1,
};

/**
 * Analyses mood logs for a user.
 * Returns: average stress score, weekly trend, personalised wellness tips.
 */
function analyseMood(userId) {
  const db = getDB();
  const logs = db
    .prepare(
      `SELECT mood, stress_level, timestamp
       FROM mood_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 30`
    )
    .all(userId);

  if (logs.length === 0) {
    return {
      stressScore: 0,
      moodTrend: 'No data',
      weeklyReport: [],
      recommendations: ['Start logging your mood to receive wellness insights.'],
    };
  }

  const avgStress = logs.reduce((s, l) => s + l.stress_level, 0) / logs.length;
  const avgMoodScore =
    logs.reduce((s, l) => s + (MOOD_SCORE[l.mood] || 3), 0) / logs.length;

  // Group by day for weekly report (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recent = logs.filter((l) => new Date(l.timestamp) >= sevenDaysAgo);
  const dayMap = {};
  recent.forEach((l) => {
    const day = l.timestamp.split('T')[0].split(' ')[0];
    if (!dayMap[day]) dayMap[day] = { stress: [], moods: [] };
    dayMap[day].stress.push(l.stress_level);
    dayMap[day].moods.push(MOOD_SCORE[l.mood] || 3);
  });
  const weeklyReport = Object.entries(dayMap).map(([day, v]) => ({
    day,
    avgStress: Math.round((v.stress.reduce((a, b) => a + b, 0) / v.stress.length) * 10) / 10,
    avgMood: Math.round((v.moods.reduce((a, b) => a + b, 0) / v.moods.length) * 10) / 10,
  }));

  const recommendations = [];

  if (avgStress >= 7) {
    recommendations.push(
      '🚨 Your stress levels are high. Consider speaking with a mental health professional.',
      '🧘 Try 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s – repeat 4 times.',
      '📵 Limit screen time before bed to improve sleep quality.'
    );
  } else if (avgStress >= 4) {
    recommendations.push(
      '😐 Moderate stress detected. Small daily habits can make a big difference.',
      '🚶 A 20-minute walk in nature can significantly lower cortisol.',
      '📔 Journalling your thoughts before bed can ease anxiety.'
    );
  } else {
    recommendations.push(
      '😊 Your stress levels look manageable – keep it up!',
      '🌟 Maintain your routine and celebrate small wins every day.'
    );
  }

  if (avgMoodScore <= 2.5) {
    recommendations.push(
      '💜 Your mood patterns suggest you may be feeling low. You are not alone.',
      '☀️ Try to get 15–30 minutes of sunlight daily to boost serotonin.',
      '🤝 Reach out to a friend, family member, or the community forum.'
    );
  }

  return {
    stressScore: Math.round(avgStress * 10) / 10,
    moodScore: Math.round(avgMoodScore * 10) / 10,
    moodTrend: avgMoodScore >= 3.5 ? 'Positive' : avgMoodScore >= 2.5 ? 'Neutral' : 'Low',
    weeklyReport,
    recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  PERSONALISED SAFETY RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

function safetyRecommendations(userId) {
  const db = getDB();
  const alertCount = db
    .prepare('SELECT COUNT(*) as cnt FROM alerts WHERE user_id = ?')
    .get(userId).cnt;

  const tips = [
    '📍 Share your live location with a trusted contact when travelling alone.',
    '🔋 Keep your phone charged above 20% when going out.',
    '📞 Save emergency contacts with a quick-dial shortcut.',
    '🌙 Avoid poorly lit or isolated areas after dark.',
    '👥 Trust your instincts – if something feels wrong, leave immediately.',
  ];

  if (alertCount >= 3) {
    tips.unshift(
      '🚨 You have triggered multiple SOS alerts recently. Please ensure your regular contacts are aware of your routine.'
    );
  }

  return { alertCount, tips };
}

module.exports = {
  updateUnsafeZones,
  checkUnsafeZone,
  getAllUnsafeZones,
  analyseCycle,
  analyseMood,
  safetyRecommendations,
};

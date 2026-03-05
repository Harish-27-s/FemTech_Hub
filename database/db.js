// database/db.js
// SQLite database setup using better-sqlite3 (no MongoDB required)
// All tables are created on first run automatically

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'femtech_hub.db');

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH, { verbose: null });
    db.pragma('journal_mode = WAL'); // Better concurrent performance
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  // ── USERS ──────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      privacy_mode  INTEGER DEFAULT 0,
      is_premium    INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── LOCATION LOGS ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS location_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      latitude    REAL NOT NULL,
      longitude   REAL NOT NULL,
      timestamp   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── ALERTS (SOS) ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      type        TEXT DEFAULT 'SOS',
      latitude    REAL,
      longitude   REAL,
      timestamp   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── CYCLE LOGS ─────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      date        TEXT NOT NULL,
      flow_level  INTEGER DEFAULT 0,
      pain_level  INTEGER DEFAULT 0,
      cycle_length INTEGER DEFAULT 28,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── SYMPTOMS ───────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS symptoms (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      symptom     TEXT NOT NULL,
      severity    INTEGER DEFAULT 1,
      date        TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── MOOD LOGS ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS mood_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      mood        TEXT NOT NULL,
      stress_level INTEGER DEFAULT 1,
      notes       TEXT DEFAULT '',
      timestamp   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── COMMUNITY POSTS ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      content     TEXT NOT NULL,
      anonymous   INTEGER DEFAULT 0,
      reported    INTEGER DEFAULT 0,
      emergency   INTEGER DEFAULT 0,
      timestamp   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── HIGH RISK ZONES (computed by AI engine) ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS high_risk_zones (
      id          TEXT PRIMARY KEY,
      latitude    REAL NOT NULL,
      longitude   REAL NOT NULL,
      radius_m    REAL DEFAULT 200,
      alert_count INTEGER DEFAULT 1,
      updated_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('✅  Database schema ready – femtech_hub.db');
}

module.exports = { getDB };

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'darsjo_app',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'darsjo_portal',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  role VARCHAR(16) NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin','teacher')),
  password_hash TEXT NOT NULL,
  quota_bytes BIGINT NOT NULL DEFAULT 16106127360,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_color VARCHAR(16) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf VARCHAR(64) NOT NULL DEFAULT '',
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS captchas (
  id UUID PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captchas_expires_idx ON captchas(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action VARCHAR(48) NOT NULL,
  detail JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read-only mirror of numbered LMS sessions that have a published recording.
-- The LMS writes this table; the file panel only reads it.
CREATE TABLE IF NOT EXISTS lms_sessions (
  lms_session_id BIGINT PRIMARY KEY,
  teacher_username VARCHAR(32) NOT NULL,
  teacher_name VARCHAR(120) NOT NULL DEFAULT '',
  offering_title VARCHAR(80) NOT NULL DEFAULT '',
  class_name VARCHAR(60) NOT NULL DEFAULT '',
  session_number INTEGER NOT NULL,
  session_title VARCHAR(120) NOT NULL DEFAULT '',
  session_date TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'ended',
  recording_name VARCHAR(200) NOT NULL DEFAULT '',
  playback_url TEXT NOT NULL DEFAULT '',
  download_url TEXT NOT NULL DEFAULT '',
  duration_label VARCHAR(16) NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lms_sessions_teacher_idx ON lms_sessions (teacher_username);
CREATE INDEX IF NOT EXISTS lms_sessions_date_idx ON lms_sessions (session_date DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id BIGSERIAL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('db','files')),
  mode VARCHAR(16) NOT NULL CHECK (mode IN ('auto','manual')),
  status VARCHAR(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed')),
  file_path TEXT,
  size_bytes BIGINT,
  duration_ms INTEGER,
  meta JSONB,
  message TEXT,
  created_by BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON backup_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS backup_runs_kind_idx ON backup_runs(kind, status);
`;

async function initDb() {
  await pool.query(SCHEMA);
  // idempotent guards for databases created by earlier builds
  await pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS csrf VARCHAR(64) NOT NULL DEFAULT ''");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(16) NOT NULL DEFAULT \'\'');
  await pool.query('DELETE FROM captchas WHERE expires_at < now() - interval \'1 day\'');
  await pool.query('DELETE FROM sessions WHERE expires_at < now() - interval \'1 day\'');
}

module.exports = { pool, query, initDb };

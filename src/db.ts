import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS heartbeats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent      TEXT NOT NULL,
  status     TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'error', 'offline')),
  context    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trace_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id        TEXT NOT NULL,
  agent           TEXT NOT NULL,
  action          TEXT NOT NULL,
  input           TEXT NOT NULL DEFAULT '',
  output          TEXT NOT NULL DEFAULT '',
  parent_event_id INTEGER REFERENCES trace_events(id),
  status          TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'error')),
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent      TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'critical')),
  message    TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_agent ON heartbeats(agent, created_at);
CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON trace_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_agent ON trace_events(agent, created_at);
CREATE INDEX IF NOT EXISTS idx_trace_events_parent ON trace_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_alerts_agent ON alerts(agent, alert_type, resolved);
`;

export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

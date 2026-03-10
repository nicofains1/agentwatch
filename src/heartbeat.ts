import type Database from 'better-sqlite3';
import type { AgentStatus, Heartbeat, AgentHealth } from './types.js';

/** Format a date as SQLite-compatible `YYYY-MM-DD HH:MM:SS` */
function sqliteNow(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export function report(
  db: Database.Database,
  agent: string,
  status: AgentStatus,
  context: string = '{}',
): Heartbeat {
  const stmt = db.prepare(`
    INSERT INTO heartbeats (agent, status, context)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(agent, status, context);
  return {
    id: Number(result.lastInsertRowid),
    agent,
    status,
    context,
    created_at: new Date().toISOString(),
  };
}

export function getLatestHeartbeat(
  db: Database.Database,
  agent: string,
): Heartbeat | undefined {
  return db.prepare(`
    SELECT * FROM heartbeats
    WHERE agent = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(agent) as Heartbeat | undefined;
}

export function getFleetHealth(
  db: Database.Database,
  staleMinutes: number = 30,
): AgentHealth[] {
  const agents = db.prepare(`
    SELECT DISTINCT agent FROM heartbeats
  `).all() as { agent: string }[];

  return agents.map(({ agent }) => {
    const latest = getLatestHeartbeat(db, agent);
    if (!latest) {
      return { agent, status: 'offline' as AgentStatus, last_heartbeat: '', uptime_pct: 0, active_alerts: 0 };
    }

    const staleThreshold = sqliteNow(-staleMinutes * 60 * 1000);
    const isStale = latest.created_at < staleThreshold;
    const status: AgentStatus = isStale ? 'offline' : latest.status;

    // Uptime: % of heartbeats in last 24h that were 'healthy'
    const dayAgo = sqliteNow(-24 * 60 * 60 * 1000);
    const totalCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM heartbeats
      WHERE agent = ? AND created_at > ?
    `).get(agent, dayAgo) as { cnt: number };

    const healthyCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM heartbeats
      WHERE agent = ? AND created_at > ? AND status = 'healthy'
    `).get(agent, dayAgo) as { cnt: number };

    const uptime = totalCount.cnt > 0
      ? Math.round((healthyCount.cnt / totalCount.cnt) * 100)
      : 0;

    const alertCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM alerts
      WHERE agent = ? AND resolved = 0
    `).get(agent) as { cnt: number };

    return {
      agent,
      status,
      last_heartbeat: latest.created_at,
      uptime_pct: uptime,
      active_alerts: alertCount.cnt,
    };
  });
}

import type Database from 'better-sqlite3';
import type { Alert, AlertSeverity } from './types.js';

function sqliteNow(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * Record an alert with de-duplication.
 * If the same (agent, alert_type) exists within the window, increment count.
 * Escalate severity based on count: 1 = info, 3+ = warning, 10+ = critical.
 */
export function recordAlert(
  db: Database.Database,
  agent: string,
  alertType: string,
  message: string,
  windowMinutes: number = 30,
): Alert {
  const windowStart = sqliteNow(-windowMinutes * 60 * 1000);

  const existing = db.prepare(`
    SELECT * FROM alerts
    WHERE agent = ? AND alert_type = ? AND resolved = 0 AND last_seen > ?
    ORDER BY last_seen DESC
    LIMIT 1
  `).get(agent, alertType, windowStart) as Alert | undefined;

  if (existing) {
    const newCount = existing.count + 1;
    const severity = escalateSeverity(newCount);
    db.prepare(`
      UPDATE alerts
      SET count = ?, severity = ?, message = ?, last_seen = datetime('now')
      WHERE id = ?
    `).run(newCount, severity, message, existing.id);

    return { ...existing, count: newCount, severity, message, last_seen: new Date().toISOString() };
  }

  const stmt = db.prepare(`
    INSERT INTO alerts (agent, alert_type, severity, message)
    VALUES (?, ?, 'info', ?)
  `);
  const result = stmt.run(agent, alertType, message);

  return {
    id: Number(result.lastInsertRowid),
    agent,
    alert_type: alertType,
    severity: 'info',
    message,
    count: 1,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    resolved: false,
  };
}

export function resolveAlert(
  db: Database.Database,
  alertId: number,
): void {
  db.prepare(`UPDATE alerts SET resolved = 1 WHERE id = ?`).run(alertId);
}

export function getActiveAlerts(
  db: Database.Database,
  agent?: string,
): Alert[] {
  if (agent) {
    return db.prepare(`
      SELECT * FROM alerts WHERE agent = ? AND resolved = 0
      ORDER BY severity DESC, last_seen DESC
    `).all(agent) as Alert[];
  }
  return db.prepare(`
    SELECT * FROM alerts WHERE resolved = 0
    ORDER BY severity DESC, last_seen DESC
  `).all() as Alert[];
}

function escalateSeverity(count: number): AlertSeverity {
  if (count >= 10) return 'critical';
  if (count >= 3) return 'warning';
  return 'info';
}

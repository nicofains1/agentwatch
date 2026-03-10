import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { TraceEvent, CascadeStep, CascadeChain } from './types.js';

export function createTraceId(): string {
  return randomUUID();
}

export function trace(
  db: Database.Database,
  traceId: string,
  agent: string,
  action: string,
  input: string,
  output: string,
  opts: {
    parentEventId?: number;
    status?: 'ok' | 'error';
    durationMs?: number;
  } = {},
): TraceEvent {
  const stmt = db.prepare(`
    INSERT INTO trace_events (trace_id, agent, action, input, output, parent_event_id, status, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    traceId,
    agent,
    action,
    input,
    output,
    opts.parentEventId ?? null,
    opts.status ?? 'ok',
    opts.durationMs ?? 0,
  );
  return {
    id: Number(result.lastInsertRowid),
    trace_id: traceId,
    agent,
    action,
    input,
    output,
    parent_event_id: opts.parentEventId ?? null,
    status: opts.status ?? 'ok',
    duration_ms: opts.durationMs ?? 0,
    created_at: new Date().toISOString(),
  };
}

export function getTraceEvents(
  db: Database.Database,
  traceId: string,
): TraceEvent[] {
  return db.prepare(`
    SELECT * FROM trace_events
    WHERE trace_id = ?
    ORDER BY created_at ASC
  `).all(traceId) as TraceEvent[];
}

/**
 * Walk backward from a failed event to find the root cause.
 * Follows parent_event_id links to build the cascade chain.
 */
export function correlate(
  db: Database.Database,
  failureEventId: number,
): CascadeChain | null {
  const failure = db.prepare(`
    SELECT * FROM trace_events WHERE id = ?
  `).get(failureEventId) as TraceEvent | undefined;

  if (!failure) return null;

  const chain: CascadeStep[] = [];
  let current: TraceEvent | undefined = failure;

  while (current) {
    chain.unshift({
      event_id: current.id,
      agent: current.agent,
      action: current.action,
      input: current.input,
      output: current.output,
      status: current.status,
      duration_ms: current.duration_ms,
      timestamp: current.created_at,
    });

    if (current.parent_event_id === null) break;

    current = db.prepare(`
      SELECT * FROM trace_events WHERE id = ?
    `).get(current.parent_event_id) as TraceEvent | undefined;
  }

  return {
    failure_id: failureEventId,
    root_cause: chain[0],
    chain,
  };
}

/**
 * Find recent failures for an agent or across all agents.
 */
export function getRecentFailures(
  db: Database.Database,
  agent?: string,
  limit: number = 20,
): TraceEvent[] {
  if (agent) {
    return db.prepare(`
      SELECT * FROM trace_events
      WHERE agent = ? AND status = 'error'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agent, limit) as TraceEvent[];
  }
  return db.prepare(`
    SELECT * FROM trace_events
    WHERE status = 'error'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as TraceEvent[];
}

/**
 * Find all events in a trace that are errors, then correlate each.
 * Returns all cascade chains for a given trace.
 */
export function replayTrace(
  db: Database.Database,
  traceId: string,
): CascadeChain[] {
  const failures = db.prepare(`
    SELECT * FROM trace_events
    WHERE trace_id = ? AND status = 'error'
    ORDER BY created_at ASC
  `).all(traceId) as TraceEvent[];

  return failures
    .map(f => correlate(db, f.id))
    .filter((c): c is CascadeChain => c !== null);
}

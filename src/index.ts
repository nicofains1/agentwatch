import type Database from 'better-sqlite3';
import { createDb } from './db.js';
import { report, getLatestHeartbeat, getFleetHealth } from './heartbeat.js';
import { createTraceId, trace, correlate, getRecentFailures, getTraceEvents, replayTrace } from './trace.js';
import { recordAlert, resolveAlert, getActiveAlerts } from './alerts.js';
import { getDashboard, formatDashboard } from './dashboard.js';
import type { AgentWatchConfig, AgentStatus, TraceEvent, CascadeChain } from './types.js';

export class AgentWatch {
  private db: Database.Database;
  private alertWindowMinutes: number;
  private heartbeatStaleMinutes: number;

  constructor(config: AgentWatchConfig = {}) {
    const dbPath = config.db_path ?? 'agentwatch.db';
    this.db = createDb(dbPath);
    this.alertWindowMinutes = config.alert_window_minutes ?? 30;
    this.heartbeatStaleMinutes = config.heartbeat_stale_minutes ?? 30;
  }

  // Feature 1: Heartbeat registration
  report(agent: string, status: AgentStatus, context: string = '{}') {
    return report(this.db, agent, status, context);
  }

  // Feature 2: Cross-agent event correlation
  trace(
    traceId: string,
    agent: string,
    action: string,
    input: string,
    output: string,
    opts?: { parentEventId?: number; status?: 'ok' | 'error'; durationMs?: number },
  ): TraceEvent {
    const event = trace(this.db, traceId, agent, action, input, output, opts);

    // Auto-alert on errors
    if (opts?.status === 'error') {
      recordAlert(this.db, agent, `trace_error:${action}`, output, this.alertWindowMinutes);
    }

    return event;
  }

  correlate(failureEventId: number): CascadeChain | null {
    return correlate(this.db, failureEventId);
  }

  // Feature 3: Fleet health dashboard
  dashboard() {
    return getDashboard(this.db, this.heartbeatStaleMinutes);
  }

  dashboardText(): string {
    return formatDashboard(this.dashboard());
  }

  // Feature 4: Alert de-duplication
  alert(agent: string, alertType: string, message: string) {
    return recordAlert(this.db, agent, alertType, message, this.alertWindowMinutes);
  }

  resolveAlert(alertId: number) {
    return resolveAlert(this.db, alertId);
  }

  activeAlerts(agent?: string) {
    return getActiveAlerts(this.db, agent);
  }

  // Feature 5: Cascade replay
  replay(traceId: string): CascadeChain[] {
    return replayTrace(this.db, traceId);
  }

  // Utilities
  createTraceId(): string {
    return createTraceId();
  }

  getTraceEvents(traceId: string): TraceEvent[] {
    return getTraceEvents(this.db, traceId);
  }

  getRecentFailures(agent?: string, limit?: number): TraceEvent[] {
    return getRecentFailures(this.db, agent, limit);
  }

  getLatestHeartbeat(agent: string) {
    return getLatestHeartbeat(this.db, agent);
  }

  getFleetHealth() {
    return getFleetHealth(this.db, this.heartbeatStaleMinutes);
  }

  close() {
    this.db.close();
  }
}

// Re-export types
export type {
  AgentStatus,
  AlertSeverity,
  Heartbeat,
  TraceEvent,
  Alert,
  AgentHealth,
  CascadeStep,
  CascadeChain,
  AgentWatchConfig,
} from './types.js';

// Re-export for direct use
export { createTraceId } from './trace.js';

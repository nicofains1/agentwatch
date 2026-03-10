export type AgentStatus = 'healthy' | 'degraded' | 'error' | 'offline';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Heartbeat {
  id: number;
  agent: string;
  status: AgentStatus;
  context: string;
  created_at: string;
}

export interface TraceEvent {
  id: number;
  trace_id: string;
  agent: string;
  action: string;
  input: string;
  output: string;
  parent_event_id: number | null;
  status: 'ok' | 'error';
  duration_ms: number;
  created_at: string;
}

export interface Alert {
  id: number;
  agent: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
}

export interface AgentHealth {
  agent: string;
  status: AgentStatus;
  last_heartbeat: string;
  uptime_pct: number;
  active_alerts: number;
}

export interface CascadeStep {
  event_id: number;
  agent: string;
  action: string;
  input: string;
  output: string;
  status: 'ok' | 'error';
  duration_ms: number;
  timestamp: string;
}

export interface CascadeChain {
  failure_id: number;
  root_cause: CascadeStep;
  chain: CascadeStep[];
}

export interface AgentWatchConfig {
  db_path?: string;
  alert_window_minutes?: number;
  heartbeat_stale_minutes?: number;
}

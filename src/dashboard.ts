import type Database from 'better-sqlite3';
import type { AgentHealth } from './types.js';
import { getFleetHealth } from './heartbeat.js';
import { getActiveAlerts } from './alerts.js';

export interface DashboardOutput {
  timestamp: string;
  agents: AgentHealth[];
  total_agents: number;
  healthy_count: number;
  degraded_count: number;
  error_count: number;
  offline_count: number;
  total_active_alerts: number;
}

export function getDashboard(
  db: Database.Database,
  staleMinutes: number = 30,
): DashboardOutput {
  const agents = getFleetHealth(db, staleMinutes);
  const alerts = getActiveAlerts(db);

  return {
    timestamp: new Date().toISOString(),
    agents,
    total_agents: agents.length,
    healthy_count: agents.filter(a => a.status === 'healthy').length,
    degraded_count: agents.filter(a => a.status === 'degraded').length,
    error_count: agents.filter(a => a.status === 'error').length,
    offline_count: agents.filter(a => a.status === 'offline').length,
    total_active_alerts: alerts.length,
  };
}

export function formatDashboard(dashboard: DashboardOutput): string {
  const lines: string[] = [];
  lines.push(`AgentWatch Fleet Dashboard - ${dashboard.timestamp}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Agents: ${dashboard.total_agents} total | ${dashboard.healthy_count} healthy | ${dashboard.degraded_count} degraded | ${dashboard.error_count} error | ${dashboard.offline_count} offline`);
  lines.push(`Active Alerts: ${dashboard.total_active_alerts}`);
  lines.push('');
  lines.push('Agent'.padEnd(15) + 'Status'.padEnd(12) + 'Uptime'.padEnd(10) + 'Alerts'.padEnd(10) + 'Last Heartbeat');
  lines.push('-'.repeat(60));

  for (const agent of dashboard.agents) {
    const statusIcon = agent.status === 'healthy' ? 'OK'
      : agent.status === 'degraded' ? 'WARN'
      : agent.status === 'error' ? 'ERR'
      : 'OFF';
    lines.push(
      agent.agent.padEnd(15) +
      statusIcon.padEnd(12) +
      `${agent.uptime_pct}%`.padEnd(10) +
      String(agent.active_alerts).padEnd(10) +
      (agent.last_heartbeat || 'never')
    );
  }

  return lines.join('\n');
}

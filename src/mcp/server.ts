#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AgentWatch } from '../index.js';

const dbPath = process.env.AGENTWATCH_DB ?? 'agentwatch.db';
const aw = new AgentWatch({ db_path: dbPath });

const server = new McpServer({
  name: 'agentwatch',
  version: '0.3.0',
});

// --- Read tools ---

server.tool(
  'agentwatch_dashboard',
  'Fleet health overview - shows all agents, their status, uptime, and active alert counts',
  {},
  async () => {
    const data = aw.dashboard();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_dashboard_text',
  'Fleet health overview as a formatted ASCII table',
  {},
  async () => {
    const text = aw.dashboardText();
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'agentwatch_fleet_health',
  'Get health status of all agents with uptime percentages',
  {},
  async () => {
    const health = aw.getFleetHealth();
    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_get_alerts',
  'List active (unresolved) alerts, optionally filtered by agent',
  { agent: z.string().optional().describe('Filter by agent name') },
  async ({ agent }) => {
    const alerts = aw.activeAlerts(agent);
    return {
      content: [{ type: 'text', text: JSON.stringify(alerts, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_get_failures',
  'List recent trace failures, optionally filtered by agent',
  {
    agent: z.string().optional().describe('Filter by agent name'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
  },
  async ({ agent, limit }) => {
    const failures = aw.getRecentFailures(agent, limit ?? 20);
    return {
      content: [{ type: 'text', text: JSON.stringify(failures, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_get_trace',
  'Get all events in a trace by trace ID',
  { trace_id: z.string().describe('The trace UUID') },
  async ({ trace_id }) => {
    const events = aw.getTraceEvents(trace_id);
    if (events.length === 0) {
      return { content: [{ type: 'text', text: `No events found for trace ${trace_id}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(events, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_cascade',
  'Find the root cause chain for a failure event - walks parent links to find where the cascade started',
  { failure_event_id: z.number().int().describe('ID of the failing trace event') },
  async ({ failure_event_id }) => {
    const chain = aw.correlate(failure_event_id);
    if (!chain) {
      return { content: [{ type: 'text', text: `No trace event found with id ${failure_event_id}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(chain, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_replay',
  'Replay all cascade chains in a trace - finds every failure and correlates each',
  { trace_id: z.string().describe('The trace UUID to replay') },
  async ({ trace_id }) => {
    const chains = aw.replay(trace_id);
    if (chains.length === 0) {
      return { content: [{ type: 'text', text: `No failures found in trace ${trace_id}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(chains, null, 2) }],
    };
  },
);

// --- Write tools ---

server.tool(
  'agentwatch_report_heartbeat',
  'Report a heartbeat for an agent. Call this periodically to track agent health.',
  {
    agent: z.string().describe('Agent name'),
    status: z.enum(['healthy', 'degraded', 'error', 'offline']).describe('Agent status'),
    context: z.string().optional().describe('JSON string with additional context'),
  },
  async ({ agent, status, context }) => {
    const hb = aw.report(agent, status, context ?? '{}');
    return {
      content: [{ type: 'text', text: JSON.stringify(hb, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_trace',
  'Record a trace event for cross-agent action tracking',
  {
    trace_id: z.string().describe('Trace UUID (use agentwatch_create_trace_id to generate)'),
    agent: z.string().describe('Agent name'),
    action: z.string().describe('Action being performed'),
    input: z.string().describe('Input data (JSON string or plaintext)'),
    output: z.string().describe('Output data or error message'),
    parent_event_id: z.number().int().optional().describe('Parent event ID for chaining'),
    status: z.enum(['ok', 'error']).optional().describe('Event status (default: ok)'),
    duration_ms: z.number().optional().describe('Duration in milliseconds'),
  },
  async ({ trace_id, agent, action, input, output, parent_event_id, status, duration_ms }) => {
    const event = aw.trace(trace_id, agent, action, input, output, {
      parentEventId: parent_event_id,
      status,
      durationMs: duration_ms,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(event, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_create_trace_id',
  'Generate a new trace UUID for grouping related events',
  {},
  async () => {
    const id = aw.createTraceId();
    return { content: [{ type: 'text', text: id }] };
  },
);

server.tool(
  'agentwatch_alert',
  'Record an alert with automatic deduplication and severity escalation',
  {
    agent: z.string().describe('Agent name'),
    alert_type: z.string().describe('Alert type identifier'),
    message: z.string().describe('Alert message'),
  },
  async ({ agent, alert_type, message }) => {
    const alert = aw.alert(agent, alert_type, message);
    return {
      content: [{ type: 'text', text: JSON.stringify(alert, null, 2) }],
    };
  },
);

server.tool(
  'agentwatch_resolve_alert',
  'Mark an alert as resolved',
  { alert_id: z.number().int().describe('Alert ID to resolve') },
  async ({ alert_id }) => {
    aw.resolveAlert(alert_id);
    return { content: [{ type: 'text', text: `Alert ${alert_id} resolved` }] };
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

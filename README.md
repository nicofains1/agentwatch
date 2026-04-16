# agentwatch

Your agent swarm crashed at 2am. You have logs from 10 agents and no idea which one started the cascade. AgentWatch tells you.

It tracks heartbeats, links actions across agents, walks backward from any failure to the root cause, and replays the full sequence. Works with any agent framework (CrewAI, AutoGen, LangGraph, PocketFlow, custom). Stores everything in a local SQLite file.

Early stage. Issues and feedback welcome: https://github.com/nicofains1/agentwatch/issues

---

## See it in action

No install needed:

```bash
npx @nicofains1/agentwatch demo
```

This seeds a 5-agent fleet, triggers a cascade failure, and shows you the full trace:

```
AgentWatch Fleet Dashboard
============================================================
Agents: 5 total | 3 healthy | 1 degraded | 1 error | 0 offline

Cascade Failure (4 steps, root cause: scheduler/dispatch-batch)
============================================================
[ROOT] scheduler/dispatch-batch [ok] 15ms
       {"assigned_to": "fetcher"}
       |
[  1 ] fetcher/call-api [error] 30000ms
       TIMEOUT after 30000ms
       |
[  2 ] processor/transform [error] 120ms
       Error: input is null - expected array from fetcher
       |
[FAIL] notifier/send-alert [error] 8ms
       Error: no processed data to report
```

---

## Install

```bash
npm install @nicofains1/agentwatch
```

Requires Node 18+. Uses `better-sqlite3` (native bindings, no external database needed).

---

## Quick start

```typescript
import { AgentWatch } from '@nicofains1/agentwatch';

const aw = new AgentWatch(); // creates agentwatch.db in the current directory

// Report heartbeats from your agents
aw.report('agent-a', 'healthy');
aw.report('agent-b', 'healthy');

// Trace an action in agent-a
const traceId = aw.createTraceId();
const e1 = aw.trace(traceId, 'agent-a', 'fetch-data',
  'url=https://api.example.com', 'rows=150');

// Trace a dependent action in agent-b that fails
const e2 = aw.trace(traceId, 'agent-b', 'process',
  JSON.stringify({ rows: 150 }), 'Error: out of memory', {
    parentEventId: e1.id,
    status: 'error',
    durationMs: 4200,
  });

// Walk back to the root cause
const chain = aw.correlate(e2.id);
console.log(chain?.root_cause);
// -> { agent: 'agent-a', action: 'fetch-data', ... }

// Print fleet status
console.log(aw.dashboardText());
```

---

## What it does

**Heartbeats** - Each agent calls `aw.report(name, status)` on a schedule. AgentWatch tracks health over time and marks agents as stale or offline based on configurable thresholds.

**Cross-agent tracing** - Actions are linked by trace ID and optional parent event ID. When agent-c fails because agent-b sent bad data that came from agent-a, the full chain is queryable.

**Cascade detection** - `correlate(failureEventId)` walks backward from any failure to the root cause, returning the full chain with timing and output at each step.

**Alert de-duplication** - The same alert type from the same agent within a time window collapses into one entry with an incrementing count. Severity auto-escalates: info (1x) -> warning (3x) -> critical (10x).

**Forensic replay** - `replay(traceId)` returns all cascade chains within a trace. Useful for post-mortem analysis when a single trace touched multiple agents.

**OpenTelemetry export** - Export traces as OTEL spans (GenAI semantic conventions). Works with Jaeger, Grafana, or any OTEL-compatible backend. Requires optional peer deps.

---

## CLI

```bash
npx @nicofains1/agentwatch demo                   # run the demo
npx @nicofains1/agentwatch dashboard              # fleet health overview
npx @nicofains1/agentwatch cascade <event-id>     # trace cascade from a failure
npx @nicofains1/agentwatch failures [agent]       # list recent failures
npx @nicofains1/agentwatch alerts [agent]         # list active alerts
npx @nicofains1/agentwatch replay <trace-id>      # replay all cascades in a trace
npx @nicofains1/agentwatch mcp                    # start MCP server (stdio)
```

Set `AGENTWATCH_DB` to point to your database file. Default: `agentwatch.db` in the current directory.

---

## MCP server

AgentWatch runs as an MCP server. Add it to your Claude Code or Cursor config:

**Claude Code** (`~/.claude/claude_desktop_config.json` or `.claude/settings.json`):

```json
{
  "mcpServers": {
    "agentwatch": {
      "command": "npx",
      "args": ["@nicofains1/agentwatch", "mcp"],
      "env": {
        "AGENTWATCH_DB": "/absolute/path/to/agentwatch.db"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agentwatch": {
      "command": "npx",
      "args": ["@nicofains1/agentwatch", "mcp"],
      "env": {
        "AGENTWATCH_DB": "/absolute/path/to/agentwatch.db"
      }
    }
  }
}
```

This exposes 13 tools: `agentwatch_dashboard`, `agentwatch_report_heartbeat`, `agentwatch_trace`, `agentwatch_cascade`, `agentwatch_replay`, `agentwatch_get_alerts`, `agentwatch_get_failures`, `agentwatch_get_trace`, `agentwatch_fleet_health`, `agentwatch_create_trace_id`, `agentwatch_alert`, `agentwatch_resolve_alert`, `agentwatch_dashboard_text`.

---

## API reference

### Constructor

```typescript
const aw = new AgentWatch({
  db_path: 'agentwatch.db',        // SQLite file path
  alert_window_minutes: 30,         // de-dup window for alerts
  heartbeat_stale_minutes: 30,      // when to mark agents as offline
});
```

### Heartbeats

```typescript
aw.report(agent, status, context?)     // status: 'healthy' | 'degraded' | 'error' | 'offline'
aw.getLatestHeartbeat(agent)           // -> Heartbeat | undefined
aw.getFleetHealth()                    // -> AgentHealth[]
```

### Tracing

```typescript
aw.createTraceId()                                // -> string (UUID)
aw.trace(traceId, agent, action, input, output, {
  parentEventId?: number,
  status?: 'ok' | 'error',                        // default: 'ok'
  durationMs?: number,
})                                                // -> TraceEvent
aw.getTraceEvents(traceId)                        // -> TraceEvent[]
aw.getRecentFailures(agent?, limit?)              // -> TraceEvent[]
```

### Cascade detection

```typescript
aw.correlate(failureEventId)    // -> CascadeChain | null
aw.replay(traceId)              // -> CascadeChain[]
```

### Alerts

```typescript
aw.alert(agent, alertType, message)
aw.resolveAlert(alertId)
aw.activeAlerts(agent?)         // -> Alert[]
```

### Dashboard

```typescript
aw.dashboard()      // -> DashboardOutput (structured)
aw.dashboardText()  // -> string (formatted for terminal)
```

### OpenTelemetry export

Requires optional peer deps `@opentelemetry/api` and `@opentelemetry/sdk-trace-base`.

```typescript
await aw.exportTraceToOtel(traceId, { serviceName: 'my-agents' });
await aw.exportRecentToOtel(1); // last 1 hour
```

---

## Storage

SQLite via `better-sqlite3`. The database file is created automatically on first use. WAL mode is on for concurrent reads.

Tables: `heartbeats`, `trace_events`, `alerts`.

---

## License

MIT

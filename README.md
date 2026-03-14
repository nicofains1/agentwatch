# @nicofains1/agentwatch

Observability for multi-agent systems. Track heartbeats, trace cross-agent actions, detect cascade failures, and replay what went wrong.

Built for teams running fleets of AI agents (CrewAI, AutoGen, LangGraph, PocketFlow, custom) who need to understand why Agent B failed after Agent A timed out.

## Try it in 30 seconds

No install needed. Run this and see a full cascade failure traced across 5 agents:

```bash
npx @nicofains1/agentwatch demo
```

Output:

```
AgentWatch Fleet Dashboard
============================================================
Agents: 5 total | 3 healthy | 1 degraded | 1 error | 0 offline

Cascade Failure (4 steps, root cause: scheduler/dispatch-batch)
============================================================
[ROOT] scheduler/dispatch-batch [ok] 15ms
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

## Install

```bash
npm install @nicofains1/agentwatch
```

## Quick Start

```typescript
import { AgentWatch } from '@nicofains1/agentwatch';

const aw = new AgentWatch(); // creates agentwatch.db

// 1. Report heartbeats from your agents
aw.report('agent-a', 'healthy');
aw.report('agent-b', 'healthy');

// 2. Trace actions across agents
const traceId = aw.createTraceId();

const e1 = aw.trace(traceId, 'agent-a', 'fetch-data',
  'url=https://api.example.com', 'rows=150');

const e2 = aw.trace(traceId, 'agent-b', 'process',
  JSON.stringify({ rows: 150 }), 'Error: out of memory', {
    parentEventId: e1.id,
    status: 'error',
    durationMs: 4200,
  });

// 3. Find the root cause
const chain = aw.correlate(e2.id);
console.log(chain?.root_cause);
// -> { agent: 'agent-a', action: 'fetch-data', ... }

// 4. Fleet dashboard
console.log(aw.dashboardText());
```

## Features

**Heartbeat registration** - Track agent health status over time. Detect stale or offline agents based on configurable thresholds.

**Cross-agent tracing** - Link actions across agents with trace IDs and parent event references. When agent-c fails because agent-b sent bad data that it got from agent-a, the trace shows the full chain.

**Cascade failure detection** - Walk backward from any failure to find the root cause across your agent fleet. `correlate(failureEventId)` returns the full chain from root cause to final failure.

**Alert de-duplication** - Same alert type from the same agent within a time window gets collapsed into one alert with an incrementing count. Severity auto-escalates: info (1x) -> warning (3x) -> critical (10x).

**Fleet dashboard** - One-line summary of your entire fleet: which agents are healthy, degraded, erroring, or offline. Uptime percentages and active alert counts per agent.

**Forensic replay** - Given a trace ID, replay all cascade chains to understand the full failure sequence.

**OpenTelemetry export** - Export traces as OTEL spans with GenAI semantic conventions. Plug into Jaeger, Grafana, or any OTEL-compatible backend.

## CLI

```bash
npx @nicofains1/agentwatch demo                   # See it in action with sample data
npx @nicofains1/agentwatch dashboard              # Fleet health overview
npx @nicofains1/agentwatch cascade <event-id>     # Trace cascade from a failure
npx @nicofains1/agentwatch failures [agent]       # List recent failures
npx @nicofains1/agentwatch alerts [agent]         # List active alerts
npx @nicofains1/agentwatch replay <trace-id>      # Replay all cascades in a trace
```

Set `AGENTWATCH_DB` to point to your database file (default: `agentwatch.db`).

## API

### `new AgentWatch(config?)`

```typescript
const aw = new AgentWatch({
  db_path: 'agentwatch.db',       // SQLite file path
  alert_window_minutes: 30,        // De-dup window for alerts
  heartbeat_stale_minutes: 30,     // When to mark agents as offline
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
  parentEventId?: number,                         // link to parent event
  status?: 'ok' | 'error',                        // default: 'ok'
  durationMs?: number,                            // execution time
})                                                // -> TraceEvent
aw.getTraceEvents(traceId)                        // -> TraceEvent[]
aw.getRecentFailures(agent?, limit?)              // -> TraceEvent[]
```

### Cascade Detection

```typescript
aw.correlate(failureEventId)    // -> CascadeChain | null (walk back to root cause)
aw.replay(traceId)              // -> CascadeChain[] (all cascades in a trace)
```

### Alerts

```typescript
aw.alert(agent, alertType, message)    // auto-deduplicates within window
aw.resolveAlert(alertId)
aw.activeAlerts(agent?)                // -> Alert[]
```

### Dashboard

```typescript
aw.dashboard()      // -> DashboardOutput (structured)
aw.dashboardText()  // -> string (formatted for terminal)
```

### OpenTelemetry Export

```typescript
// Requires optional peer deps: @opentelemetry/api, @opentelemetry/sdk-trace-base
await aw.exportTraceToOtel(traceId, { serviceName: 'my-agents' });
await aw.exportRecentToOtel(1); // last 1 hour
```

## Storage

Uses SQLite via `better-sqlite3`. The database file is created automatically on first use. WAL mode is enabled for concurrent reads.

Tables: `heartbeats`, `trace_events`, `alerts` - all with proper indexes.

## License

MIT

# agentwatch

Observability for multi-agent systems. Track heartbeats, trace cross-agent actions, detect cascade failures, and replay what went wrong.

Built for teams running fleets of AI agents (CrewAI, AutoGen, LangGraph, custom) who need to understand why Agent B failed after Agent A timed out.

## Install

```bash
npm install agentwatch
```

## Quick Start

```typescript
import { AgentWatch } from 'agentwatch';

const aw = new AgentWatch(); // uses agentwatch.db by default

// Register heartbeats from your agents
aw.report('agent-a', 'healthy');
aw.report('agent-b', 'healthy');

// Trace cross-agent actions
const traceId = aw.createTraceId();

const e1 = aw.trace(traceId, 'agent-a', 'fetch-data', 'url=https://api.example.com', 'rows=150');
const e2 = aw.trace(traceId, 'agent-b', 'process', JSON.stringify({ rows: 150 }), '', {
  parentEventId: e1.id,
  status: 'error',
  durationMs: 4200,
});

// Find the root cause
const chain = aw.correlate(e2.id);
console.log(chain?.root_cause); // -> agent-a / fetch-data

// Fleet dashboard
console.log(aw.dashboardText());
```

## Features

**Heartbeat registration** - Track agent health status over time. Detect stale or offline agents based on configurable thresholds.

**Cross-agent tracing** - Link actions across agents with trace IDs and parent event references. When agent-c fails because agent-b sent bad data that it got from agent-a, the trace shows the full chain.

**Cascade failure detection** - Walk backward from any failure to find the root cause across your agent fleet. `correlate(failureEventId)` returns the full chain from root cause to final failure.

**Alert de-duplication** - Same alert type from the same agent within a time window gets collapsed into one alert with an incrementing count. Severity auto-escalates: info (1x) -> warning (3x) -> critical (10x).

**Fleet dashboard** - One-line summary of your entire fleet: which agents are healthy, degraded, erroring, or offline. Uptime percentages and active alert counts per agent.

**Forensic replay** - Given a trace ID, replay all cascade chains to understand the full failure sequence.

## CLI

```bash
npx agentwatch dashboard              # Fleet health overview
npx agentwatch cascade <event-id>     # Trace cascade from a failure
npx agentwatch failures [agent]       # List recent failures
npx agentwatch alerts [agent]         # List active alerts
npx agentwatch replay <trace-id>      # Replay all cascades in a trace
```

Set `AGENTWATCH_DB` to point to your database file (default: `agentwatch.db`).

## API

### `new AgentWatch(config?)`

```typescript
const aw = new AgentWatch({
  db_path: 'agentwatch.db',       // SQLite file path (default: agentwatch.db)
  alert_window_minutes: 30,        // De-dup window for alerts (default: 30)
  heartbeat_stale_minutes: 30,     // When to mark agents as offline (default: 30)
});
```

### Heartbeats

```typescript
aw.report(agent: string, status: 'healthy' | 'degraded' | 'error' | 'offline', context?: string)
aw.getLatestHeartbeat(agent: string): Heartbeat | undefined
aw.getFleetHealth(): AgentHealth[]
```

### Tracing

```typescript
aw.createTraceId(): string
aw.trace(traceId, agent, action, input, output, opts?): TraceEvent
aw.getTraceEvents(traceId: string): TraceEvent[]
aw.getRecentFailures(agent?: string, limit?: number): TraceEvent[]
```

### Cascade Detection

```typescript
aw.correlate(failureEventId: number): CascadeChain | null
aw.replay(traceId: string): CascadeChain[]
```

### Alerts

```typescript
aw.alert(agent, alertType, message): Alert
aw.resolveAlert(alertId: number): void
aw.activeAlerts(agent?: string): Alert[]
```

### Dashboard

```typescript
aw.dashboard(): DashboardOutput
aw.dashboardText(): string
```

## Storage

Uses SQLite via `better-sqlite3`. The database file is created automatically on first use. WAL mode is enabled for concurrent reads.

Tables: `heartbeats`, `trace_events`, `alerts` - all with proper indexes for fast lookups.

## License

MIT

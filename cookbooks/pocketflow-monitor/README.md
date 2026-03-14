# PocketFlow + AgentWatch: Pipeline Monitoring

Add observability to a multi-node pipeline. Track heartbeats per node, trace actions across the pipeline, and find the root cause when something breaks.

## Run it

```bash
cd cookbooks/pocketflow-monitor
npm install
node monitor.mjs
```

The pipeline has a 30% chance of failing at the fetch step. Run it a few times to see both the happy path and the cascade failure path.

## What it shows

1. **Heartbeat per node** - each pipeline node registers as an agent with health status
2. **Cross-node tracing** - parent event IDs link each step to the previous one
3. **Cascade detection** - when the fetcher fails, `correlate()` traces back from the final failure to the root cause
4. **Alert dedup** - repeated failures of the same node collapse into a single alert with escalating severity

## The pattern

Wrap any async function with `traced()` to get automatic heartbeats, traces, and error handling:

```javascript
function traced(aw, traceId, agentName, action, fn) {
  return async (input, parentEventId) => {
    aw.report(agentName, 'healthy', JSON.stringify({ action, state: 'running' }));
    const start = Date.now();
    try {
      const result = await fn(input);
      aw.trace(traceId, agentName, action,
        JSON.stringify(input), JSON.stringify(result),
        { parentEventId, status: 'ok', durationMs: Date.now() - start });
      return { result, eventId: event.id };
    } catch (err) {
      aw.trace(traceId, agentName, action,
        JSON.stringify(input), `Error: ${err.message}`,
        { parentEventId, status: 'error', durationMs: Date.now() - start });
      aw.report(agentName, 'error');
      aw.alert(agentName, `${action}-failed`, err.message);
      return { error: err, eventId: event.id };
    }
  };
}
```

This works with any framework - PocketFlow, LangGraph, CrewAI, or plain functions. The key integration points are `report()` for health and `trace()` for action tracking.

## After running

Use the CLI to explore the data:

```bash
AGENTWATCH_DB=pipeline.db npx @nicofains1/agentwatch dashboard
AGENTWATCH_DB=pipeline.db npx @nicofains1/agentwatch failures
AGENTWATCH_DB=pipeline.db npx @nicofains1/agentwatch replay <trace-id>
```

## Export to OpenTelemetry

If you're using Jaeger, Grafana Tempo, or another OTEL backend:

```javascript
import { AgentWatch } from '@nicofains1/agentwatch';
const aw = new AgentWatch({ db_path: 'pipeline.db' });
await aw.exportTraceToOtel(traceId, { serviceName: 'my-pipeline' });
```

TraceTest can pick up the exported spans and run assertions against your pipeline traces.

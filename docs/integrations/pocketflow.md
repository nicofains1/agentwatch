# PocketFlow Integration

Monitor [PocketFlow](https://github.com/The-Pocket/PocketFlow) Nodes and Flows with agentwatch heartbeats, traces, and cascade detection.

## Setup

```bash
npm install @nicofains1/agentwatch pocketflow
```

```typescript
import { AgentWatch } from '@nicofains1/agentwatch'
import { Node, Flow } from 'pocketflow'

const aw = new AgentWatch({ db_path: 'agentwatch.db' })
```

## Instrumenting a Node

Wrap your Node's `exec` method with agentwatch trace calls. Each Node maps to an agent in agentwatch's model.

```typescript
class FetchDataNode extends Node {
  async exec(input: string): Promise<string> {
    const traceId = input // pass trace ID through the flow
    const start = Date.now()

    // Report this node is active
    aw.report('fetch-data', 'healthy', 'processing request')

    try {
      const result = await fetchFromAPI(input)

      aw.trace(traceId, 'fetch-data', 'exec', input, result, {
        status: 'ok',
        durationMs: Date.now() - start,
      })

      return result
    } catch (err) {
      aw.trace(traceId, 'fetch-data', 'exec', input, String(err), {
        status: 'error',
        durationMs: Date.now() - start,
      })
      throw err
    }
  }
}
```

## Instrumenting a Flow

Create a trace ID at the start of each Flow execution and pass it through your Nodes.

```typescript
import { createTraceId } from '@nicofains1/agentwatch'

class DataPipeline extends Flow {
  async run() {
    const traceId = createTraceId()
    const start = Date.now()

    aw.report('data-pipeline', 'healthy', `starting trace ${traceId}`)

    try {
      const result = await super.run(traceId)

      aw.trace(traceId, 'data-pipeline', 'flow-complete', '', 'ok', {
        status: 'ok',
        durationMs: Date.now() - start,
      })

      return result
    } catch (err) {
      aw.trace(traceId, 'data-pipeline', 'flow-error', '', String(err), {
        status: 'error',
        durationMs: Date.now() - start,
      })
      throw err
    }
  }
}
```

## Linking Parent-Child Traces

When one Node triggers another, use `parentEventId` to build the dependency chain. This enables cascade detection - if a downstream Node fails, `correlate()` walks back to the root cause.

```typescript
class TransformNode extends Node {
  async exec(input: { traceId: string; data: string; parentEventId: number }) {
    const { traceId, data, parentEventId } = input
    const start = Date.now()

    try {
      const result = transform(data)

      const event = aw.trace(traceId, 'transform', 'exec', data, result, {
        parentEventId, // links to the FetchDataNode event
        status: 'ok',
        durationMs: Date.now() - start,
      })

      // Pass event.id to the next Node for continued chaining
      return { traceId, data: result, parentEventId: event.id }
    } catch (err) {
      const event = aw.trace(traceId, 'transform', 'exec', data, String(err), {
        parentEventId,
        status: 'error',
        durationMs: Date.now() - start,
      })

      // Correlate: walk back the chain to find root cause
      const cascade = aw.correlate(event.id)
      if (cascade) {
        console.log('Root cause:', cascade.root_cause.agent, cascade.root_cause.action)
        console.log('Chain length:', cascade.chain.length)
      }

      throw err
    }
  }
}
```

## Dashboard and Alerts

After instrumenting your Nodes, use the CLI or API to monitor them:

```bash
# Fleet health across all Nodes
npx agentwatch dashboard

# Recent failures
npx agentwatch failures

# Active alerts (auto-created on trace errors)
npx agentwatch alerts

# Replay a full trace to see the cascade path
npx agentwatch replay <trace-id>
```

Or programmatically:

```typescript
// Fleet overview
const health = aw.dashboard()
console.log(`${health.healthy_count}/${health.total_agents} nodes healthy`)

// Check for cascades after a failure
const failures = aw.getRecentFailures('transform', 5)
for (const f of failures) {
  const cascade = aw.correlate(f.id)
  if (cascade) {
    console.log(`Cascade: ${cascade.chain.map(s => s.agent).join(' -> ')}`)
  }
}
```

## Helper: Auto-Instrument Wrapper

For less boilerplate, wrap Node execution with a helper:

```typescript
function instrumentNode(
  aw: AgentWatch,
  agentName: string,
  fn: (input: any) => Promise<any>,
) {
  return async (input: { traceId: string; parentEventId?: number; data: any }) => {
    const start = Date.now()
    aw.report(agentName, 'healthy')

    try {
      const result = await fn(input.data)
      const event = aw.trace(input.traceId, agentName, 'exec', JSON.stringify(input.data), JSON.stringify(result), {
        parentEventId: input.parentEventId,
        status: 'ok',
        durationMs: Date.now() - start,
      })
      return { traceId: input.traceId, parentEventId: event.id, data: result }
    } catch (err) {
      aw.trace(input.traceId, agentName, 'exec', JSON.stringify(input.data), String(err), {
        parentEventId: input.parentEventId,
        status: 'error',
        durationMs: Date.now() - start,
      })
      throw err
    }
  }
}

// Usage
const instrumentedFetch = instrumentNode(aw, 'fetch-data', fetchFromAPI)
const instrumentedTransform = instrumentNode(aw, 'transform', transformData)
```

## OTEL Export

Export PocketFlow traces to any OpenTelemetry-compatible backend:

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

// Export a specific trace
await aw.exportTraceToOtel(traceId, {
  exporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  serviceName: 'my-pocketflow-app',
})

// Export all traces from the last 2 hours
await aw.exportRecentToOtel(2, {
  exporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
})
```

See [tracetest.md](./tracetest.md) for using these OTEL exports with TraceTest assertions.

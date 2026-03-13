# TraceTest Integration

Run [TraceTest](https://github.com/kubeshop/tracetest) assertions against agentwatch traces. This works because agentwatch exports traces in OpenTelemetry format, and TraceTest consumes OTEL spans.

## Architecture

```
PocketFlow / your agents
        |
    agentwatch (records traces)
        |
    OTEL exporter (agentwatch -> OTLP)
        |
    OTEL Collector or Jaeger/Tempo
        |
    TraceTest (assertions against spans)
```

## Prerequisites

```bash
npm install @nicofains1/agentwatch @opentelemetry/api @opentelemetry/sdk-trace-base
npm install @opentelemetry/exporter-trace-otlp-http  # or grpc variant
```

You also need a running OTEL-compatible backend (Jaeger, Tempo, or the OTEL Collector) and TraceTest pointed at it.

## Step 1: Export agentwatch traces to OTLP

```typescript
import { AgentWatch } from '@nicofains1/agentwatch'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const aw = new AgentWatch({ db_path: 'agentwatch.db' })

// After your agents run, export traces
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces', // OTEL Collector or Jaeger OTLP endpoint
})

// Export a specific trace
await aw.exportTraceToOtel(traceId, {
  exporter,
  serviceName: 'my-agent-system',
})

// Or export everything from the last hour
await aw.exportRecentToOtel(1, { exporter, serviceName: 'my-agent-system' })
```

## Step 2: OTEL Collector config (if using Collector)

Minimal `otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [jaeger]
```

## Step 3: Write TraceTest assertions

TraceTest definitions are YAML files that specify what to assert on the spans.

### Assert agent heartbeats exist

```yaml
# tracetest/heartbeat-check.yaml
type: Test
spec:
  name: Agent heartbeats recorded
  trigger:
    type: traceid
    traceid:
      id: ${TRACE_ID}
  specs:
    - selector: span[agentwatch.action = "heartbeat"]
      assertions:
        - attr:gen_ai.agent.name != ""
        - attr:agentwatch.duration_ms >= 0
```

### Assert no cascade failures

```yaml
# tracetest/no-cascades.yaml
type: Test
spec:
  name: No cascade failures in trace
  trigger:
    type: traceid
    traceid:
      id: ${TRACE_ID}
  specs:
    - selector: span[tracetest.selected_spans.count > 0]
      assertions:
        - attr:otel.status_code != 2  # No ERROR spans
```

### Assert pipeline completes within time budget

```yaml
# tracetest/latency-budget.yaml
type: Test
spec:
  name: Pipeline under 5s
  trigger:
    type: traceid
    traceid:
      id: ${TRACE_ID}
  specs:
    - selector: span[gen_ai.operation.name = "invoke_agent"]
      assertions:
        - attr:agentwatch.duration_ms < 5000
```

### Assert specific agent participates

```yaml
# tracetest/agent-participation.yaml
type: Test
spec:
  name: Transform agent ran
  trigger:
    type: traceid
    traceid:
      id: ${TRACE_ID}
  specs:
    - selector: span[gen_ai.agent.name = "transform"]
      assertions:
        - attr:agentwatch.action = "exec"
        - attr:otel.status_code = 1  # OK
```

## Step 4: Run TraceTest

```bash
# Run a single test
tracetest run test --file tracetest/heartbeat-check.yaml --var TRACE_ID=abc-123

# Run all tests
tracetest run test --file tracetest/ --var TRACE_ID=abc-123
```

## Span Attributes Reference

agentwatch exports these attributes on each span:

| Attribute | Type | Description |
|-----------|------|-------------|
| `gen_ai.operation.name` | string | Always `"invoke_agent"` |
| `gen_ai.agent.name` | string | Agent name (e.g., `"fetch-data"`) |
| `agentwatch.trace_id` | string | agentwatch trace UUID |
| `agentwatch.action` | string | Action name (e.g., `"exec"`, `"heartbeat"`) |
| `agentwatch.event_id` | number | Unique event ID in agentwatch DB |
| `agentwatch.duration_ms` | number | Execution time in milliseconds |
| `agentwatch.input` | string | Serialized input (if non-empty) |
| `agentwatch.output` | string | Serialized output (if non-empty) |
| `agentwatch.parent_event_id` | number | Parent event for cascade linking |
| `otel.status_code` | number | 1 = OK, 2 = ERROR |
| `error.type` | string | `"agent_error:{action}"` on failures |

## PocketFlow + TraceTest Example

Combining both integrations: instrument PocketFlow Nodes with agentwatch (see [pocketflow.md](./pocketflow.md)), export to OTLP, then assert with TraceTest.

```typescript
import { AgentWatch, createTraceId } from '@nicofains1/agentwatch'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const aw = new AgentWatch()
const traceId = createTraceId()

// ... run your PocketFlow pipeline with agentwatch instrumentation ...

// Export for TraceTest
await aw.exportTraceToOtel(traceId, {
  exporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  serviceName: 'pocketflow-app',
})

// Then run: tracetest run test --file tracetest/ --var TRACE_ID=<traceId>
```

This gives you automated regression testing on your agent orchestration: if a Node starts failing or latency spikes, TraceTest catches it.

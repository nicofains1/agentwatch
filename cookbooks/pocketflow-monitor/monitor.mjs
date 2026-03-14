/**
 * PocketFlow + AgentWatch - Monitor a multi-node pipeline
 *
 * This example shows how to add observability to a PocketFlow-style pipeline.
 * Each node gets heartbeat monitoring and cross-node traces, so when something
 * fails you can trace back to the root cause.
 *
 * Run:
 *   npm install
 *   node monitor.mjs
 */

import { AgentWatch } from '@nicofains1/agentwatch';

const aw = new AgentWatch({ db_path: 'pipeline.db' });

// --- Wrap any node function with AgentWatch tracing ---

function traced(aw, traceId, agentName, action, fn) {
  return async (input, parentEventId) => {
    aw.report(agentName, 'healthy', JSON.stringify({ action, state: 'running' }));
    const start = Date.now();
    try {
      const result = await fn(input);
      const event = aw.trace(
        traceId, agentName, action,
        JSON.stringify(input), JSON.stringify(result),
        { parentEventId, status: 'ok', durationMs: Date.now() - start }
      );
      return { result, eventId: event.id };
    } catch (err) {
      const event = aw.trace(
        traceId, agentName, action,
        JSON.stringify(input), `Error: ${err.message}`,
        { parentEventId, status: 'error', durationMs: Date.now() - start }
      );
      aw.report(agentName, 'error', JSON.stringify({ action, error: err.message }));
      aw.alert(agentName, `${action}-failed`, err.message);
      return { error: err, eventId: event.id };
    }
  };
}

// --- Define pipeline nodes (these would be PocketFlow Nodes) ---

async function fetchData(input) {
  // Simulate an API call. Fails 30% of the time.
  if (Math.random() < 0.3) throw new Error('upstream API timeout after 30s');
  return { rows: Math.floor(Math.random() * 500), source: input.url };
}

async function transform(input) {
  if (!input.rows) throw new Error('no rows to transform - upstream returned nothing');
  return { processed: input.rows, format: 'parquet' };
}

async function loadToDB(input) {
  if (!input.processed) throw new Error('nothing to load');
  return { inserted: input.processed, table: 'analytics' };
}

// --- Run the pipeline ---

const traceId = aw.createTraceId();

// Register all nodes as agents
aw.report('fetcher', 'healthy');
aw.report('transformer', 'healthy');
aw.report('loader', 'healthy');

console.log('Running ETL pipeline with AgentWatch tracing...\n');

const fetch = traced(aw, traceId, 'fetcher', 'fetch-data', fetchData);
const xform = traced(aw, traceId, 'transformer', 'transform', transform);
const load  = traced(aw, traceId, 'loader', 'load-to-db', loadToDB);

// Chain the nodes, passing parent event IDs for cascade tracking
const step1 = await fetch({ url: 'https://api.vendor.io/sales' });

let step2, step3;
if (!step1.error) {
  step2 = await xform(step1.result, step1.eventId);
  if (!step2.error) {
    step3 = await load(step2.result, step2.eventId);
  }
}

// --- See what happened ---

console.log(aw.dashboardText());

const failures = aw.getRecentFailures(undefined, 10);
if (failures.length > 0) {
  console.log('\nCascade analysis:');
  const lastFailure = failures[0];
  const chain = aw.correlate(lastFailure.id);
  if (chain) {
    console.log(`  Root cause: ${chain.root_cause.agent}/${chain.root_cause.action}`);
    console.log(`  Chain: ${chain.chain.map(s => s.agent).join(' -> ')}`);
    console.log(`  Steps: ${chain.chain.length}`);
  }
} else {
  console.log('\nAll pipeline steps completed. No failures.');
}

const alerts = aw.activeAlerts();
if (alerts.length > 0) {
  console.log(`\nAlerts (${alerts.length}):`);
  for (const a of alerts) {
    console.log(`  [${a.severity}] ${a.agent}: ${a.message}`);
  }
}

console.log(`\nTrace ID: ${traceId}`);
console.log(`Database: pipeline.db`);
console.log(`\nExplore further:`);
console.log(`  AGENTWATCH_DB=pipeline.db npx @nicofains1/agentwatch dashboard`);
console.log(`  AGENTWATCH_DB=pipeline.db npx @nicofains1/agentwatch replay ${traceId}`);

aw.close();

#!/usr/bin/env node

import { AgentWatch } from '../index.js';
import { formatDashboard } from '../dashboard.js';

const args = process.argv.slice(2);
const command = args[0];

const dbPath = process.env.AGENTWATCH_DB ?? 'agentwatch.db';
const aw = new AgentWatch({ db_path: dbPath });

try {
  switch (command) {
    case 'dashboard': {
      console.log(aw.dashboardText());
      break;
    }

    case 'cascade': {
      const failureId = parseInt(args[1], 10);
      if (isNaN(failureId)) {
        console.error('Usage: agentwatch cascade <failure-event-id>');
        process.exit(1);
      }

      const chain = aw.correlate(failureId);
      if (!chain) {
        console.error(`No trace event found with id ${failureId}`);
        process.exit(1);
      }

      console.log(`Cascade for failure #${failureId}`);
      console.log('='.repeat(60));
      console.log(`Root cause: ${chain.root_cause.agent} / ${chain.root_cause.action}`);
      console.log(`Chain length: ${chain.chain.length} steps`);
      console.log('');

      for (let i = 0; i < chain.chain.length; i++) {
        const step = chain.chain[i];
        const prefix = i === 0 ? 'ROOT' : i === chain.chain.length - 1 ? 'FAIL' : `  ${i} `;
        console.log(`[${prefix}] ${step.agent} / ${step.action} (${step.status}, ${step.duration_ms}ms)`);
        console.log(`       Input:  ${truncate(step.input, 120)}`);
        console.log(`       Output: ${truncate(step.output, 120)}`);
        console.log(`       Time:   ${step.timestamp}`);
        if (i < chain.chain.length - 1) console.log('       |');
      }
      break;
    }

    case 'failures': {
      const agent = args[1];
      const limit = parseInt(args[2] ?? '20', 10);
      const failures = aw.getRecentFailures(agent, limit);

      if (failures.length === 0) {
        console.log('No recent failures.');
        break;
      }

      console.log(`Recent failures${agent ? ` for ${agent}` : ''} (${failures.length})`);
      console.log('='.repeat(60));
      for (const f of failures) {
        console.log(`#${f.id} | ${f.agent} / ${f.action} | trace=${f.trace_id.slice(0, 8)} | ${f.created_at}`);
        console.log(`  Output: ${truncate(f.output, 100)}`);
      }
      break;
    }

    case 'alerts': {
      const alertAgent = args[1];
      const alerts = aw.activeAlerts(alertAgent);

      if (alerts.length === 0) {
        console.log('No active alerts.');
        break;
      }

      console.log(`Active alerts (${alerts.length})`);
      console.log('='.repeat(60));
      for (const a of alerts) {
        console.log(`[${a.severity.toUpperCase()}] ${a.agent} / ${a.alert_type} (x${a.count})`);
        console.log(`  ${a.message}`);
        console.log(`  First: ${a.first_seen} | Last: ${a.last_seen}`);
      }
      break;
    }

    case 'replay': {
      const traceId = args[1];
      if (!traceId) {
        console.error('Usage: agentwatch replay <trace-id>');
        process.exit(1);
      }

      const chains = aw.replay(traceId);
      if (chains.length === 0) {
        console.log(`No failures found in trace ${traceId}`);
        break;
      }

      console.log(`Trace ${traceId} - ${chains.length} cascade(s) found`);
      console.log('='.repeat(60));

      for (const chain of chains) {
        console.log('');
        console.log(`Cascade -> failure #${chain.failure_id} (${chain.chain.length} steps)`);
        for (let i = 0; i < chain.chain.length; i++) {
          const step = chain.chain[i];
          const arrow = i < chain.chain.length - 1 ? ' ->' : ' X';
          console.log(`  ${step.agent}/${step.action} [${step.status}]${arrow}`);
          console.log(`    in:  ${truncate(step.input, 80)}`);
          console.log(`    out: ${truncate(step.output, 80)}`);
        }
      }
      break;
    }

    default: {
      console.log('AgentWatch - Multi-agent observability');
      console.log('');
      console.log('Usage:');
      console.log('  agentwatch dashboard              Fleet health overview');
      console.log('  agentwatch cascade <event-id>     Trace cascade from failure');
      console.log('  agentwatch failures [agent]       List recent failures');
      console.log('  agentwatch alerts [agent]          List active alerts');
      console.log('  agentwatch replay <trace-id>      Replay all cascades in a trace');
      console.log('');
      console.log('Environment:');
      console.log('  AGENTWATCH_DB    Path to SQLite database (default: agentwatch.db)');
    }
  }
} finally {
  aw.close();
}

function truncate(s: string, max: number): string {
  const oneline = s.replace(/\n/g, ' ');
  return oneline.length > max ? oneline.slice(0, max - 3) + '...' : oneline;
}

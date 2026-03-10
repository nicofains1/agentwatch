import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentWatch } from '../src/index.js';
import { unlinkSync, existsSync } from 'node:fs';

const TEST_DB = 'test-alerts.db';

describe('alert de-duplication', () => {
  let aw: AgentWatch;

  beforeEach(() => {
    aw = new AgentWatch({ db_path: TEST_DB, alert_window_minutes: 60 });
  });

  afterEach(() => {
    aw.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal');
    if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm');
  });

  it('creates a new alert', () => {
    const alert = aw.alert('coo', 'health_check_failed', 'agentic-ads returned 502');
    expect(alert.id).toBeGreaterThan(0);
    expect(alert.severity).toBe('info');
    expect(alert.count).toBe(1);
  });

  it('de-duplicates alerts within window', () => {
    aw.alert('coo', 'health_check_failed', 'agentic-ads returned 502');
    aw.alert('coo', 'health_check_failed', 'agentic-ads returned 502 again');
    const third = aw.alert('coo', 'health_check_failed', 'still down');

    expect(third.count).toBe(3);
    expect(third.severity).toBe('warning');
  });

  it('escalates to critical at 10+ occurrences', () => {
    for (let i = 0; i < 10; i++) {
      aw.alert('coo', 'health_check_failed', `attempt ${i + 1}`);
    }
    const alerts = aw.activeAlerts('coo');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].count).toBe(10);
    expect(alerts[0].severity).toBe('critical');
  });

  it('resolves alerts', () => {
    const alert = aw.alert('coo', 'health_check_failed', 'down');
    aw.resolveAlert(alert.id);

    const active = aw.activeAlerts('coo');
    expect(active).toHaveLength(0);
  });

  it('different alert types are separate', () => {
    aw.alert('coo', 'health_check_failed', 'down');
    aw.alert('coo', 'deploy_failed', 'build error');

    const alerts = aw.activeAlerts('coo');
    expect(alerts).toHaveLength(2);
  });

  it('auto-alerts on trace errors', () => {
    const traceId = aw.createTraceId();
    aw.trace(traceId, 'agent-a', 'api_call', 'input', 'server error', { status: 'error' });

    const alerts = aw.activeAlerts('agent-a');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert_type).toBe('trace_error:api_call');
  });
});

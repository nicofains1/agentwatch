import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentWatch } from '../src/index.js';
import { unlinkSync, existsSync } from 'node:fs';

const TEST_DB = 'test-heartbeat.db';

describe('heartbeat', () => {
  let aw: AgentWatch;

  beforeEach(() => {
    aw = new AgentWatch({ db_path: TEST_DB, heartbeat_stale_minutes: 1 });
  });

  afterEach(() => {
    aw.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal');
    if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm');
  });

  it('registers a heartbeat', () => {
    const hb = aw.report('agent-a', 'healthy', '{"task": "review"}');
    expect(hb.id).toBeGreaterThan(0);
    expect(hb.agent).toBe('agent-a');
    expect(hb.status).toBe('healthy');
  });

  it('returns latest heartbeat for an agent', () => {
    aw.report('agent-a', 'healthy');
    aw.report('agent-a', 'degraded');
    const latest = aw.getLatestHeartbeat('agent-a');
    expect(latest?.status).toBe('degraded');
  });

  it('returns fleet health with multiple agents', () => {
    aw.report('agent-a', 'healthy');
    aw.report('agent-b', 'error');
    aw.report('agent-c', 'degraded');

    const fleet = aw.getFleetHealth();
    expect(fleet).toHaveLength(3);

    const agentA = fleet.find(a => a.agent === 'agent-a');
    expect(agentA?.status).toBe('healthy');
    expect(agentA?.uptime_pct).toBe(100);

    const agentB = fleet.find(a => a.agent === 'agent-b');
    expect(agentB?.status).toBe('error');
  });

  it('dashboard returns structured output', () => {
    aw.report('ceo', 'healthy');
    aw.report('cto', 'healthy');
    aw.report('cfo', 'degraded');

    const dash = aw.dashboard();
    expect(dash.total_agents).toBe(3);
    expect(dash.healthy_count).toBe(2);
    expect(dash.degraded_count).toBe(1);
  });

  it('dashboard text renders without errors', () => {
    aw.report('ceo', 'healthy');
    const text = aw.dashboardText();
    expect(text).toContain('AgentWatch Fleet Dashboard');
    expect(text).toContain('ceo');
  });
});

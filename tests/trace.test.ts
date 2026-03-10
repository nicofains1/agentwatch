import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentWatch, createTraceId } from '../src/index.js';
import { unlinkSync, existsSync } from 'node:fs';

const TEST_DB = 'test-trace.db';

describe('trace and cascade', () => {
  let aw: AgentWatch;

  beforeEach(() => {
    aw = new AgentWatch({ db_path: TEST_DB });
  });

  afterEach(() => {
    aw.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal');
    if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm');
  });

  it('creates trace events', () => {
    const traceId = createTraceId();
    const event = aw.trace(traceId, 'agent-a', 'api_call', '{"url": "/foo"}', '{"ok": true}');
    expect(event.id).toBeGreaterThan(0);
    expect(event.trace_id).toBe(traceId);
    expect(event.status).toBe('ok');
  });

  it('links parent events for cascade chain', () => {
    const traceId = createTraceId();

    const e1 = aw.trace(traceId, 'agent-a', 'fetch_data', 'request', 'bad_response', {
      status: 'error',
      durationMs: 150,
    });

    const e2 = aw.trace(traceId, 'agent-b', 'transform', 'bad_response', 'corrupted', {
      parentEventId: e1.id,
      status: 'ok',
      durationMs: 20,
    });

    const e3 = aw.trace(traceId, 'agent-c', 'process', 'corrupted', 'crash: invalid input', {
      parentEventId: e2.id,
      status: 'error',
      durationMs: 5,
    });

    // Correlate from the final failure
    const chain = aw.correlate(e3.id);
    expect(chain).not.toBeNull();
    expect(chain!.chain).toHaveLength(3);
    expect(chain!.root_cause.agent).toBe('agent-a');
    expect(chain!.root_cause.action).toBe('fetch_data');
    expect(chain!.chain[2].agent).toBe('agent-c');
    expect(chain!.chain[2].status).toBe('error');
  });

  it('replays all cascades in a trace', () => {
    const traceId = createTraceId();

    const e1 = aw.trace(traceId, 'agent-a', 'call', 'in', 'out', { status: 'error' });
    const e2 = aw.trace(traceId, 'agent-b', 'call', 'in', 'fail', {
      parentEventId: e1.id,
      status: 'error',
    });

    const chains = aw.replay(traceId);
    expect(chains.length).toBeGreaterThanOrEqual(1);
  });

  it('finds recent failures', () => {
    const traceId = createTraceId();
    aw.trace(traceId, 'agent-a', 'ok_action', 'in', 'out');
    aw.trace(traceId, 'agent-a', 'bad_action', 'in', 'error', { status: 'error' });
    aw.trace(traceId, 'agent-b', 'bad_action', 'in', 'error', { status: 'error' });

    const all = aw.getRecentFailures();
    expect(all).toHaveLength(2);

    const agentA = aw.getRecentFailures('agent-a');
    expect(agentA).toHaveLength(1);
  });

  it('returns null for nonexistent failure', () => {
    expect(aw.correlate(99999)).toBeNull();
  });
});

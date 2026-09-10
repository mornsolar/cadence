import { describe, expect, test } from 'vitest';
import { reduceSession, type SessionContext } from '../../src/shared/session';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import type { SessionState, Settings } from '../../src/shared/types';

const T0 = Date.parse('2026-09-10T02:00:00Z');
const MINUTE = 60_000;

function ctx(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    now: T0,
    settings: DEFAULT_SETTINGS,
    newId: () => 'sid',
    ...overrides,
  };
}

function swipes(count: number, settings: Settings = DEFAULT_SETTINGS, start: SessionState | null = null) {
  let state = start;
  const effects = [];
  for (let i = 0; i < count; i += 1) {
    const result = reduceSession(state, { type: 'swipe', platform: 'tiktok' }, ctx({ now: T0 + i * 1000, settings }));
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

describe('reduceSession: starting', () => {
  test('first swipe starts a session with count 1 and emits sessionStarted', () => {
    const { state, effects } = reduceSession(null, { type: 'swipe', platform: 'youtube' }, ctx());

    expect(state).toMatchObject({ sessionId: 'sid', swipeCount: 1, swipesSinceCheckpoint: 1, triggerCount: 0, lockedUntil: null });
    expect(state?.startedAt).toBe('2026-09-10T02:00:00.000Z');
    expect(effects).toEqual([{ type: 'sessionStarted', sessionId: 'sid', platform: 'youtube' }]);
  });

  test('does not mutate the previous state object', () => {
    const first = reduceSession(null, { type: 'swipe', platform: 'tiktok' }, ctx()).state;
    const frozen = Object.freeze({ ...first! });

    const second = reduceSession(frozen, { type: 'swipe', platform: 'tiktok' }, ctx({ now: T0 + 1000 })).state;

    expect(frozen.swipeCount).toBe(1);
    expect(second?.swipeCount).toBe(2);
  });
});

describe('reduceSession: trigger threshold', () => {
  test('trigger fires exactly on the Nth swipe and not before', () => {
    const nine = swipes(9);
    expect(nine.effects.filter((e) => e.type === 'trigger')).toHaveLength(0);

    const ten = swipes(10);
    const triggers = ten.effects.filter((e) => e.type === 'trigger');
    expect(triggers).toEqual([{ type: 'trigger', sessionId: 'sid', swipeCount: 10, platform: 'tiktok' }]);
    expect(ten.state?.triggerCount).toBe(1);
  });

  test('threshold is taken from settings', () => {
    const { effects } = swipes(3, { ...DEFAULT_SETTINGS, swipeThreshold: 3 });
    expect(effects.filter((e) => e.type === 'trigger')).toHaveLength(1);
  });

  test('after a trigger the checkpoint counter restarts so the next trigger is a fresh N later', () => {
    const { state, effects } = swipes(20);
    const triggers = effects.filter((e) => e.type === 'trigger');
    expect(triggers.map((e) => e.type === 'trigger' && e.swipeCount)).toEqual([10, 20]);
    expect(state?.swipeCount).toBe(20);
    expect(state?.swipesSinceCheckpoint).toBe(0);
  });
});

describe('reduceSession: mode B choices', () => {
  test('continue keeps the session, refreshes lastSwipeAt and emits nothing', () => {
    const { state: before } = swipes(10);
    const { state, effects } = reduceSession(before, { type: 'continue' }, ctx({ now: T0 + 30_000 }));

    expect(effects).toEqual([]);
    expect(state?.sessionId).toBe('sid');
    expect(state?.swipeCount).toBe(10);
    expect(state?.lastSwipeAt).toBe(new Date(T0 + 30_000).toISOString());
  });

  test('stop ends the session with reason stop and duration measured to now', () => {
    const { state: before } = swipes(10);
    const { state, effects } = reduceSession(before, { type: 'stop' }, ctx({ now: T0 + 30_000 }));

    expect(state).toBeNull();
    expect(effects).toEqual([
      { type: 'sessionEnded', sessionId: 'sid', swipes: 10, durationMs: 30_000, reason: 'stop', endedAt: new Date(T0 + 30_000).toISOString() },
    ]);
  });

  test('continue and stop with no session are no-ops', () => {
    expect(reduceSession(null, { type: 'continue' }, ctx())).toEqual({ state: null, effects: [] });
    expect(reduceSession(null, { type: 'stop' }, ctx())).toEqual({ state: null, effects: [] });
  });
});

describe('reduceSession: mode A lock', () => {
  const modeA: Settings = { ...DEFAULT_SETTINGS, mode: 'A', cooldownMinutes: 5 };

  test('trigger in mode A sets lockedUntil to now + cooldown', () => {
    const { state } = swipes(10, modeA);
    expect(state?.lockedUntil).toBe(new Date(T0 + 9000 + 5 * MINUTE).toISOString());
  });

  test('swipes while locked are ignored entirely', () => {
    const { state: locked } = swipes(10, modeA);
    const result = reduceSession(locked, { type: 'swipe', platform: 'tiktok' }, ctx({ now: T0 + 60_000, settings: modeA }));

    expect(result.state).toBe(locked);
    expect(result.effects).toEqual([]);
  });

  test('cooldownEnded ends the session with reason cooldown', () => {
    const { state: locked } = swipes(10, modeA);
    const { state, effects } = reduceSession(locked, { type: 'cooldownEnded' }, ctx({ now: T0 + 9000 + 5 * MINUTE, settings: modeA }));

    expect(state).toBeNull();
    expect(effects).toMatchObject([{ type: 'sessionEnded', reason: 'cooldown', swipes: 10 }]);
  });

  test('switching away from mode A clears an active lock', () => {
    const { state: locked } = swipes(10, modeA);
    const { state } = reduceSession(locked, { type: 'modeChanged', mode: 'B' }, ctx({ now: T0 + 10_000 }));
    expect(state?.lockedUntil).toBeNull();
    expect(state?.swipeCount).toBe(10);
  });

  test('modeChanged without a lock returns the same state', () => {
    const { state: before } = swipes(3);
    const { state } = reduceSession(before, { type: 'modeChanged', mode: 'C' }, ctx());
    expect(state).toBe(before);
  });
});

describe('reduceSession: idle boundary', () => {
  test('a swipe after the idle gap ends the old session and starts a new one', () => {
    const { state: before } = swipes(4);
    const later = T0 + 3000 + 6 * MINUTE;
    const { state, effects } = reduceSession(before, { type: 'swipe', platform: 'instagram' }, ctx({ now: later, newId: () => 'sid2' }));

    expect(effects).toEqual([
      { type: 'sessionEnded', sessionId: 'sid', swipes: 4, durationMs: 3000, reason: 'idle', endedAt: new Date(T0 + 3000).toISOString() },
      { type: 'sessionStarted', sessionId: 'sid2', platform: 'instagram' },
    ]);
    expect(state).toMatchObject({ sessionId: 'sid2', swipeCount: 1 });
  });

  test('a swipe inside the idle gap continues the same session', () => {
    const { state: before } = swipes(4);
    const { state, effects } = reduceSession(before, { type: 'swipe', platform: 'tiktok' }, ctx({ now: T0 + 3000 + 4 * MINUTE }));
    expect(effects).toEqual([]);
    expect(state?.swipeCount).toBe(5);
  });

  test('reconcile on load ends a stale session with end = lastSwipeAt', () => {
    const { state: before } = swipes(7);
    const { state, effects } = reduceSession(before, { type: 'reconcile' }, ctx({ now: T0 + 60 * MINUTE }));

    expect(state).toBeNull();
    expect(effects).toEqual([
      { type: 'sessionEnded', sessionId: 'sid', swipes: 7, durationMs: 6000, reason: 'idle', endedAt: new Date(T0 + 6000).toISOString() },
    ]);
  });

  test('reconcile keeps a fresh session untouched', () => {
    const { state: before } = swipes(7);
    const result = reduceSession(before, { type: 'reconcile' }, ctx({ now: T0 + 6000 + MINUTE }));
    expect(result.state).toBe(before);
    expect(result.effects).toEqual([]);
  });

  test('reconcile ends a session whose cooldown already elapsed', () => {
    const modeA: Settings = { ...DEFAULT_SETTINGS, mode: 'A' };
    const { state: locked } = swipes(10, modeA);
    const { state, effects } = reduceSession(locked, { type: 'reconcile' }, ctx({ now: T0 + 30 * MINUTE, settings: modeA }));
    expect(state).toBeNull();
    expect(effects).toMatchObject([{ type: 'sessionEnded', reason: 'cooldown' }]);
  });

  test('reconcile with no session is a no-op', () => {
    expect(reduceSession(null, { type: 'reconcile' }, ctx())).toEqual({ state: null, effects: [] });
  });
});

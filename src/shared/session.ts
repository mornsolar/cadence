/**
 * Pure session state machine. No I/O, no clocks: everything comes in through the context.
 * The controller persists the returned state and executes the returned effects.
 */
import { MS_PER_MINUTE } from './constants';
import type { PlatformId, SessionEndReason, SessionState, Settings, Mode } from './types';

export type SessionAction =
  | { readonly type: 'swipe'; readonly platform: PlatformId }
  | { readonly type: 'continue' }
  | { readonly type: 'stop' }
  | { readonly type: 'cooldownEnded' }
  | { readonly type: 'reconcile' }
  | { readonly type: 'modeChanged'; readonly mode: Mode };

export type SessionEffect =
  | { readonly type: 'sessionStarted'; readonly sessionId: string; readonly platform: PlatformId }
  | { readonly type: 'trigger'; readonly sessionId: string; readonly swipeCount: number; readonly platform: PlatformId }
  | {
      readonly type: 'sessionEnded';
      readonly sessionId: string;
      readonly swipes: number;
      readonly durationMs: number;
      readonly reason: SessionEndReason;
      readonly endedAt: string;
    };

export interface SessionContext {
  /** Epoch milliseconds. */
  readonly now: number;
  readonly settings: Settings;
  readonly newId: () => string;
}

export interface SessionResult {
  readonly state: SessionState | null;
  readonly effects: readonly SessionEffect[];
}

const NO_CHANGE = (state: SessionState | null): SessionResult => ({ state, effects: [] });

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function endedEffect(state: SessionState, reason: SessionEndReason, endedAtMs: number): SessionEffect {
  return {
    type: 'sessionEnded',
    sessionId: state.sessionId,
    swipes: state.swipeCount,
    durationMs: endedAtMs - Date.parse(state.startedAt),
    reason,
    endedAt: iso(endedAtMs),
  };
}

function isLocked(state: SessionState, now: number): boolean {
  return state.lockedUntil !== null && Date.parse(state.lockedUntil) > now;
}

/** Returns the reason a stored session should already be considered over, if any. */
function expiredReason(state: SessionState, ctx: SessionContext): SessionEndReason | null {
  if (state.lockedUntil !== null && Date.parse(state.lockedUntil) <= ctx.now) {
    return 'cooldown';
  }
  const idleGapMs = ctx.settings.idleGapMinutes * MS_PER_MINUTE;
  if (ctx.now - Date.parse(state.lastSwipeAt) > idleGapMs) {
    return 'idle';
  }
  return null;
}

function expire(state: SessionState, reason: SessionEndReason, ctx: SessionContext): SessionEffect {
  const endedAtMs = reason === 'cooldown' ? Date.parse(state.lockedUntil as string) : Date.parse(state.lastSwipeAt);
  return endedEffect(state, reason, endedAtMs);
}

function startSession(platform: PlatformId, ctx: SessionContext): { state: SessionState; effect: SessionEffect } {
  const sessionId = ctx.newId();
  return {
    state: {
      sessionId,
      startedAt: iso(ctx.now),
      lastSwipeAt: iso(ctx.now),
      swipeCount: 0,
      swipesSinceCheckpoint: 0,
      triggerCount: 0,
      lockedUntil: null,
    },
    effect: { type: 'sessionStarted', sessionId, platform },
  };
}

function countSwipe(state: SessionState, platform: PlatformId, ctx: SessionContext): SessionResult {
  const swipeCount = state.swipeCount + 1;
  const sinceCheckpoint = state.swipesSinceCheckpoint + 1;
  const reached = sinceCheckpoint >= ctx.settings.swipeThreshold;
  const lockedUntil =
    reached && ctx.settings.mode === 'A' ? iso(ctx.now + ctx.settings.cooldownMinutes * MS_PER_MINUTE) : state.lockedUntil;

  const next: SessionState = {
    ...state,
    lastSwipeAt: iso(ctx.now),
    swipeCount,
    swipesSinceCheckpoint: reached ? 0 : sinceCheckpoint,
    triggerCount: reached ? state.triggerCount + 1 : state.triggerCount,
    lockedUntil,
  };
  const effects: SessionEffect[] = reached
    ? [{ type: 'trigger', sessionId: state.sessionId, swipeCount, platform }]
    : [];
  return { state: next, effects };
}

function handleSwipe(state: SessionState | null, platform: PlatformId, ctx: SessionContext): SessionResult {
  if (state !== null && isLocked(state, ctx.now)) {
    return NO_CHANGE(state);
  }
  const reason = state === null ? null : expiredReason(state, ctx);
  const priorEffects: SessionEffect[] = state !== null && reason !== null ? [expire(state, reason, ctx)] : [];
  const live = state !== null && reason === null ? state : null;

  if (live === null) {
    const started = startSession(platform, ctx);
    const counted = countSwipe(started.state, platform, ctx);
    return { state: counted.state, effects: [...priorEffects, started.effect, ...counted.effects] };
  }
  const counted = countSwipe(live, platform, ctx);
  return { state: counted.state, effects: [...priorEffects, ...counted.effects] };
}

export function reduceSession(state: SessionState | null, action: SessionAction, ctx: SessionContext): SessionResult {
  switch (action.type) {
    case 'swipe':
      return handleSwipe(state, action.platform, ctx);
    case 'continue':
      return state === null ? NO_CHANGE(null) : { state: { ...state, lastSwipeAt: iso(ctx.now) }, effects: [] };
    case 'stop':
      return state === null ? NO_CHANGE(null) : { state: null, effects: [endedEffect(state, 'stop', ctx.now)] };
    case 'cooldownEnded':
      return state === null || state.lockedUntil === null
        ? NO_CHANGE(state)
        : { state: null, effects: [endedEffect(state, 'cooldown', ctx.now)] };
    case 'reconcile': {
      if (state === null) return NO_CHANGE(null);
      const reason = expiredReason(state, ctx);
      return reason === null ? NO_CHANGE(state) : { state: null, effects: [expire(state, reason, ctx)] };
    }
    case 'modeChanged':
      return state === null || state.lockedUntil === null || action.mode === 'A'
        ? NO_CHANGE(state)
        : { state: { ...state, lockedUntil: null }, effects: [] };
  }
}

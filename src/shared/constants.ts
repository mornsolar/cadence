import type { Settings } from './types';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'B',
  swipeThreshold: 10,
  idleGapMinutes: 5,
  cooldownMinutes: 5,
  platforms: { tiktok: true, instagram: true, youtube: true, facebook: true },
  showCounter: true,
};

export const SETTINGS_LIMITS = {
  swipeThreshold: { min: 1, max: 500 },
  idleGapMinutes: { min: 1, max: 1440 },
  cooldownMinutes: { min: 1, max: 1440 },
} as const;

/** Two detection sources reporting the same transition inside this window count once. */
export const DEDUPE_WINDOW_MS = 400;

/**
 * A card change only counts if a scroll, swipe or arrow-key gesture happened this
 * recently beforehand. Without this, a clip that finishes and loops back to itself
 * (some players swap in a fresh <video> element to do it) looks identical to a real
 * skip. A real transition lands well inside this window; a loop only happens after
 * the clip's full playback, which takes far longer.
 */
export const GESTURE_WINDOW_MS = 1500;

/**
 * How close to the end (in seconds) a video's playback has to get before counting as
 * one completed pass, as a fallback for players that loop via the native `loop`
 * attribute rather than firing an `ended` event.
 */
export const FINISH_NEAR_END_S = 0.35;

/**
 * How many times a clip must play through before leaving it stops counting as a skip.
 * One pass is too weak a signal on short clips (a few seconds is common): it can
 * complete on its own well before a person has decided whether to stay or move on,
 * so a single loop can't be told apart from someone who was about to skip anyway.
 * Seeing it complete a second time is real evidence of having stayed on purpose.
 */
export const FINISH_REQUIRED_COMPLETIONS = 2;

/**
 * A completion detected via playback position (the `loop`-attribute fallback) within
 * this long of an `ended` event is the same completion reported twice, not two passes.
 */
export const FINISH_DEDUPE_MS = 1000;

/** URL polling interval for platforms that update history without events. */
export const URL_POLL_INTERVAL_MS = 250;

/** Newest events kept in local storage. */
export const MAX_EVENTS = 5000;

export const MS_PER_MINUTE = 60_000;

export const DIARY_ALARM_NAME = 'cadence-diary';
export const DIARY_PERIOD_MINUTES = 7 * 24 * 60;

export const OVERLAY_HOST_ID = 'cadence-host';
export const OVERLAY_FADE_MS = 200;

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
 * How close to the end (in seconds) a video's playback has to get before it counts as
 * "finished watching," as a fallback for players that loop via the native `loop`
 * attribute rather than firing an `ended` event. A swipe away from a finished video is
 * the platform's required way to move on, not a skip, and does not count toward the
 * threshold — only leaving a video before it reaches this point does.
 */
export const FINISH_NEAR_END_S = 0.35;

/** URL polling interval for platforms that update history without events. */
export const URL_POLL_INTERVAL_MS = 250;

/** Newest events kept in local storage. */
export const MAX_EVENTS = 5000;

export const MS_PER_MINUTE = 60_000;

export const DIARY_ALARM_NAME = 'cadence-diary';
export const DIARY_PERIOD_MINUTES = 7 * 24 * 60;

export const OVERLAY_HOST_ID = 'cadence-host';
export const OVERLAY_FADE_MS = 200;

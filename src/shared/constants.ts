import type { Settings } from './types';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'B',
  swipeThreshold: 10,
  idleGapMinutes: 5,
  cooldownMinutes: 5,
  platforms: { tiktok: true, instagram: true, youtube: true },
};

export const SETTINGS_LIMITS = {
  swipeThreshold: { min: 1, max: 500 },
  idleGapMinutes: { min: 1, max: 1440 },
  cooldownMinutes: { min: 1, max: 1440 },
} as const;

/** Two detection sources reporting the same transition inside this window count once. */
export const DEDUPE_WINDOW_MS = 400;

/** URL polling interval for platforms that update history without events. */
export const URL_POLL_INTERVAL_MS = 250;

/** Newest events kept in local storage. */
export const MAX_EVENTS = 5000;

export const MS_PER_MINUTE = 60_000;

export const DIARY_ALARM_NAME = 'cadence-diary';
export const DIARY_PERIOD_MINUTES = 7 * 24 * 60;

export const OVERLAY_HOST_ID = 'cadence-host';
export const OVERLAY_FADE_MS = 200;

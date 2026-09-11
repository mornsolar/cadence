import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from './constants';
import type { Mode, PlatformId, Settings } from './types';

const MODES: readonly Mode[] = ['A', 'B', 'C'];
const PLATFORM_IDS: readonly PlatformId[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

export interface ParsedSettings {
  readonly settings: Settings;
  readonly problems: readonly string[];
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedInteger(name: keyof typeof SETTINGS_LIMITS, value: unknown, problems: string[]): number {
  const { min, max } = SETTINGS_LIMITS[name];
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }
  problems.push(`${name}: expected an integer from ${min} to ${max}, got ${show(value)}`);
  return DEFAULT_SETTINGS[name];
}

function mode(value: unknown, problems: string[]): Mode {
  if (MODES.includes(value as Mode)) return value as Mode;
  problems.push(`mode: expected A, B or C, got ${show(value)}`);
  return DEFAULT_SETTINGS.mode;
}

function booleanSetting(name: 'showCounter', value: unknown, problems: string[]): boolean {
  if (typeof value === 'boolean') return value;
  problems.push(`${name}: expected a boolean, got ${show(value)}`);
  return DEFAULT_SETTINGS[name];
}

function platforms(value: unknown, problems: string[]): Record<PlatformId, boolean> {
  const source = isRecord(value) ? value : {};
  const entries = PLATFORM_IDS.map((id) => {
    const flag = source[id];
    if (typeof flag === 'boolean') return [id, flag] as const;
    if (flag !== undefined) problems.push(`platforms.${id}: expected a boolean, got ${show(flag)}`);
    return [id, DEFAULT_SETTINGS.platforms[id]] as const;
  });
  return Object.fromEntries(entries) as Record<PlatformId, boolean>;
}

/** Validates stored settings field by field, falling back to defaults and reporting each problem. */
export function parseSettings(raw: unknown): ParsedSettings {
  if (raw === undefined) return { settings: DEFAULT_SETTINGS, problems: [] };
  if (!isRecord(raw)) return { settings: DEFAULT_SETTINGS, problems: [`settings: expected an object, got ${show(raw)}`] };

  const problems: string[] = [];
  const settings: Settings = {
    mode: mode(raw.mode, problems),
    swipeThreshold: boundedInteger('swipeThreshold', raw.swipeThreshold, problems),
    idleGapMinutes: boundedInteger('idleGapMinutes', raw.idleGapMinutes, problems),
    cooldownMinutes: boundedInteger('cooldownMinutes', raw.cooldownMinutes, problems),
    platforms: platforms(raw.platforms, problems),
    showCounter: booleanSetting('showCounter', raw.showCounter, problems),
  };
  return { settings, problems };
}

export interface SettingsChange {
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

export function settingsDiff(before: Settings, after: Settings): readonly SettingsChange[] {
  const scalarKeys = ['mode', 'swipeThreshold', 'idleGapMinutes', 'cooldownMinutes', 'showCounter'] as const;
  const scalar = scalarKeys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ key, from: String(before[key]), to: String(after[key]) }));
  const platformChanges = PLATFORM_IDS
    .filter((id) => before.platforms[id] !== after.platforms[id])
    .map((id) => ({ key: `platforms.${id}`, from: String(before.platforms[id]), to: String(after.platforms[id]) }));
  return [...scalar, ...platformChanges];
}

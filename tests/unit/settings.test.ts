import { describe, expect, test } from 'vitest';
import { parseSettings, settingsDiff } from '../../src/shared/settings';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

describe('parseSettings', () => {
  test('returns defaults with no problems for undefined', () => {
    expect(parseSettings(undefined)).toEqual({ settings: DEFAULT_SETTINGS, problems: [] });
  });

  test('accepts a fully valid object unchanged', () => {
    const valid = { mode: 'A', swipeThreshold: 25, idleGapMinutes: 3, cooldownMinutes: 10, platforms: { tiktok: false, instagram: true, youtube: true, facebook: false }, showCounter: false };
    expect(parseSettings(valid)).toEqual({ settings: valid, problems: [] });
  });

  test('falls back per field and names each problem', () => {
    const raw = { mode: 'Z', swipeThreshold: 0, idleGapMinutes: 'soon', cooldownMinutes: 99999, platforms: { tiktok: 'yes' }, showCounter: 'yep' };
    const { settings, problems } = parseSettings(raw);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, platforms: { tiktok: true, instagram: true, youtube: true, facebook: true } });
    expect(problems).toEqual([
      'mode: expected A, B or C, got "Z"',
      'swipeThreshold: expected an integer from 1 to 500, got 0',
      'idleGapMinutes: expected an integer from 1 to 1440, got "soon"',
      'cooldownMinutes: expected an integer from 1 to 1440, got 99999',
      'platforms.tiktok: expected a boolean, got "yes"',
      'showCounter: expected a boolean, got "yep"',
    ]);
  });

  test('non-object input is a single problem', () => {
    expect(parseSettings('nope').problems).toEqual(['settings: expected an object, got "nope"']);
  });
});

describe('settingsDiff', () => {
  test('lists changed top-level keys and platform toggles as strings', () => {
    const next = { ...DEFAULT_SETTINGS, mode: 'C' as const, platforms: { ...DEFAULT_SETTINGS.platforms, youtube: false } };
    expect(settingsDiff(DEFAULT_SETTINGS, next)).toEqual([
      { key: 'mode', from: 'B', to: 'C' },
      { key: 'platforms.youtube', from: 'true', to: 'false' },
    ]);
  });
  test('identical settings give no diff', () => {
    expect(settingsDiff(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toEqual([]);
  });
});

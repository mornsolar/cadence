import { describe, expect, test } from 'vitest';
import { median, summarizeSessions } from '../../src/shared/stats';
import type { LogEvent } from '../../src/shared/types';

const NOW = Date.parse('2026-09-10T12:00:00Z');
const DAY = 86_400_000;

function ended(sessionId: string, swipes: number, daysAgo: number): LogEvent {
  return { type: 'session_end', at: new Date(NOW - daysAgo * DAY).toISOString(), sessionId, swipes, durationMs: 1000, reason: 'idle' };
}

describe('median', () => {
  test('empty is 0', () => expect(median([])).toBe(0));
  test('odd count picks the middle', () => expect(median([9, 1, 5])).toBe(5));
  test('even count averages the middle pair and rounds', () => expect(median([1, 2, 3, 10])).toBe(3));
});

describe('summarizeSessions', () => {
  test('counts only session_end events inside the window', () => {
    const events = [ended('a', 4, 1), ended('b', 30, 3), ended('c', 12, 20), { type: 'diary', at: new Date(NOW).toISOString(), text: 'x' } as LogEvent];
    expect(summarizeSessions(events, 7, NOW)).toEqual({ sessions: 2, medianSwipes: 17, days: 7 });
    expect(summarizeSessions(events, 28, NOW)).toEqual({ sessions: 3, medianSwipes: 12, days: 28 });
  });

  test('empty log gives zero sessions', () => {
    expect(summarizeSessions([], 7, NOW)).toEqual({ sessions: 0, medianSwipes: 0, days: 7 });
  });
});

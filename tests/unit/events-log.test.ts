import { describe, expect, test } from 'vitest';
import { appendEvent, pruneEvents, toCsv, toJson } from '../../src/shared/events-log';
import type { LogEvent } from '../../src/shared/types';

const trigger: LogEvent = { type: 'trigger', at: '2026-09-10T02:00:00.000Z', sessionId: 's1', mode: 'B', swipeCount: 10, platform: 'tiktok' };
const choice: LogEvent = { type: 'choice', at: '2026-09-10T02:00:02.000Z', sessionId: 's1', choice: 'continue', latencyMs: 1800 };
const diary: LogEvent = { type: 'diary', at: '2026-09-11T09:00:00.000Z', text: 'Quieter, "less pull"' };

describe('appendEvent', () => {
  test('returns a new array and leaves the input untouched', () => {
    const before: readonly LogEvent[] = Object.freeze([trigger]);
    const after = appendEvent(before, choice);
    expect(after).toEqual([trigger, choice]);
    expect(before).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  test('prunes to the max when appending past the cap', () => {
    const before = Array.from({ length: 3 }, () => trigger);
    const after = appendEvent(before, choice, 3);
    expect(after).toHaveLength(3);
    expect(after[2]).toBe(choice);
  });
});

describe('pruneEvents', () => {
  test('keeps the newest events', () => {
    expect(pruneEvents([trigger, choice, diary], 2)).toEqual([choice, diary]);
  });
  test('returns the same array when under the cap', () => {
    const list = [trigger];
    expect(pruneEvents(list, 5)).toBe(list);
  });
});

describe('export', () => {
  test('toJson round-trips', () => {
    expect(JSON.parse(toJson([trigger, diary]))).toEqual([trigger, diary]);
  });

  test('toCsv has a header, one row per event, and quotes commas and quotes', () => {
    const csv = toCsv([trigger, choice, diary]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('at,type,sessionId,platform,mode,swipeCount,choice,latencyMs,swipes,durationMs,reason,from,to,key,text');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-09-10T02:00:00.000Z,trigger,s1,tiktok,B,10,,,,,,,,,');
    expect(lines[3]).toContain('"Quieter, ""less pull"""');
  });
});

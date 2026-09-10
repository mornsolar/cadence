import type { LogEvent } from './types';

const DAY_MS = 86_400_000;

export interface SessionSummary {
  readonly sessions: number;
  readonly medianSwipes: number;
  readonly days: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(value);
}

export function summarizeSessions(events: readonly LogEvent[], days: number, now: number = Date.now()): SessionSummary {
  const since = now - days * DAY_MS;
  const swipes = events
    .filter((event) => event.type === 'session_end' && Date.parse(event.at) >= since)
    .map((event) => (event.type === 'session_end' ? event.swipes : 0));
  return { sessions: swipes.length, medianSwipes: median(swipes), days };
}

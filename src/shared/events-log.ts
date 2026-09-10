import { MAX_EVENTS } from './constants';
import type { LogEvent } from './types';

export function pruneEvents(events: readonly LogEvent[], max: number = MAX_EVENTS): readonly LogEvent[] {
  return events.length <= max ? events : events.slice(events.length - max);
}

export function appendEvent(events: readonly LogEvent[], event: LogEvent, max: number = MAX_EVENTS): readonly LogEvent[] {
  return pruneEvents([...events, event], max);
}

export function toJson(events: readonly LogEvent[]): string {
  return JSON.stringify(events, null, 2);
}

const CSV_COLUMNS = [
  'at', 'type', 'sessionId', 'platform', 'mode', 'swipeCount', 'choice', 'latencyMs',
  'swipes', 'durationMs', 'reason', 'from', 'to', 'key', 'text',
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(events: readonly LogEvent[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = events.map((event) => {
    const record = event as unknown as Record<string, unknown>;
    return CSV_COLUMNS.map((column) => csvCell(record[column])).join(',');
  });
  return [header, ...rows].join('\n');
}

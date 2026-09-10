import { getBrowserApi } from '../shared/browser-api';
import { COPY } from '../shared/copy';
import { createExtensionStorage } from '../shared/storage';
import { summarizeSessions } from '../shared/stats';

/** Only show the comparison line once there is enough history for it to be a fact rather than noise. */
const MIN_SESSIONS_FOR_COMPARISON = 5;
const COMPARISON_WINDOW_DAYS = 7;

function readSwipes(): number {
  const raw = new URLSearchParams(window.location.search).get('swipes');
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function main(): Promise<void> {
  const line = document.getElementById('line');
  const comparison = document.getElementById('comparison');
  const link = document.getElementById('settings');
  if (line === null || comparison === null || link === null) return;

  line.textContent = COPY.stopped.line(readSwipes());
  link.textContent = COPY.stopped.link;

  const storage = createExtensionStorage(getBrowserApi());
  const { events = [] } = await storage.get(['events']);
  const summary = summarizeSessions(events, COMPARISON_WINDOW_DAYS);
  if (summary.sessions >= MIN_SESSIONS_FOR_COMPARISON) {
    comparison.textContent = COPY.stopped.comparison(summary.medianSwipes);
  }
}

main().catch((error: unknown) => console.error('Cadence: stopped page failed', error));

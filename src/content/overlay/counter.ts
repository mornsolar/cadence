/**
 * A small, passive "N / threshold" badge in a corner of the page while scrolling.
 * Unlike the checkpoint and lockout, this never blocks input, traps focus, or pauses
 * video — it's purely informational, matching the brief's "no gamification" rule: a
 * bare count, not a progress bar, a countdown, or anything colour-coded by proximity
 * to the limit.
 */
import { COPY } from '../../shared/copy';

const HOST_ID = 'cadence-counter';

export interface CounterBadge {
  show(count: number, threshold: number): void;
  hide(): void;
}

const BADGE_CSS = `
:host { all: initial; }
.badge {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(30, 29, 27, 0.55);
  color: #f6f4f0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  pointer-events: none;
  user-select: none;
  z-index: 2147483646;
}
`;

export function createCounterBadge(document: Document): CounterBadge {
  let host: HTMLElement | null = null;
  let label: HTMLElement | null = null;

  function ensureMounted(): void {
    if (host !== null) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BADGE_CSS;
    label = document.createElement('div');
    label.className = 'badge';
    // Decorative and non-essential: the count is a convenience, not information a
    // screen reader user needs pushed at them on every single swipe.
    label.setAttribute('aria-hidden', 'true');
    root.append(style, label);
    document.body.appendChild(host);
  }

  function show(count: number, threshold: number): void {
    ensureMounted();
    if (label !== null) label.textContent = COPY.counter.label(count, threshold);
  }

  function hide(): void {
    host?.remove();
    host = null;
    label = null;
  }

  return { show, hide };
}

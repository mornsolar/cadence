import { COPY } from '../../shared/copy';

export interface LockoutOptions {
  /** Epoch milliseconds when the lock lifts. */
  readonly lockedUntil: number;
  readonly onEnd: () => void;
  readonly now?: () => number;
  readonly setInterval?: (fn: () => void, ms: number) => number;
  readonly clearInterval?: (handle: number) => void;
}

export interface LockoutView {
  readonly element: HTMLElement;
  start(): void;
  stop(): void;
}

const TICK_MS = 1000;

/**
 * Mode A view. States a fact and the remaining time. No buttons: this mode is the
 * agency-replacing comparison arm and is meant to behave like an ordinary blocker.
 */
export function renderLockout(document: Document, options: LockoutOptions): LockoutView {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms) as unknown as number);
  const clearTimer = options.clearInterval ?? ((handle) => globalThis.clearInterval(handle));

  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'cadence-lock-title');

  const title = document.createElement('h1');
  title.id = 'cadence-lock-title';
  title.className = 'question';
  title.textContent = COPY.lockout.title;

  const remaining = document.createElement('p');
  remaining.className = 'remaining';
  remaining.setAttribute('aria-live', 'polite');

  dialog.append(title, remaining);

  let handle: number | null = null;

  function render(): void {
    const leftMs = Math.max(0, options.lockedUntil - now());
    const totalSeconds = Math.ceil(leftMs / 1000);
    remaining.textContent = COPY.lockout.remaining(Math.floor(totalSeconds / 60), totalSeconds % 60);
    if (leftMs <= 0) {
      stop();
      options.onEnd();
    }
  }

  function start(): void {
    render();
    if (handle === null && options.lockedUntil > now()) handle = setTimer(render, TICK_MS);
  }

  function stop(): void {
    if (handle !== null) clearTimer(handle);
    handle = null;
  }

  return { element: dialog, start, stop };
}

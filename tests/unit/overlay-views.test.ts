import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderCheckpoint } from '../../src/content/overlay/checkpoint';
import { renderLockout } from '../../src/content/overlay/lockout';
import { COPY } from '../../src/shared/copy';

describe('renderCheckpoint', () => {
  test('renders the question and two equal choices wired to handlers', () => {
    const onContinue = vi.fn();
    const onStop = vi.fn();
    const dialog = renderCheckpoint(document, { onContinue, onStop });

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.querySelector('h1')?.textContent).toBe(COPY.checkpoint.question);
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button');
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([COPY.checkpoint.keepGoing, COPY.checkpoint.done]);
    expect(Array.from(buttons).map((b) => b.className)).toEqual(['choice', 'choice']);

    buttons[0]!.click();
    buttons[1]!.click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('has no timer text and no default-selected button', () => {
    const dialog = renderCheckpoint(document, { onContinue: () => undefined, onStop: () => undefined });
    expect(dialog.querySelector('.remaining')).toBeNull();
    expect(dialog.querySelector('[autofocus]')).toBeNull();
  });
});

describe('renderLockout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('shows remaining time, ticks down, and calls onEnd when the lock lifts', () => {
    let clock = 0;
    const onEnd = vi.fn();
    const view = renderLockout(document, { lockedUntil: 65_000, onEnd, now: () => clock });
    view.start();

    expect(view.element.querySelector('.remaining')?.textContent).toBe('1 min 5 s left');
    expect(view.element.querySelectorAll('button')).toHaveLength(0);

    clock = 60_000;
    vi.advanceTimersByTime(1000);
    expect(view.element.querySelector('.remaining')?.textContent).toBe('5 s left');
    expect(onEnd).not.toHaveBeenCalled();

    clock = 65_000;
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);

    clock = 70_000;
    vi.advanceTimersByTime(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('an already-expired lock ends immediately without starting a timer', () => {
    const onEnd = vi.fn();
    const view = renderLockout(document, { lockedUntil: 0, onEnd, now: () => 10 });
    view.start();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('stop clears the timer', () => {
    const view = renderLockout(document, { lockedUntil: 100_000, onEnd: () => undefined, now: () => 0 });
    view.start();
    expect(vi.getTimerCount()).toBe(1);
    view.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

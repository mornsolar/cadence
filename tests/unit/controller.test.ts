import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createController, type Controller } from '../../src/content/controller';
import type { Detector, DetectorDeps } from '../../src/content/detector';
import type { OverlayHost } from '../../src/content/overlay/host';
import { tiktok } from '../../src/content/platforms/tiktok';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { InMemoryStorage } from '../../src/shared/storage';
import type { LogEvent, Settings } from '../../src/shared/types';

const T0 = Date.parse('2026-09-10T02:00:00Z');
const MINUTE = 60_000;

class FakeOverlay implements OverlayHost {
  content: HTMLElement | null = null;
  show(content: HTMLElement) { this.content = content; }
  hide() { this.content = null; }
  isVisible() { return this.content !== null; }
  button(choice: string): HTMLButtonElement {
    const button = this.content?.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`);
    if (!button) throw new Error(`no button ${choice}`);
    return button;
  }
}

describe('controller', () => {
  let clock: number;
  let storage: InMemoryStorage;
  let overlay: FakeOverlay;
  let sendMessage: ReturnType<typeof vi.fn>;
  let detectorDeps: DetectorDeps | null;
  let controller: Controller;
  let detector: Detector;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = T0;
    overlay = new FakeOverlay();
    sendMessage = vi.fn().mockResolvedValue(undefined);
    detectorDeps = null;
    detector = { start: vi.fn(), stop: vi.fn() };
  });

  afterEach(() => {
    controller?.stop();
    vi.useRealTimers();
  });

  async function boot(settings: Partial<Settings> = {}, initial: Parameters<typeof InMemoryStorage.prototype.set>[0] = {}) {
    storage = new InMemoryStorage({ settings: { ...DEFAULT_SETTINGS, ...settings }, ...initial });
    let ids = 0;
    controller = createController({
      adapter: tiktok,
      storage,
      overlay,
      document,
      window,
      sendMessage,
      now: () => clock,
      newId: () => `s${(ids += 1)}`,
      warn: () => undefined,
      detectorFactory: (deps) => { detectorDeps = deps; return detector; },
    });
    await controller.start();
  }

  async function swipe(times = 1, wasSkip = true) {
    for (let i = 0; i < times; i += 1) {
      clock += 1000;
      await controller.onCardChange({ source: 'url', id: String(clock), wasSkip });
    }
  }

  async function events(): Promise<readonly LogEvent[]> {
    return (await storage.get(['events'])).events ?? [];
  }

  test('starts the detector and persists a session after the first swipe', async () => {
    await boot();
    expect(detector.start).toHaveBeenCalled();
    expect(detectorDeps?.adapter).toBe(tiktok);

    await swipe();
    const { session } = await storage.get(['session']);
    expect(session).toMatchObject({ sessionId: 's1', swipeCount: 1 });
    expect(await events()).toMatchObject([{ type: 'session_start', sessionId: 's1', platform: 'tiktok' }]);
  });

  test('mode B: the tenth swipe shows the checkpoint, Keep going hides it and logs the choice with latency', async () => {
    await boot();
    await swipe(9);
    expect(overlay.isVisible()).toBe(false);
    await swipe(1);
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.content?.textContent).toContain('Is this what you meant to be doing?');

    await swipe(1); // ignored while the checkpoint is up, but it still moves the clock by 1 s
    expect((await storage.get(['session'])).session?.swipeCount).toBe(10);

    clock += 2500;
    overlay.button('continue').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.isVisible()).toBe(false);

    const log = await events();
    expect(log.map((e) => e.type)).toEqual(['session_start', 'trigger', 'choice']);
    expect(log[1]).toMatchObject({ type: 'trigger', mode: 'B', swipeCount: 10, platform: 'tiktok' });
    expect(log[2]).toMatchObject({ type: 'choice', choice: 'continue', latencyMs: 3500 });

    await swipe(10);
    expect(overlay.isVisible()).toBe(true);
    expect((await storage.get(['session'])).session?.swipeCount).toBe(20);
  });

  test("mode B: I'm done logs the choice, ends the session and asks the background to navigate", async () => {
    await boot();
    await swipe(10);
    clock += 900;
    overlay.button('stop').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(overlay.isVisible()).toBe(false);
    expect((await storage.get(['session'])).session).toBeNull();
    const log = await events();
    expect(log.map((e) => e.type)).toEqual(['session_start', 'trigger', 'choice', 'session_end']);
    expect(log[2]).toMatchObject({ choice: 'stop', latencyMs: 900 });
    expect(log[3]).toMatchObject({ type: 'session_end', swipes: 10, reason: 'stop' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'navigateToStopped', swipes: 10 });
  });

  test('mode A: trigger shows a lockout without buttons; when it ends the session closes', async () => {
    await boot({ mode: 'A', cooldownMinutes: 2 });
    await swipe(10);
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.content?.querySelectorAll('button')).toHaveLength(0);
    expect(overlay.content?.textContent).toContain('The feed is paused');

    await swipe(3);
    expect((await storage.get(['session'])).session?.swipeCount).toBe(10);

    clock += 2 * MINUTE;
    await vi.advanceTimersByTimeAsync(1000);
    expect(overlay.isVisible()).toBe(false);
    expect((await storage.get(['session'])).session).toBeNull();
    expect((await events()).at(-1)).toMatchObject({ type: 'session_end', reason: 'cooldown', swipes: 10 });
  });

  test('mode A: a lock still active on load is shown immediately', async () => {
    const lockedUntil = new Date(T0 + MINUTE).toISOString();
    await boot({ mode: 'A' }, {
      session: { sessionId: 'old', startedAt: new Date(T0 - 5000).toISOString(), lastSwipeAt: new Date(T0 - 1000).toISOString(), swipeCount: 10, swipesSinceCheckpoint: 0, triggerCount: 1, lockedUntil },
    });
    expect(overlay.isVisible()).toBe(true);
  });

  test('mode C: trigger is logged and nothing is shown', async () => {
    await boot({ mode: 'C' });
    await swipe(10);
    expect(overlay.isVisible()).toBe(false);
    expect((await events()).map((e) => e.type)).toEqual(['session_start', 'trigger']);
  });

  test('watching a video to the end and swiping onward does not count against the threshold', async () => {
    await boot();
    await swipe(9); // nine real skips
    expect(overlay.isVisible()).toBe(false);
    await swipe(20, false); // twenty swipes onward after finishing each video, not skips
    expect(overlay.isVisible()).toBe(false);
    expect((await storage.get(['session'])).session?.swipeCount).toBe(9);

    await swipe(1); // the tenth real skip
    expect(overlay.isVisible()).toBe(true);
    const log = await events();
    expect(log.map((e) => e.type)).toEqual(['session_start', 'trigger']);
    expect(log[1]).toMatchObject({ swipeCount: 10 });
  });

  test('the example from the request: 8 real skips among 30 total videos never show the checkpoint', async () => {
    await boot();
    await swipe(8, true);
    await swipe(22, false);
    expect(overlay.isVisible()).toBe(false);
    expect((await storage.get(['session'])).session?.swipeCount).toBe(8);
    expect(await events()).toEqual([{ type: 'session_start', at: expect.any(String), sessionId: 's1', platform: 'tiktok' }]);
  });

  test('a disabled platform is ignored entirely', async () => {
    await boot({ platforms: { tiktok: false, instagram: true, youtube: true } });
    await swipe(12);
    expect((await storage.get(['session'])).session).toBeUndefined();
    expect(await events()).toEqual([]);
  });

  test('a stale session on load is closed with an idle session_end', async () => {
    await boot({}, {
      session: { sessionId: 'old', startedAt: new Date(T0 - 20 * MINUTE).toISOString(), lastSwipeAt: new Date(T0 - 10 * MINUTE).toISOString(), swipeCount: 6, swipesSinceCheckpoint: 6, triggerCount: 0, lockedUntil: null },
    });
    expect((await storage.get(['session'])).session).toBeNull();
    expect(await events()).toMatchObject([{ type: 'session_end', sessionId: 'old', swipes: 6, reason: 'idle', durationMs: 10 * MINUTE }]);
  });

  test('the idle timer closes a session left open in a tab', async () => {
    await boot({ idleGapMinutes: 1 });
    await swipe(3);
    clock += MINUTE + 2000;
    await vi.advanceTimersByTimeAsync(MINUTE + 2000);
    expect((await storage.get(['session'])).session).toBeNull();
    expect((await events()).at(-1)).toMatchObject({ type: 'session_end', swipes: 3, reason: 'idle' });
  });

  test('switching mode from A to B in another tab lifts the lock and hides the lockout', async () => {
    await boot({ mode: 'A' });
    await swipe(10);
    expect(overlay.isVisible()).toBe(true);

    await storage.set({ settings: { ...DEFAULT_SETTINGS, mode: 'B' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.isVisible()).toBe(false);
    expect((await storage.get(['session'])).session?.lockedUntil).toBeNull();
  });

  test('session state written by another tab is adopted', async () => {
    await boot();
    await swipe(2);
    await storage.set({ session: { sessionId: 'other', startedAt: new Date(clock).toISOString(), lastSwipeAt: new Date(clock).toISOString(), swipeCount: 8, swipesSinceCheckpoint: 8, triggerCount: 0, lockedUntil: null } });
    await swipe(2);
    expect(overlay.isVisible()).toBe(true);
    expect((await storage.get(['session'])).session?.swipeCount).toBe(10);
  });

  test('invalid stored settings fall back to defaults', async () => {
    storage = new InMemoryStorage({ settings: { mode: 'nope' } as unknown as Settings });
    controller = createController({ adapter: tiktok, storage, overlay, document, window, sendMessage, now: () => clock, warn: () => undefined, detectorFactory: () => detector });
    await controller.start();
    await swipe(10);
    expect(overlay.isVisible()).toBe(true);
  });
});

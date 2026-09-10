import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDetector, type CardChange } from '../../src/content/detector';
import { tiktok } from '../../src/content/platforms/tiktok';
import { youtube } from '../../src/content/platforms/youtube';
import { DEDUPE_WINDOW_MS, GESTURE_WINDOW_MS, URL_POLL_INTERVAL_MS } from '../../src/shared/constants';

type Callback = (entries: IntersectionObserverEntry[]) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<Element>();
  constructor(public callback: Callback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  fire(entries: Array<{ target: Element; ratio: number }>) {
    this.callback(entries.map((e) => ({ target: e.target, intersectionRatio: e.ratio })) as IntersectionObserverEntry[]);
  }
}

function setUrl(path: string) {
  window.history.pushState({}, '', path);
}

function addVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  document.body.appendChild(video);
  return video;
}

/** Simulates the one input a real skip always has: a wheel, touch or arrow-key gesture. */
function gesture(): void {
  window.dispatchEvent(new Event('wheel'));
}

describe('createDetector', () => {
  let changes: CardChange[];
  let clock: number;
  let active: ReturnType<typeof createDetector> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    changes = [];
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    document.body.innerHTML = '';
    setUrl('/@a/video/1');
  });

  afterEach(() => {
    active?.stop();
    active = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function build(adapter = tiktok) {
    const detector = createDetector({ adapter, window, document, onCardChange: (c) => changes.push(c), now: () => clock });
    detector.start();
    active = detector;
    return detector;
  }

  function io() { return FakeIntersectionObserver.instances[0]!; }

  test('URL id change on popstate emits one url change and the initial id is a baseline', () => {
    build();
    expect(changes).toEqual([]);
    gesture();
    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes).toEqual([{ source: 'url', id: '2' }]);
  });

  test('URL changes are picked up by polling when no event fires', () => {
    build();
    gesture();
    setUrl('/@a/video/3');
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS);
    expect(changes).toEqual([{ source: 'url', id: '3' }]);
  });

  test('yt-navigate-finish is honoured for youtube', () => {
    setUrl('/shorts/aaa');
    build(youtube);
    gesture();
    setUrl('/shorts/bbb');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    expect(changes).toEqual([{ source: 'url', id: 'bbb' }]);
  });

  test('same URL id repeated does not emit; going back to a previous id does', () => {
    build();
    gesture();
    setUrl('/@a/video/1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes).toEqual([]);
    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    clock += DEDUPE_WINDOW_MS + 1;
    gesture();
    setUrl('/@a/video/1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes.map((c) => c.id)).toEqual(['2', '1']);
  });

  test('nothing is emitted while off a recognised surface', () => {
    build();
    gesture();
    setUrl('/@a');
    window.dispatchEvent(new PopStateEvent('popstate'));
    const v1 = addVideo();
    const v2 = addVideo();
    vi.runOnlyPendingTimers();
    io().fire([{ target: v1, ratio: 1 }]);
    gesture();
    io().fire([{ target: v1, ratio: 0 }, { target: v2, ratio: 1 }]);
    expect(changes).toEqual([]);
  });

  test('dominant video change emits a video change after a baseline is set', async () => {
    build();
    const v1 = addVideo();
    const v2 = addVideo();
    await vi.advanceTimersByTimeAsync(0);
    expect(io().observed.has(v1)).toBe(true);
    expect(io().observed.has(v2)).toBe(true);

    io().fire([{ target: v1, ratio: 1 }, { target: v2, ratio: 0 }]);
    expect(changes).toEqual([]);
    gesture();
    io().fire([{ target: v1, ratio: 0.2 }, { target: v2, ratio: 0.8 }]);
    expect(changes).toEqual([{ source: 'video', id: 'v2' }]);
  });

  test('a momentary state with no dominant video does not break the transition', async () => {
    build();
    const v1 = addVideo();
    const v2 = addVideo();
    await vi.advanceTimersByTimeAsync(0);
    gesture();
    io().fire([{ target: v1, ratio: 1 }]);
    io().fire([{ target: v1, ratio: 0.4 }, { target: v2, ratio: 0.3 }]);
    io().fire([{ target: v2, ratio: 0.9 }]);
    expect(changes).toEqual([{ source: 'video', id: 'v2' }]);
  });

  test('the second source inside the dedupe window is suppressed, outside it counts', async () => {
    build();
    const v1 = addVideo();
    const v2 = addVideo();
    const v3 = addVideo();
    await vi.advanceTimersByTimeAsync(0);
    io().fire([{ target: v1, ratio: 1 }]);

    gesture();
    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    clock += 100;
    io().fire([{ target: v1, ratio: 0 }, { target: v2, ratio: 1 }]);
    expect(changes).toEqual([{ source: 'url', id: '2' }]);

    clock += DEDUPE_WINDOW_MS;
    gesture();
    io().fire([{ target: v2, ratio: 0 }, { target: v3, ratio: 1 }]);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual({ source: 'video', id: 'v3' });
  });

  test('videos removed from the DOM are forgotten and pre-existing videos are observed at start', async () => {
    const existing = addVideo();
    build();
    expect(io().observed.has(existing)).toBe(true);
    const wrapper = document.createElement('div');
    const inner = document.createElement('video');
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
    await vi.advanceTimersByTimeAsync(0);
    expect(io().observed.has(inner)).toBe(true);
    wrapper.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(io().observed.has(inner)).toBe(false);
  });

  test('stop disconnects everything, including the gesture listeners', () => {
    const detector = build();
    gesture();
    detector.stop();
    gesture(); // should have no lingering effect either
    setUrl('/@a/video/9');
    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS * 4);
    expect(changes).toEqual([]);
    expect(io().observed.size).toBe(0);
  });

  describe('gesture gate: distinguishing a real skip from a clip looping in place', () => {
    test('a card change with no preceding gesture is ignored, e.g. a clip looping via a replaced <video>', async () => {
      build();
      const v1 = addVideo();
      await vi.advanceTimersByTimeAsync(0);
      gesture();
      io().fire([{ target: v1, ratio: 1 }]); // baseline, no gesture needed to establish it

      // The clip finishes and the player swaps in a fresh element to loop it, with no
      // wheel/touch/key event anywhere near this moment.
      clock += 8000; // clip played out for 8s with no further input
      const v1Replay = addVideo();
      v1.remove();
      await vi.advanceTimersByTimeAsync(0);
      io().fire([{ target: v1, ratio: 0 }, { target: v1Replay, ratio: 1 }]);
      expect(changes).toEqual([]);

      // A real swipe right after is still picked up correctly.
      const v2 = addVideo();
      await vi.advanceTimersByTimeAsync(0);
      gesture();
      io().fire([{ target: v1Replay, ratio: 0 }, { target: v2, ratio: 1 }]);
      expect(changes).toEqual([{ source: 'video', id: 'v3' }]);
    });

    test('a gesture followed by a change outside the gesture window is ignored', () => {
      build();
      gesture();
      clock += GESTURE_WINDOW_MS + 1;
      setUrl('/@a/video/2');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(changes).toEqual([]);
    });

    test('a change right at the edge of the gesture window still counts', () => {
      build();
      gesture();
      clock += GESTURE_WINDOW_MS;
      setUrl('/@a/video/2');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(changes).toEqual([{ source: 'url', id: '2' }]);
    });

    test('ArrowDown and ArrowUp count as a gesture; an unrelated key does not', () => {
      build();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      setUrl('/@a/video/2');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(changes).toEqual([]);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      setUrl('/@a/video/3');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(changes).toEqual([{ source: 'url', id: '3' }]);
    });

    test("a loop happening moments after a real swipe does not ride on that swipe's gesture", async () => {
      // A real swipe lands on a short clip that loops inside the gesture window
      // (well before GESTURE_WINDOW_MS elapses). The loop must not be mistaken
      // for a second swipe just because a real gesture happened recently — the
      // gesture that caused the first swipe should not still be "available" to
      // authorise an unrelated change moments later.
      build();
      const v1 = addVideo();
      const v2 = addVideo();
      await vi.advanceTimersByTimeAsync(0);
      gesture();
      io().fire([{ target: v1, ratio: 1 }]); // baseline, no emit

      gesture();
      io().fire([{ target: v1, ratio: 0 }, { target: v2, ratio: 1 }]); // the real swipe
      expect(changes).toEqual([{ source: 'video', id: 'v2' }]);

      clock += 300; // the clip on v2 finishes and loops well inside the gesture window
      const v2Replay = addVideo();
      v2.remove();
      await vi.advanceTimersByTimeAsync(0);
      io().fire([{ target: v2, ratio: 0 }, { target: v2Replay, ratio: 1 }]);
      expect(changes).toEqual([{ source: 'video', id: 'v2' }]); // unchanged: the loop was rejected
    });

    test('touchmove and touchend each count as a gesture', () => {
      build();
      window.dispatchEvent(new Event('touchmove'));
      setUrl('/@a/video/2');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new Event('touchend'));
      setUrl('/@a/video/3');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(changes.map((c) => c.id)).toEqual(['2', '3']);
    });
  });
});

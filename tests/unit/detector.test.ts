import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDetector, type CardChange } from '../../src/content/detector';
import { tiktok } from '../../src/content/platforms/tiktok';
import { youtube } from '../../src/content/platforms/youtube';
import { DEDUPE_WINDOW_MS, URL_POLL_INTERVAL_MS } from '../../src/shared/constants';

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
    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes).toEqual([{ source: 'url', id: '2' }]);
  });

  test('URL changes are picked up by polling when no event fires', () => {
    build();
    setUrl('/@a/video/3');
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS);
    expect(changes).toEqual([{ source: 'url', id: '3' }]);
  });

  test('yt-navigate-finish is honoured for youtube', () => {
    setUrl('/shorts/aaa');
    build(youtube);
    setUrl('/shorts/bbb');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    expect(changes).toEqual([{ source: 'url', id: 'bbb' }]);
  });

  test('same URL id repeated does not emit; going back to a previous id does', () => {
    build();
    setUrl('/@a/video/1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes).toEqual([]);
    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    clock += DEDUPE_WINDOW_MS + 1;
    setUrl('/@a/video/1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(changes.map((c) => c.id)).toEqual(['2', '1']);
  });

  test('nothing is emitted while off a recognised surface', () => {
    build();
    setUrl('/@a');
    window.dispatchEvent(new PopStateEvent('popstate'));
    const v1 = addVideo();
    const v2 = addVideo();
    vi.runOnlyPendingTimers();
    io().fire([{ target: v1, ratio: 1 }]);
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
    io().fire([{ target: v1, ratio: 0.2 }, { target: v2, ratio: 0.8 }]);
    expect(changes).toEqual([{ source: 'video', id: 'v2' }]);
  });

  test('a momentary state with no dominant video does not break the transition', async () => {
    build();
    const v1 = addVideo();
    const v2 = addVideo();
    await vi.advanceTimersByTimeAsync(0);
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

    setUrl('/@a/video/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    clock += 100;
    io().fire([{ target: v1, ratio: 0 }, { target: v2, ratio: 1 }]);
    expect(changes).toEqual([{ source: 'url', id: '2' }]);

    clock += DEDUPE_WINDOW_MS;
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

  test('stop disconnects everything', () => {
    const detector = build();
    detector.stop();
    setUrl('/@a/video/9');
    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS * 4);
    expect(changes).toEqual([]);
    expect(io().observed.size).toBe(0);
  });
});

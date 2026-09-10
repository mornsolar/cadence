/**
 * Emits one 'card-change' per completed transition to a different content card.
 * Two sources: the URL's content id, and the <video> that dominates the viewport.
 * A change from either counts; the other source is ignored inside the dedupe window.
 *
 * A change only counts if it follows a scroll, swipe or arrow-key gesture within
 * GESTURE_WINDOW_MS. Without that, a clip that finishes and loops back to itself
 * (TikTok and YouTube Shorts do this instead of auto-advancing) looks identical to
 * a real skip: some players swap in a fresh <video> element to loop it, which reads
 * as a "dominant video changed" event with nothing else to distinguish it.
 *
 * Every change also carries `wasSkip`: whether the video being left had already
 * played through at least once. These platforms require a swipe to move on even
 * after a clip finishes, so "swiped away" alone doesn't mean "skipped" — only
 * leaving before the clip ends does. The dominant video is watched for its `ended`
 * event (and, as a fallback for players that loop via the native `loop` attribute
 * and never fire it, for its playback position nearing the end) for exactly this.
 */
import { DEDUPE_WINDOW_MS, FINISH_NEAR_END_S, GESTURE_WINDOW_MS, URL_POLL_INTERVAL_MS } from '../shared/constants';
import type { PlatformAdapter } from './platforms/types';

export type CardChangeSource = 'url' | 'video';

export interface CardChange {
  readonly source: CardChangeSource;
  readonly id: string;
  /** False if the video being left had already played through once; not a skip. */
  readonly wasSkip: boolean;
}

export interface DetectorDeps {
  readonly adapter: PlatformAdapter;
  readonly window: Window & typeof globalThis;
  readonly document: Document;
  readonly onCardChange: (change: CardChange) => void;
  readonly now?: () => number;
}

export interface Detector {
  start(): void;
  stop(): void;
}

const DOMINANT_RATIO = 0.5;

/** Keys that move to the next or previous card; a plain Space or Enter is a play/pause toggle, not navigation. */
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']);

export function createDetector(deps: DetectorDeps): Detector {
  const { adapter, window, document, onCardChange } = deps;
  const now = deps.now ?? (() => Date.now());

  let lastUrlId: string | null = null;
  let lastDominant: Element | null = null;
  let lastEmit: { at: number; source: CardChangeSource } | null = null;
  let lastGestureAt = -Infinity;
  let pollHandle: number | null = null;
  let intersection: IntersectionObserver | null = null;
  let mutation: MutationObserver | null = null;
  const ratios = new Map<Element, number>();
  const videoIds = new WeakMap<Element, string>();
  let nextVideoId = 0;

  // Tracks whether the currently-dominant video has played through at least once,
  // so the next transition away from it can be classified as a skip or not.
  let watchedVideo: HTMLVideoElement | null = null;
  let currentVideoFinished = false;

  function currentUrl(): URL {
    return new URL(window.location.href);
  }

  function markGesture(): void {
    lastGestureAt = now();
  }

  function onWheel(): void {
    markGesture();
  }

  function onTouchProgress(): void {
    markGesture();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (NAV_KEYS.has(event.key)) markGesture();
  }

  function onVideoEnded(): void {
    currentVideoFinished = true;
  }

  function onVideoTimeUpdate(): void {
    const video = watchedVideo;
    if (video === null) return;
    const { currentTime, duration } = video;
    if (Number.isFinite(duration) && duration > 0 && currentTime >= duration - FINISH_NEAR_END_S) {
      currentVideoFinished = true;
    }
  }

  function attachWatchTracking(element: Element): void {
    if (!(element instanceof window.HTMLVideoElement)) return;
    watchedVideo = element;
    element.addEventListener('ended', onVideoEnded);
    element.addEventListener('timeupdate', onVideoTimeUpdate);
  }

  function detachWatchTracking(): void {
    if (watchedVideo === null) return;
    watchedVideo.removeEventListener('ended', onVideoEnded);
    watchedVideo.removeEventListener('timeupdate', onVideoTimeUpdate);
    watchedVideo = null;
  }

  function emit(source: CardChangeSource, id: string, wasFinished: boolean): void {
    if (!adapter.isSurface(currentUrl())) return;
    const at = now();
    if (at - lastGestureAt > GESTURE_WINDOW_MS) return;
    if (lastEmit !== null && lastEmit.source !== source && at - lastEmit.at < DEDUPE_WINDOW_MS) return;
    lastEmit = { at, source };
    // A gesture only authorises the one transition it caused. Consuming it here
    // means a clip that loops moments after a real swipe (short clips can loop
    // inside the gesture window) still needs its own gesture to count, rather
    // than riding on the swipe that brought the viewer to it.
    lastGestureAt = -Infinity;
    onCardChange({ source, id, wasSkip: !wasFinished });
  }

  function checkUrl(): void {
    const id = adapter.contentIdFromUrl(currentUrl());
    if (id === null || id === lastUrlId) return;
    const hadBaseline = lastUrlId !== null;
    lastUrlId = id;
    if (hadBaseline) emit('url', id, currentVideoFinished);
  }

  function videoId(element: Element): string {
    const existing = videoIds.get(element);
    if (existing !== undefined) return existing;
    nextVideoId += 1;
    const id = `v${nextVideoId}`;
    videoIds.set(element, id);
    return id;
  }

  function checkDominant(): void {
    let best: Element | null = null;
    let bestRatio = 0;
    ratios.forEach((ratio, element) => {
      if (ratio >= DOMINANT_RATIO && ratio > bestRatio) {
        best = element;
        bestRatio = ratio;
      }
    });
    if (best === null || best === lastDominant) return;
    const hadBaseline = lastDominant !== null;
    const leavingFinished = currentVideoFinished;
    detachWatchTracking();
    lastDominant = best;
    attachWatchTracking(best);
    currentVideoFinished = false;
    if (hadBaseline) emit('video', videoId(best), leavingFinished);
  }

  function observeVideo(element: Element): void {
    if (ratios.has(element)) return;
    ratios.set(element, 0);
    videoId(element);
    intersection?.observe(element);
  }

  function forgetVideo(element: Element): void {
    ratios.delete(element);
    intersection?.unobserve(element);
  }

  function scanVideos(root: ParentNode): void {
    root.querySelectorAll('video').forEach(observeVideo);
  }

  function onMutations(records: MutationRecord[]): void {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof window.Element)) return;
        if (node.tagName === 'VIDEO') observeVideo(node);
        else scanVideos(node);
      });
      record.removedNodes.forEach((node) => {
        if (!(node instanceof window.Element)) return;
        if (node.tagName === 'VIDEO') forgetVideo(node);
        else node.querySelectorAll('video').forEach(forgetVideo);
      });
    });
  }

  function onIntersections(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      if (ratios.has(entry.target)) ratios.set(entry.target, entry.intersectionRatio);
    });
    checkDominant();
  }

  function start(): void {
    lastUrlId = adapter.contentIdFromUrl(currentUrl());
    window.addEventListener('popstate', checkUrl);
    document.addEventListener('yt-navigate-finish', checkUrl);
    pollHandle = window.setInterval(checkUrl, URL_POLL_INTERVAL_MS);

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchmove', onTouchProgress, { passive: true });
    window.addEventListener('touchend', onTouchProgress, { passive: true });
    window.addEventListener('keydown', onKeydown);

    intersection = new window.IntersectionObserver(onIntersections, { threshold: [0, DOMINANT_RATIO, 1] });
    const observer = new window.MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    mutation = observer;
    scanVideos(document);
  }

  function stop(): void {
    window.removeEventListener('popstate', checkUrl);
    document.removeEventListener('yt-navigate-finish', checkUrl);
    if (pollHandle !== null) window.clearInterval(pollHandle);
    pollHandle = null;
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchmove', onTouchProgress);
    window.removeEventListener('touchend', onTouchProgress);
    window.removeEventListener('keydown', onKeydown);
    detachWatchTracking();
    intersection?.disconnect();
    mutation?.disconnect();
    intersection = null;
    mutation = null;
    ratios.clear();
  }

  return { start, stop };
}

/**
 * Emits one 'card-change' per completed transition to a different content card.
 * Two sources: the URL's content id, and the <video> that dominates the viewport.
 * A change from either counts; the other source is ignored inside the dedupe window.
 */
import { DEDUPE_WINDOW_MS, URL_POLL_INTERVAL_MS } from '../shared/constants';
import type { PlatformAdapter } from './platforms/types';

export type CardChangeSource = 'url' | 'video';

export interface CardChange {
  readonly source: CardChangeSource;
  readonly id: string;
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

export function createDetector(deps: DetectorDeps): Detector {
  const { adapter, window, document, onCardChange } = deps;
  const now = deps.now ?? (() => Date.now());

  let lastUrlId: string | null = null;
  let lastDominant: Element | null = null;
  let lastEmit: { at: number; source: CardChangeSource } | null = null;
  let pollHandle: number | null = null;
  let intersection: IntersectionObserver | null = null;
  let mutation: MutationObserver | null = null;
  const ratios = new Map<Element, number>();
  const videoIds = new WeakMap<Element, string>();
  let nextVideoId = 0;

  function currentUrl(): URL {
    return new URL(window.location.href);
  }

  function emit(source: CardChangeSource, id: string): void {
    if (!adapter.isSurface(currentUrl())) return;
    const at = now();
    if (lastEmit !== null && lastEmit.source !== source && at - lastEmit.at < DEDUPE_WINDOW_MS) return;
    lastEmit = { at, source };
    onCardChange({ source, id });
  }

  function checkUrl(): void {
    const id = adapter.contentIdFromUrl(currentUrl());
    if (id === null || id === lastUrlId) return;
    const hadBaseline = lastUrlId !== null;
    lastUrlId = id;
    if (hadBaseline) emit('url', id);
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
    lastDominant = best;
    if (hadBaseline) emit('video', videoId(best));
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
    intersection?.disconnect();
    mutation?.disconnect();
    intersection = null;
    mutation = null;
    ratios.clear();
  }

  return { start, stop };
}

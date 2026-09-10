import type { PlatformAdapter } from './types';

const FEED_PATHS = new Set(['/', '/foryou', '/following', '/explore', '/friends']);
const VIDEO_PATH = /^\/@[^/]+\/video\/(\d+)\/?$/;

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export const tiktok: PlatformAdapter = {
  id: 'tiktok',
  hostnames: ['www.tiktok.com', 'tiktok.com'],
  isSurface(url) {
    const path = normalize(url.pathname);
    return FEED_PATHS.has(path) || VIDEO_PATH.test(path);
  },
  contentIdFromUrl(url) {
    const match = VIDEO_PATH.exec(normalize(url.pathname));
    return match?.[1] ?? null;
  },
};

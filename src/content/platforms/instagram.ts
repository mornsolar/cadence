import type { PlatformAdapter } from './types';

const REELS_ROOT = /^\/reels\/?$/;
const REEL_PATH = /^\/reels?\/([A-Za-z0-9_-]+)\/?$/;

export const instagram: PlatformAdapter = {
  id: 'instagram',
  hostnames: ['www.instagram.com', 'instagram.com'],
  isSurface(url) {
    return REELS_ROOT.test(url.pathname) || REEL_PATH.test(url.pathname);
  },
  contentIdFromUrl(url) {
    const match = REEL_PATH.exec(url.pathname);
    return match?.[1] ?? null;
  },
};

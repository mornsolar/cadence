import type { PlatformAdapter } from './types';

const SHORTS_PATH = /^\/shorts\/([A-Za-z0-9_-]+)\/?$/;

export const youtube: PlatformAdapter = {
  id: 'youtube',
  hostnames: ['www.youtube.com', 'youtube.com', 'm.youtube.com'],
  isSurface(url) {
    return SHORTS_PATH.test(url.pathname) || /^\/shorts\/?$/.test(url.pathname);
  },
  contentIdFromUrl(url) {
    const match = SHORTS_PATH.exec(url.pathname);
    return match?.[1] ?? null;
  },
};

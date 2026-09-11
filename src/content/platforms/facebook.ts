import type { PlatformAdapter } from './types';

// Confirmed permalink format: facebook.com/reel/<id>. The exact path Facebook
// routes to when browsing the Reels tab itself (rather than a specific permalink)
// isn't independently confirmed here, so both the singular and plural root are
// accepted defensively, matching how the Instagram adapter handles the same
// ambiguity. If this turns out wrong, the extension simply stays inactive on
// Facebook rather than miscounting — worth checking against the live site.
const REEL_ROOT = /^\/reels?\/?$/;
const REEL_PATH = /^\/reel\/([A-Za-z0-9_-]+)\/?$/;

export const facebook: PlatformAdapter = {
  id: 'facebook',
  hostnames: ['www.facebook.com', 'facebook.com'],
  isSurface(url) {
    return REEL_ROOT.test(url.pathname) || REEL_PATH.test(url.pathname);
  },
  contentIdFromUrl(url) {
    const match = REEL_PATH.exec(url.pathname);
    return match?.[1] ?? null;
  },
};

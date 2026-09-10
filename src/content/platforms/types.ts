import type { PlatformId } from '../../shared/types';

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly hostnames: readonly string[];
  /** True when this URL is a swipeable short-form surface. */
  isSurface(url: URL): boolean;
  /** Stable id of the card currently at this URL, or null when the URL carries none. */
  contentIdFromUrl(url: URL): string | null;
}

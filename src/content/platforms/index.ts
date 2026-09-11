import { facebook } from './facebook';
import { instagram } from './instagram';
import { tiktok } from './tiktok';
import type { PlatformAdapter } from './types';
import { youtube } from './youtube';

export const ADAPTERS: readonly PlatformAdapter[] = [tiktok, instagram, youtube, facebook];

export function pickAdapter(url: URL): PlatformAdapter | null {
  return ADAPTERS.find((adapter) => adapter.hostnames.includes(url.hostname)) ?? null;
}

export type { PlatformAdapter } from './types';

/** Messages from the content script to the background script. */
export type BackgroundMessage =
  | { readonly type: 'navigateToStopped'; readonly swipes: number }
  | { readonly type: 'openOptions' };

export function stoppedPagePath(swipes: number): string {
  return `stopped/stopped.html?swipes=${encodeURIComponent(String(swipes))}`;
}

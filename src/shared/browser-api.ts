/**
 * Firefox exposes the promise-based API on `browser`; Chrome on `chrome`.
 * Both are close enough for the subset used here.
 */
export function getBrowserApi(): typeof chrome {
  const scope = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome };
  const api = scope.browser ?? scope.chrome;
  if (!api) {
    throw new Error('Cadence: no extension API available in this context');
  }
  return api;
}

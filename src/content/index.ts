import { getBrowserApi } from '../shared/browser-api';
import type { BackgroundMessage } from '../shared/messages';
import { createExtensionStorage } from '../shared/storage';
import { createController } from './controller';
import { createCounterBadge } from './overlay/counter';
import { createOverlayHost } from './overlay/host';
import { pickAdapter } from './platforms';

declare global {
  interface Window {
    __cadenceStarted?: boolean;
  }
}

function main(): void {
  if (window.__cadenceStarted) return;
  const adapter = pickAdapter(new URL(window.location.href));
  if (adapter === null) return;
  window.__cadenceStarted = true;

  const api = getBrowserApi();
  const controller = createController({
    adapter,
    storage: createExtensionStorage(api),
    overlay: createOverlayHost(document),
    counter: createCounterBadge(document),
    document,
    window,
    sendMessage: (message: BackgroundMessage) => api.runtime.sendMessage(message),
  });
  controller.start().catch((error: unknown) => console.error('Cadence: failed to start', error));
}

main();

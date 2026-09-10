/**
 * Shadow DOM host for the checkpoint and lockout views.
 * While shown it pauses playing videos, blocks feed input at the capture phase,
 * and keeps keyboard focus inside the dialog.
 */
import { OVERLAY_HOST_ID } from '../../shared/constants';
import { OVERLAY_CSS } from './styles';

export interface OverlayHost {
  show(content: HTMLElement): void;
  hide(): void;
  isVisible(): boolean;
}

const KEYS_ALLOWED_INSIDE = new Set(['Tab', 'Enter', ' ', 'Shift']);
const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function createOverlayHost(document: Document): OverlayHost {
  const window = document.defaultView as Window & typeof globalThis;
  let host: HTMLElement | null = null;
  let backdrop: HTMLElement | null = null;
  let pausedByUs: HTMLVideoElement[] = [];

  function isInsideDialog(event: Event): boolean {
    return host !== null && event.composedPath().includes(host);
  }

  function block(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isInsideDialog(event) && KEYS_ALLOWED_INSIDE.has(event.key)) {
      if (event.key === 'Tab') cycleFocus(event);
      return;
    }
    block(event);
  }

  function focusables(): HTMLElement[] {
    return backdrop === null ? [] : Array.from(backdrop.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  function cycleFocus(event: KeyboardEvent): void {
    const items = focusables();
    if (items.length === 0) return;
    const active = (backdrop?.getRootNode() as ShadowRoot | undefined)?.activeElement ?? null;
    const index = items.findIndex((item) => item === active);
    const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index >= items.length - 1 ? 0 : index + 1);
    event.preventDefault();
    items[next]?.focus();
  }

  function onFocusIn(event: FocusEvent): void {
    if (isInsideDialog(event)) return;
    focusables()[0]?.focus();
  }

  function onPlay(event: Event): void {
    const target = event.target;
    if (target instanceof window.HTMLVideoElement) target.pause();
  }

  function pauseVideos(): void {
    pausedByUs = Array.from(document.querySelectorAll('video')).filter((video) => !video.paused);
    pausedByUs.forEach((video) => video.pause());
  }

  function resumeVideos(): void {
    pausedByUs.forEach((video) => {
      if (video.isConnected) void video.play()?.catch(() => undefined);
    });
    pausedByUs = [];
  }

  function attachListeners(): void {
    window.addEventListener('wheel', block, { capture: true, passive: false });
    window.addEventListener('touchmove', block, { capture: true, passive: false });
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('play', onPlay, true);
  }

  function detachListeners(): void {
    window.removeEventListener('wheel', block, true);
    window.removeEventListener('touchmove', block, true);
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('play', onPlay, true);
  }

  function show(content: HTMLElement): void {
    if (host !== null) hide();
    host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.tabIndex = -1; // takes initial focus so neither choice looks pre-selected
    backdrop.appendChild(content);
    root.append(style, backdrop);
    document.body.appendChild(host);

    pauseVideos();
    attachListeners();
    window.requestAnimationFrame(() => backdrop?.setAttribute('data-state', 'shown'));
    backdrop.focus();
  }

  function hide(): void {
    if (host === null) return;
    detachListeners();
    host.remove();
    host = null;
    backdrop = null;
    resumeVideos();
  }

  return { show, hide, isVisible: () => host !== null };
}

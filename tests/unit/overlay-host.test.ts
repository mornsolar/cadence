import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOverlayHost } from '../../src/content/overlay/host';
import { OVERLAY_HOST_ID } from '../../src/shared/constants';

function dialogWithButtons(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.innerHTML = '<button id="one">one</button><button id="two">two</button>';
  return dialog;
}

function shadow(): ShadowRoot {
  return document.getElementById(OVERLAY_HOST_ID)!.shadowRoot!;
}

describe('overlay host', () => {
  let overlay: ReturnType<typeof createOverlayHost>;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    overlay = createOverlayHost(document);
  });
  afterEach(() => {
    overlay.hide();
    vi.unstubAllGlobals();
  });

  test('show mounts a shadow host with the content and marks it shown; hide removes it', () => {
    overlay.show(dialogWithButtons());

    expect(overlay.isVisible()).toBe(true);
    expect(shadow().querySelector('.backdrop')?.getAttribute('data-state')).toBe('shown');
    expect(shadow().querySelector('#one')).not.toBeNull();

    overlay.hide();
    expect(overlay.isVisible()).toBe(false);
    expect(document.getElementById(OVERLAY_HOST_ID)).toBeNull();
  });

  test('wheel and arrow keys are blocked while shown and pass through after hide', () => {
    overlay.show(dialogWithButtons());

    const wheel = new WheelEvent('wheel', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);

    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
    document.body.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);

    overlay.hide();
    const after = new WheelEvent('wheel', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  test('Enter inside the dialog is allowed, Escape is not', () => {
    overlay.show(dialogWithButtons());
    const button = shadow().querySelector('#one')!;

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true, composed: true });
    button.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true, composed: true });
    button.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  test('initial focus sits on the container so no choice looks pre-selected; Tab cycles and wraps', () => {
    overlay.show(dialogWithButtons());
    const backdrop = shadow().querySelector<HTMLElement>('.backdrop')!;
    const one = shadow().querySelector<HTMLElement>('#one')!;
    const two = shadow().querySelector<HTMLElement>('#two')!;
    expect(shadow().activeElement).toBe(backdrop);

    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }));
    expect(shadow().activeElement).toBe(one);

    one.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }));
    expect(shadow().activeElement).toBe(two);
    two.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }));
    expect(shadow().activeElement).toBe(one);
    one.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
    expect(shadow().activeElement).toBe(two);
  });

  test('focus leaving the dialog is pulled back in', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    overlay.show(dialogWithButtons());

    outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(shadow().activeElement).toBe(shadow().querySelector('#one'));
  });

  test('playing videos are paused on show, kept paused, and resumed on hide', () => {
    const video = document.createElement('video');
    let paused = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.pause = vi.fn(() => { paused = true; });
    video.play = vi.fn(() => { paused = false; return Promise.resolve(); });
    document.body.appendChild(video);

    overlay.show(dialogWithButtons());
    expect(video.pause).toHaveBeenCalledTimes(1);

    paused = false;
    video.dispatchEvent(new Event('play', { bubbles: true }));
    expect(video.pause).toHaveBeenCalledTimes(2);

    overlay.hide();
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  test('showing twice replaces the first dialog', () => {
    overlay.show(dialogWithButtons());
    const second = document.createElement('p');
    second.textContent = 'second';
    overlay.show(second);
    expect(document.querySelectorAll(`#${OVERLAY_HOST_ID}`)).toHaveLength(1);
    expect(shadow().querySelector('p')?.textContent).toBe('second');
  });
});

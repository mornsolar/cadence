import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCounterBadge } from '../../src/content/overlay/counter';

const HOST_ID = 'cadence-counter';

function shadow(): ShadowRoot {
  return document.getElementById(HOST_ID)!.shadowRoot!;
}

describe('createCounterBadge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.getElementById(HOST_ID)?.remove();
  });

  test('show mounts a bare "count / threshold" badge, decorative and non-blocking', () => {
    const badge = createCounterBadge(document);
    badge.show(6, 10);

    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    const label = shadow().querySelector('.badge')!;
    expect(label.textContent).toBe('6 / 10');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(shadow().querySelectorAll('button')).toHaveLength(0);
  });

  test('a second show updates the existing badge rather than mounting a new one', () => {
    const badge = createCounterBadge(document);
    badge.show(6, 10);
    badge.show(7, 10);

    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
    expect(shadow().querySelector('.badge')?.textContent).toBe('7 / 10');
  });

  test('hide removes the badge entirely', () => {
    const badge = createCounterBadge(document);
    badge.show(3, 10);
    badge.hide();
    expect(document.getElementById(HOST_ID)).toBeNull();
  });

  test('hide with nothing shown is a no-op', () => {
    const badge = createCounterBadge(document);
    expect(() => badge.hide()).not.toThrow();
  });

  test('showing again after a hide remounts cleanly', () => {
    const badge = createCounterBadge(document);
    badge.show(1, 10);
    badge.hide();
    badge.show(2, 10);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
    expect(shadow().querySelector('.badge')?.textContent).toBe('2 / 10');
  });
});

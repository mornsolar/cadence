import { expect, test } from '@playwright/test';
import { launch, type Harness } from './extension';

const OVERLAY = '#cadence-host .backdrop';
const DEFAULTS = { mode: 'B', swipeThreshold: 10, idleGapMinutes: 5, cooldownMinutes: 5, platforms: { tiktok: true, instagram: true, youtube: true, facebook: true } };

let harness: Harness;

test.beforeEach(async () => {
  harness = await launch();
  await harness.setStorage({ settings: DEFAULTS, session: null, events: [] });
});

test.afterEach(async () => {
  await harness.close();
});

async function swipe(times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await harness.page.mouse.wheel(0, 600);
    await harness.page.waitForTimeout(60);
  }
}

type FixtureWindow = Window & { __cadenceFixture: { finishCurrentVideo(): void; loopCurrentVideo(): void } };

/** Watches the current card through to the end, then swipes onward — not a skip. */
async function watchToEndAndSwipe(times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await harness.page.evaluate(() => (window as unknown as FixtureWindow).__cadenceFixture.finishCurrentVideo());
    await harness.page.mouse.wheel(0, 600);
    await harness.page.waitForTimeout(60);
  }
}

async function open(url: string): Promise<void> {
  await harness.page.goto(url);
  await harness.page.waitForTimeout(300);
}

test('mode B: the tenth swipe shows the checkpoint, blocks the feed, and Keep going resumes it', async () => {
  await open('https://www.tiktok.com/foryou');
  await swipe(9);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);

  await swipe(1);
  const overlay = harness.page.locator(OVERLAY);
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Is this what you meant to be doing?');
  await expect(overlay.getByRole('button')).toHaveText(['Keep going', "I'm done"]);

  const urlBefore = harness.page.url();
  await swipe(3);
  expect(harness.page.url()).toBe(urlBefore);

  await overlay.getByRole('button', { name: 'Keep going' }).click();
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);

  await swipe(1);
  expect(harness.page.url()).not.toBe(urlBefore);
  await swipe(9);
  await expect(harness.page.locator(OVERLAY)).toBeVisible();

  const events = (await harness.getStorage<Array<{ type: string; choice?: string }>>('events')) ?? [];
  expect(events.map((e) => e.type)).toEqual(['session_start', 'trigger', 'choice', 'trigger']);
  expect(events[2]?.choice).toBe('continue');
});

test('a clip looping in place is never counted as a swipe, even soon after a real one', async () => {
  await open('https://www.tiktok.com/foryou');
  await swipe(5);
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(5);

  // Simulate the clip finishing and looping via a replaced <video> element —
  // what TikTok and YouTube Shorts actually do instead of auto-advancing —
  // several times, with no wheel/touch/key event anywhere near it, including
  // right after the real swipes above (the tightest case for the gesture gate).
  for (let i = 0; i < 4; i += 1) {
    await harness.page.evaluate(() => (window as unknown as { __cadenceFixture: { loopCurrentVideo(): void } }).__cadenceFixture.loopCurrentVideo());
    await harness.page.waitForTimeout(120);
  }
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(5);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);

  // A real swipe right after is still picked up correctly.
  await swipe(5);
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(10);
  await expect(harness.page.locator(OVERLAY)).toBeVisible();
});

test('watching a video through and swiping onward does not count against the limit', async () => {
  await open('https://www.tiktok.com/foryou');
  await swipe(9);
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(9);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);

  // Twenty videos, each watched to the end before swiping onward — the platform's
  // required way to move on, not a skip.
  await watchToEndAndSwipe(20);
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(9);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);

  await swipe(1); // the tenth real skip
  await expect(harness.page.locator(OVERLAY)).toBeVisible();
  const events = (await harness.getStorage<Array<{ type: string; swipeCount?: number }>>('events')) ?? [];
  expect(events.map((e) => e.type)).toEqual(['session_start', 'trigger']);
  expect(events[1]?.swipeCount).toBe(10);
});

test('the example from the request: 8 real skips among 30 total videos never show the checkpoint', async () => {
  await open('https://www.tiktok.com/foryou');
  await swipe(8);
  await watchToEndAndSwipe(22);
  expect((await harness.getStorage<{ swipeCount: number }>('session'))?.swipeCount).toBe(8);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);
});

test("mode B: I'm done lands on the quiet stopped page with the swipe count", async () => {
  await open('https://www.tiktok.com/foryou');
  await swipe(10);
  await harness.page.locator(OVERLAY).getByRole('button', { name: "I'm done" }).click();

  await harness.page.waitForURL(`chrome-extension://${harness.extensionId}/stopped/stopped.html?swipes=10`);
  await expect(harness.page.locator('#line')).toHaveText('You stopped after 10 swipes.');
  await expect(harness.page.locator('#comparison')).toHaveText('');

  const events = (await harness.getStorage<Array<{ type: string; reason?: string }>>('events')) ?? [];
  expect(events.map((e) => e.type)).toEqual(['session_start', 'trigger', 'choice', 'session_end']);
  expect(events[3]?.reason).toBe('stop');
});

test('mode A: the trigger shows a lockout with no choices', async () => {
  await harness.setStorage({ settings: { ...DEFAULTS, mode: 'A' } });
  await open('https://www.tiktok.com/foryou');
  await swipe(10);
  const overlay = harness.page.locator(OVERLAY);
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('The feed is paused for a few minutes.');
  await expect(overlay).toContainText('left');
  await expect(overlay.getByRole('button')).toHaveCount(0);
});

test('mode C: nothing is shown but the trigger is recorded', async () => {
  await harness.setStorage({ settings: { ...DEFAULTS, mode: 'C' } });
  await open('https://www.tiktok.com/foryou');
  await swipe(12);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);
  const events = (await harness.getStorage<Array<{ type: string }>>('events')) ?? [];
  expect(events.map((e) => e.type)).toEqual(['session_start', 'trigger']);
});

test('a profile page is not a feed: scrolling there never counts', async () => {
  await open('https://www.tiktok.com/@someone');
  await swipe(15);
  await expect(harness.page.locator(OVERLAY)).toHaveCount(0);
  expect(await harness.getStorage('session')).toBeNull();
});

test('instagram reels, youtube shorts and facebook reels all trigger through the same path', async () => {
  await open('https://www.instagram.com/reels/');
  await swipe(10);
  await expect(harness.page.locator(OVERLAY)).toBeVisible();
  await harness.page.locator(OVERLAY).getByRole('button', { name: 'Keep going' }).click();

  await open('https://www.youtube.com/shorts/fix0000000');
  await swipe(10);
  await expect(harness.page.locator(OVERLAY)).toBeVisible();
  await harness.page.locator(OVERLAY).getByRole('button', { name: 'Keep going' }).click();

  await open('https://www.facebook.com/reel/9000000000000000');
  await swipe(10);
  await expect(harness.page.locator(OVERLAY)).toBeVisible();

  const session = await harness.getStorage<{ swipeCount: number }>('session');
  expect(session?.swipeCount).toBe(30);
});

test('the options page saves a mode change and records it', async () => {
  const options = await harness.context.newPage();
  await options.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
  await expect(options.locator('input[name="mode"][value="B"]')).toBeChecked();
  await expect(options.locator('#cooldown-field')).toBeHidden();

  await options.locator('input[name="mode"][value="A"]').check();
  await expect(options.locator('#cooldown-field')).toBeVisible();
  await options.locator('#swipeThreshold').fill('3');
  await options.locator('#swipeThreshold').dispatchEvent('change');

  await expect.poll(async () => (await harness.getStorage<{ mode: string; swipeThreshold: number }>('settings'))).toEqual({ ...DEFAULTS, mode: 'A', swipeThreshold: 3 });
  const events = (await harness.getStorage<Array<{ type: string; key?: string; from?: string; to?: string }>>('events')) ?? [];
  expect(events).toMatchObject([
    { type: 'mode_change', from: 'B', to: 'A' },
    { type: 'settings_change', key: 'swipeThreshold', from: '10', to: '3' },
  ]);

  await options.locator('#diaryText').fill('Less pull this week.');
  await options.locator('#diarySave').click();
  await expect(options.locator('#diaryEntries li')).toHaveCount(1);
  await expect(options.locator('#diaryStatus')).toHaveText('Saved.');
});

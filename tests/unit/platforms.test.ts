import { describe, expect, test } from 'vitest';
import { pickAdapter } from '../../src/content/platforms';
import { tiktok } from '../../src/content/platforms/tiktok';
import { instagram } from '../../src/content/platforms/instagram';
import { youtube } from '../../src/content/platforms/youtube';

const url = (s: string) => new URL(s);

describe('tiktok adapter', () => {
  test.each([
    ['https://www.tiktok.com/', true, null],
    ['https://www.tiktok.com/foryou', true, null],
    ['https://www.tiktok.com/foryou/', true, null],
    ['https://www.tiktok.com/following', true, null],
    ['https://www.tiktok.com/explore', true, null],
    ['https://www.tiktok.com/@someone/video/7301234567890123456', true, '7301234567890123456'],
    ['https://www.tiktok.com/@someone/video/7301234567890123456?lang=en', true, '7301234567890123456'],
    ['https://www.tiktok.com/@someone', false, null],
    ['https://www.tiktok.com/search?q=cats', false, null],
    ['https://www.tiktok.com/upload', false, null],
    ['https://www.tiktok.com/messages', false, null],
  ])('%s -> surface %s, id %s', (href, surface, id) => {
    expect(tiktok.isSurface(url(href))).toBe(surface);
    expect(tiktok.contentIdFromUrl(url(href))).toBe(id);
  });
});

describe('instagram adapter', () => {
  test.each([
    ['https://www.instagram.com/reels/', true, null],
    ['https://www.instagram.com/reels', true, null],
    ['https://www.instagram.com/reels/C9abcDEF_12/', true, 'C9abcDEF_12'],
    ['https://www.instagram.com/reel/C9abcDEF_12/', true, 'C9abcDEF_12'],
    ['https://www.instagram.com/', false, null],
    ['https://www.instagram.com/explore/', false, null],
    ['https://www.instagram.com/someone/', false, null],
    ['https://www.instagram.com/p/C9abcDEF_12/', false, null],
  ])('%s -> surface %s, id %s', (href, surface, id) => {
    expect(instagram.isSurface(url(href))).toBe(surface);
    expect(instagram.contentIdFromUrl(url(href))).toBe(id);
  });
});

describe('youtube adapter', () => {
  test.each([
    ['https://www.youtube.com/shorts/abcDEF12345', true, 'abcDEF12345'],
    ['https://www.youtube.com/shorts/abcDEF12345?feature=share', true, 'abcDEF12345'],
    ['https://www.youtube.com/shorts', true, null],
    ['https://www.youtube.com/watch?v=abcDEF12345', false, null],
    ['https://www.youtube.com/', false, null],
    ['https://www.youtube.com/feed/subscriptions', false, null],
    ['https://www.youtube.com/@channel/shorts', false, null],
  ])('%s -> surface %s, id %s', (href, surface, id) => {
    expect(youtube.isSurface(url(href))).toBe(surface);
    expect(youtube.contentIdFromUrl(url(href))).toBe(id);
  });
});

describe('pickAdapter', () => {
  test('matches by hostname', () => {
    expect(pickAdapter(url('https://www.tiktok.com/foryou'))?.id).toBe('tiktok');
    expect(pickAdapter(url('https://www.instagram.com/reels/'))?.id).toBe('instagram');
    expect(pickAdapter(url('https://www.youtube.com/shorts/x'))?.id).toBe('youtube');
  });
  test('returns null for other hosts', () => {
    expect(pickAdapter(url('https://example.com/shorts/x'))).toBeNull();
    expect(pickAdapter(url('https://tiktok.com.evil.example/'))).toBeNull();
  });
});

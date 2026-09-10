// Opens the built extension in a real, visible browser window using the
// Chromium binary Playwright downloaded for the e2e tests — no separate
// browser install required. Stays open until you close the window.
import { chromium } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXTENSION_DIR = path.resolve(import.meta.dirname, '../dist/chrome');

const SITES = {
  tiktok: 'https://www.tiktok.com/foryou',
  instagram: 'https://www.instagram.com/reels/',
  youtube: 'https://www.youtube.com/shorts',
};

const site = process.argv[2] ?? 'tiktok';
const url = SITES[site];
if (url === undefined) {
  console.error(`Unknown site "${site}". Choose one of: ${Object.keys(SITES).join(', ')}`);
  process.exit(1);
}

const userDataDir = await mkdtemp(path.join(tmpdir(), 'cadence-try-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
  ],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url);

console.log(`Cadence loaded. Browsing ${url}`);
console.log('Open the toolbar puzzle-piece menu, pin Cadence, and click it for settings.');
console.log('Close the browser window (or press Ctrl+C here) to exit.');

await new Promise((resolve) => context.on('close', resolve));

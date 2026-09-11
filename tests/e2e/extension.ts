import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXTENSION_DIR = path.resolve(import.meta.dirname, '../../dist/chrome');
const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/feed.html');
const HOSTS = [
  'https://www.tiktok.com/**',
  'https://www.instagram.com/**',
  'https://www.youtube.com/**',
  'https://www.facebook.com/**',
];

export interface Harness {
  readonly context: BrowserContext;
  readonly extensionId: string;
  readonly page: Page;
  setStorage(patch: Record<string, unknown>): Promise<void>;
  getStorage<T>(key: string): Promise<T | undefined>;
  close(): Promise<void>;
}

export async function launch(): Promise<Harness> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'cadence-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  for (const host of HOSTS) {
    await context.route(host, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
  }
  const worker: Worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();

  async function setStorage(patch: Record<string, unknown>): Promise<void> {
    await worker.evaluate((data) => chrome.storage.local.set(data), patch);
  }
  async function getStorage<T>(key: string): Promise<T | undefined> {
    const result = await worker.evaluate((k) => chrome.storage.local.get(k), key);
    return (result as Record<string, T>)[key];
  }
  async function close(): Promise<void> {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
  return { context, extensionId, page, setStorage, getStorage, close };
}

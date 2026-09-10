// Builds the extension for Chrome and Firefox into dist/<browser>.
// One esbuild pass per browser; the only difference is the manifest background block.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const BROWSERS = ['chrome', 'firefox'];
const FIREFOX_ID = 'cadence@local.invalid';

const ENTRY_POINTS = {
  'content/index': 'content/index.ts',
  'background/index': 'background/index.ts',
  'options/options': 'options/options.ts',
  'stopped/stopped': 'stopped/stopped.ts',
};

const STATIC_FILES = [
  'options/options.html',
  'options/options.css',
  'stopped/stopped.html',
  'stopped/stopped.css',
];

function manifestFor(browser, base) {
  const background =
    browser === 'firefox'
      ? { scripts: ['background/index.js'] }
      : { service_worker: 'background/index.js' };
  const extra =
    browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: FIREFOX_ID, strict_min_version: '121.0' } } }
      : {};
  return { ...base, background, ...extra };
}

async function buildFor(browser, base) {
  const out = path.join(DIST, browser);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  await build({
    entryPoints: Object.fromEntries(
      Object.entries(ENTRY_POINTS).map(([name, file]) => [name, path.join(SRC, file)]),
    ),
    outdir: out,
    bundle: true,
    format: 'iife',
    target: ['chrome120', 'firefox121'],
    sourcemap: false,
    minify: false,
    logLevel: 'warning',
  });

  await Promise.all(
    STATIC_FILES.map(async (file) => {
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await cp(path.join(SRC, file), path.join(out, file));
    }),
  );
  await cp(path.join(SRC, 'icons'), path.join(out, 'icons'), { recursive: true });
  await writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify(manifestFor(browser, base), null, 2),
  );
  console.log(`built ${browser} -> ${path.relative(ROOT, out)}`);
}

async function main() {
  const base = JSON.parse(await readFile(path.join(SRC, 'manifest.base.json'), 'utf8'));
  for (const browser of BROWSERS) {
    await buildFor(browser, base);
  }
}

main().catch((error) => {
  console.error('build failed:', error);
  process.exit(1);
});

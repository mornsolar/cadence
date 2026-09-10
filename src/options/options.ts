import { getBrowserApi } from '../shared/browser-api';
import { COPY } from '../shared/copy';
import { appendEvent, toCsv, toJson } from '../shared/events-log';
import { parseSettings, settingsDiff } from '../shared/settings';
import { createExtensionStorage, type StorageRepository } from '../shared/storage';
import { summarizeSessions } from '../shared/stats';
import type { LogEvent, Mode, PlatformId, Settings } from '../shared/types';

const MODES: readonly Mode[] = ['B', 'A', 'C'];
const PLATFORMS: ReadonlyArray<{ id: PlatformId; name: string }> = [
  { id: 'tiktok', name: 'TikTok' },
  { id: 'instagram', name: 'Instagram Reels' },
  { id: 'youtube', name: 'YouTube Shorts' },
];
const DIARY_ENTRIES_SHOWN = 12;
const NUMERIC_KEYS = ['swipeThreshold', 'idleGapMinutes', 'cooldownMinutes'] as const;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Cadence options: missing #${id}`);
  return node as T;
}

function renderModes(container: HTMLElement): void {
  container.replaceChildren(
    ...MODES.map((mode) => {
      const label = document.createElement('label');
      label.className = 'mode';
      label.innerHTML = `<input type="radio" name="mode" value="${mode}"><span class="name"></span><span class="description"></span>`;
      label.querySelector('.name')!.textContent = COPY.options.modeNames[mode];
      label.querySelector('.description')!.textContent = COPY.options.modes[mode];
      return label;
    }),
  );
}

function renderPlatforms(container: HTMLElement): void {
  container.replaceChildren(
    ...PLATFORMS.map(({ id, name }) => {
      const label = document.createElement('label');
      label.className = 'platform';
      label.innerHTML = `<input type="checkbox" name="platform" value="${id}"><span class="name"></span>`;
      label.querySelector('.name')!.textContent = name;
      return label;
    }),
  );
}

function fillForm(settings: Settings): void {
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
    input.checked = input.value === settings.mode;
  });
  NUMERIC_KEYS.forEach((key) => { el<HTMLInputElement>(key).value = String(settings[key]); });
  document.querySelectorAll<HTMLInputElement>('input[name="platform"]').forEach((input) => {
    input.checked = settings.platforms[input.value as PlatformId];
  });
  el('cooldown-field').hidden = settings.mode !== 'A';
}

function readForm(): unknown {
  const mode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value;
  const numbers = Object.fromEntries(NUMERIC_KEYS.map((key) => [key, Number(el<HTMLInputElement>(key).value)]));
  const platforms = Object.fromEntries(
    Array.from(document.querySelectorAll<HTMLInputElement>('input[name="platform"]')).map((input) => [input.value, input.checked]),
  );
  return { mode, ...numbers, platforms };
}

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderSummary(events: readonly LogEvent[]): void {
  const week = summarizeSessions(events, 7);
  const month = summarizeSessions(events, 28);
  el('summary7').textContent = week.sessions === 0 ? COPY.options.summaryNone : COPY.options.summary(week.sessions, week.medianSwipes, 7);
  el('summary28').textContent = month.sessions === 0 ? '' : COPY.options.summary(month.sessions, month.medianSwipes, 28);
}

function renderDiary(events: readonly LogEvent[]): void {
  const entries = events.filter((event) => event.type === 'diary').slice(-DIARY_ENTRIES_SHOWN).reverse();
  el('diaryEntries').replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = entry.at;
      time.textContent = new Date(entry.at).toLocaleDateString();
      item.append(time, document.createTextNode(entry.type === 'diary' ? entry.text : ''));
      return item;
    }),
  );
}

async function loadEvents(storage: StorageRepository): Promise<readonly LogEvent[]> {
  return (await storage.get(['events'])).events ?? [];
}

async function logEvents(storage: StorageRepository, additions: readonly LogEvent[]): Promise<void> {
  if (additions.length === 0) return;
  const events = await loadEvents(storage);
  await storage.set({ events: additions.reduce((list, event) => appendEvent(list, event), events) });
}

async function saveSettings(storage: StorageRepository, previous: Settings): Promise<Settings> {
  const { settings, problems } = parseSettings(readForm());
  el('problems').textContent = problems.map((problem) => problem.replace(/^[a-zA-Z.]+: /, '')).join(' ');
  const at = new Date().toISOString();
  const changes = settingsDiff(previous, settings).map((change): LogEvent =>
    change.key === 'mode'
      ? { type: 'mode_change', at, from: change.from as Mode, to: change.to as Mode }
      : { type: 'settings_change', at, key: change.key, from: change.from, to: change.to },
  );
  await storage.set({ settings });
  await logEvents(storage, changes);
  fillForm(settings);
  return settings;
}

async function main(): Promise<void> {
  const storage = createExtensionStorage(getBrowserApi());
  renderModes(el('modes'));
  renderPlatforms(el('platforms'));
  el('diary-prompt').textContent = COPY.diary.prompt;
  el('diarySave').textContent = COPY.diary.save;
  el('keep-logging-note').textContent = COPY.options.keepLoggingNote;

  const stored = await storage.get(['settings']);
  const parsed = parseSettings(stored.settings);
  let current = parsed.settings;
  fillForm(current);
  const events = await loadEvents(storage);
  renderSummary(events);
  renderDiary(events);

  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.addEventListener('change', () => {
      saveSettings(storage, current)
        .then((next) => { current = next; })
        .catch((error: unknown) => { el('problems').textContent = `Could not save: ${String(error)}`; });
    });
  });

  el('diarySave').addEventListener('click', () => {
    const textarea = el<HTMLTextAreaElement>('diaryText');
    const text = textarea.value.trim();
    if (text.length === 0) return;
    logEvents(storage, [{ type: 'diary', at: new Date().toISOString(), text }])
      .then(async () => {
        textarea.value = '';
        el('diaryStatus').textContent = COPY.diary.saved;
        renderDiary(await loadEvents(storage));
      })
      .catch((error: unknown) => { el('diaryStatus').textContent = `Could not save: ${String(error)}`; });
  });

  el('exportJson').addEventListener('click', () => {
    loadEvents(storage).then((list) => download(`cadence-${stamp()}.json`, toJson(list), 'application/json')).catch(console.error);
  });
  el('exportCsv').addEventListener('click', () => {
    loadEvents(storage).then((list) => download(`cadence-${stamp()}.csv`, toCsv(list), 'text/csv')).catch(console.error);
  });
  el('clearData').addEventListener('click', () => {
    if (!window.confirm(COPY.options.clearConfirm)) return;
    storage.set({ events: [], session: null })
      .then(() => { renderSummary([]); renderDiary([]); })
      .catch(console.error);
  });
}

main().catch((error: unknown) => {
  document.body.textContent = `Cadence could not load its settings: ${String(error)}`;
});

import { getBrowserApi } from '../shared/browser-api';
import { DEFAULT_SETTINGS, DIARY_ALARM_NAME, DIARY_PERIOD_MINUTES, SCHEMA_VERSION } from '../shared/constants';
import { COPY } from '../shared/copy';
import type { BackgroundMessage } from '../shared/messages';
import { stoppedPagePath } from '../shared/messages';
import { parseSettings } from '../shared/settings';

const api = getBrowserApi();

async function seedDefaults(): Promise<void> {
  const stored = await api.storage.local.get(['schemaVersion', 'settings', 'events']);
  const { settings, problems } = parseSettings(stored['settings']);
  problems.forEach((problem) => console.warn(`Cadence: repaired setting (${problem})`));
  await api.storage.local.set({
    schemaVersion: SCHEMA_VERSION,
    settings: stored['settings'] === undefined ? DEFAULT_SETTINGS : settings,
    events: Array.isArray(stored['events']) ? stored['events'] : [],
  });
}

async function ensureDiaryAlarm(): Promise<void> {
  const existing = await api.alarms.get(DIARY_ALARM_NAME);
  if (existing) return;
  await api.alarms.create(DIARY_ALARM_NAME, { periodInMinutes: DIARY_PERIOD_MINUTES, delayInMinutes: DIARY_PERIOD_MINUTES });
}

function openOptions(): void {
  api.runtime.openOptionsPage().catch((error: unknown) => console.error('Cadence: could not open options', error));
}

api.runtime.onInstalled.addListener(() => {
  seedDefaults()
    .then(ensureDiaryAlarm)
    .catch((error: unknown) => console.error('Cadence: install setup failed', error));
});

api.action.onClicked.addListener(openOptions);

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== DIARY_ALARM_NAME) return;
  api.notifications.create(DIARY_ALARM_NAME, {
    type: 'basic',
    iconUrl: api.runtime.getURL('icons/icon128.png'),
    title: COPY.diary.notificationTitle,
    message: COPY.diary.notificationBody,
  });
});

api.notifications.onClicked.addListener((id) => {
  if (id === DIARY_ALARM_NAME) openOptions();
});

api.runtime.onMessage.addListener((message: BackgroundMessage, sender) => {
  if (message.type === 'navigateToStopped') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return false;
    api.tabs
      .update(tabId, { url: api.runtime.getURL(stoppedPagePath(message.swipes)) })
      .catch((error: unknown) => console.error('Cadence: could not open the stopped page', error));
    return false;
  }
  if (message.type === 'openOptions') openOptions();
  return false;
});

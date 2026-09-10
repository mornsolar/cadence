/**
 * Wires the detector to the session reducer, persists state, and runs the
 * mode-specific effect (lockout, checkpoint, or nothing).
 */
import { MS_PER_MINUTE } from '../shared/constants';
import { appendEvent } from '../shared/events-log';
import { newSessionId } from '../shared/ids';
import type { BackgroundMessage } from '../shared/messages';
import { reduceSession, type SessionAction, type SessionEffect } from '../shared/session';
import { parseSettings } from '../shared/settings';
import type { StoragePatch, StorageRepository } from '../shared/storage';
import type { LogEvent, PlatformId, SessionState, Settings } from '../shared/types';
import { createDetector, type CardChange, type Detector, type DetectorDeps } from './detector';
import { renderCheckpoint } from './overlay/checkpoint';
import type { OverlayHost } from './overlay/host';
import { renderLockout, type LockoutView } from './overlay/lockout';
import type { PlatformAdapter } from './platforms/types';

export interface ControllerDeps {
  readonly adapter: PlatformAdapter;
  readonly storage: StorageRepository;
  readonly overlay: OverlayHost;
  readonly document: Document;
  readonly window: Window & typeof globalThis;
  readonly sendMessage: (message: BackgroundMessage) => Promise<unknown>;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly warn?: (message: string, ...detail: unknown[]) => void;
  readonly detectorFactory?: (deps: DetectorDeps) => Detector;
}

export interface Controller {
  start(): Promise<void>;
  stop(): void;
  onCardChange(change: CardChange): Promise<void>;
}

const IDLE_TIMER_SLACK_MS = 1000;

export function createController(deps: ControllerDeps): Controller {
  const { adapter, storage, overlay, document, window } = deps;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => newSessionId(now()));
  const warn = deps.warn ?? ((message, ...detail) => console.warn(`Cadence: ${message}`, ...detail));
  const detectorFactory = deps.detectorFactory ?? createDetector;

  let settings: Settings | null = null;
  let session: SessionState | null = null;
  let detector: Detector | null = null;
  let lockout: LockoutView | null = null;
  let idleTimer: number | null = null;
  let queue: Promise<void> = Promise.resolve();

  /** Serialises dispatches so two fast card changes cannot interleave their storage writes. */
  function enqueue(task: () => Promise<void>): Promise<void> {
    queue = queue.then(task, task);
    return queue;
  }

  async function log(event: LogEvent): Promise<void> {
    const { events = [] } = await storage.get(['events']);
    await storage.set({ events: appendEvent(events, event) });
  }

  function iso(): string {
    return new Date(now()).toISOString();
  }

  async function dispatch(action: SessionAction, platform: PlatformId): Promise<void> {
    if (settings === null) return;
    const result = reduceSession(session, action, { now: now(), settings, newId });
    if (result.state === session && result.effects.length === 0) return;
    session = result.state;
    await storage.set({ session });
    for (const effect of result.effects) {
      await runEffect(effect, platform);
    }
    scheduleIdleCheck();
  }

  async function runEffect(effect: SessionEffect, platform: PlatformId): Promise<void> {
    if (settings === null) return;
    switch (effect.type) {
      case 'sessionStarted':
        await log({ type: 'session_start', at: iso(), sessionId: effect.sessionId, platform: effect.platform });
        return;
      case 'sessionEnded':
        await log({
          type: 'session_end',
          at: effect.endedAt,
          sessionId: effect.sessionId,
          swipes: effect.swipes,
          durationMs: effect.durationMs,
          reason: effect.reason,
        });
        return;
      case 'trigger':
        await log({ type: 'trigger', at: iso(), sessionId: effect.sessionId, mode: settings.mode, swipeCount: effect.swipeCount, platform });
        showForMode(platform);
    }
  }

  function showForMode(platform: PlatformId): void {
    if (settings === null) return;
    if (settings.mode === 'A') showLockout(platform);
    else if (settings.mode === 'B') showCheckpoint(platform);
  }

  function showLockout(platform: PlatformId): void {
    if (session === null || session.lockedUntil === null) return;
    lockout?.stop();
    lockout = renderLockout(document, {
      lockedUntil: Date.parse(session.lockedUntil),
      now,
      onEnd: () => {
        void enqueue(async () => {
          hideOverlay();
          await dispatch({ type: 'cooldownEnded' }, platform);
        });
      },
    });
    overlay.show(lockout.element);
    lockout.start();
  }

  function showCheckpoint(platform: PlatformId): void {
    const sessionId = session?.sessionId ?? null;
    const shownAt = now();
    const latency = (): number => now() - shownAt;
    const view = renderCheckpoint(document, {
      onContinue: () => {
        void enqueue(async () => {
          hideOverlay();
          if (sessionId !== null) await log({ type: 'choice', at: iso(), sessionId, choice: 'continue', latencyMs: latency() });
          await dispatch({ type: 'continue' }, platform);
        });
      },
      onStop: () => {
        void enqueue(async () => {
          const swipes = session?.swipeCount ?? 0;
          hideOverlay();
          if (sessionId !== null) await log({ type: 'choice', at: iso(), sessionId, choice: 'stop', latencyMs: latency() });
          await dispatch({ type: 'stop' }, platform);
          await deps.sendMessage({ type: 'navigateToStopped', swipes });
        });
      },
    });
    overlay.show(view);
  }

  function hideOverlay(): void {
    lockout?.stop();
    lockout = null;
    overlay.hide();
  }

  function scheduleIdleCheck(): void {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = null;
    if (session === null || settings === null) return;
    const dueAt = Date.parse(session.lastSwipeAt) + settings.idleGapMinutes * MS_PER_MINUTE + IDLE_TIMER_SLACK_MS;
    idleTimer = window.setTimeout(() => {
      void enqueue(() => dispatch({ type: 'reconcile' }, adapter.id));
    }, Math.max(0, dueAt - now()));
  }

  function onStorageChanged(patch: StoragePatch): void {
    if ('session' in patch) {
      session = patch.session ?? null;
      scheduleIdleCheck();
    }
    if ('settings' in patch) {
      const parsed = parseSettings(patch.settings);
      const previousMode = settings?.mode;
      settings = parsed.settings;
      if (previousMode !== undefined && previousMode !== settings.mode) {
        void enqueue(async () => {
          if (overlay.isVisible()) hideOverlay();
          await dispatch({ type: 'modeChanged', mode: parsed.settings.mode }, adapter.id);
        });
      }
    }
  }

  async function onCardChange(change: CardChange): Promise<void> {
    void change;
    return enqueue(async () => {
      if (settings === null || !settings.platforms[adapter.id] || overlay.isVisible()) return;
      await dispatch({ type: 'swipe', platform: adapter.id }, adapter.id);
    });
  }

  async function start(): Promise<void> {
    const stored = await storage.get(['settings', 'session']);
    const parsed = parseSettings(stored.settings);
    parsed.problems.forEach((problem) => warn(`ignoring invalid setting (${problem})`));
    settings = parsed.settings;
    session = stored.session ?? null;
    storage.onChanged(onStorageChanged);

    await enqueue(() => dispatch({ type: 'reconcile' }, adapter.id));
    if (session !== null && session.lockedUntil !== null && settings.mode === 'A') showLockout(adapter.id);
    scheduleIdleCheck();

    detector = detectorFactory({ adapter, window, document, onCardChange: (change) => void onCardChange(change), now });
    detector.start();
  }

  function stop(): void {
    detector?.stop();
    detector = null;
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = null;
    hideOverlay();
  }

  return { start, stop, onCardChange };
}

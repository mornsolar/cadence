export type Mode = 'A' | 'B' | 'C';

export type PlatformId = 'tiktok' | 'instagram' | 'youtube';

export interface Settings {
  readonly mode: Mode;
  readonly swipeThreshold: number;
  readonly idleGapMinutes: number;
  readonly cooldownMinutes: number;
  readonly platforms: Readonly<Record<PlatformId, boolean>>;
}

/** A session is a run of swipes with no gap longer than the idle rule. */
export interface SessionState {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly lastSwipeAt: string;
  readonly swipeCount: number;
  readonly swipesSinceCheckpoint: number;
  readonly triggerCount: number;
  readonly lockedUntil: string | null;
}

export type SessionEndReason = 'idle' | 'stop' | 'cooldown';

export type Choice = 'continue' | 'stop';

interface BaseEvent {
  readonly at: string;
}

export interface SessionStartEvent extends BaseEvent {
  readonly type: 'session_start';
  readonly sessionId: string;
  readonly platform: PlatformId;
}

export interface TriggerEvent extends BaseEvent {
  readonly type: 'trigger';
  readonly sessionId: string;
  readonly mode: Mode;
  readonly swipeCount: number;
  readonly platform: PlatformId;
}

export interface ChoiceEvent extends BaseEvent {
  readonly type: 'choice';
  readonly sessionId: string;
  readonly choice: Choice;
  readonly latencyMs: number;
}

export interface SessionEndEvent extends BaseEvent {
  readonly type: 'session_end';
  readonly sessionId: string;
  readonly swipes: number;
  readonly durationMs: number;
  readonly reason: SessionEndReason;
}

export interface ModeChangeEvent extends BaseEvent {
  readonly type: 'mode_change';
  readonly from: Mode;
  readonly to: Mode;
}

export interface SettingsChangeEvent extends BaseEvent {
  readonly type: 'settings_change';
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

export interface DiaryEvent extends BaseEvent {
  readonly type: 'diary';
  readonly text: string;
}

export type LogEvent =
  | SessionStartEvent
  | TriggerEvent
  | ChoiceEvent
  | SessionEndEvent
  | ModeChangeEvent
  | SettingsChangeEvent
  | DiaryEvent;

/** Shape of everything persisted in extension local storage. */
export interface StorageShape {
  readonly schemaVersion: number;
  readonly settings: Settings;
  readonly session: SessionState | null;
  readonly events: readonly LogEvent[];
}

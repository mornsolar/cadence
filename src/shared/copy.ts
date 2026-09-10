/**
 * Every string a person reads lives here so tone can be reviewed in one place.
 * Rules from the brief: human, second person, never system-voiced, never loss-framed.
 */
export const COPY = {
  checkpoint: {
    question: 'Is this what you meant to be doing?',
    keepGoing: 'Keep going',
    done: "I'm done",
  },
  lockout: {
    title: 'The feed is paused for a few minutes.',
    remaining: (minutes: number, seconds: number): string =>
      minutes > 0 ? `${minutes} min ${seconds} s left` : `${seconds} s left`,
  },
  stopped: {
    line: (swipes: number): string =>
      swipes === 1 ? 'You stopped after 1 swipe.' : `You stopped after ${swipes} swipes.`,
    comparison: (median: number): string =>
      `Your usual session lately has been about ${median} swipes.`,
    link: 'Cadence settings',
  },
  diary: {
    notificationTitle: 'A quiet check-in is ready',
    notificationBody: 'One question, whenever you have a minute.',
    prompt: 'How has it felt this week?',
    save: 'Save',
    saved: 'Saved.',
  },
  options: {
    title: 'Cadence',
    modes: {
      A: 'Pause the feed for a few minutes after the swipe count is reached.',
      B: 'Ask whether this is what you meant to be doing, then let you decide.',
      C: 'Show nothing. Keep the record so later weeks can be compared.',
    },
    modeNames: { A: 'Hard pause', B: 'Checkpoint', C: 'Off (record only)' },
    keepLoggingNote:
      'Switching to Off keeps the record going. Uninstalling erases it. The point of this tool is what happens after you turn it off, so Off is the honest way to stop.',
    summaryNone: 'No sessions recorded yet.',
    summary: (sessions: number, medianSwipes: number, days: number): string =>
      `${sessions} ${sessions === 1 ? 'session' : 'sessions'} in the last ${days} days, about ${medianSwipes} swipes each.`,
    clearConfirm: 'Erase every recorded session and diary entry on this device?',
  },
} as const;

# Cadence

An agency-returning swipe checkpoint for short-form video on desktop web. A browser extension for Chrome and Firefox that watches TikTok, Instagram Reels and YouTube Shorts, and after a set number of completed swipes pauses the feed and asks one question: *Is this what you meant to be doing?*

It is a research instrument first and a feature second. Everything it records stays on the device.

## Why it exists

Two controlled studies found that self-paced short-form swiping measurably degrades prospective memory (the ability to carry out an intention formed earlier) in the minutes after a session, and that capping swiping at ten per session removed the deficit:

- Chiossi, F. et al. (2023). *Short-form videos degrade our capacity to retain intentions.* CHI 2023. https://doi.org/10.1145/3544548.3580778
- Barton, A. & Smyth, M. (2025). UK replication. *Memory.* https://doi.org/10.1080/09658211.2025.2521076
- Sun & Ma (2024). *CyberPsychology.* The same interaction-mode-not-content pattern for analytical reasoning: the deficit appears under self-paced swiping, not under forced passive viewing of identical clips.

The implicated mechanism is the removal of friction and sequential micro-choice, not runtime or content. Every one of these studies measured only the minutes after a single session. Nothing published says whether a cap's protective effect, or the platform's harm, persists over days or weeks. That is the gap this prototype exists to help answer.

The specific question: does an interruption that hands the decision back to the person produce change that survives once the intervention is removed, where a system-decided hard cap produces compliance that evaporates when it is turned off? Cadence ships both so they can be compared.

## Modes

| Mode | Name in settings | What happens at the trigger |
|---|---|---|
| A | Hard pause | The feed locks for a cooldown. No choice is offered. This is the agency-replacing comparison arm and behaves like an ordinary blocker. |
| B | Checkpoint (default) | The feed pauses and asks *Is this what you meant to be doing?* with two equally weighted buttons: **Keep going** and **I'm done**. Keep going is instant, penalty-free and shame-free, and starts a fresh count. I'm done takes the tab to a quiet page with one informational line. |
| C | Off (record only) | Nothing is shown. The record keeps going so later weeks can be compared with earlier ones. |

If Mode B ever starts to feel like failing, it has silently become Mode A. Treat that as a bug.

## Definitions the code encodes

| Term | Rule | Setting |
|---|---|---|
| Completed swipe | The active content card changes, *and* that change follows a scroll, swipe or arrow-key gesture within 1.5 seconds. Identity is the content id in the URL, with the video that dominates the viewport as a fallback. A change from either source inside a 400 ms window counts once. Going back counts. Like, comment and share taps and cancelled drags do not change the card, so they do not count. Neither does a clip finishing and looping back to itself — TikTok and YouTube Shorts do that instead of auto-advancing, sometimes by swapping in a fresh video element, which would otherwise look identical to a real skip. | fixed |
| Recognised surface | TikTok: `/`, `/foryou`, `/following`, `/explore`, `/@user/video/ID`. Instagram: `/reels/*`, `/reel/*`. YouTube: `/shorts/*`. Profile pages, search, ordinary YouTube watch pages and everything else are ignored. | per-platform on/off |
| Session | Starts at the first counted swipe. Ends after the idle gap passes with no swipe (default 5 minutes), when the person chooses I'm done, or when a hard-pause cooldown ends. Closing a tab does not end it; the next load reconciles it using the last swipe time. One session is shared across all three platforms and all tabs. | idle gap in minutes |
| Trigger | Fires when the count since the last checkpoint reaches the threshold (default 10). Keep going restarts the count inside the same session. | swipes before the checkpoint |
| Cooldown | Mode A only. Default 5 minutes. The session ends when it lifts. | minutes paused |

## What is recorded

Local extension storage only. No network, no accounts, no sync. Export as JSON or CSV from the settings page.

| Event | Fields |
|---|---|
| `session_start` | session id, platform |
| `trigger` | session id, active mode, swipe count in session, platform |
| `choice` | session id, `continue` or `stop`, milliseconds from the question appearing to the answer |
| `session_end` | session id, total swipes, duration, reason (`idle`, `stop`, `cooldown`) |
| `mode_change` | from, to |
| `settings_change` | key, from, to |
| `diary` | free text from the weekly check-in |

Mode changes are timestamped so the weeks before and after switching a mode off can be compared. Switching to Off keeps the record. Uninstalling erases it, which is why the settings page says Off is the honest way to stop.

Once a week the extension raises one quiet notification inviting a short free-text check-in. It is the qualitative signal the study cares about: identity language ("I don't really do that any more") against compliance language ("it wouldn't let me").

## What counts as a result

In-session behaviour differences between modes prove nothing by themselves and should not be reported as a result. Every existing blocker can change behaviour while it is on. What matters is swiping behaviour one to two weeks after a person stops using a mode, and whether Mode B users hold their change where Mode A users revert to baseline. Read the `session_end` events either side of the `mode_change` timestamp.

## Install

Build once:

```bash
npm install && npm run build
```

Chrome: open `chrome://extensions`, turn on Developer mode, choose *Load unpacked*, pick `dist/chrome`.

Firefox: open `about:debugging#/runtime/this-firefox`, choose *Load Temporary Add-on*, pick `dist/firefox/manifest.json`. Temporary add-ons are removed when Firefox closes; a signed build is needed for anything longer.

Click the toolbar icon to open settings.

## Develop

```bash
npm test          # unit tests with coverage (Vitest, jsdom)
npm run typecheck
npm run e2e       # builds, then Playwright loads dist/chrome and drives a fixture feed
```

The end-to-end tests route the real hostnames to a local fixture page so the manifest match patterns and platform adapters are exercised without touching the live sites. The first run needs `npx playwright install chromium`.

Layout: `src/shared` holds the pure core (session reducer, settings validation, event log, copy). `src/content` holds the platform adapters, the card-change detector, the overlay and the controller that ties them together. `src/background` seeds defaults, owns the weekly alarm, and navigates a tab to the stopped page. `src/options` and `src/stopped` are the two extension pages.

## Known limits

- Desktop web only. Android and iOS are out of scope for this build. iOS offers no supported way to observe per-swipe activity inside a third-party app.
- Detection depends on the sites updating the URL per card and rendering one video per card. Site changes can break it; treat adapter maintenance as ongoing.
- Two tabs swiping at the same instant can overwrite each other's session write. The last write wins. Acceptable for a prototype; a background-owned counter would fix it.
- The idle rule is a proxy for "put it down". Five minutes is a starting value, not a finding.
- The weekly check-in is a browser notification. If notifications are blocked, the check-in is still on the settings page.

## Non-goals

No monetisation, no accounts, no sync, no social features, no streaks, badges, points or loss-framed feedback of any kind. No attempt to cover every platform.

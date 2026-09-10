import { OVERLAY_FADE_MS } from '../../shared/constants';

/** Calm, low-contrast, no alarm colours. Lives in a shadow root so site CSS cannot reach it. */
export const OVERLAY_CSS = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(246, 244, 240, 0.96);
  color: #2f2e2b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 18px; line-height: 1.5;
  opacity: 0; transition: opacity ${OVERLAY_FADE_MS}ms ease;
  z-index: 2147483647;
}
.backdrop[data-state="shown"] { opacity: 1; }
@media (prefers-color-scheme: dark) {
  .backdrop { background: rgba(28, 27, 25, 0.96); color: #e8e4dc; }
}
@media (prefers-reduced-motion: reduce) {
  .backdrop { transition: none; }
}
.dialog {
  max-width: 28rem; padding: 2.5rem 2rem;
  text-align: center;
}
.question {
  margin: 0 0 2rem;
  font-size: 1.5rem; font-weight: 400; letter-spacing: -0.01em;
}
.choices { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.choice {
  flex: 1 1 10rem; min-width: 10rem;
  padding: 0.9rem 1.25rem;
  border: 1px solid currentColor; border-radius: 999px;
  background: transparent; color: inherit;
  font: inherit; font-size: 1rem;
  cursor: pointer;
}
.choice:hover { background: rgba(127, 127, 127, 0.12); }
.choice:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.remaining { margin: 1rem 0 0; opacity: 0.7; font-size: 1rem; font-variant-numeric: tabular-nums; }
`;

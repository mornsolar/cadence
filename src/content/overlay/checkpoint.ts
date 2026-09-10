import { COPY } from '../../shared/copy';

export interface CheckpointHandlers {
  readonly onContinue: () => void;
  readonly onStop: () => void;
}

/**
 * Mode B view. Two choices of identical weight; no default, no timer, no verdict.
 */
export function renderCheckpoint(document: Document, handlers: CheckpointHandlers): HTMLElement {
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'cadence-question');

  const question = document.createElement('h1');
  question.id = 'cadence-question';
  question.className = 'question';
  question.textContent = COPY.checkpoint.question;

  const choices = document.createElement('div');
  choices.className = 'choices';
  choices.append(
    choiceButton(document, 'continue', COPY.checkpoint.keepGoing, handlers.onContinue),
    choiceButton(document, 'stop', COPY.checkpoint.done, handlers.onStop),
  );

  dialog.append(question, choices);
  return dialog;
}

function choiceButton(document: Document, id: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset['choice'] = id;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

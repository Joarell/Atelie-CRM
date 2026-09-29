// A redraw in this app is `root.innerHTML = html`: every live form control is
// thrown away and rebuilt from markup. That is invisible for static content,
// but a field the reader is holding loses its value, its focus AND its caret
// — which is what made the Inbox wipe its inputs on every background refresh.
//
// This module is the small contract that makes a full redraw safe: snapshot
// the fields before the swap, put them back after. It is deliberately generic
// so any view that repaints by replacing `innerHTML` can opt in.

const FIELD_SELECTOR = 'input, textarea, select';

// `worker-configuration.d.ts` merges the workerd DOM into the ambient
// lib.dom one, so the CLASS name `ParentNode` stops being the browser
// interface (same trap `dom.ts` documents). Constrain to the union instead
// and keep the cast inside this module.
type Root = ParentNode | HTMLElement;

export interface FieldSnapshot {
  /** Field id -> the value it held at capture time. */
  values: Record<string, string>;
  /** Id of the field that had focus, or '' when nothing was focused. */
  focusId: string;
  /** Caret/selection of the focused field. */
  caretStart: number;
  caretEnd: number;
}

const EMPTY: FieldSnapshot = {
  values: {}, focusId: '', caretStart: 0, caretEnd: 0
};

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

// Only text-ish fields carry state a reader can lose. A checkbox/radio's
// value string says nothing about whether it is ticked, and re-applying it
// would be noise, so snapshotting stays off the whole node type.
function isTextField(el: Field): boolean {
  const type = (el as HTMLInputElement).type?.toLowerCase() ?? '';
  return !['checkbox', 'radio', 'file', 'button', 'submit', 'image']
    .includes(type);
}

function fieldsOf(root: Root): Field[] {
  const nodes = root.querySelectorAll(FIELD_SELECTOR);
  return Array.from(nodes).filter((el) => isTextField(el as Field)) as Field[];
}

function selectionOf(field: Field): { start: number; end: number } {
  const s = (field as HTMLTextAreaElement).selectionStart;
  const e = (field as HTMLTextAreaElement).selectionEnd;
  return { start: s ?? 0, end: e ?? 0 };
}

function focusedFieldOf(root: Root): Field | null {
  const active = root.ownerDocument?.activeElement ?? null;
  const isField = active instanceof HTMLElement &&
    active.matches(FIELD_SELECTOR);
  if (!active || !isField || !root.contains(active)) return null;
  return active as Field;
}

export function snapshotFields(root: Root): FieldSnapshot {
  const focused = focusedFieldOf(root);
  const caret = focused ? selectionOf(focused) : { start: 0, end: 0 };
  const values: Record<string, string> = {};
  fieldsOf(root).forEach((field) => {
    if (field.id) values[field.id] = field.value;
  });
  return {
    values,
    focusId: focused?.id ?? '',
    caretStart: caret.start,
    caretEnd: caret.end
  };
}

function restoreValue(root: Root, id: string, value: string): void {
  const field = root.querySelector(`#${id}`) as Field | null;
  // Guarded: a field whose markup now renders a different value (e.g. the
  // "today" default of a date input) must not be overwritten by a stale
  // capture, and an unknown id is simply skipped.
  if (field && field.value !== value) field.value = value;
}

function restoreCaret(field: Field, start: number, end: number): void {
  const area = field as HTMLTextAreaElement;
  if (typeof area.setSelectionRange !== 'function') return;
  try {
    area.setSelectionRange(start, end);
  } catch {
    // Types that do not support a selection (date/number) throw — the value
    // is already restored, the caret simply cannot be.
  }
}

function restoreFocus(root: Root, snap: FieldSnapshot): void {
  if (!snap.focusId) return;
  const field = root.querySelector(`#${snap.focusId}`) as Field | null;
  if (!field) return;
  field.focus();
  restoreCaret(field, snap.caretStart, snap.caretEnd);
}

export function restoreFields(root: Root, snap: FieldSnapshot): void {
  Object.entries(snap.values).forEach(([id, value]) =>
    restoreValue(root, id, value));
  restoreFocus(root, snap);
}

export function emptySnapshot(): FieldSnapshot {
  return { ...EMPTY, values: {} };
}

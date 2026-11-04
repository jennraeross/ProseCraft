export const UNDO_GROUP_MAX_MS = 2000;
const MAX_FIELD_STEPS = 1000;
const MAX_PAGE_STEPS = 1000;
const STATE_MERGE_MS = 800;

export type EditKind = "type" | "delete" | "newline" | "compose" | "other";

export function editKindFromInputType(inputType: string | undefined, composing = false): EditKind {
  if (composing || inputType === "insertCompositionText") return "compose";
  if (inputType === "insertParagraph" || inputType === "insertLineBreak") return "newline";
  if (inputType?.startsWith("delete")) return "delete";
  if (inputType === "insertText") return "type";
  return "other";
}

export type TextDiff = { from: number; removed: string; inserted: string };

export function diffText(before: string, after: string): TextDiff {
  const limit = Math.min(before.length, after.length);
  let from = 0;
  while (from < limit && before.charCodeAt(from) === after.charCodeAt(from)) from += 1;
  let suffix = 0;
  while (
    suffix < limit - from
    && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) suffix += 1;
  return {
    from,
    removed: before.slice(from, before.length - suffix),
    inserted: after.slice(from, after.length - suffix)
  };
}

function revertDiff(text: string, diff: TextDiff) {
  return text.slice(0, diff.from) + diff.removed + text.slice(diff.from + diff.inserted.length);
}

function reapplyDiff(text: string, diff: TextDiff) {
  return text.slice(0, diff.from) + diff.inserted + text.slice(diff.from + diff.removed.length);
}

type FieldEntry<S> = { id: number; page: string | null; diff: TextDiff; before: S; after: S };
type OpenGroup = { kind: EditKind; start: number; base: string };
type FieldHistory<S> = {
  current: string;
  done: FieldEntry<S>[];
  undone: FieldEntry<S>[];
  open: OpenGroup | null;
};

export type StateChange = ArrayChange | ObjectChange;
type ArrayChange = {
  type: "array";
  beforeIds: string[];
  afterIds: string[];
  items: { id: string; before?: Item; after?: Item; whole: boolean }[];
};
type ObjectChange = { type: "object"; before: Item; after: Item };
type Item = Record<string, unknown>;
export type StateTree = Record<string, unknown>;
export type StateStep = { changes: Record<string, StateChange>; time: number; signature: string };
export type IgnoredProps = Record<string, readonly string[]>;

type PageStep = { type: "field"; key: string; entryId: number } | { type: "state"; step: StateStep };
type PageHistory = { done: PageStep[]; undone: PageStep[] };

export type FieldResult<S> = { key: string; value: string; selection: S };
export type PageResult<S> =
  | ({ type: "field" } & FieldResult<S>)
  | { type: "state"; step: StateStep };
export type RecordOptions<S> = {
  kind: EditKind;
  time: number;
  caretMoved: boolean;
  before: S;
  after: S;
};

/**
 * Stores undo history per text field and per page. A page's steps point to field
 * entries instead of holding text, so a field and its page always agree on which
 * edits are undone, whichever of the two ran the undo.
 */
export class UndoManager<S> {
  private fields = new Map<string, FieldHistory<S>>();
  private pages = new Map<string, PageHistory>();
  private nextEntryId = 1;

  has(key: string) {
    return this.fields.has(key);
  }

  /** Discards a field's history when its text changed outside the history, such as during a sync. */
  sync(key: string, actual: string) {
    const field = this.fields.get(key);
    if (!field) {
      this.fields.set(key, { current: actual, done: [], undone: [], open: null });
    } else if (field.current !== actual) {
      this.dropEntries(key, field.done);
      this.dropEntries(key, field.undone);
      this.fields.set(key, { current: actual, done: [], undone: [], open: null });
    }
  }

  record(key: string, page: string | null, next: string, options: RecordOptions<S>) {
    const field = this.fields.get(key);
    if (!field || field.current === next) return;
    const open = field.open;
    const top = field.done.at(-1);
    const joins = open && top && top.page === page && !options.caretMoved && open.kind === options.kind
      && options.kind !== "newline" && options.kind !== "other"
      && (options.kind === "compose" || options.time - open.start < UNDO_GROUP_MAX_MS);
    if (joins) {
      top.diff = diffText(open.base, next);
      top.after = options.after;
    } else {
      const entry: FieldEntry<S> = {
        id: this.nextEntryId++,
        page,
        diff: diffText(field.current, next),
        before: options.before,
        after: options.after
      };
      field.open = { kind: options.kind, start: options.time, base: field.current };
      this.dropEntries(key, field.undone);
      field.undone = [];
      field.done.push(entry);
      if (field.done.length > MAX_FIELD_STEPS) this.dropEntries(key, field.done.splice(0, 1));
      if (page !== null) {
        const history = this.page(page);
        history.undone = [];
        pushCapped(history.done, { type: "field", key, entryId: entry.id });
      }
    }
    field.current = next;
  }

  undoField(key: string): FieldResult<S> | null {
    const field = this.fields.get(key);
    const entry = field?.done.pop();
    if (!field || !entry) return null;
    field.open = null;
    field.current = revertDiff(field.current, entry.diff);
    field.undone.push(entry);
    if (entry.page !== null) {
      const history = this.page(entry.page);
      const step = takeFieldStep(history.done, key, entry.id);
      if (step) history.undone.push(step);
    }
    return { key, value: field.current, selection: entry.before };
  }

  redoField(key: string): FieldResult<S> | null {
    const field = this.fields.get(key);
    const entry = field?.undone.pop();
    if (!field || !entry) return null;
    field.open = null;
    field.current = reapplyDiff(field.current, entry.diff);
    field.done.push(entry);
    if (entry.page !== null) {
      const history = this.page(entry.page);
      const step = takeFieldStep(history.undone, key, entry.id);
      pushCapped(history.done, step ?? { type: "field", key, entryId: entry.id });
    }
    return { key, value: field.current, selection: entry.after };
  }

  /** Returns the newest step on the page. A field step that `canApply` rejects is discarded. */
  undoPage(page: string, canApply: (key: string) => boolean): PageResult<S> | null {
    const history = this.page(page);
    while (history.done.length > 0) {
      const step = history.done[history.done.length - 1];
      if (step.type === "state") {
        history.done.pop();
        history.undone.push(step);
        return step;
      }
      const field = this.fields.get(step.key);
      if (field?.done.at(-1)?.id === step.entryId && canApply(step.key)) {
        return { type: "field", ...this.undoField(step.key)! };
      }
      history.done.pop();
    }
    return null;
  }

  redoPage(page: string, canApply: (key: string) => boolean): PageResult<S> | null {
    const history = this.page(page);
    while (history.undone.length > 0) {
      const step = history.undone[history.undone.length - 1];
      if (step.type === "state") {
        history.undone.pop();
        history.done.push(step);
        return step;
      }
      const field = this.fields.get(step.key);
      if (field?.undone.at(-1)?.id === step.entryId && canApply(step.key)) {
        return { type: "field", ...this.redoField(step.key)! };
      }
      history.undone.pop();
    }
    return null;
  }

  pushState(page: string, step: StateStep) {
    const history = this.page(page);
    history.undone = [];
    const top = history.done.at(-1);
    if (top?.type === "state" && top.step.signature === step.signature && step.time - top.step.time < STATE_MERGE_MS) {
      top.step = mergeSteps(top.step, step);
      return;
    }
    pushCapped(history.done, { type: "state", step });
  }

  /** Keeps a state step reachable after applying it switched the page, such as when the open scene was removed. */
  moveState(from: string, to: string, step: StateStep) {
    if (from === to) return;
    const source = this.page(from);
    const target = this.page(to);
    for (const list of ["done", "undone"] as const) {
      const index = source[list].findIndex((entry) => entry.type === "state" && entry.step === step);
      if (index >= 0) target[list].push(...source[list].splice(index, 1));
    }
  }

  /** Removes an item from every step, so that redo cannot restore a permanently deleted item. */
  forget(collection: string, id: string) {
    for (const history of this.pages.values()) {
      for (const list of [history.done, history.undone]) {
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const step = list[index];
          if (step.type === "state" && forgetFromStep(step.step, collection, id)) list.splice(index, 1);
        }
      }
    }
  }

  private page(id: string) {
    let history = this.pages.get(id);
    if (!history) {
      history = { done: [], undone: [] };
      this.pages.set(id, history);
    }
    return history;
  }

  private dropEntries(key: string, entries: FieldEntry<S>[]) {
    for (const entry of entries) {
      if (entry.page === null) continue;
      const history = this.page(entry.page);
      takeFieldStep(history.done, key, entry.id);
      takeFieldStep(history.undone, key, entry.id);
    }
  }
}

function pushCapped(list: PageStep[], step: PageStep) {
  list.push(step);
  if (list.length > MAX_PAGE_STEPS) list.shift();
}

function takeFieldStep(list: PageStep[], key: string, entryId: number) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const step = list[index];
    if (step.type === "field" && step.key === key && step.entryId === entryId) {
      list.splice(index, 1);
      return step;
    }
  }
  return null;
}

function isItemArray(value: unknown): value is Item[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "object" && item !== null && typeof (item as Item).id === "string");
}

function isPlainObject(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(left: unknown, right: unknown) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function changedProps(before: Item, after: Item, ignored: readonly string[]) {
  const beforeProps: Item = {};
  const afterProps: Item = {};
  let changed = false;
  for (const prop of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (ignored.includes(prop) || same(before[prop], after[prop])) continue;
    beforeProps[prop] = before[prop];
    afterProps[prop] = after[prop];
    changed = true;
  }
  return changed ? { before: beforeProps, after: afterProps } : null;
}

function diffArray(before: Item[], after: Item[], ignored: readonly string[]): ArrayChange | null {
  const beforeById = new Map(before.map((item) => [item.id as string, item]));
  const afterById = new Map(after.map((item) => [item.id as string, item]));
  const items: ArrayChange["items"] = [];
  for (const [id, item] of beforeById) {
    const next = afterById.get(id);
    if (!next) {
      items.push({ id, before: item, whole: true });
      continue;
    }
    const props = changedProps(item, next, ignored);
    if (props) items.push({ id, ...props, whole: false });
  }
  for (const [id, item] of afterById) {
    if (!beforeById.has(id)) items.push({ id, after: item, whole: true });
  }
  const beforeIds = [...beforeById.keys()];
  const afterIds = [...afterById.keys()];
  if (items.length === 0 && same(beforeIds, afterIds)) return null;
  return { type: "array", beforeIds, afterIds, items };
}

/** Returns the difference between two state trees, or null when they match apart from ignored props. */
export function diffState(before: StateTree, after: StateTree, ignored: IgnoredProps = {}, time = 0): StateStep | null {
  const changes: Record<string, StateChange> = {};
  const signature: string[] = [];
  for (const name of Object.keys(after)) {
    const left = before[name];
    const right = after[name];
    const skip = ignored[name] ?? [];
    if (isItemArray(left) && isItemArray(right)) {
      const change = diffArray(left, right, skip);
      if (!change) continue;
      changes[name] = change;
      const props = change.items.map((item) => `${item.id}:${item.whole ? "*" : Object.keys(item.before ?? {}).join()}`);
      signature.push(`${name}[${props.join("|")}]${same(change.beforeIds, change.afterIds) ? "" : "#order"}`);
    } else if (isPlainObject(left) && isPlainObject(right)) {
      const props = changedProps(left, right, skip);
      if (!props) continue;
      changes[name] = { type: "object", ...props };
      signature.push(`${name}{${Object.keys(props.before).join()}}`);
    }
  }
  return signature.length > 0 ? { changes, time, signature: signature.join(";") } : null;
}

/** Applies a step to the current state. Items that no longer exist are skipped. */
export function applyStateStep(current: StateTree, step: StateStep, direction: "undo" | "redo"): StateTree {
  const next: StateTree = { ...current };
  for (const [name, change] of Object.entries(step.changes)) {
    if (change.type === "object") {
      next[name] = { ...(current[name] as Item), ...(direction === "undo" ? change.before : change.after) };
    } else if (isItemArray(current[name])) {
      next[name] = applyArrayChange(current[name], change, direction);
    }
  }
  return next;
}

function applyArrayChange(current: Item[], change: ArrayChange, direction: "undo" | "redo") {
  const targetIds = direction === "undo" ? change.beforeIds : change.afterIds;
  const byId = new Map(current.map((item) => [item.id as string, item]));
  for (const entry of change.items) {
    const target = direction === "undo" ? entry.before : entry.after;
    const existing = byId.get(entry.id);
    if (entry.whole && target) {
      byId.set(entry.id, target);
    } else if (entry.whole) {
      // Text typed since the item was added is kept here, so redo restores it.
      if (existing) {
        if (direction === "undo") entry.after = existing;
        else entry.before = existing;
      }
      byId.delete(entry.id);
    } else if (existing && target) {
      byId.set(entry.id, { ...existing, ...target });
    }
  }
  const rank = new Map(targetIds.map((id, index) => [id, index]));
  const placed = targetIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  return [...placed, ...[...byId.entries()].filter(([id]) => !rank.has(id)).map(([, item]) => item)];
}

function mergeSteps(first: StateStep, second: StateStep): StateStep {
  const changes: Record<string, StateChange> = {};
  for (const [name, change] of Object.entries(second.changes)) {
    const earlier = first.changes[name];
    if (change.type === "object" && earlier?.type === "object") {
      changes[name] = { ...change, before: earlier.before };
    } else if (change.type === "array" && earlier?.type === "array") {
      changes[name] = {
        ...change,
        beforeIds: earlier.beforeIds,
        items: change.items.map((item) => ({
          ...item,
          before: earlier.items.find((entry) => entry.id === item.id)?.before ?? item.before
        }))
      };
    } else {
      changes[name] = change;
    }
  }
  return { changes, time: second.time, signature: second.signature };
}

function forgetFromStep(step: StateStep, collection: string, id: string) {
  const change = step.changes[collection];
  if (change?.type !== "array") return false;
  change.items = change.items.filter((item) => item.id !== id);
  change.beforeIds = change.beforeIds.filter((entry) => entry !== id);
  change.afterIds = change.afterIds.filter((entry) => entry !== id);
  if (change.items.length > 0 || !same(change.beforeIds, change.afterIds)) return false;
  delete step.changes[collection];
  return Object.keys(step.changes).length === 0;
}

/** Lists ids present in `before` and missing from `after`, by collection. */
export function removedIds(before: StateTree, after: StateTree) {
  const removed: { collection: string; id: string }[] = [];
  for (const [collection, list] of Object.entries(before)) {
    const next = after[collection];
    if (!isItemArray(list) || !isItemArray(next)) continue;
    const remaining = new Set(next.map((item) => item.id));
    for (const item of list) {
      if (!remaining.has(item.id)) removed.push({ collection, id: item.id as string });
    }
  }
  return removed;
}

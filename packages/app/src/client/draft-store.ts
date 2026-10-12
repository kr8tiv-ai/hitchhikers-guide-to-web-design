/**
 * Unsent interview answers on this machine.
 * The key is the project id and the question id. The value is the text,
 * the interview step, and when it was saved. No token and no file path.
 */

export const DRAFT_PREFIX = "hh.draft.v1";
export const DRAFT_DEBOUNCE_MS = 400;
export const DRAFT_CHAR_CAP = 20_000;
export const DRAFT_PROJECT_CHAR_CAP = 100_000;
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const PROJECT_KEY = /^[a-f0-9]{32}$/;
const QUESTION_ID = /^[A-Za-z0-9._-]{1,64}$/;
const VALUE_KEYS = ["savedAt", "step", "text"] as const;

export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftLifecycle {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  hidden(): boolean;
}

export interface DraftRecord {
  text: string;
  savedAt: number;
  step: number;
}

export interface DraftSaveInput {
  projectKey: string;
  questionId: string;
  text: string;
  savedAt: number;
  step: number;
}

export interface DraftWriter {
  push(text: string): void;
  flush(): void;
  clear(): void;
  stop(): void;
}

export function draftStorageKey(projectKey: string, questionId: string): string {
  return `${DRAFT_PREFIX}:${projectKey}:${questionId}`;
}

/** Writes one draft, or removes it when the text is blank. Never throws. */
export function saveDraft(storage: DraftStorage, input: DraftSaveInput): { ok: boolean } {
  if (!PROJECT_KEY.test(input.projectKey) || !QUESTION_ID.test(input.questionId)) return { ok: false };
  if (!Number.isFinite(input.savedAt) || !Number.isFinite(input.step)) return { ok: false };
  const key = draftStorageKey(input.projectKey, input.questionId);
  if (input.text.trim() === "") {
    try {
      storage.removeItem(key);
    } catch {
      return { ok: false };
    }
    return { ok: true };
  }
  const text = input.text.slice(0, DRAFT_CHAR_CAP);
  const payload = JSON.stringify({ savedAt: input.savedAt, step: input.step, text });
  if (writeItem(storage, key, payload)) {
    trimProject(storage, input.projectKey, key);
    return { ok: true };
  }
  trimProject(storage, input.projectKey, key);
  dropOldestOthers(storage, input.projectKey, key);
  if (writeItem(storage, key, payload)) {
    trimProject(storage, input.projectKey, key);
    return { ok: true };
  }
  return { ok: false };
}

/** Drops aged or corrupt rows, then returns this question's draft. */
export function loadDraft(
  storage: DraftStorage,
  projectKey: string,
  questionId: string,
  now: number,
): DraftRecord | null {
  sweep(storage, now);
  if (!PROJECT_KEY.test(projectKey) || !QUESTION_ID.test(questionId)) return null;
  const key = draftStorageKey(projectKey, questionId);
  const record = readRecord(storage, key);
  if (record === null) {
    try {
      storage.removeItem(key);
    } catch {
      return null;
    }
    return null;
  }
  if (Number.isFinite(now) && now - record.savedAt > DRAFT_MAX_AGE_MS) {
    try {
      storage.removeItem(key);
    } catch {
      return null;
    }
    return null;
  }
  return record;
}

/** Removes one question. A different project, and every other question, stay. */
export function clearDraft(storage: DraftStorage, projectKey: string, questionId: string): void {
  if (!PROJECT_KEY.test(projectKey) || !QUESTION_ID.test(questionId)) return;
  try {
    storage.removeItem(draftStorageKey(projectKey, questionId));
  } catch {
    // A blocked store already has nothing we can delete.
  }
}

/** Drops this project's drafts for questions the interview is not asking. */
export function dropOtherQuestions(storage: DraftStorage, projectKey: string, questionId: string): void {
  if (!PROJECT_KEY.test(projectKey) || !QUESTION_ID.test(questionId)) return;
  const prefix = `${DRAFT_PREFIX}:${projectKey}:`;
  const keep = draftStorageKey(projectKey, questionId);
  for (const key of collectKeys(storage)) {
    if (!key.startsWith(prefix) || key === keep) continue;
    try {
      storage.removeItem(key);
    } catch {
      // Keep going. One blocked key should not strand the rest.
    }
  }
}

/** Drops this project's drafts saved before a restart. */
export function forgetProjectDraftsBefore(storage: DraftStorage, projectKey: string, cutoff: number): void {
  if (!PROJECT_KEY.test(projectKey) || !Number.isFinite(cutoff)) return;
  const prefix = `${DRAFT_PREFIX}:${projectKey}:`;
  for (const key of collectKeys(storage)) {
    if (!key.startsWith(prefix)) continue;
    const record = readRecord(storage, key);
    if (record !== null && record.savedAt >= cutoff) continue;
    try {
      storage.removeItem(key);
    } catch {
      // Same as a missing key: the next load will not restore it.
    }
  }
}

export function createDraftWriter(opts: {
  storage: DraftStorage;
  projectKey: string;
  questionId: string;
  step: number;
  now: () => number;
  schedule: (fn: () => void, ms: number) => { cancel(): void };
  lifecycle: DraftLifecycle;
  onResult?: (result: {
    ok: boolean;
    text: string;
    questionId: string;
    step: number;
    savedAt: number;
  }) => void;
}): DraftWriter {
  let current = "";
  let dirty = false;
  let stopped = false;
  let timer: { cancel(): void } | null = null;

  const flush = (): void => {
    if (stopped) return;
    timer?.cancel();
    timer = null;
    if (!dirty) return;
    dirty = false;
    const text = current;
    const savedAt = opts.now();
    let ok = false;
    try {
      ok = saveDraft(opts.storage, {
        projectKey: opts.projectKey,
        questionId: opts.questionId,
        text,
        savedAt,
        step: opts.step,
      }).ok;
    } catch {
      ok = false;
    }
    try {
      opts.onResult?.({ ok, text, questionId: opts.questionId, step: opts.step, savedAt });
    } catch {
      // The note is optional. A failure there must not block the box.
    }
  };

  const onHide = (): void => {
    flush();
  };
  const onVis = (): void => {
    if (opts.lifecycle.hidden()) flush();
  };
  opts.lifecycle.addEventListener("pagehide", onHide);
  opts.lifecycle.addEventListener("beforeunload", onHide);
  opts.lifecycle.addEventListener("visibilitychange", onVis);

  return {
    push(text: string): void {
      if (stopped) return;
      current = text;
      dirty = true;
      timer?.cancel();
      timer = opts.schedule(flush, DRAFT_DEBOUNCE_MS);
    },
    flush,
    clear(): void {
      timer?.cancel();
      timer = null;
      dirty = false;
      current = "";
      clearDraft(opts.storage, opts.projectKey, opts.questionId);
    },
    stop(): void {
      if (stopped) return;
      flush();
      stopped = true;
      opts.lifecycle.removeEventListener("pagehide", onHide);
      opts.lifecycle.removeEventListener("beforeunload", onHide);
      opts.lifecycle.removeEventListener("visibilitychange", onVis);
    },
  };
}

function writeItem(storage: DraftStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function collectKeys(storage: DraftStorage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

function readRecord(storage: DraftStorage, key: string): DraftRecord | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== VALUE_KEYS.length || keys.some((keyName, index) => keyName !== VALUE_KEYS[index])) return null;
  if (typeof record.text !== "string") return null;
  if (typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (typeof record.step !== "number" || !Number.isFinite(record.step)) return null;
  return { text: record.text, savedAt: record.savedAt, step: record.step };
}

function sweep(storage: DraftStorage, now: number): void {
  if (!Number.isFinite(now)) return;
  for (const key of collectKeys(storage)) {
    if (!key.startsWith(`${DRAFT_PREFIX}:`)) continue;
    const record = readRecord(storage, key);
    if (record !== null && now - record.savedAt <= DRAFT_MAX_AGE_MS) continue;
    try {
      storage.removeItem(key);
    } catch {
      // Leave the bad row. The next read still ignores it.
    }
  }
}

interface ProjectRow {
  key: string;
  savedAt: number;
  length: number;
}

function projectRows(storage: DraftStorage, projectKey: string): ProjectRow[] {
  const prefix = `${DRAFT_PREFIX}:${projectKey}:`;
  const rows: ProjectRow[] = [];
  for (const key of collectKeys(storage)) {
    if (!key.startsWith(prefix)) continue;
    const record = readRecord(storage, key);
    if (record === null) continue;
    rows.push({ key, savedAt: record.savedAt, length: record.text.length });
  }
  rows.sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key));
  return rows;
}

function trimProject(storage: DraftStorage, projectKey: string, keepKey: string): void {
  const rows = projectRows(storage, projectKey);
  let total = 0;
  for (const row of rows) total += row.length;
  for (const row of rows) {
    if (total <= DRAFT_PROJECT_CHAR_CAP) return;
    if (row.key === keepKey) continue;
    try {
      storage.removeItem(row.key);
      total -= row.length;
    } catch {
      return;
    }
  }
}

function dropOldestOthers(storage: DraftStorage, projectKey: string, keepKey: string): void {
  for (const row of projectRows(storage, projectKey)) {
    if (row.key === keepKey) continue;
    try {
      storage.removeItem(row.key);
    } catch {
      return;
    }
  }
}

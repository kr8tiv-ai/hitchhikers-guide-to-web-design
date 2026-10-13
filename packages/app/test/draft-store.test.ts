import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_CHAR_CAP,
  DRAFT_DEBOUNCE_MS,
  DRAFT_MAX_AGE_MS,
  DRAFT_PREFIX,
  DRAFT_PROJECT_CHAR_CAP,
  clearDraft,
  createDraftWriter,
  draftStorageKey,
  loadDraft,
  saveDraft,
  type DraftLifecycle,
  type DraftStorage,
} from "../src/client/draft-store.ts";

const PROJECT = "abcdef0123456789abcdef0123456789";
const OTHER = "0123456789abcdef0123456789abcdef";
const QUESTION = "DP-0.1";
const NOW = 1_760_000_000_000;

function memoryStorage(): DraftStorage & { dump(): Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    get length() {
      return rows.size;
    },
    key(index) {
      return [...rows.keys()][index] ?? null;
    },
    getItem(key) {
      return rows.get(key) ?? null;
    },
    setItem(key, value) {
      rows.set(key, value);
    },
    removeItem(key) {
      rows.delete(key);
    },
    dump() {
      return rows;
    },
  };
}

function readRecord(storage: DraftStorage, projectKey: string, questionId: string): { text: string; savedAt: number; step: number } {
  const raw = storage.getItem(draftStorageKey(projectKey, questionId));
  assert.equal(typeof raw, "string");
  const parsed: unknown = JSON.parse(raw ?? "");
  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null && !Array.isArray(parsed));
  return parsed as { text: string; savedAt: number; step: number };
}

test("saves and loads by project and question id", () => {
  const storage = memoryStorage();
  const saved = saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: "Draft one",
    savedAt: NOW,
    step: 3,
  });
  assert.deepEqual(saved, { ok: true });
  assert.deepEqual(loadDraft(storage, PROJECT, QUESTION, NOW), {
    text: "Draft one",
    savedAt: NOW,
    step: 3,
  });
  assert.equal(loadDraft(storage, OTHER, QUESTION, NOW), null);
  const raw = storage.getItem(draftStorageKey(PROJECT, QUESTION));
  assert.equal(raw?.includes("Draft one"), true);
  assert.equal(draftStorageKey(PROJECT, QUESTION).includes(PROJECT), true);
  assert.equal(raw?.includes(PROJECT), false);
});

test("an empty draft removes only that entry", () => {
  const storage = memoryStorage();
  saveDraft(storage, { projectKey: PROJECT, questionId: QUESTION, text: "Draft one", savedAt: NOW, step: 1 });
  saveDraft(storage, { projectKey: PROJECT, questionId: "DP-0.2", text: "Second", savedAt: NOW, step: 2 });
  const cleared = saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: "   ",
    savedAt: NOW + 1,
    step: 1,
  });
  assert.deepEqual(cleared, { ok: true });
  assert.equal(storage.getItem(draftStorageKey(PROJECT, QUESTION)), null);
  assert.deepEqual(loadDraft(storage, PROJECT, "DP-0.2", NOW), {
    text: "Second",
    savedAt: NOW,
    step: 2,
  });
  clearDraft(storage, PROJECT, "DP-0.2");
  assert.equal(storage.length, 0);
});

test("a different project never sees the draft", () => {
  const storage = memoryStorage();
  saveDraft(storage, { projectKey: PROJECT, questionId: QUESTION, text: "Mine", savedAt: NOW, step: 1 });
  assert.equal(loadDraft(storage, OTHER, QUESTION, NOW), null);
  clearDraft(storage, OTHER, QUESTION);
  assert.equal(loadDraft(storage, PROJECT, QUESTION, NOW)?.text, "Mine");
});

test("corrupt JSON is ignored and dropped", () => {
  const storage = memoryStorage();
  const key = draftStorageKey(PROJECT, QUESTION);
  storage.setItem(key, "{not json");
  assert.equal(loadDraft(storage, PROJECT, QUESTION, NOW), null);
  assert.equal(storage.getItem(key), null);
  storage.setItem(key, JSON.stringify({ text: "x", savedAt: NOW, step: 1, token: "secret" }));
  assert.equal(loadDraft(storage, PROJECT, QUESTION, NOW), null);
  assert.equal(storage.getItem(key), null);
});

test("a throwing setItem returns ok false and does not throw", () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const result = saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: "Still here",
    savedAt: NOW,
    step: 1,
  });
  assert.deepEqual(result, { ok: false });
  assert.equal(storage.getItem(draftStorageKey(PROJECT, QUESTION)), null);
});

test("caps each draft and trims the oldest draft in the project first", () => {
  const storage = memoryStorage();
  const over = "x".repeat(DRAFT_CHAR_CAP + 40);
  const capped = saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: over,
    savedAt: NOW,
    step: 1,
  });
  assert.equal(capped.ok, true);
  assert.equal(loadDraft(storage, PROJECT, QUESTION, NOW)?.text.length, DRAFT_CHAR_CAP);

  storage.removeItem(draftStorageKey(PROJECT, QUESTION));
  const chunk = "y".repeat(DRAFT_CHAR_CAP);
  const room = Math.floor(DRAFT_PROJECT_CHAR_CAP / DRAFT_CHAR_CAP);
  for (let index = 0; index < room; index += 1) {
    const wrote = saveDraft(storage, {
      projectKey: PROJECT,
      questionId: `DP-9.${index}`,
      text: chunk,
      savedAt: NOW + index,
      step: index + 1,
    });
    assert.equal(wrote.ok, true);
  }
  const added = saveDraft(storage, {
    projectKey: PROJECT,
    questionId: "DP-9.99",
    text: chunk,
    savedAt: NOW + room + 1,
    step: room + 1,
  });
  assert.equal(added.ok, true);
  assert.equal(loadDraft(storage, PROJECT, "DP-9.0", NOW + room + 1), null);
  assert.equal(loadDraft(storage, PROJECT, "DP-9.99", NOW + room + 1)?.text, chunk);
  let total = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(`${DRAFT_PREFIX}:${PROJECT}:`)) continue;
    const raw = storage.getItem(key);
    const parsed = JSON.parse(raw ?? "{}") as { text?: string };
    total += parsed.text?.length ?? 0;
  }
  assert.ok(total <= DRAFT_PROJECT_CHAR_CAP);
});

test("entries older than 30 days are dropped on load", () => {
  const storage = memoryStorage();
  saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: "Stale",
    savedAt: NOW - DRAFT_MAX_AGE_MS - 1,
    step: 1,
  });
  saveDraft(storage, {
    projectKey: PROJECT,
    questionId: "DP-0.2",
    text: "Fresh",
    savedAt: NOW - DRAFT_MAX_AGE_MS + 1_000,
    step: 2,
  });
  assert.equal(loadDraft(storage, PROJECT, QUESTION, NOW), null);
  assert.equal(storage.getItem(draftStorageKey(PROJECT, QUESTION)), null);
  assert.equal(loadDraft(storage, PROJECT, "DP-0.2", NOW)?.text, "Fresh");
});

test("keys and values hold only the project id, question id, text, and a timestamp", () => {
  const storage = memoryStorage();
  saveDraft(storage, {
    projectKey: PROJECT,
    questionId: QUESTION,
    text: "Draft one",
    savedAt: NOW,
    step: 4,
  });
  const key = draftStorageKey(PROJECT, QUESTION);
  assert.equal(key, `${DRAFT_PREFIX}:${PROJECT}:${QUESTION}`);
  assert.equal(key.includes("\\"), false);
  assert.equal(key.includes("Users"), false);
  assert.equal(key.includes("Authorization"), false);
  const raw = storage.getItem(key);
  assert.equal(typeof raw, "string");
  const parsed = JSON.parse(raw ?? "") as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ["savedAt", "step", "text"]);
  assert.equal(parsed.text, "Draft one");
  assert.equal(parsed.savedAt, NOW);
  assert.equal(parsed.step, 4);
  assert.equal(JSON.stringify(parsed).includes("Authorization"), false);
  assert.equal(JSON.stringify(parsed).includes("Users"), false);
});

test("many keystrokes write once after the wait, and pagehide or a hidden tab flushes", () => {
  const storage = memoryStorage();
  let queued: (() => void) | null = null;
  let waits = 0;
  let hidden = false;
  const listeners = new Map<string, Set<() => void>>();
  const lifecycle: DraftLifecycle = {
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    hidden() {
      return hidden;
    },
  };
  const writer = createDraftWriter({
    storage,
    projectKey: PROJECT,
    questionId: QUESTION,
    step: 1,
    now: () => NOW,
    schedule(fn, ms) {
      assert.equal(ms, DRAFT_DEBOUNCE_MS);
      waits += 1;
      queued = fn;
      return {
        cancel() {
          if (queued === fn) queued = null;
        },
      };
    },
    lifecycle,
  });
  writer.push("D");
  writer.push("Dr");
  writer.push("Draft one");
  assert.equal(storage.length, 0);
  assert.equal(waits, 3);
  assert.ok(queued);
  const run = queued;
  queued = null;
  run();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Draft one");
  assert.equal(waits, 3);

  writer.push("Draft one more");
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Draft one");
  hidden = false;
  for (const listener of listeners.get("visibilitychange") ?? []) listener();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Draft one");
  hidden = true;
  for (const listener of listeners.get("visibilitychange") ?? []) listener();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Draft one more");

  writer.push("Left the page");
  for (const listener of listeners.get("pagehide") ?? []) listener();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Left the page");
  writer.stop();
  writer.push("After stop");
  for (const listener of listeners.get("pagehide") ?? []) listener();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Left the page");
});

test("suspend drops a pending save until resume", () => {
  const storage = memoryStorage();
  let queued: (() => void) | null = null;
  const writer = createDraftWriter({
    storage,
    projectKey: PROJECT,
    questionId: QUESTION,
    step: 1,
    now: () => NOW,
    schedule(fn) {
      queued = fn;
      return {
        cancel() {
          if (queued === fn) queued = null;
        },
      };
    },
    lifecycle: {
      addEventListener() {},
      removeEventListener() {},
      hidden() {
        return false;
      },
    },
  });
  writer.push("Still typing");
  assert.ok(queued);
  writer.suspend();
  assert.equal(queued, null);
  assert.equal(storage.length, 0);
  writer.flush();
  assert.equal(storage.length, 0);
  writer.resume();
  assert.ok(queued);
  const run = queued;
  queued = null;
  if (run === null) throw new Error("resume did not schedule");
  run();
  assert.equal(readRecord(storage, PROJECT, QUESTION).text, "Still typing");
  writer.stop();
});

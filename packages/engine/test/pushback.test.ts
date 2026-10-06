import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  InterviewError,
  coverageReport,
  openInterview,
  pushbackFor,
  type AnswerRecord,
  type Question,
} from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pushbackSource = path.resolve(here, "..", "src", "pushback.ts");
const interviewSource = path.resolve(here, "..", "src", "interview.ts");

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function question(pushbackIf?: string[]): Question {
  const item: Question = {
    id: "DP-5.3",
    module: "point-of-view-gun",
    depth: ["express", "standard", "deep"],
    ask: "Give the vibe in three words, and three words it must never feel like.",
    why: "Empty praise words do not count as a vibe.",
    input: ["text", "voice"],
    skipDefault: "Vibe not stated.",
    writes: ["SITE-BRIEF.md#vibe"],
  };
  if (pushbackIf !== undefined) item.pushbackIf = pushbackIf;
  return item;
}

function treeYaml(): string {
  return `questions:
  - id: DP-5.3
    module: point-of-view-gun
    depth: [express, standard, deep]
    ask: "Give the vibe in three words, and three words it must never feel like."
    why: "Empty praise words do not count as a vibe."
    input: [text, voice]
    skip_default: "Vibe not stated."
    suggest: "Three concrete words, then three refusals."
    pushback_if:
      - "clean"
    writes:
      - "SITE-BRIEF.md#vibe"
  - id: DP-9.9
    module: limits
    depth: [express, standard, deep]
    ask: "Where should the follow-up live?"
    why: "The cursor has to have somewhere to advance."
    input: [text]
    skip_default: "Follow-up not set."
    suggest: "Name the room where the follow-up happens."
    writes:
      - "PROJECT.md#follow-up"
`;
}

function plantTree(projectDir: string, yaml: string = treeYaml()): void {
  const dir = path.join(projectDir, "interview");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "tree.yaml"), yaml, "utf8");
}

interface SavedInterview {
  version: number;
  answers: AnswerRecord[];
  cursor: number;
  pushedIds: Array<{ id: string; count: number }>;
}

function readSaved(projectDir: string): SavedInterview {
  const filePath = path.join(projectDir, ".hitchhiker", "interview.json");
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed));
  const file = parsed as Record<string, unknown>;
  assert.equal(file.version, 1);
  assert.ok(Array.isArray(file.answers));
  assert.equal(typeof file.cursor, "number");
  assert.ok(Array.isArray(file.pushedIds));
  return {
    version: 1,
    answers: file.answers as AnswerRecord[],
    cursor: file.cursor as number,
    pushedIds: file.pushedIds as Array<{ id: string; count: number }>,
  };
}

test("pushbackFor quotes the phrase and ignores a shorter word", () => {
  const globalOnly = question();
  const fine = pushbackFor(globalOnly, "fine");
  assert.equal(fine, null);
  const itsFine = pushbackFor(globalOnly, "It's fine for now");
  assert.ok(itsFine);
  assert.match(itsFine, /It's fine/);
  assert.match(itsFine, /concrete detail/);
  assert.equal(itsFine.includes("!"), false);
  assert.equal(itsFine.includes("\u2014"), false);
  assert.equal(pushbackFor(globalOnly, "it is fine"), null);
  assert.equal(pushbackFor(globalOnly, "pop"), null);
  assert.match(pushbackFor(globalOnly, "Please make it pop") ?? "", /make it pop/);
  assert.equal(pushbackFor(globalOnly, "I don't know"), null);
  assert.match(pushbackFor(globalOnly, "idk really") ?? "", /idk/);
  for (const phrase of ["whatever", "you decide", "something modern"]) {
    const message = pushbackFor(globalOnly, `We could do ${phrase} later`);
    assert.match(message ?? "", new RegExp(phrase, "i"));
  }
  const clean = pushbackFor(question(["clean"]), "Clean and airy");
  assert.match(clean ?? "", /Clean/);
  assert.equal(pushbackFor(question(["clean"]), "Warm oak and a quiet serif"), null);
});

test("pushbackFor only inspects the first 500 characters and does not use a regexp", () => {
  const late = `${"a".repeat(500)} it's fine`;
  assert.equal(pushbackFor(question(), late), null);
  const early = `whatever ${"b".repeat(4000)}`;
  assert.match(pushbackFor(question(), early) ?? "", /whatever/);
  const evil = `${"(".repeat(80)}a${")+".repeat(80)}`;
  const started = Date.now();
  assert.equal(pushbackFor(question(), evil), null);
  assert.ok(Date.now() - started < 200);
  const source = readFileSync(pushbackSource, "utf8");
  assert.equal(source.includes("RegExp"), false);
  assert.equal(source.includes(".match("), false);
  assert.equal(source.includes("think("), false);
  assert.equal(source.includes("fetch("), false);
});

test("coverageReport names SOFT ids and counts statuses", () => {
  const markdown = coverageReport([
    { id: "DP-5.3", status: "SOFT", value: "it's fine" },
    { id: "DP-2.1", status: "ANSWERED", value: "Sell bread to neighbors." },
    { id: "DP-2.2", status: "SKIPPED", value: "One visitor action." },
    { id: "DP-0.1", status: "SUGGESTED", value: "Yourself." },
    { id: "DP-1.1", status: "IMPORTED", value: "Logo on file." },
  ]);
  assert.match(markdown, /DP-5.3/);
  assert.match(markdown, /it's fine/);
  assert.match(markdown, /Answered: 1/);
  assert.match(markdown, /Suggested: 1/);
  assert.match(markdown, /Skipped: 1/);
  assert.match(markdown, /Soft: 1/);
  assert.match(markdown, /Imported: 1/);
  assert.equal(markdown.includes("DP-2.1"), false);
  assert.equal(markdown.includes("!"), false);
});

test("two soft answers push back and the third stores SOFT", async () => {
  const dir = tempDir("hh-push-cap-");
  try {
    plantTree(dir);
    const session = await openInterview(dir, "express");
    assert.equal(session.next()?.id, "DP-5.3");
    const pushes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await session.command({ type: "answer", text: "It's fine" });
      if (record === null) {
        const message = session.lastPushback;
        assert.ok(message);
        assert.match(message, /It's fine/);
        assert.equal(message.includes("!"), false);
        assert.equal(session.next()?.id, "DP-5.3");
        pushes.push(message);
      } else {
        assert.equal(record.status, "SOFT");
        assert.equal(record.id, "DP-5.3");
        assert.equal(record.value, "It's fine");
        assert.notEqual(record.value.trim(), "");
        assert.equal(session.lastPushback, null);
      }
    }
    assert.equal(pushes.length, 2);
    assert.equal(session.next()?.id, "DP-9.9");
    assert.equal(session.coverage().soft, 1);
    const saved = readSaved(dir);
    assert.equal(saved.answers.length, 1);
    assert.equal(saved.answers[0]?.status, "SOFT");
    assert.equal(saved.cursor, 1);
    assert.deepEqual(saved.pushedIds, [{ id: "DP-5.3", count: 2 }]);
    const follow = await session.command({
      type: "answer",
      text: "A desk in the shop, not a second page.",
    });
    assert.ok(follow);
    assert.equal(follow.id, "DP-9.9");
    assert.equal(follow.status, "ANSWERED");
    assert.equal(session.lastPushback, null);
    assert.equal(session.next(), null);
    await assert.rejects(
      () => session.command({ type: "answer", text: "It's fine" }),
      (error: unknown) => error instanceof InterviewError && error.code === "finished",
    );
    const done = readSaved(dir);
    assert.equal(done.answers.length, 2);
    assert.equal(done.answers.filter((item) => item.status === "SOFT").length, 1);
    assert.deepEqual(done.pushedIds, [{ id: "DP-5.3", count: 2 }]);
    assert.equal(session.lastPushback, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a concrete answer stores ANSWERED and clears lastPushback", async () => {
  const dir = tempDir("hh-push-clear-");
  try {
    plantTree(dir);
    const session = await openInterview(dir, "express");
    const text = "Oak counters, warm paper, and a quiet serif.";
    const record = await session.command({ type: "answer", text });
    assert.ok(record);
    assert.equal(record.status, "ANSWERED");
    assert.equal(record.value, text);
    assert.equal(session.lastPushback, null);
    assert.equal(session.next()?.id, "DP-9.9");
    const held = await openInterview(dir, "express");
    assert.equal(held.lastPushback, null);
    const again = await held.command({ type: "answer", text: "whatever" });
    assert.equal(again, null);
    assert.ok(held.lastPushback);
    const sharp = "A follow-up email the week after the visit.";
    const stored = await held.command({ type: "answer", text: sharp });
    assert.ok(stored);
    assert.equal(stored.status, "ANSWERED");
    assert.equal(stored.value, sharp);
    assert.equal(held.lastPushback, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skip and suggest during a hold store immediately", async () => {
  const dir = tempDir("hh-push-skip-");
  try {
    plantTree(dir);
    const session = await openInterview(dir, "express");
    assert.equal(await session.command({ type: "answer", text: "clean" }), null);
    assert.ok(session.lastPushback);
    const skipped = await session.command({ type: "skip" });
    assert.ok(skipped);
    assert.equal(skipped.status, "SKIPPED");
    assert.equal(skipped.value, "Vibe not stated.");
    assert.equal(session.lastPushback, null);
    assert.equal(session.next()?.id, "DP-9.9");
    assert.equal(await session.command({ type: "answer", text: "you decide" }), null);
    const suggested = await session.command({ type: "suggest" });
    assert.ok(suggested);
    assert.equal(suggested.status, "SUGGESTED");
    assert.match(suggested.value, /room/);
    assert.equal(session.lastPushback, null);
    assert.equal(session.coverage().soft, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume keeps the push count for an id", async () => {
  const dir = tempDir("hh-push-resume-");
  try {
    plantTree(dir);
    const first = await openInterview(dir, "express");
    assert.equal(await first.command({ type: "answer", text: "whatever" }), null);
    assert.equal(first.next()?.id, "DP-5.3");
    let saved = readSaved(dir);
    assert.deepEqual(saved.answers, []);
    assert.equal(saved.cursor, 0);
    assert.deepEqual(saved.pushedIds, [{ id: "DP-5.3", count: 1 }]);

    const second = await openInterview(dir, "express");
    assert.equal(second.lastPushback, null);
    assert.equal(second.next()?.id, "DP-5.3");
    assert.equal(await second.command({ type: "answer", text: "whatever" }), null);
    saved = readSaved(dir);
    assert.deepEqual(saved.answers, []);
    assert.deepEqual(saved.pushedIds, [{ id: "DP-5.3", count: 2 }]);

    const third = await openInterview(dir, "express");
    const record = await third.command({ type: "answer", text: "whatever" });
    assert.ok(record);
    assert.equal(record.status, "SOFT");
    assert.equal(record.value, "whatever");
    assert.equal(third.lastPushback, null);
    assert.equal(third.next()?.id, "DP-9.9");
    assert.equal(readSaved(dir).answers.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a long answer is stored whole and a late soft phrase is not a push", async () => {
  const dir = tempDir("hh-push-long-");
  try {
    plantTree(dir);
    const session = await openInterview(dir, "express");
    const late = `${"a".repeat(500)} it's fine`;
    const answered = await session.command({ type: "answer", text: late });
    assert.ok(answered);
    assert.equal(answered.status, "ANSWERED");
    assert.equal(answered.value, late);
    assert.equal(session.lastPushback, null);

    const early = `it's fine ${"b".repeat(4000)}`;
    assert.equal(await session.command({ type: "answer", text: early }), null);
    assert.equal(readSaved(dir).answers.length, 1);
    assert.equal(await session.command({ type: "answer", text: early }), null);
    const stored = await session.command({ type: "answer", text: early });
    assert.ok(stored);
    assert.equal(stored.status, "SOFT");
    assert.equal(stored.value, early);
    assert.equal(stored.value.length, early.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty answer is not stored as SOFT", async () => {
  const dir = tempDir("hh-push-empty-");
  try {
    plantTree(dir);
    const session = await openInterview(dir, "express");
    await assert.rejects(
      () => session.command({ type: "answer", text: "   " }),
      (error: unknown) => error instanceof InterviewError && error.code === "empty-answer",
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "interview.json")), false);
    assert.equal(session.lastPushback, null);
    assert.equal(session.coverage().soft, 0);
    assert.equal(session.next()?.id, "DP-5.3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bare answer array still loads and an IMPORTED id is not pushed", async () => {
  const dir = tempDir("hh-push-bare-");
  try {
    plantTree(dir);
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    const imported: AnswerRecord = { id: "DP-5.3", status: "IMPORTED", value: "Logo on file." };
    writeFileSync(
      path.join(hitch, "interview.json"),
      `${JSON.stringify([imported], null, 2)}\n`,
      "utf8",
    );
    const session = await openInterview(dir, "express");
    assert.equal(session.next()?.id, "DP-9.9");
    assert.equal(session.lastPushback, null);
    assert.equal(session.coverage().imported, 1);
    const record = await session.command({ type: "answer", text: "It's fine" });
    assert.equal(record, null);
    assert.equal(session.next()?.id, "DP-9.9");
    assert.equal(readSaved(dir).answers.length, 1);
    assert.equal(readSaved(dir).answers[0]?.status, "IMPORTED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the interview calls pushbackFor before it stores an answer", () => {
  const source = readFileSync(interviewSource, "utf8");
  const call = source.indexOf("pushbackFor(");
  const store = source.indexOf("const answers = [...this.#answers, record]");
  assert.ok(call > 0);
  assert.ok(store > call);
  assert.equal(source.includes("fetch("), false);
});

/**
 * BUG-026. A skip, an auto not-applicable row, and an assumed default
 * are notes in the transcript. They are not spoken by "You".
 * The stored interview value stays the brief's value.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { AnswerRecord } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const NA_STORED = "Not applicable: 3D is none, so the custom generation budget is not asked.";
const NA_SHOWN = "Not asked: 3D is none, so the custom budget is not needed";
const SKIP_STORED = "WCAG 2.2 AA. Nothing beyond that named.";
const ASSUMED_STORED = "ASSUMED: The owner maintains it.";

function writeInterview(dir: string, answers: readonly AnswerRecord[]): void {
  const folder = path.join(dir, ".hitchhiker");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "interview.json"),
    `${JSON.stringify({ version: 1, answers, cursor: answers.length, pushedIds: [] }, null, 2)}\n`,
    "utf8",
  );
}

function region(html: string, name: string): string {
  const matched = new RegExp(`data-region="${name}"[\\s\\S]*?</(?:section|nav|footer)>`).exec(html);
  assert.ok(matched, name);
  return matched[0];
}

function entry(transcript: string, id: string): string {
  const marker = `data-answer-id="${id}"`;
  const at = transcript.indexOf(marker);
  assert.ok(at >= 0, id);
  const next = transcript.indexOf("data-answer-id=", at + marker.length);
  return transcript.slice(at, next === -1 ? transcript.length : next);
}

test("skips, auto not-applicable rows, and assumptions are not attributed to You", async () => {
  const answers: AnswerRecord[] = [
    { id: "DP-0.1", status: "ANSWERED", value: "For myself." },
    { id: "DP-9.4", status: "SKIPPED", value: SKIP_STORED },
    { id: "DP-7.2", status: "SKIPPED", value: NA_STORED },
    { id: "DP-9.3", status: "SKIPPED", value: ASSUMED_STORED },
    { id: "DP-2.6", status: "SUGGESTED", value: "One visitor, Dana." },
  ];
  const dir = mkdtempSync(path.join(tmpdir(), "hh-transcript-026-"));
  let handle: ServerHandle | undefined;
  try {
    writeInterview(dir, answers);
    handle = await startServer({ projectDir: dir, open: false });
    const html = await (await fetch(handle.url)).text();
    const transcript = region(html, "transcript");

    const spoken = entry(transcript, "DP-0.1");
    assert.match(spoken, /hh-turn__who">You</);
    assert.match(spoken, /data-answer-text>For myself\.</);

    const skipped = entry(transcript, "DP-9.4");
    assert.equal(skipped.includes(">You<"), false);
    assert.match(skipped, /data-answer-kind="skip"/);
    assert.match(skipped, /data-answer-text>Skipped</);
    assert.equal(skipped.includes(SKIP_STORED), false);

    const notAsked = entry(transcript, "DP-7.2");
    assert.equal(notAsked.includes(">You<"), false);
    assert.equal(notAsked.includes("Not applicable:"), false);
    assert.match(notAsked, /data-answer-kind="not-asked"/);
    assert.match(notAsked, new RegExp(`data-answer-text>${NA_SHOWN}<`));

    const assumed = entry(transcript, "DP-9.3");
    assert.equal(assumed.includes(">You<"), false);
    assert.equal(assumed.includes("ASSUMED:"), false);
    assert.match(assumed, /data-answer-kind="assumed"/);
    assert.match(assumed, /data-answer-text>Assumed: The owner maintains it\.</);

    const suggested = entry(transcript, "DP-2.6");
    assert.equal(suggested.includes(">You<"), false);
    assert.match(suggested, /data-answer-kind="assumed"/);
    assert.match(suggested, /data-answer-text>Assumed: One visitor, Dana\.</);

    const saved = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: AnswerRecord[];
    };
    assert.equal(saved.answers.find((item) => item.id === "DP-7.2")?.value, NA_STORED);
    assert.equal(saved.answers.find((item) => item.id === "DP-9.4")?.value, SKIP_STORED);
    assert.equal(saved.answers.find((item) => item.id === "DP-9.3")?.value, ASSUMED_STORED);
    assert.equal(saved.answers.find((item) => item.id === "DP-9.3")?.status, "SKIPPED");
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

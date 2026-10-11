import assert from "node:assert/strict";
import { test } from "node:test";
import { joinWords, settleVoice } from "../src/client/voice-text.ts";

test("joinWords trims the ends, keeps internal spaces, and joins a newline as a space", () => {
  assert.equal(joinWords("", ""), "");
  assert.equal(joinWords("   ", ""), "");
  assert.equal(joinWords("", "  world  "), "world");
  assert.equal(joinWords("  hello  ", ""), "hello");
  assert.equal(joinWords("  hello   ", "  world  "), "hello world");
  assert.equal(joinWords("hello  there", "world"), "hello  there world");
  assert.equal(joinWords("hello\n", "world"), "hello world");
  assert.equal(joinWords("hello", "\nworld\n"), "hello world");
});

test("settleVoice hears nothing only when final and interim are empty", () => {
  assert.deepEqual(settleVoice({ base: "Hello", typed: "Hello friend", final: "", interim: "" }), {
    draft: "Hello friend",
    heard: false,
  });
  assert.deepEqual(settleVoice({ base: "Hello", typed: "Hello friend", final: "  ", interim: "\n" }), {
    draft: "Hello friend",
    heard: false,
  });
  assert.deepEqual(settleVoice({ base: "", typed: "", final: "", interim: "" }), {
    draft: "",
    heard: false,
  });
  const onlyInterim = settleVoice({ base: "", typed: "", final: "", interim: "hot tea" });
  assert.equal(onlyInterim.heard, true);
  assert.equal(onlyInterim.draft, "hot tea");
});

test("a final that repeats the promoted interim is kept once", () => {
  const settled = settleVoice({
    base: "Hello",
    typed: "Hello hot tea",
    final: "hot tea",
    interim: "hot tea",
  });
  assert.equal(settled.heard, true);
  assert.equal(settled.draft, "Hello hot tea");
  assert.equal(settled.draft.includes("hot tea hot tea"), false);
});

test("a longer final replaces the interim instead of appending it", () => {
  const settled = settleVoice({
    base: "",
    typed: "hot tea",
    final: "hot tea on the counter",
    interim: "hot tea",
  });
  assert.equal(settled.heard, true);
  assert.equal(settled.draft, "hot tea on the counter");
});

test("typed text and heard words stay together, and the draft never shrinks", () => {
  const mixed = settleVoice({
    base: "Hello",
    typed: "Hello friend",
    final: "tea",
    interim: "",
  });
  assert.equal(mixed.heard, true);
  assert.equal(mixed.draft, "Hello friend tea");

  const longer = settleVoice({
    base: "Hello",
    typed: "Hello friend extra notes",
    final: "tea",
    interim: "",
  });
  assert.equal(longer.draft.startsWith("Hello friend extra notes"), true);
  assert.equal(longer.draft.includes("tea"), true);

  const exact = settleVoice({
    base: "Hello",
    typed: "Hello  ",
    final: "",
    interim: "",
  });
  assert.equal(exact.draft, "Hello  ");
  assert.equal(exact.heard, false);
});

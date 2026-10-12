import assert from "node:assert/strict";
import { test } from "node:test";
import { joinWords, mergeTranscript, settleVoice } from "../src/client/voice-text.ts";

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

test("an identical results list produces the same transcript", () => {
  const list = [
    { transcript: "one two", isFinal: true },
    { transcript: "three four", isFinal: true },
  ];
  assert.deepEqual(mergeTranscript(list), mergeTranscript(list));
  assert.equal(mergeTranscript(list).heard, "one two three four");
  const sealed = mergeTranscript(list, "one two three four");
  assert.equal(sealed.heard, "one two three four");
  assert.equal(sealed.interim, "");
});

test("a growing resend collapses to the sentence once", () => {
  const once = mergeTranscript([{ transcript: "turn on", isFinal: false }]);
  assert.equal(once.heard, "turn on");
  const longer = mergeTranscript([
    { transcript: "turn on", isFinal: false },
    { transcript: "turn on the", isFinal: false },
  ]);
  assert.equal(longer.heard, "turn on the");
  const done = mergeTranscript([
    { transcript: "turn on", isFinal: true },
    { transcript: "turn on the", isFinal: true },
    { transcript: "turn on the light", isFinal: true },
  ]);
  assert.equal(done.heard, "turn on the light");
  assert.equal(done.interim, "");
  assert.equal(mergeTranscript([
    { transcript: "turn on", isFinal: true },
    { transcript: "turn on the", isFinal: true },
    { transcript: "turn on the light", isFinal: true },
  ], "turn on the light").heard, "turn on the light");
});

test("a resend with a new tail keeps the earlier words once", () => {
  const first = mergeTranscript([{ transcript: "one two", isFinal: true }]);
  assert.equal(first.heard, "one two");
  const second = mergeTranscript([
    { transcript: "one two", isFinal: true },
    { transcript: "three four", isFinal: true },
  ]);
  assert.equal(second.heard, "one two three four");
  const third = mergeTranscript([
    { transcript: "one two", isFinal: true },
    { transcript: "three four", isFinal: true },
    { transcript: "five six", isFinal: true },
  ], "one two three four");
  assert.equal(third.heard, "one two three four five six");
  assert.equal(third.heard.split("one two").length - 1, 1);
});

test("a resend with only an interim tail shows the final and the tail once", () => {
  const mixed = mergeTranscript([
    { transcript: "one two", isFinal: true },
    { transcript: "three", isFinal: false },
  ]);
  assert.equal(mixed.finals, "one two");
  assert.equal(mixed.interim, "three");
  assert.equal(mixed.heard, "one two three");
  const again = mergeTranscript([
    { transcript: "one two", isFinal: true },
    { transcript: "three", isFinal: false },
  ], "one two");
  assert.equal(again.heard, "one two three");
  const finalized = mergeTranscript([
    { transcript: "one two", isFinal: true },
    { transcript: "three", isFinal: true },
  ], "one two");
  assert.equal(finalized.heard, "one two three");
  assert.equal(finalized.interim, "");
});

test("empty and whitespace results add nothing", () => {
  assert.deepEqual(mergeTranscript([]), { finals: "", interim: "", heard: "" });
  assert.deepEqual(mergeTranscript([
    { transcript: "   ", isFinal: true },
    { transcript: "\n", isFinal: false },
  ]), { finals: "", interim: "", heard: "" });
  const kept = mergeTranscript([
    { transcript: "  ", isFinal: true },
    { transcript: "\t", isFinal: false },
  ], "already heard");
  assert.equal(kept.heard, "already heard");
  assert.equal(kept.interim, "");
});

test("the same word said twice on purpose stays twice", () => {
  const twice = mergeTranscript([
    { transcript: "no", isFinal: true },
    { transcript: "no", isFinal: true },
  ]);
  assert.equal(twice.heard, "no no");
  assert.equal(twice.finals, "no no");
  assert.equal(twice.interim, "");
});

test("a typed-over box keeps the edit when the same transcript is resent", () => {
  const heard = mergeTranscript([{ transcript: "tea", isFinal: true }]);
  const typed = settleVoice({
    base: "Hello",
    typed: "Hello friend",
    final: heard.finals,
    interim: heard.interim,
  });
  assert.equal(typed.heard, true);
  assert.equal(typed.draft, "Hello friend tea");
  const resent = mergeTranscript([{ transcript: "tea", isFinal: true }]);
  assert.deepEqual(resent, heard);
  const again = settleVoice({
    base: "Hello",
    typed: typed.draft,
    final: resent.finals,
    interim: resent.interim,
  });
  assert.equal(again.draft, "Hello friend tea");
  assert.equal(again.draft.split("tea").length - 1, 1);
});

/** The utterance from the Chrome screenshot, without the revised last word. */
const UTTERANCE =
  "this web page is for myself to operate I'm creating a page where people can buy";

function countOf(host: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  while (from < host.length) {
    const at = host.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

/**
 * Each call's `typed` is the previous call's draft, which is how the desk
 * used to pass the live textarea back in.
 */
function chainRevised(base: string, steps: { final: string; interim: string }[]): string[] {
  let typed = base;
  const drafts: string[] = [];
  for (const step of steps) {
    const settled = settleVoice({ base, typed, final: step.final, interim: step.interim });
    assert.equal(settled.heard, true);
    typed = settled.draft;
    drafts.push(settled.draft);
  }
  return drafts;
}

test("a revised interim replaces its last word instead of repeating the sentence", () => {
  const words = ["fire", "Farm", "firewood"];
  const steps = words.map((word) => ({ final: "", interim: `${UTTERANCE} ${word}` }));
  steps.push({ final: `${UTTERANCE} firewood`, interim: "" });
  const expected = [
    `${UTTERANCE} fire`,
    `${UTTERANCE} Farm`,
    `${UTTERANCE} firewood`,
    `${UTTERANCE} firewood`,
  ];
  assert.deepEqual(chainRevised("", steps), expected);
  assert.deepEqual(
    chainRevised("Intro.", steps),
    expected.map((line) => `Intro. ${line}`),
  );

  const withFinals = chainRevised("Intro.", [
    { final: "one two", interim: "three fire" },
    { final: "one two", interim: "three Farm" },
    { final: "one two three firewood", interim: "" },
  ]);
  assert.deepEqual(withFinals, [
    "Intro. one two three fire",
    "Intro. one two three Farm",
    "Intro. one two three firewood",
  ]);
  for (const line of withFinals) {
    assert.equal(countOf(line, "one two three"), 1);
  }
});

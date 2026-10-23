/**
 * Slow answer checks say how long they have run, then explain a long wait.
 * Try again appears only after 300s, and only when the server has failed
 * the call or its own timeout has passed. No percentage.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import {
  LONG_WAIT_NOTE,
  SERVER_GUIDE_TIMEOUT_S,
  answerCheckReport,
  answerLongWaitNote,
  answerLongWaitRetry,
  answerProgressLine,
  answerWaitHtml,
  briefProgressLine,
  formatElapsed,
  type AnswerCheckReport,
} from "../src/client/desk.ts";

const HEALTHY: AnswerCheckReport = { callFailed: false, serverTimeoutPassed: false };
const FAILED: AnswerCheckReport = { callFailed: true, serverTimeoutPassed: false };
const TIMED_OUT: AnswerCheckReport = { callFailed: false, serverTimeoutPassed: true };

function question(): Question {
  return {
    id: "DP-3.1",
    module: "tools",
    depth: ["express", "standard", "deep"],
    ask: "Do you want a contact form?",
    why: "The desk needs to know where messages go.",
    input: ["text"],
    skipDefault: "Yes, a contact form.",
    writes: ["PROJECT.md#contact"],
  };
}

function state(overrides: Partial<CardState> = {}): CardState {
  return {
    question: question(),
    draft: "Yes. A general contact form.",
    pushback: null,
    error: null,
    done: false,
    pending: true,
    ...overrides,
  };
}

test("elapsed time stays in seconds under a minute, then minutes and seconds", () => {
  assert.equal(formatElapsed(0), "0s");
  assert.equal(formatElapsed(59), "59s");
  assert.equal(formatElapsed(60), "1 min 00 s");
  assert.equal(formatElapsed(125), "2 min 05 s");
  assert.equal(formatElapsed(559), "9 min 19 s");
  assert.equal(formatElapsed(-1), null);
  assert.equal(formatElapsed(1.5), null);
  for (const seconds of [0, 59, 60, 125, 559]) {
    const label = formatElapsed(seconds);
    assert.equal(label?.includes("%"), false);
    assert.equal(label?.includes(`${seconds}s`) === true, seconds < 60);
  }
});

test("answer and brief progress lines use that clock and keep the stage names", () => {
  assert.equal(answerProgressLine("Checking your answer", 0), "Checking your answer · 0s");
  assert.equal(answerProgressLine("Checking your answer", 45), "Checking your answer · 45s");
  assert.equal(answerProgressLine("Checking your answer", 59), "Checking your answer · 59s");
  assert.equal(answerProgressLine("Checking your answer", 60), "Checking your answer · 1 min 00 s");
  assert.equal(answerProgressLine("Checking your answer", 125), "Checking your answer · 2 min 05 s");
  assert.equal(answerProgressLine("Checking your answer", 559), "Checking your answer · 9 min 19 s");
  assert.equal(answerProgressLine("Writing the next question", 125), "Writing the next question · 2 min 05 s");
  assert.equal(answerProgressLine("Saving", 60), "Saving · 1 min 00 s");
  assert.equal(answerProgressLine("Sending to Grok", 125), null);
  assert.equal(answerProgressLine("Checking your answer", -1), null);
  assert.equal(answerProgressLine("Checking your answer", 1.5), null);
  assert.equal(briefProgressLine("Drafting the Site Brief", 0), "Drafting the Site Brief · 0s");
  assert.equal(briefProgressLine("Drafting the Site Brief", 59), "Drafting the Site Brief · 59s");
  assert.equal(briefProgressLine("Drafting the Site Brief", 60), "Drafting the Site Brief · 1 min 00 s");
  assert.equal(briefProgressLine("Drafting the Site Brief", 125), "Drafting the Site Brief · 2 min 05 s");
  assert.equal(briefProgressLine("Drafting the Site Brief", 559), "Drafting the Site Brief · 9 min 19 s");
  assert.equal(briefProgressLine("Checking your answer", 60), null);
  assert.equal(answerProgressLine("Checking your answer", 559)?.includes("%"), false);
  assert.equal(answerProgressLine("Checking your answer", 559)?.includes("559s"), false);
});

test("the long-wait note and Try again appear only at their thresholds", () => {
  assert.equal(LONG_WAIT_NOTE.includes("%"), false);
  assert.equal(answerLongWaitNote(0), null);
  assert.equal(answerLongWaitNote(59), null);
  assert.equal(answerLongWaitNote(60), null);
  assert.equal(answerLongWaitNote(119), null);
  assert.equal(answerLongWaitNote(120), LONG_WAIT_NOTE);
  assert.equal(answerLongWaitNote(125), LONG_WAIT_NOTE);
  assert.equal(answerLongWaitNote(300), LONG_WAIT_NOTE);
  assert.equal(answerLongWaitNote(559), LONG_WAIT_NOTE);

  assert.equal(answerLongWaitRetry(125, FAILED), false);
  assert.equal(answerLongWaitRetry(299, FAILED), false);
  assert.equal(answerLongWaitRetry(299, TIMED_OUT), false);
  assert.equal(answerLongWaitRetry(300, HEALTHY), false);
  assert.equal(answerLongWaitRetry(559, HEALTHY), false);
  assert.equal(answerLongWaitRetry(300, FAILED), true);
  assert.equal(answerLongWaitRetry(300, TIMED_OUT), true);
  assert.equal(answerLongWaitRetry(559, FAILED), true);

  assert.equal(answerWaitHtml(0, FAILED), "");
  assert.equal(answerWaitHtml(59, FAILED), "");
  assert.equal(answerWaitHtml(60, TIMED_OUT), "");
  assert.equal(answerWaitHtml(119, FAILED), "");
  const atTwoMinutes = answerWaitHtml(125, HEALTHY);
  assert.match(atTwoMinutes, /data-long-wait="1"/);
  assert.match(atTwoMinutes, /This one is taking longer than usual/);
  assert.equal(atTwoMinutes.includes("Try again"), false);
  assert.equal(atTwoMinutes.includes("%"), false);
  assert.equal(answerWaitHtml(299, FAILED).includes("Try again"), false);
  assert.match(answerWaitHtml(299, FAILED), /data-long-wait="1"/);

  const retry = answerWaitHtml(300, FAILED);
  assert.match(retry, /data-long-wait="1"/);
  assert.match(retry, /data-long-wait-retry="true"/);
  assert.match(retry, />Try again</);
  assert.equal(retry.includes("%"), false);
  assert.equal(retry.includes("model"), false);
  assert.equal(retry.includes("effort"), false);
  const noteAt = retry.indexOf('data-long-wait="1"');
  const buttonAt = retry.indexOf("data-long-wait-retry");
  assert.ok(noteAt >= 0 && buttonAt > noteAt);

  assert.equal(answerWaitHtml(300, HEALTHY).includes("Try again"), false);
  assert.match(answerWaitHtml(300, TIMED_OUT), />Try again</);
  const stillRunning = answerWaitHtml(559, HEALTHY);
  assert.match(stillRunning, /Your answer is saved/);
  assert.equal(stillRunning.includes("Try again"), false);
  const failedLate = answerWaitHtml(559, FAILED, { inProgress: false });
  assert.equal(failedLate.includes("taking longer"), false);
  assert.match(failedLate, />Try again</);
});

test("a running check is not a failure until the server says so or its cap passes", () => {
  assert.equal(SERVER_GUIDE_TIMEOUT_S, 600);
  const slow = answerCheckReport({
    elapsedSeconds: 559,
    jobStatus: "running",
    serverError: null,
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.deepEqual(slow, { callFailed: false, serverTimeoutPassed: false });
  assert.equal(answerLongWaitRetry(559, slow), false);
  assert.equal(answerLongWaitNote(559), LONG_WAIT_NOTE);

  const atCap = answerCheckReport({
    elapsedSeconds: 600,
    jobStatus: "running",
    serverError: null,
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.deepEqual(atCap, { callFailed: false, serverTimeoutPassed: true });
  assert.equal(answerLongWaitRetry(600, atCap), true);
  const beforeCap = answerCheckReport({
    elapsedSeconds: 300,
    jobStatus: "running",
    serverError: null,
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.deepEqual(beforeCap, { callFailed: false, serverTimeoutPassed: false });
  assert.equal(answerLongWaitRetry(300, beforeCap), false);

  const failed = answerCheckReport({
    elapsedSeconds: 350,
    jobStatus: "failed",
    serverError: "The Guide hit an error: the call stopped.",
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.equal(failed.callFailed, true);
  assert.equal(failed.serverTimeoutPassed, false);
  assert.equal(answerLongWaitRetry(350, failed), true);

  const timedOut = answerCheckReport({
    elapsedSeconds: 610,
    jobStatus: "failed",
    serverError: "The Guide took too long to answer. Your answer is kept. Try again.",
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.equal(timedOut.callFailed, true);
  assert.equal(timedOut.serverTimeoutPassed, true);

  const finished = answerCheckReport({
    elapsedSeconds: 700,
    jobStatus: "done",
    serverError: null,
    serverTimeoutSeconds: SERVER_GUIDE_TIMEOUT_S,
  });
  assert.deepEqual(finished, { callFailed: false, serverTimeoutPassed: false });
  assert.equal(answerLongWaitRetry(700, finished), false);
});

test("the card places the note and Try again under the stage line", () => {
  const line = answerProgressLine("Checking your answer", 559);
  assert.equal(line, "Checking your answer · 9 min 19 s");
  const waiting = renderCard(
    state({
      reading: line ?? "",
      longWaitHtml: answerWaitHtml(559, HEALTHY),
    }),
  );
  const readingAt = waiting.indexOf("data-guide-reading");
  const noteAt = waiting.indexOf('data-long-wait="1"');
  assert.ok(readingAt >= 0 && noteAt > readingAt);
  assert.match(waiting, /Checking your answer · 9 min 19 s/);
  assert.match(waiting, /This one is taking longer than usual\. Your answer is saved/);
  assert.equal(waiting.includes("Try again"), false);
  assert.equal(waiting.includes("%"), false);

  const retry = renderCard(
    state({
      reading: answerProgressLine("Checking your answer", 300) ?? "",
      longWaitHtml: answerWaitHtml(300, FAILED),
    }),
  );
  const retryNote = retry.indexOf('data-long-wait="1"');
  const retryButton = retry.indexOf("data-long-wait-retry");
  assert.ok(retry.indexOf("data-guide-reading") < retryNote && retryNote < retryButton);
  assert.match(retry, />Try again</);

  const quiet = renderCard(state({ pending: false }));
  assert.equal(quiet.includes("data-long-wait"), false);
  assert.equal(quiet.includes("Try again"), false);
});

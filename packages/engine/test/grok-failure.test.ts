/**
 * BUG-038: a 402 usage-balance failure is billing, not an ordinary exit,
 * and a shown reason never keeps raw JSON braces.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BILLING_TOP_UP,
  GrokBillingError,
  classifyGrokFailure,
  isBillingFailure,
  isRawJsonLine,
  sanitizeFailureReason,
} from "../src/ai/grok-failure.ts";

const RUN3 = "API error (status 402 Payment Required): Grok Build usage balance exhausted";

test("the Run 3 402 line is billing on stdout, stderr, and the stream", () => {
  assert.equal(classifyGrokFailure({ stdout: RUN3 }).kind, "billing");
  assert.equal(classifyGrokFailure({ stderr: RUN3 }).kind, "billing");
  assert.equal(classifyGrokFailure({ stream: RUN3 }).kind, "billing");
  assert.equal(classifyGrokFailure({ stdout: "", stderr: "", stream: RUN3, code: 1 }).kind, "billing");
});

test("http 402 envelopes are billing", () => {
  const envelope = [
    '{"type":"error","message":"Internal error: {',
    `  \\"message\\": \\"${RUN3}\\",`,
    '  \\"http_status\\": 402',
    '"costUsdTicks": 9514179200 } }, "numTurns": 33 } }',
  ].join("\n");
  assert.equal(classifyGrokFailure({ stream: envelope }).kind, "billing");
  assert.equal(classifyGrokFailure({ stderr: '{"http_status":402}' }).kind, "billing");
  assert.equal(classifyGrokFailure({ stdout: "Payment Required" }).kind, "billing");
  assert.equal(classifyGrokFailure({ stderr: "insufficient balance" }).kind, "billing");
  assert.equal(classifyGrokFailure({ stderr: "insufficient credits" }).kind, "billing");
  assert.equal(classifyGrokFailure({ stderr: "out of credits" }).kind, "billing");
});

test("429 and ordinary exits are not billing", () => {
  assert.equal(classifyGrokFailure({ stderr: "API error (status 429): too many requests" }).kind, "rate-limit");
  assert.equal(classifyGrokFailure({ stdout: "usage limit reached" }).kind, "rate-limit");
  assert.equal(classifyGrokFailure({ stderr: '{"http_status":429}' }).kind, "rate-limit");
  assert.equal(classifyGrokFailure({ stderr: "quota exceeded" }).kind, "rate-limit");
  assert.equal(classifyGrokFailure({ code: 1, stderr: "error TS2322" }).kind, "ordinary");
  assert.equal(classifyGrokFailure({ code: 1, stderr: "", stdout: "" }).kind, "ordinary");
  assert.equal(classifyGrokFailure({ stderr: "402 tokens" }).kind, "ordinary");
  assert.equal(classifyGrokFailure({ stderr: BILLING_TOP_UP }).kind, "ordinary");
});

test("a billing error carries the plain top-up sentence", () => {
  const error = new GrokBillingError();
  assert.equal(error.message, BILLING_TOP_UP);
  assert.equal(error.kind, "billing");
  assert.equal(isBillingFailure(error), true);
  assert.equal(isBillingFailure(new Error(RUN3)), true);
  assert.equal(isBillingFailure(new Error("usage limit reached")), false);
  assert.equal(isBillingFailure(new Error(BILLING_TOP_UP)), false);
});

test("failure reasons drop JSON fragments and braces", () => {
  const raw = ['"costUsdTicks": 9514179200', "} }", "The type check failed."].join("\n");
  const reason = sanitizeFailureReason(raw, "The build exited with code 1.");
  assert.equal(reason.includes("{"), false);
  assert.equal(reason.includes("}"), false);
  assert.match(reason, /type check failed/);
  const onlyJson = sanitizeFailureReason('"costUsdTicks": 9514179200 } }, "numTurns": 33 } }', "The build exited with code 1.");
  assert.equal(onlyJson, "The build exited with code 1.");
  assert.equal(onlyJson.includes("{"), false);
  assert.equal(onlyJson.includes("}"), false);
  assert.equal(isRawJsonLine('"costUsdTicks": 9514179200 } }'), true);
  assert.equal(isRawJsonLine("} }"), true);
  assert.equal(isRawJsonLine(RUN3), false);
});

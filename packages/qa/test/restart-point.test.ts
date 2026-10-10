import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPromptId } from "@hitchhiker/engine";
import { resumeFrom } from "../src/driver-plan.mjs";

test("the project file restart point matches the driver last_done plus one rule", () => {
  const samples = ["", "0", "001", "7", "182", "007", "not-a-number", "  12  "];
  for (const last of samples) {
    assert.equal(nextPromptId(last), resumeFrom(0, last), last);
  }
  assert.equal(resumeFrom(9, "001"), 9);
  assert.equal(nextPromptId("001"), resumeFrom(0, "001"));
  assert.equal(nextPromptId("001"), 2);
  assert.equal(nextPromptId(""), resumeFrom(0, ""));
  assert.equal(nextPromptId(""), 1);
});

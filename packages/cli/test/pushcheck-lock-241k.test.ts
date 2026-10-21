/**
 * A Windows lock on a git object is retried. A rejected ref is not.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { retryGitText, type GitText } from "../src/improve/pushcheck.ts";

test("a file lock is retried and a rejected ref returns once", () => {
  let locks = 0;
  const recovered = retryGitText((): GitText => {
    locks += 1;
    if (locks < 3) {
      return {
        status: 1,
        stdout: "",
        stderr: "unable to write file .git/objects/aa/bb: Permission denied",
      };
    }
    return { status: 0, stdout: "ok\n", stderr: "" };
  }, () => undefined);
  assert.equal(recovered.status, 0);
  assert.equal(locks, 3);

  let rejects = 0;
  const rejected = retryGitText((): GitText => {
    rejects += 1;
    return { status: 1, stdout: "", stderr: "! [rejected] main -> main (non-fast-forward)" };
  }, () => undefined);
  assert.equal(rejects, 1);
  assert.equal(rejected.status, 1);

  let indexWrites = 0;
  const index = retryGitText((): GitText => {
    indexWrites += 1;
    if (indexWrites < 2) {
      return { status: 1, stdout: "", stderr: "fatal: unable to write new index file" };
    }
    return { status: 0, stdout: "ok\n", stderr: "" };
  }, () => undefined);
  assert.equal(index.status, 0);
  assert.equal(indexWrites, 2);
});

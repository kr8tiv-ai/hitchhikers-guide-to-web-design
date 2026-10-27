/**
 * An SSH or HTTPS refusal is not a Windows loose-object lock.
 * The push reports a login error on the first result.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gitTextIsAuthFailure,
  gitTextIsFileLock,
  retryGitText,
  verifyKeptCommit,
  type GitText,
} from "../src/improve/pushcheck.ts";

const AUTH_ERROR = "Push was refused: SSH key or credentials. Check your git login.";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const AUTH_TEXTS = [
  "git@github.com: Permission denied (publickey).",
  "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
  "fatal: Could not read from remote repository.",
  "fatal: Authentication failed for 'https://github.com/example/repo.git/'",
  "fatal: unable to access 'https://github.com/example/repo.git/': The requested URL returned error: 403",
  "403",
];

const LOCK_TEXTS = [
  "unable to write file .git/objects/aa/bb: Permission denied",
  "fatal: Unable to create '/repo/.git/index.lock': File exists.",
  "fatal: unable to write new index file",
];

test("gitTextIsFileLock is false for SSH and HTTPS auth failures", () => {
  for (const text of AUTH_TEXTS) {
    assert.equal(gitTextIsAuthFailure(text), true, text);
    assert.equal(gitTextIsFileLock(text), false, text);
  }
  for (const text of LOCK_TEXTS) {
    assert.equal(gitTextIsAuthFailure(text), false, text);
  }
});

test("gitTextIsFileLock stays true for a loose object, an index lock, and a new index", () => {
  for (const text of LOCK_TEXTS) {
    assert.equal(gitTextIsFileLock(text), true, text);
  }
  assert.equal(gitTextIsFileLock(".git/objects/aa/bb: Permission denied"), true);
  assert.equal(gitTextIsFileLock("Permission denied"), false);
});

test("an auth failure is not retried", () => {
  for (const text of AUTH_TEXTS) {
    let calls = 0;
    let waits = 0;
    retryGitText((): GitText => {
      calls += 1;
      return { status: 128, stdout: "", stderr: text };
    }, () => {
      waits += 1;
    });
    assert.equal(calls, 1, text);
    assert.equal(waits, 0, text);
  }
});

test("the push path reports an auth error instead of a lock message", () => {
  for (const text of AUTH_TEXTS) {
    const check = verifyKeptCommit("C:\\unused", COMMIT, () => ({
      status: 128,
      stdout: "",
      stderr: text,
    }));
    assert.equal(check.ok, false, text);
    assert.equal(check.reason, AUTH_ERROR, text);
    assert.equal(/lock/i.test(check.reason), false, text);
  }
});

test("a file lock plus the transport trailer is a lock and is retried", () => {
  const text = "fatal: Unable to create '/repo/.git/index.lock': File exists.\nfatal: Could not read from remote repository.";
  assert.equal(gitTextIsAuthFailure(text), false, text);
  assert.equal(gitTextIsFileLock(text), true, text);
  let calls = 0;
  const result = retryGitText((): GitText => {
    calls += 1;
    if (calls === 1) return { status: 1, stdout: "", stderr: text };
    return { status: 0, stdout: "", stderr: "" };
  }, () => {});
  assert.equal(calls, 2);
  assert.equal(result.status, 0);
});

test("a successful push keeps the ancestor reason when a later fetch looks like auth", () => {
  const ancestor = "origin/main does not contain the commit";
  let step = 0;
  const fetched = verifyKeptCommit("C:\\unused", COMMIT, () => {
    step += 1;
    if (step === 1) return { status: 0, stdout: "", stderr: "" };
    return { status: 1, stdout: "", stderr: "fatal: Could not read from remote repository." };
  });
  assert.equal(fetched.reason, ancestor);
  assert.equal(step, 2);

  step = 0;
  const checked = verifyKeptCommit("C:\\unused", COMMIT, () => {
    step += 1;
    if (step === 1) return { status: 0, stdout: "", stderr: "" };
    if (step === 2) return { status: 0, stdout: "", stderr: "fatal: Could not read from remote repository." };
    return { status: 1, stdout: "", stderr: "" };
  });
  assert.equal(checked.reason, ancestor);
  assert.equal(step, 3);
});

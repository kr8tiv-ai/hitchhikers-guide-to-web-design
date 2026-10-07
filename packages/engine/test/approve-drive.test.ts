import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  DriveApprovalError,
  assertDriveAllowed,
  driveApprovalPath,
  hashApprovedFile,
  hashPromptIds,
  hashPromptIdsFromPackage,
  readDriveApproval,
  type DriveApproval,
  type DriveExpected,
} from "../src/spec/approve-drive.ts";
import { generateSkeleton, type SiteSkeletonInput } from "../src/spec/site-prompts.ts";

const AT = "2026-10-07T15:04:00.000Z";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function yes(fileSha: string): DriveApproval["prd"] {
  return { approved: true, at: AT, sha256: fileSha };
}

function pair(ids: readonly string[] = ["001", "002"], files = { prd: "prd-v1", context: "context-v1", package: "package-v1" }): {
  raw: DriveApproval;
  expected: DriveExpected;
} {
  const promptIdsHash = hashPromptIds(ids);
  const prdSha256 = hashApprovedFile(files.prd);
  const contextSha256 = hashApprovedFile(files.context);
  const promptPackageSha256 = hashApprovedFile(files.package);
  return {
    expected: { count: ids.length, promptIdsHash, prdSha256, contextSha256, promptPackageSha256 },
    raw: {
      approved: true,
      at: AT,
      count: ids.length,
      promptIdsHash,
      prd: yes(prdSha256),
      context: yes(contextSha256),
      promptPackage: yes(promptPackageSha256),
    },
  };
}

function throwsDrive(run: () => void, pattern: RegExp): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DriveApprovalError);
    assert.match(error.message, pattern);
    assert.equal(error.message.includes("!"), false);
    return true;
  });
}

test("hashPromptIds is sha256 of ids joined by newlines", () => {
  const ids = ["001", "002", "003"];
  const want = sha(ids.join("\n"));
  assert.equal(hashPromptIds(ids), want);
  assert.notEqual(hashPromptIds(ids), sha(ids.join(",")));
  assert.equal(hashPromptIds([]), sha(""));
});

test("a title change does not change the id hash and an id change does", () => {
  const input: SiteSkeletonInput = {
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
  };
  const { prompts } = generateSkeleton(input);
  assert.ok(prompts.length > 0);
  const hash = hashPromptIdsFromPackage(prompts);
  assert.equal(hash, hashPromptIds(prompts.map((prompt) => prompt.id)));
  const retitled = prompts.map((prompt) => ({ ...prompt, title: `${prompt.title} revised` }));
  assert.equal(hashPromptIdsFromPackage(retitled), hash);
  const first = prompts[0];
  assert.ok(first);
  const changed = prompts.map((prompt, index) => (index === 0 ? { ...prompt, id: `${first.id}-x` } : prompt));
  assert.notEqual(hashPromptIdsFromPackage(changed), hash);

  const files = { prd: "# PRD\n", context: "# CONTEXT\n", package: prompts.map((prompt) => prompt.id).join("\n") };
  const expected: DriveExpected = {
    count: prompts.length,
    promptIdsHash: hash,
    prdSha256: hashApprovedFile(files.prd),
    contextSha256: hashApprovedFile(files.context),
    promptPackageSha256: hashApprovedFile(files.package),
  };
  const raw: DriveApproval = {
    approved: true,
    at: AT,
    count: prompts.length,
    promptIdsHash: hash,
    prd: yes(expected.prdSha256),
    context: yes(expected.contextSha256),
    promptPackage: yes(expected.promptPackageSha256),
  };
  assertDriveAllowed(raw, expected);
  throwsDrive(
    () => assertDriveAllowed(raw, { ...expected, promptIdsHash: hashPromptIdsFromPackage(changed) }),
    /different package/,
  );
});

test("a matching approval is allowed", () => {
  const { raw, expected } = pair();
  assert.doesNotThrow(() => assertDriveAllowed(raw, expected));
});

test("a missing file is not a yes", () => {
  const { expected } = pair();
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-drive-"));
  try {
    assert.equal(readDriveApproval(dir), null);
    assert.equal(existsSync(driveApprovalPath(dir)), false);
    throwsDrive(() => assertDriveAllowed(readDriveApproval(dir), expected), /missing file is not a yes/);
    throwsDrive(() => assertDriveAllowed(null, expected), /missing file is not a yes/);
    throwsDrive(() => assertDriveAllowed(undefined, expected), /missing file is not a yes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approved false and the string true are denied", () => {
  const { raw, expected } = pair();
  throwsDrive(() => assertDriveAllowed({ ...raw, approved: false }, expected), /Received boolean/);
  throwsDrive(() => assertDriveAllowed({ ...raw, approved: "true" }, expected), /Received string/);
  throwsDrive(
    () => assertDriveAllowed({ ...raw, prd: { ...raw.prd, approved: "true" } }, expected),
    /PRD\.md requires boolean true\. Received string/,
  );
});

test("a stale count is denied and count 0 throws", () => {
  const { raw, expected } = pair();
  throwsDrive(() => assertDriveAllowed({ ...raw, count: expected.count + 1 }, expected), /different package/);
  throwsDrive(() => assertDriveAllowed({ ...raw, count: 0 }, { ...expected, count: 0 }), /count is 0/);
  throwsDrive(() => assertDriveAllowed(raw, { ...expected, count: 0 }), /count is 0/);
  throwsDrive(() => assertDriveAllowed({ ...raw, count: 1.5 }, expected), /integer/);
});

test("a hash mismatch is denied, including a stale file hash", () => {
  const { raw, expected } = pair();
  const other = hashPromptIds(["001", "009"]);
  throwsDrive(() => assertDriveAllowed(raw, { ...expected, promptIdsHash: other }), /different package/);
  throwsDrive(
    () => assertDriveAllowed(raw, { ...expected, prdSha256: hashApprovedFile("prd-v2") }),
    /PRD\.md hash does not match/,
  );
  throwsDrive(
    () => assertDriveAllowed(raw, { ...expected, contextSha256: hashApprovedFile("context-v2") }),
    /CONTEXT\.md hash does not match/,
  );
  throwsDrive(
    () => assertDriveAllowed(raw, { ...expected, promptPackageSha256: hashApprovedFile("package-v2") }),
    /Prompt package hash does not match/,
  );
});

test("a missing file yes is denied", () => {
  const { raw, expected } = pair();
  const { prd, ...withoutPrd } = raw;
  assert.equal(typeof prd.sha256, "string");
  throwsDrive(() => assertDriveAllowed(withoutPrd, expected), /PRD\.md has no recorded yes/);
  const { context, ...withoutContext } = raw;
  assert.equal(typeof context.sha256, "string");
  throwsDrive(() => assertDriveAllowed(withoutContext, expected), /CONTEXT\.md has no recorded yes/);
  const { promptPackage, ...withoutPackage } = raw;
  assert.equal(typeof promptPackage.sha256, "string");
  throwsDrive(() => assertDriveAllowed(withoutPackage, expected), /Prompt package has no recorded yes/);
});

test("the approval file round-trips and a corrupt file throws", () => {
  const { raw, expected } = pair();
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-drive-"));
  try {
    const file = driveApprovalPath(dir);
    assert.equal(file, path.join(dir, ".hitchhiker", "drive-approval.json"));
    mkdirSync(path.dirname(file));
    writeFileSync(file, JSON.stringify(raw));
    assertDriveAllowed(readDriveApproval(dir), expected);
    writeFileSync(file, "{");
    throwsDrive(() => readDriveApproval(dir), /not JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file bytes and strings hash as sha256 and a title is not part of the id hash", () => {
  assert.equal(hashApprovedFile("alpha"), sha("alpha"));
  assert.equal(hashApprovedFile(new TextEncoder().encode("alpha")), sha("alpha"));
  assert.notEqual(hashApprovedFile("alpha"), hashApprovedFile("beta"));
  assert.equal(hashPromptIds(["001"]), hashPromptIds(["001"]));
});

test("the gate module does not spawn a process or call a model", () => {
  const source = readFileSync(new URL("../src/spec/approve-drive.ts", import.meta.url), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("grok"), false);
  assert.match(source, /generateSkeleton/);
  assert.match(source, /export function assertDriveAllowed/);
  assert.match(source, /export function hashPromptIds/);
});

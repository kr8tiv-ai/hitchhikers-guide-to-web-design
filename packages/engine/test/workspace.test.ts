import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_PACKAGES,
  listWorkspacePackages,
} from "../src/workspace.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

interface PackageManifest {
  name: string;
  private: boolean;
  repository: { url: string };
}

function readManifest(dir: string): PackageManifest {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Not an object: ${dir}`);
  }
  const record = raw as Record<string, unknown>;
  const repository = record.repository;
  if (typeof repository !== "object" || repository === null) {
    throw new Error(`Missing repository: ${dir}`);
  }
  const url = (repository as Record<string, unknown>).url;
  if (typeof record.name !== "string" || typeof url !== "string") {
    throw new Error(`Missing name or repository.url: ${dir}`);
  }
  if (typeof record.private !== "boolean") {
    throw new Error(`private must be a boolean: ${dir}`);
  }
  return { name: record.name, private: record.private, repository: { url } };
}

test("workspace package set matches EXPECTED_PACKAGES", () => {
  const listed = listWorkspacePackages(repoRoot);
  const names = listed.map((pkg) => pkg.name);
  assert.deepEqual(new Set(names), new Set(EXPECTED_PACKAGES));
  assert.equal(names.length, EXPECTED_PACKAGES.length);

  for (const pkg of listed) {
    assert.equal(pkg.dir, path.normalize(pkg.dir));
    const manifest = readManifest(path.join(repoRoot, pkg.dir));
    assert.equal(manifest.name, pkg.name);
    const isCli = pkg.dir === path.normalize("packages/cli");
    assert.equal(manifest.private, isCli ? false : true);
    assert.ok(
      manifest.repository.url.includes(
        "kr8tiv-ai/hitchhikers-guide-to-web-design",
      ),
    );
  }

  const rootManifest = readManifest(repoRoot);
  assert.ok(
    rootManifest.repository.url.includes(
      "kr8tiv-ai/hitchhikers-guide-to-web-design",
    ),
  );
});

test("NOTICE states gsd-core is not an npm dependency", () => {
  const notice = readFileSync(path.join(repoRoot, "NOTICE"), "utf8");
  assert.ok(notice.includes("not an npm dependency"));
  assert.ok(notice.includes("13d37238ba08377929e4850fd6ae4b8db49a22ca"));
  assert.ok(notice.includes("vendor/gsd-core"));
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BOUNDARIES,
  findDeepImports,
  findEscapes,
  listWorkspacePackages,
} from "@hitchhiker/engine";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const ENGINE_DEP = "@hitchhiker/engine";

function deepSpecifier(): string {
  return `@hitchhiker/${"engine"}/src/workspace`;
}

function vendorSpecifier(): string {
  return ["vendor", "gsd-core", "templates"].join("/");
}

test("a fixture deep import fails, including a .ts comment, and markdown is ignored", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-boundaries-"));
  try {
    const src = path.join(root, "packages", "sample", "src");
    mkdirSync(src, { recursive: true });
    const specifier = deepSpecifier();
    writeFileSync(
      path.join(src, "bad.ts"),
      `import { listWorkspacePackages } from "${specifier}";\n`,
      "utf8",
    );
    writeFileSync(path.join(src, "note.ts"), `// ${specifier}\nexport const ok = 1;\n`, "utf8");
    writeFileSync(path.join(src, "note.md"), `${specifier}\n`, "utf8");

    const hits = findDeepImports(root);
    const specifiers = hits.map((hit) => hit.specifier).sort();
    assert.deepEqual(specifiers, [specifier, specifier].sort());
    assert.equal(hits.length, 2);
    assert.ok(hits.every((hit) => hit.file.endsWith(".ts")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("relative imports inside a package are allowed; escapes and vendor imports are not", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-boundaries-"));
  try {
    const src = path.join(root, "packages", "sample", "src");
    const tests = path.join(root, "packages", "sample", "test");
    mkdirSync(src, { recursive: true });
    mkdirSync(tests, { recursive: true });
    writeFileSync(path.join(src, "ok.ts"), "export const PACKAGE_NAME = \"sample\";\n", "utf8");
    writeFileSync(
      path.join(tests, "self.test.ts"),
      "import { PACKAGE_NAME } from \"../src/ok.ts\";\nvoid PACKAGE_NAME;\n",
      "utf8",
    );
    const outside = "../../outside.ts";
    writeFileSync(
      path.join(src, "leave.ts"),
      `import x from "${outside}";\nvoid x;\n`,
      "utf8",
    );
    const vendor = vendorSpecifier();
    writeFileSync(
      path.join(src, "vendor-import.ts"),
      `import y from "${vendor}";\nvoid y;\n`,
      "utf8",
    );

    assert.deepEqual(findDeepImports(root), []);
    const escapes = findEscapes(root);
    const specifiers = escapes.map((hit) => hit.specifier).sort();
    assert.deepEqual(specifiers, [outside, vendor].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the repo has no deep imports and no package escapes", () => {
  assert.deepEqual(findDeepImports(repoRoot), []);
  assert.deepEqual(findEscapes(repoRoot), []);
});

test("package.json dependencies match BOUNDARIES", () => {
  const listed = listWorkspacePackages(repoRoot);
  assert.equal(BOUNDARIES.length, listed.length);
  const byName = new Map(listed.map((pkg) => [pkg.name, pkg.dir]));

  for (const boundary of BOUNDARIES) {
    const dir = byName.get(boundary.name);
    assert.ok(dir, boundary.name);
    assert.equal(boundary.allowDeps.includes("hitchhikers-guide"), false);
    const manifestPath = path.join(repoRoot, dir, "package.json");
    const raw: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.ok(typeof raw === "object" && raw !== null);
    const record = raw as Record<string, unknown>;
    const dependencies = record.dependencies;
    const deps =
      typeof dependencies === "object" && dependencies !== null
        ? (dependencies as Record<string, unknown>)
        : {};
    const names = Object.keys(deps).sort();
    const externalAllow = [...(boundary.allowExternal ?? [])].sort();
    const workspaceNames = names.filter((name) => !externalAllow.includes(name));
    assert.deepEqual(workspaceNames, [...boundary.allowDeps].sort());
    assert.deepEqual(
      names.filter((name) => externalAllow.includes(name)),
      externalAllow,
    );
    for (const name of workspaceNames) {
      assert.equal(deps[name], "workspace:*");
    }
    for (const name of externalAllow) {
      const version = deps[name];
      assert.equal(typeof version, "string");
      assert.notEqual(version, "workspace:*");
    }
  }

  const orchestrator = BOUNDARIES.find((boundary) => boundary.name === "@hitchhiker/orchestrator");
  assert.ok(orchestrator);
  assert.deepEqual(orchestrator.allowDeps, [ENGINE_DEP]);
  assert.equal(orchestrator.allowDeps.includes("@hitchhiker/app"), false);
});

test("tsconfig references follow the same allow list", () => {
  const listed = listWorkspacePackages(repoRoot);
  const byName = new Map(listed.map((pkg) => [pkg.name, pkg.dir]));

  for (const boundary of BOUNDARIES) {
    const dir = byName.get(boundary.name);
    assert.ok(dir, boundary.name);
    const raw: unknown = JSON.parse(
      readFileSync(path.join(repoRoot, dir, "tsconfig.json"), "utf8"),
    );
    assert.ok(typeof raw === "object" && raw !== null);
    const record = raw as Record<string, unknown>;
    const options = record.compilerOptions;
    assert.ok(typeof options === "object" && options !== null);
    const compilerOptions = options as Record<string, unknown>;
    assert.equal(compilerOptions.composite, true);
    assert.equal(compilerOptions.rootDir, "src");
    assert.equal(compilerOptions.outDir, "dist");

    const references = record.references;
    const paths: string[] = [];
    if (references !== undefined) {
      assert.ok(Array.isArray(references));
      for (const reference of references) {
        assert.ok(typeof reference === "object" && reference !== null);
        const refPath = (reference as Record<string, unknown>).path;
        assert.equal(typeof refPath, "string");
        paths.push(path.normalize(refPath));
      }
    }

    if (boundary.allowDeps.includes(ENGINE_DEP)) {
      assert.deepEqual(paths, [path.normalize("../engine")]);
    } else {
      assert.deepEqual(paths, []);
    }
  }
});

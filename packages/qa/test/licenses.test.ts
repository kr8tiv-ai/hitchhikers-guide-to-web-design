import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { auditDeps, noticeNeedsMention } from "../src/licenses.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

const GSAP_LICENSE = "Standard 'no charge' license: https://gsap.com/standard-license.";

test("MIT OR Apache-2.0 passes and is recorded", () => {
  const result = auditDeps([{ name: "@visioncortex/vtracer", license: "MIT OR Apache-2.0" }]);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.deepEqual(result.problems, []);
  assert.equal(noticeNeedsMention("MIT OR Apache-2.0"), true);
  assert.equal(noticeNeedsMention("MIT"), false);
});

test("GPL-3.0-only and AGPL fail", () => {
  const gpl = auditDeps([{ name: "copyleft", license: "GPL-3.0-only" }]);
  assert.equal(gpl.ok, false);
  assert.match(gpl.problems.join("\n"), /GPL-3.0-only/);
  const agpl = auditDeps([{ name: "affero", license: "AGPL-3.0-only" }]);
  assert.equal(agpl.ok, false);
  assert.match(agpl.problems.join("\n"), /AGPL-3.0-only/);
  const prose = auditDeps([{ name: "prose", license: "GNU General Public License v3.0" }]);
  assert.equal(prose.ok, false);
  const either = auditDeps([{ name: "either", license: "MIT OR GPL-3.0-only" }]);
  assert.equal(either.ok, false);
  const both = auditDeps([{ name: "both", license: "MIT AND GPL-3.0-only" }]);
  assert.equal(both.ok, false);
});

test("@theatre/studio fails even when the license field is MIT", () => {
  const result = auditDeps([{ name: "@theatre/studio", license: "MIT" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["@theatre/studio: banned package name"]);
  const core = auditDeps([{ name: "@theatre/core", license: "Apache-2.0" }]);
  assert.equal(core.ok, true, core.problems.join("\n"));
  assert.deepEqual(core.problems, []);
});

test("potrace fails by name", () => {
  const result = auditDeps([{ name: "potrace", license: "MIT" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["potrace: banned package name"]);
  const mixed = auditDeps([{ name: "Potrace", license: "GPL-2.0-only" }]);
  assert.equal(mixed.ok, false);
  assert.ok(mixed.problems.some((problem) => problem.startsWith("Potrace: banned package name")));
  assert.ok(mixed.problems.some((problem) => problem.includes("GPL-2.0-only")));
});

test("MPL-2.0 and Zlib pass and need a NOTICE mention", () => {
  const mpl = auditDeps([{ name: "@resvg/resvg-js", license: "MPL-2.0" }]);
  assert.equal(mpl.ok, true, mpl.problems.join("\n"));
  assert.deepEqual(mpl.problems, []);
  const zlib = auditDeps([{ name: "pako", license: "(MIT AND Zlib)" }]);
  assert.equal(zlib.ok, true, zlib.problems.join("\n"));
  assert.deepEqual(zlib.problems, []);
  assert.equal(noticeNeedsMention("MPL-2.0"), true);
  assert.equal(noticeNeedsMention("Zlib"), true);
  assert.equal(noticeNeedsMention("(MIT AND Zlib)"), true);
  assert.equal(noticeNeedsMention("Apache-2.0"), false);
  assert.equal(noticeNeedsMention(null), false);
  assert.equal(noticeNeedsMention(""), false);
  const oldMpl = auditDeps([{ name: "old-mpl", license: "MPL-1.1" }]);
  assert.equal(oldMpl.ok, false);
});

test("an empty license and UNLICENSED fail, and Unlicense passes", () => {
  assert.match(auditDeps([{ name: "bare", license: null }]).problems.join("\n"), /missing/);
  assert.match(auditDeps([{ name: "bare", license: "" }]).problems.join("\n"), /missing/);
  assert.match(auditDeps([{ name: "bare", license: "   " }]).problems.join("\n"), /missing/);
  const proprietary = auditDeps([{ name: "closed", license: "UNLICENSED" }]);
  assert.equal(proprietary.ok, false);
  assert.match(proprietary.problems.join("\n"), /proprietary/);
  const unlicense = auditDeps([{ name: "ogl", license: "Unlicense" }]);
  assert.equal(unlicense.ok, true, unlicense.problems.join("\n"));
  assert.deepEqual(unlicense.problems, []);
});

test("the fixture graph allows the installed permissive set and rejects the known traps", () => {
  const allowed = auditDeps([
    { name: "@theatre/core", license: "Apache-2.0" },
    { name: "vtracer", license: "MIT OR Apache-2.0" },
    { name: "pako", license: "(MIT AND Zlib)" },
    { name: "resvg", license: "MPL-2.0" },
    { name: "ogl", license: "Unlicense" },
    { name: "tslib", license: "0BSD" },
    { name: "sax", license: "BlueOak-1.0.0" },
    { name: "mdn-data", license: "CC0-1.0" },
    { name: "css-select", license: "BSD-2-Clause" },
    { name: "source-map", license: "BSD-3-Clause" },
    { name: "parse-cache-control", license: "BSD" },
    { name: "clear", license: "BSD-3-Clause-Clear" },
    { name: "gsap", license: GSAP_LICENSE },
    { name: "@img/sharp-win32-x64", license: "Apache-2.0 AND LGPL-3.0-or-later" },
  ]);
  assert.equal(allowed.ok, true, allowed.problems.join("\n"));
  assert.deepEqual(allowed.problems, []);

  const trapped = auditDeps([
    { name: "left", license: "GPL-3.0-only" },
    { name: "affero", license: "AGPL-3.0-only" },
    { name: "@theatre/studio", license: "MIT" },
    { name: "potrace", license: "ISC" },
  ]);
  assert.equal(trapped.ok, false);
  const text = trapped.problems.join("\n");
  assert.match(text, /GPL-3.0-only/);
  assert.match(text, /AGPL-3.0-only/);
  assert.match(text, /@theatre\/studio: banned package name/);
  assert.match(text, /potrace: banned package name/);
});

test("LGPL alone fails, and a different AND with LGPL fails", () => {
  const alone = auditDeps([{ name: "copyleft-lite", license: "LGPL-3.0-or-later" }]);
  assert.equal(alone.ok, false);
  const swapped = auditDeps([{ name: "not-sharp", license: "MIT AND LGPL-3.0-or-later" }]);
  assert.equal(swapped.ok, false);
  const borrowedSharp = auditDeps([
    { name: "not-sharp", license: "Apache-2.0 AND LGPL-3.0-or-later" },
  ]);
  assert.equal(borrowedSharp.ok, false);
  assert.match(borrowedSharp.problems.join("\n"), /LGPL-3.0-or-later/);
  const unscopedSharp = auditDeps([
    { name: "sharp", license: "Apache-2.0 AND LGPL-3.0-or-later" },
  ]);
  assert.equal(unscopedSharp.ok, false);
  const linuxSharp = auditDeps([
    { name: "@img/sharp-linux-x64", license: "Apache-2.0 AND LGPL-3.0-or-later" },
  ]);
  assert.equal(linuxSharp.ok, true, linuxSharp.problems.join("\n"));
  const borrowedGsap = auditDeps([{ name: "not-gsap", license: GSAP_LICENSE }]);
  assert.equal(borrowedGsap.ok, false);
  const gplAnd = auditDeps([{ name: "worse", license: "Apache-2.0 AND GPL-3.0-only" }]);
  assert.equal(gplAnd.ok, false);
  assert.equal(noticeNeedsMention("Apache-2.0 AND LGPL-3.0-or-later"), true);
  assert.equal(noticeNeedsMention("BlueOak-1.0.0"), true);
  assert.equal(noticeNeedsMention("CC0-1.0"), true);
  assert.equal(noticeNeedsMention(GSAP_LICENSE), true);
  assert.equal(noticeNeedsMention("0BSD"), false);
});

test("NOTICE has a Third-party heading and still credits gsd-core", () => {
  const notice = readFileSync(path.join(repoRoot, "NOTICE"), "utf8");
  const lines = notice.split(/\r?\n/);
  assert.ok(lines.includes("Third-party"));
  assert.match(notice, /vendor\/gsd-core/);
  assert.match(notice, /https:\/\/github\.com\/open-gsd\/gsd-core/);
  assert.match(notice, /License: MIT License/);
  assert.match(notice, /MPL-2\.0/);
  assert.match(notice, /Zlib/);
  assert.match(notice, /passes only for a package whose name/);
  assert.match(notice, /@img\/sharp-/);
  assert.match(notice, /gsd-core is vendored source for templates/);
  assert.equal(notice.includes("!"), false);
});

test("workspace package.json files and the installed tree pass the licence gate", (t) => {
  const nodeModules = path.join(repoRoot, "node_modules");
  if (!existsSync(nodeModules)) {
    t.diagnostic("node_modules is absent. Live tree skipped. Fixture gate only.");
    const fixture = auditDeps([{ name: "@theatre/core", license: "Apache-2.0" }]);
    assert.equal(fixture.ok, true, fixture.problems.join("\n"));
    assert.deepEqual(fixture.problems, []);
    return;
  }

  const packageFiles = workspacePackageJsons(repoRoot);
  assert.ok(packageFiles.length > 0, "expected workspace package.json files");
  const entries: Array<{ name: string; license: string | null }> = [];
  const directNames = new Set<string>();

  for (const file of packageFiles) {
    const pkg = readJson(file);
    const ownName = typeof pkg.name === "string" && pkg.name.trim() !== "" ? pkg.name : path.basename(path.dirname(file));
    if (typeof pkg.license === "string") entries.push({ name: ownName, license: pkg.license });
    for (const field of DEP_FIELDS) {
      const block = pkg[field];
      if (typeof block !== "object" || block === null) continue;
      for (const [name, spec] of Object.entries(block)) {
        directNames.add(name);
        assert.equal(isBannedDep(name), false, `${name} in ${path.relative(repoRoot, file)}`);
        if (typeof spec === "object" && spec !== null && "license" in spec) {
          const declared = spec.license;
          entries.push({
            name,
            license: typeof declared === "string" ? declared : null,
          });
        }
      }
    }
  }

  const installed = readInstalledPackages(nodeModules);
  const store = path.join(nodeModules, ".pnpm");
  if (existsSync(store)) {
    assert.ok(installed.size > 50, `expected the pnpm store to yield packages, saw ${installed.size}`);
  }
  for (const rows of installed.values()) {
    for (const row of rows) {
      if (row.license !== undefined) entries.push({ name: row.name, license: row.license });
    }
  }
  for (const name of directNames) {
    const rows = installed.get(name);
    if (rows !== undefined && rows.every((row) => row.license === undefined)) {
      entries.push({ name, license: null });
    }
  }

  const result = auditDeps(entries);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.deepEqual(result.problems, []);
});

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

function isBannedDep(name: string): boolean {
  const value = name.trim().toLowerCase();
  return value === "@theatre/studio" || value === "potrace";
}

interface PackageShape {
  name?: unknown;
  license?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
}

function readJson(file: string): PackageShape {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null) return {};
  return parsed as PackageShape;
}

function workspacePackageJsons(dir: string): string[] {
  const found: string[] = [];
  walkWorkspace(dir, found);
  return found;
}

function walkWorkspace(dir: string, found: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === "vendor" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkWorkspace(full, found);
    else if (entry.name === "package.json") found.push(full);
  }
}

interface InstalledRow {
  name: string;
  /** Undefined when the package.json has no license field. */
  license: string | null | undefined;
}

function readInstalledPackages(nodeModules: string): Map<string, InstalledRow[]> {
  const found = new Map<string, InstalledRow[]>();
  const store = path.join(nodeModules, ".pnpm");
  if (existsSync(store)) {
    let ids: Dirent[];
    try {
      ids = readdirSync(store, { withFileTypes: true });
    } catch {
      ids = [];
    }
    for (const id of ids) {
      if (!id.isDirectory() && !id.isSymbolicLink()) continue;
      collectModuleDir(path.join(store, id.name, "node_modules"), found);
    }
    return found;
  }
  collectModuleDir(nodeModules, found);
  return found;
}

function collectModuleDir(dir: string, found: Map<string, InstalledRow[]>): void {
  if (!existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@")) {
      collectModuleDir(path.join(dir, entry.name), found);
      continue;
    }
    const file = path.join(dir, entry.name, "package.json");
    if (!existsSync(file)) continue;
    const row = installedRow(file, entry.name);
    if (row === null) continue;
    const rows = found.get(row.name);
    if (rows === undefined) found.set(row.name, [row]);
    else if (!rows.some((existing) => existing.license === row.license)) rows.push(row);
  }
}

function installedRow(file: string, folderName: string): InstalledRow | null {
  let pkg: PackageShape;
  try {
    pkg = readJson(file);
  } catch {
    return null;
  }
  const name = typeof pkg.name === "string" && pkg.name.trim() !== "" ? pkg.name : folderName;
  if (!("license" in pkg)) return { name, license: undefined };
  return { name, license: licenseValue(pkg.license) };
}

function licenseValue(license: unknown): string | null {
  if (typeof license === "string") return license;
  if (typeof license === "object" && license !== null && "type" in license) {
    const type = (license as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return null;
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseYaml, type YamlMap, type YamlValue } from "./ci-workflows.test.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const releasePath = path.join(repoRoot, ".github", "workflows", "release.yml");

test("release workflow triggers are only dispatch and v tags, and publish needs pack smoke", () => {
  const raw = readFileSync(releasePath, "utf8");
  const doc = parseYaml(raw);
  assert.equal(doc.name, "Release");

  const on = doc.on;
  assert.ok(isMap(on), "on");
  assert.deepEqual(Object.keys(on).sort(), ["push", "workflow_dispatch"]);
  const push = on.push;
  assert.ok(isMap(push), "push");
  assert.deepEqual(Object.keys(push), ["tags"]);
  assert.deepEqual(push.tags, ["v*"]);
  const dispatch = on.workflow_dispatch;
  assert.ok(isMap(dispatch), "workflow_dispatch");
  const inputs = dispatch.inputs;
  assert.ok(isMap(inputs), "inputs");
  const confirmInput = inputs.confirm;
  assert.ok(isMap(confirmInput), "confirm input");
  assert.equal(confirmInput.required, true);
  assert.equal(confirmInput.type, "string");

  assert.equal(raw.includes("pull_request"), false);
  assert.equal(raw.includes("workflow_run"), false);
  assert.equal(raw.includes("schedule:"), false);
  assert.equal(raw.includes("branches:"), false);
  assert.equal(raw.includes("git tag"), false);
  assert.equal(raw.includes("gh release"), false);
  assert.equal(raw.includes("secrets."), false);
  assert.equal(raw.includes("NPM_TOKEN"), false);
  assert.equal(raw.includes("NODE_AUTH_TOKEN"), false);

  const permissions = doc.permissions;
  assert.ok(isMap(permissions), "permissions");
  assert.deepEqual(Object.keys(permissions).sort(), ["contents"]);
  assert.equal(permissions.contents, "read");

  const jobs = doc.jobs;
  assert.ok(isMap(jobs), "jobs");
  assert.deepEqual(Object.keys(jobs), ["confirm", "ci", "pack-smoke", "publish"]);

  const confirm = jobs.confirm;
  const ci = jobs.ci;
  const pack = jobs["pack-smoke"];
  const publish = jobs.publish;
  assert.ok(isMap(confirm) && isMap(ci) && isMap(pack) && isMap(publish));
  assert.deepEqual(ci.needs, ["confirm"]);
  assert.deepEqual(pack.needs, ["confirm"]);
  assert.deepEqual(publish.needs, ["ci", "pack-smoke"]);

  const ciRuns = stepRuns(ci.steps);
  assert.ok(ciRuns.some((run) => run.includes("pnpm -r run --if-present lint")));
  assert.ok(ciRuns.some((run) => run.includes("pnpm exec tsc -b")));
  assert.ok(ciRuns.some((run) => run.trim() === "pnpm -r test"));
  assert.ok(ciRuns.some((run) => run.includes("pnpm -r run --if-present eval")));
  assert.equal(stepEnv(ci.steps, "Unit tests", "HH_CASSETTE"), "replay");
  assert.equal(stepEnv(ci.steps, "Evals from cassettes", "HH_CASSETTE"), "replay");
  assert.equal(ciRuns.some((run) => run.includes("npm publish")), false);

  const packRuns = stepRuns(pack.steps);
  assert.ok(
    packRuns.some((run) => run.trim() === "node --experimental-strip-types --test packages/cli/test/pack-243.test.ts"),
  );
  assert.equal(packRuns.some((run) => run.includes("npm publish")), false);
  assert.equal(stepRuns(confirm.steps).some((run) => run.includes("npm publish")), false);

  const publishPermissions = publish.permissions;
  assert.ok(isMap(publishPermissions), "publish permissions");
  assert.equal(publishPermissions["id-token"], "write");
  assert.equal(publishPermissions.contents, "read");
  const publishRuns = stepRuns(publish.steps);
  assert.deepEqual(
    publishRuns.filter((run) => run.includes("npm publish")),
    ["npm publish --provenance --access public"],
  );
  assert.equal(raw.split("npm publish").length - 1, 1);

  const uses = [...raw.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1] ?? "");
  assert.ok(uses.length > 0);
  for (const ref of uses) {
    assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, ref);
  }
});

function stepRuns(steps: YamlValue | undefined): string[] {
  if (!Array.isArray(steps)) return [];
  const runs: string[] = [];
  for (const step of steps) {
    if (!isMap(step)) continue;
    const run = step.run;
    if (typeof run === "string") runs.push(run);
  }
  return runs;
}

function stepEnv(steps: YamlValue | undefined, stepName: string, key: string): string | undefined {
  if (!Array.isArray(steps)) return undefined;
  for (const step of steps) {
    if (!isMap(step) || step.name !== stepName) continue;
    const env = step.env;
    if (!isMap(env)) return undefined;
    const value = env[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function isMap(value: YamlValue | unknown): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

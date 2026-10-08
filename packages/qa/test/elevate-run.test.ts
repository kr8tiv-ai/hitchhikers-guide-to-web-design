import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "@hitchhiker/engine";
import { evaluateA11y } from "../src/a11y-gate.ts";
import { runElevate, type RunElevateInput } from "../src/elevate-run.ts";
import { evaluateLh } from "../src/lighthouse-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "..", "src", "elevate-run.ts");

type Snapshot = { lh: "PASS" | "BLOCKER"; a11y: "PASS" | "BLOCKER" };

function clear(): Snapshot {
  return { lh: "PASS", a11y: "PASS" };
}

function counters(): {
  order: string[];
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
  counts: { apply: number; rollback: number };
} {
  const order: string[] = [];
  const counts = { apply: 0, rollback: 0 };
  return {
    order,
    counts,
    apply: async () => {
      counts.apply += 1;
      order.push("apply");
      if (counts.apply > 1) throw new Error("apply ran twice");
    },
    rollback: async () => {
      counts.rollback += 1;
      order.push("rollback");
      if (counts.rollback > 1) throw new Error("rollback ran twice");
    },
  };
}

function input(
  before: Snapshot,
  after: Snapshot,
  hooks: Pick<ReturnType<typeof counters>, "apply" | "rollback" | "order">,
): RunElevateInput {
  return {
    apply: hooks.apply,
    rollback: hooks.rollback,
    before: () => {
      hooks.order.push("before");
      return before;
    },
    after: () => {
      hooks.order.push("after");
      return after;
    },
  };
}

test("a clear pair of gates keeps the edit and does not roll back", async () => {
  const hooks = counters();
  const result = await runElevate(input(clear(), clear(), hooks));
  assert.deepEqual(result, { status: "kept", rolledBack: false });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 0);
  assert.deepEqual(hooks.order, ["before", "apply", "after"]);
});

test("a phone gate that flips to BLOCKER rolls back once", async () => {
  const hooks = counters();
  const result = await runElevate(input(clear(), { lh: "BLOCKER", a11y: "PASS" }, hooks));
  assert.deepEqual(result, { status: "refused", rolledBack: true });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 1);
  assert.deepEqual(hooks.order, ["before", "apply", "after", "rollback"]);
});

test("an accessibility gate that flips to BLOCKER rolls back once", async () => {
  const hooks = counters();
  const result = await runElevate(input(clear(), { lh: "PASS", a11y: "BLOCKER" }, hooks));
  assert.deepEqual(result, { status: "refused", rolledBack: true });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 1);
});

test("both gates flipping still roll back once", async () => {
  const hooks = counters();
  const result = await runElevate(input(clear(), { lh: "BLOCKER", a11y: "BLOCKER" }, hooks));
  assert.deepEqual(result, { status: "refused", rolledBack: true });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 1);
});

test("a gate that was already BLOCKER is refused too", async () => {
  const hooks = counters();
  const red: Snapshot = { lh: "BLOCKER", a11y: "BLOCKER" };
  const result = await runElevate(input(red, red, hooks));
  assert.deepEqual(result, { status: "refused", rolledBack: true });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 1);
  assert.deepEqual(hooks.order, ["before", "apply", "after", "rollback"]);
});

test("one gate that stays BLOCKER refuses even when the other stays PASS", async () => {
  const hooks = counters();
  const prior: Snapshot = { lh: "PASS", a11y: "BLOCKER" };
  const result = await runElevate(input(prior, prior, hooks));
  assert.deepEqual(result, { status: "refused", rolledBack: true });
  assert.equal(hooks.counts.rollback, 1);
  assert.equal(hooks.counts.apply, 1);
});

test("a change that clears a red gate is kept", async () => {
  const hooks = counters();
  const result = await runElevate(input({ lh: "BLOCKER", a11y: "BLOCKER" }, clear(), hooks));
  assert.deepEqual(result, { status: "kept", rolledBack: false });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 0);
});

test("a rollback rejection is not swallowed", async () => {
  const hooks = counters();
  const failing: RunElevateInput = {
    ...input(clear(), { lh: "BLOCKER", a11y: "PASS" }, hooks),
    rollback: async () => {
      hooks.counts.rollback += 1;
      hooks.order.push("rollback");
      throw new Error("patch restore failed");
    },
  };
  await assert.rejects(() => runElevate(failing), { message: "patch restore failed" });
  assert.equal(hooks.counts.apply, 1);
  assert.equal(hooks.counts.rollback, 1);
  assert.deepEqual(hooks.order, ["before", "apply", "after", "rollback"]);
});

test("an apply rejection is not swallowed and does not roll back", async () => {
  const order: string[] = [];
  let rollbacks = 0;
  await assert.rejects(
    () =>
      runElevate({
        apply: async () => {
          order.push("apply");
          throw new Error("patch failed");
        },
        rollback: async () => {
          rollbacks += 1;
          order.push("rollback");
        },
        before: () => {
          order.push("before");
          return clear();
        },
        after: () => {
          order.push("after");
          return clear();
        },
      }),
    { message: "patch failed" },
  );
  assert.equal(rollbacks, 0);
  assert.deepEqual(order, ["before", "apply"]);
});

test("apply, rollback, before, and after are required", async () => {
  const hooks = counters();
  const full = input(clear(), clear(), hooks);
  const cases: Array<{ field: keyof RunElevateInput; value: unknown }> = [
    { field: "apply", value: undefined },
    { field: "rollback", value: undefined },
    { field: "before", value: undefined },
    { field: "after", value: null },
  ];
  for (const item of cases) {
    const broken = { ...full, [item.field]: item.value } as RunElevateInput;
    await assert.rejects(() => runElevate(broken), new RegExp(`${item.field} is`));
  }
  assert.equal(hooks.counts.apply, 0);
  assert.equal(hooks.counts.rollback, 0);
  await assert.rejects(
    () => runElevate(null as unknown as RunElevateInput),
    /runElevate input is null/,
  );
});

test("a bad before snapshot rejects before apply", async () => {
  let applies = 0;
  await assert.rejects(
    () =>
      runElevate({
        apply: async () => {
          applies += 1;
        },
        rollback: async () => {
          throw new Error("rollback on a bad before");
        },
        before: () => ({ lh: "PASS", a11y: "WARN" }) as Snapshot,
        after: () => clear(),
      }),
    /before\.a11y is "WARN"/,
  );
  assert.equal(applies, 0);
});

test("a bad after snapshot rejects and is not reported as kept", async () => {
  let applies = 0;
  let rollbacks = 0;
  await assert.rejects(
    () =>
      runElevate({
        apply: async () => {
          applies += 1;
        },
        rollback: async () => {
          rollbacks += 1;
        },
        before: () => clear(),
        after: () => ({ lh: "pass", a11y: "PASS" }) as Snapshot,
      }),
    /after\.lh is "pass"/,
  );
  assert.equal(applies, 1);
  assert.equal(rollbacks, 0);
});

test("evaluateLh and evaluateA11y statuses drive keep and refuse", async () => {
  const floors = defaultConfig().gates;
  const phoneBlock = evaluateLh({ phone: null, heavy: false, floors }).status;
  const phonePass = evaluateLh({
    phone: { performance: 90, accessibility: 90, bestPractices: 90, seo: 90 },
    heavy: false,
    floors,
  }).status;
  const a11yPass = evaluateA11y({
    violations: [],
    hasKeyboardPath: true,
    hasReducedMotion: true,
    contrastRatio: 21,
    motionUsed: false,
  }).status;
  const a11yBlock = evaluateA11y({
    violations: [{ impact: "serious", id: "button-name" }],
    hasKeyboardPath: true,
    hasReducedMotion: true,
    contrastRatio: 21,
    motionUsed: false,
  }).status;
  assert.equal(phoneBlock, "BLOCKER");
  assert.equal(phonePass, "PASS");
  assert.equal(a11yPass, "PASS");
  assert.equal(a11yBlock, "BLOCKER");

  const refusedHooks = counters();
  const refused = await runElevate(
    input(clear(), { lh: phoneBlock, a11y: a11yPass }, refusedHooks),
  );
  assert.deepEqual(refused, { status: "refused", rolledBack: true });
  assert.equal(refusedHooks.counts.apply, 1);
  assert.equal(refusedHooks.counts.rollback, 1);

  const a11yHooks = counters();
  const a11yRefused = await runElevate(
    input({ lh: phonePass, a11y: a11yPass }, { lh: phonePass, a11y: a11yBlock }, a11yHooks),
  );
  assert.deepEqual(a11yRefused, { status: "refused", rolledBack: true });
  assert.equal(a11yHooks.counts.apply, 1);

  const keptHooks = counters();
  const kept = await runElevate(
    input({ lh: phonePass, a11y: a11yPass }, { lh: phonePass, a11y: a11yPass }, keptHooks),
  );
  assert.deepEqual(kept, { status: "kept", rolledBack: false });
  assert.equal(keptHooks.counts.apply, 1);
  assert.equal(keptHooks.counts.rollback, 0);
});

test("the executor exports runElevate and does not import a browser", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /export async function runElevate\b/);
  assert.match(source, /evaluateLh/);
  assert.match(source, /evaluateA11y/);
  assert.match(source, /patch/);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.equal(source.includes("@lhci"), false);
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("node:fs"), false);
});

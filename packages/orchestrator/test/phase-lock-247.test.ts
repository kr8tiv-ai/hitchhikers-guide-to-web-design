/**
 * One transition table owns discovery, brief, design, build, Elevate, and So long.
 * Legal edges pass. A skip returns a plain sentence. Desk entries call the table.
 * The brief, Elevate, so-long, and build commands are tested in the CLI package.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { GATE_IDS, gatesJsonPath, type GateId, type GateStatus } from "@hitchhiker/qa";
import { beginPhaseSix, FLOW_PHASES, FLOW_TRANSITIONS, enterFlow, flowFilePath, readFlowFrom, requestFlowTransition, type FlowFrom, type FlowPhase, type FlowRequest } from "../src/index.ts";
import { advance } from "../src/progress.ts";
import { FLOW_TRANSITIONS as progressTable } from "../src/progress.ts";
import { RunConfigError, runElevatePicks, FLOW_TRANSITIONS as runnerTable } from "../src/runner.ts";
import { ScheduleError, insertReviews, scheduleElevatePicks, FLOW_TRANSITIONS as scheduleTable } from "../src/schedule.ts";
import { saveQueue } from "../src/queue-file.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const EDGES: ReadonlyArray<readonly [FlowFrom, FlowPhase, boolean]> = [
  ["start", "discovery", false],
  ["discovery", "discovery", false],
  ["discovery", "brief", false],
  ["brief", "discovery", false],
  ["brief", "brief", false],
  ["brief", "design", false],
  ["design", "brief", false],
  ["design", "design", false],
  ["design", "build", false],
  ["build", "design", false],
  ["build", "build", false],
  ["build", "elevate", false],
  ["elevate", "build", false],
  ["elevate", "elevate", false],
  ["elevate", "so-long", true],
  ["so-long", "elevate", false],
  ["so-long", "so-long", true],
];

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-phase-lock-"));
}

function guide(phase: GuideState["phase"]): GuideState {
  return {
    phase,
    slice: "The Guide",
    promptId: "interview:DP-1.1",
    lastGoodCommit: "abc1234",
    blockers: ["hold the towel"],
    nextAction: "answer",
    updatedAt: "2026-10-22T12:00:00.000Z",
  };
}

function writeReport(projectDir: string): void {
  const results = GATE_IDS.map((id: GateId) => ({
    id,
    status: "PASS" as GateStatus,
    reason: "This check is in good shape.",
    evidence: {},
  }));
  const file = gatesJsonPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ head: HEAD, ranAt: "2026-10-22T12:00:00.000Z", results }, null, 2)}\n`,
    "utf8",
  );
}

function savedPhase(projectDir: string): string {
  const raw: unknown = JSON.parse(readFileSync(flowFilePath(projectDir), "utf8"));
  assert.ok(raw !== null && typeof raw === "object" && "phase" in raw);
  return String((raw as { phase: unknown }).phase);
}

test("the table is one object, and every legal edge is one step", () => {
  assert.equal(progressTable, FLOW_TRANSITIONS);
  assert.equal(runnerTable, FLOW_TRANSITIONS);
  assert.equal(scheduleTable, FLOW_TRANSITIONS);
  assert.deepEqual(
    FLOW_TRANSITIONS.map((edge) => [edge.from, edge.to, edge.shipGate]),
    EDGES,
  );
  const order = ["start", ...FLOW_PHASES];
  for (const edge of FLOW_TRANSITIONS) {
    const distance = order.indexOf(edge.to) - order.indexOf(edge.from);
    assert.ok(distance >= -1 && distance <= 1, `${edge.from} -> ${edge.to}`);
    if (edge.from === "start") assert.equal(edge.to, "discovery");
    const request: FlowRequest = { from: edge.from, to: edge.to };
    if (edge.shipGate) {
      const closed = requestFlowTransition({ from: edge.from, to: edge.to, publish: true });
      assert.equal(closed.ok, false);
      assert.equal(closed.reason, "The quality check has to pass before the site can go live.");
      const stillClosed = requestFlowTransition({ from: edge.from, to: edge.to, publish: true, shipGateOk: false });
      assert.equal(stillClosed.ok, false);
      const open = requestFlowTransition({ from: edge.from, to: edge.to, publish: true, shipGateOk: true });
      assert.equal(open.ok, true);
      assert.equal(open.reason, "");
      const look = requestFlowTransition({ ...request, publish: false });
      assert.equal(look.ok, true);
    } else {
      const decision = requestFlowTransition(request);
      assert.equal(decision.ok, true, `${edge.from} -> ${edge.to}`);
      assert.equal(decision.reason, "");
    }
  }
});

test("a skip says which step is still open, in plain language", () => {
  const samples: Array<[FlowFrom, FlowPhase, string]> = [
    ["discovery", "build", "Finish the brief before building."],
    ["start", "build", "Finish the brief before building."],
    ["brief", "build", "Finish the design before building."],
    ["discovery", "design", "Finish the brief before the design."],
    ["start", "design", "Finish the brief before the design."],
    ["discovery", "elevate", "Finish the brief before Elevate."],
    ["design", "elevate", "Finish the build before Elevate."],
    ["discovery", "so-long", "Finish the brief before publishing."],
    ["brief", "so-long", "Finish the brief before publishing."],
    ["start", "so-long", "Finish the brief before publishing."],
    ["design", "so-long", "Finish the build before publishing."],
    ["build", "so-long", "Finish Elevate before publishing."],
    ["build", "discovery", "Go back one step at a time."],
    ["so-long", "brief", "Go back one step at a time."],
  ];
  for (const [from, to, reason] of samples) {
    const decision = requestFlowTransition({ from, to });
    assert.equal(decision.ok, false, `${from} -> ${to}`);
    assert.equal(decision.reason, reason);
  }
  const unknown = requestFlowTransition({ from: "nope" as FlowFrom, to: "build" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, "That step is not part of this guide.");
  const publish = requestFlowTransition({ from: "elevate", to: "so-long", publish: true });
  assert.equal(publish.ok, false);
  assert.equal(publish.reason, "The quality check has to pass before the site can go live.");

  const froms: FlowFrom[] = ["start", ...FLOW_PHASES, "nope" as FlowFrom];
  const tos: FlowPhase[] = [...FLOW_PHASES, "nope" as FlowPhase];
  for (const from of froms) {
    for (const to of tos) {
      const decision = requestFlowTransition({ from, to, publish: true });
      assert.equal(decision.reason.includes("!"), false, decision.reason);
      assert.equal(decision.reason.includes("\u2014"), false, decision.reason);
      assert.equal(/GATES/i.test(decision.reason), false, decision.reason);
      assert.equal(decision.reason.includes("undefined"), false, decision.reason);
      assert.equal(/ship gate/i.test(decision.reason), false, decision.reason);
    }
  }
});

test("a saved step wins, a quality-check file does not skip the interview, and publish is not assumed", async () => {
  const dir = tempProject();
  try {
    await saveState(dir, guide("Don't Panic"));
    const early = await enterFlow(dir, "build");
    assert.equal(early.ok, false);
    assert.equal(early.reason, "Finish the brief before building.");
    assert.equal(existsSync(flowFilePath(dir)), false);

    const brief = await enterFlow(dir, "brief");
    assert.equal(brief.ok, true);
    assert.equal(savedPhase(dir), "brief");
    const beforeDesign = await enterFlow(dir, "build");
    assert.equal(beforeDesign.ok, false);
    assert.equal(beforeDesign.reason, "Finish the design before building.");
    assert.equal(savedPhase(dir), "brief");

    assert.equal((await enterFlow(dir, "design")).ok, true);
    assert.equal((await enterFlow(dir, "build")).ok, true);
    assert.equal((await enterFlow(dir, "elevate")).ok, true);
    const blocked = await enterFlow(dir, "so-long", { publish: true, shipGateOk: false });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "The quality check has to pass before the site can go live.");
    assert.equal(savedPhase(dir), "elevate");
    const live = await enterFlow(dir, "so-long", { publish: true, shipGateOk: true });
    assert.equal(live.ok, true);
    assert.equal(savedPhase(dir), "so-long");

    writeFileSync(path.join(dir, ".hitchhiker", "queue.json"), "{}\n", "utf8");
    assert.equal(readFlowFrom(dir), "so-long");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty folder may take the next honest step, and a quality-check file means Elevate only from the start or the build", async () => {
  const empty = tempProject();
  const bare = tempProject();
  const gated = tempProject();
  const interview = tempProject();
  try {
    const built = await enterFlow(empty, "build");
    assert.equal(built.ok, true);
    assert.equal(savedPhase(empty), "build");
    const published = await enterFlow(bare, "so-long", { publish: false, write: false });
    assert.equal(published.ok, false);
    assert.equal(published.reason, "Finish the brief before publishing.");
    assert.equal(existsSync(flowFilePath(bare)), false);

    writeReport(gated);
    assert.equal(readFlowFrom(gated), "elevate");
    let deploys = 0;
    const launched = await beginPhaseSix(gated, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        deploys += 1;
      },
    });
    assert.equal(launched.ok, true);
    assert.equal(deploys, 2);
    assert.equal(savedPhase(gated), "so-long");
    assert.equal(loadState(gated), null);

    await saveState(interview, guide("Don't Panic"));
    writeReport(interview);
    assert.equal(readFlowFrom(interview), "discovery");
    let hooks = 0;
    const refused = await beginPhaseSix(interview, HEAD, {
      deploy: () => {
        hooks += 1;
      },
      launchKit: () => {
        hooks += 1;
      },
    });
    assert.equal(refused.ok, false);
    assert.equal(hooks, 0);
    assert.equal(refused.reasons[0], "Finish the brief before publishing.");
    assert.equal(existsSync(flowFilePath(interview)), false);
    assert.equal(loadState(interview)?.nextAction, "answer");
    assert.deepEqual(loadState(interview)?.blockers, ["hold the towel"]);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
    rmSync(gated, { recursive: true, force: true });
    rmSync(interview, { recursive: true, force: true });
  }
});

test("Elevate picks and a finished prompt use the same table", async () => {
  assert.deepEqual(scheduleElevatePicks([]), []);
  assert.throws(
    () => scheduleElevatePicks([{ id: "r1-01" }], "discovery"),
    (error: unknown) => error instanceof ScheduleError && error.message === "Finish the brief before building.",
  );
  const scheduled = insertReviews([{ id: "001", phase: "dont-panic" }]);
  assert.equal(scheduled[0]?.id, "001");
  assert.equal(scheduled[0]?.kind, "build");

  let spawned = 0;
  const idle = await runElevatePicks(
    [],
    async () => {
      spawned += 1;
      return { code: 0, stderr: "" };
    },
    async () => undefined,
  );
  assert.deepEqual(idle, { ran: 0, committed: 0 });
  await assert.rejects(
    () =>
      runElevatePicks(
        [],
        async () => {
          spawned += 1;
          return { code: 0, stderr: "" };
        },
        async () => undefined,
        undefined,
        "discovery",
      ),
    (error: unknown) => error instanceof RunConfigError && /Finish the brief before building/.test(error.message),
  );
  assert.equal(spawned, 0);

  const dir = tempProject();
  try {
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "running" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await saveState(dir, guide("Don't Panic"));
    const result = await advance({ projectDir: dir, finishedId: "001", outcome: "passed", commit: "abc1234" });
    assert.deepEqual(result, { nextId: "002" });
    assert.equal(existsSync(flowFilePath(dir)), false);
    assert.equal(loadState(dir)?.phase, "Don't Panic");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the orchestrator sources and the desk call the table", () => {
  const progress = readFileSync(path.join(root, "packages/orchestrator/src/progress.ts"), "utf8");
  const runner = readFileSync(path.join(root, "packages/orchestrator/src/runner.ts"), "utf8");
  const schedule = readFileSync(path.join(root, "packages/orchestrator/src/schedule.ts"), "utf8");
  const routes = readFileSync(path.join(root, "packages/app/src/server/routes.ts"), "utf8");
  const desk = readFileSync(path.join(root, "packages/app/src/server/desk-flow.ts"), "utf8");

  assert.match(progress, /holdGuidePhase/);
  assert.match(progress, /FLOW_TRANSITIONS/);
  assert.equal(progress.includes("flow.json"), false);
  assert.match(runner, /requestFlowTransition/);
  assert.equal(runner.includes("child_process"), false);
  assert.match(schedule, /requestFlowTransition/);
  assert.doesNotMatch(schedule, /node:fs/);
  assert.doesNotMatch(schedule, /from ["'].*runner/);
  assert.match(desk, /phase-lock\.ts/);
  assert.match(routes, /from "\.\/desk-flow\.ts"/);
  assert.match(routes, /allowDeskMove\(/);
  assert.match(routes, /enterFlow\(projectDir, "so-long", \{ publish: false, write: false \}\)/);
  for (const action of ["approve", "stage", "start-build", "retry", "change"]) {
    assert.match(routes, new RegExp(`action === "${action}"`));
  }
  assert.match(routes, /\/api\/brief\/draft/);
  assert.match(routes, /\/api\/brief\/approve/);
  const directionAt = routes.indexOf('pathname === "/api/direction"');
  const directionEnd = routes.indexOf("pathname.startsWith", directionAt);
  assert.equal(routes.slice(directionAt, directionEnd).includes("enterFlow"), false);
  const directionFn = routes.indexOf("async function handleDirectionPost");
  const directionBody = routes.slice(directionFn, routes.indexOf("postDirectionChoice", directionFn));
  assert.equal(directionBody.includes("enterFlow"), false);
});

test("a missing folder and an unreadable saved step do not move", async () => {
  const missing = await enterFlow("", "brief");
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "The project folder is missing, so nothing moved.");
  const dir = tempProject();
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(flowFilePath(dir), "{", "utf8");
    const bad = await enterFlow(dir, "brief");
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "The saved step could not be read, so nothing moved.");
    assert.equal(readFileSync(flowFilePath(dir), "utf8"), "{");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

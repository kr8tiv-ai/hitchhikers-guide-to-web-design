/**
 * BUG-027: `hh brief` uses the same engine path as the desk.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { loadQueue } from "@hitchhiker/engine";
import { runBriefCommand } from "../src/commands/brief.ts";
import { runCli } from "../src/main.ts";

const LINE = "The site helps a visitor book a visit.";

function sample() {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    coverage: LINE,
  };
}

test("hh brief drafts with the packet, shows without a second call, and approve starts one build", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-cli-brief-"));
  const tasks: string[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    tasks.push(req.task);
    if (req.task !== "brief-draft") throw new Error(req.task);
    assert.match(req.input, /## Context packet/);
    assert.match(req.input, /Purpose: brief/);
    return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    const drafted = await runBriefCommand(["--project", dir], process.cwd(), think as never);
    assert.equal(drafted.exitCode, 0);
    assert.match(drafted.stdout, /status: pending/);
    assert.match(drafted.stdout, /## Goal/);
    assert.equal(tasks.length, 1);
    const shown = await runBriefCommand(["--project", dir], process.cwd(), think as never);
    assert.equal(shown.exitCode, 0);
    assert.match(shown.stdout, /status: pending/);
    assert.equal(tasks.length, 1);
    const approved = await runBriefCommand(["--approve", "--project", dir], process.cwd(), think as never);
    assert.equal(approved.exitCode, 0);
    assert.match(approved.stdout, /status: approved/);
    assert.match(approved.stdout, /The build is started/);
    assert.match(approved.stdout, /phase: Babel Fish/);
    assert.equal(tasks.filter((task) => task === "brief-draft").length, 1);
    const queue = await loadQueue(dir);
    assert.ok((queue?.items.length ?? 0) > 1);
    assert.equal(queue?.items[0]?.id, "001");
    assert.equal(queue?.items[0]?.status, "queued");
    const again = await runBriefCommand(["--approve", "--project", dir], process.cwd(), think as never);
    assert.equal(again.exitCode, 0);
    assert.equal((await loadQueue(dir))?.items.length, queue?.items.length);
    assert.equal(tasks.filter((task) => task === "brief-draft").length, 1);
    const unknown = await runCli(["brief", "--nope"]);
    assert.equal(unknown.exitCode, 2);
    assert.match(unknown.stdout, /hh brief/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  defaultConfig,
  think,
  type SpawnLike,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { contrastRatio } from "../src/axe-run.ts";
import { applyFixLoop } from "../src/fix-prompts.ts";
import { lhciCollectConfig } from "../src/lhci-run.ts";
import { checkLinks } from "../src/link-check.ts";
import { captureReviewShots, startFixtureSite } from "../src/playwright-opener.ts";
import { ONCE_OVER_ID, insertOnceOver, runGates, writeOnceOver, type QueueEntry } from "../src/site-once-over.ts";
import { zaphodReview, type SitePrompt } from "../src/zaphod-vision.ts";

const PILLARS = ["copy", "visuals", "color", "type", "spacing", "experience", "motion", "brand"] as const;

const TRUTH = "The towel is on the page.";

const BODY = `<must_haves>
truths:
- ${TRUTH}
</must_haves>
`;

function prompt(overrides: Partial<SitePrompt> = {}): SitePrompt {
  return {
    id: overrides.id ?? "001-home",
    kind: overrides.kind ?? "build",
    body: overrides.body ?? BODY,
    ...(overrides.tier === undefined ? {} : { tier: overrides.tier }),
    ...(overrides.effort === undefined ? {} : { effort: overrides.effort }),
    ...(overrides.title === undefined ? {} : { title: overrides.title }),
  };
}

function reviewValue(overrides: {
  pillar?: "PASS" | "FIX" | "BLOCKER";
  boots?: boolean;
  copy?: string;
  fixes?: string[];
  brand?: number;
  note?: string;
}): Record<string, unknown> {
  const status = overrides.pillar ?? "PASS";
  const value: Record<string, unknown> = {
    truths: [{ truth: TRUTH, note: "The towel sits in the hero shot." }],
    pillars: PILLARS.map((name) => ({
      name,
      status: name === "copy" ? status : "PASS",
      note: `${name} holds in this review.`,
    })),
    jury: {
      brand: overrides.brand ?? 8,
      craft: 8,
      clarity: 8,
      performance: 8,
    },
    boots: overrides.boots ?? true,
    copy: overrides.copy ?? "A quiet towel page.",
  };
  if (overrides.fixes !== undefined) value.fixes = overrides.fixes;
  return value;
}

function cassette(value: unknown, seen: ThinkRequest<unknown>[]): typeof import("@hitchhiker/engine").think {
  return async (request) => {
    seen.push(request);
    return {
      value,
      raw: JSON.stringify(value),
      durationMs: 1,
      cassette: "hit",
    };
  };
}

function points(score: number): number {
  return score <= 1 ? score * 100 : score;
}

const ADAPTER_FLAGS = new Set([
  "-p",
  "-m",
  "--effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

describe("live gates", { concurrency: false }, () => {
  test("zaphod passes shots, the diff, and truths to vision", async () => {
    const seen: ThinkRequest<unknown>[] = [];
    const shots = ["fold.png", "full.png"];
    const diff = "hero color shifted toward paper";
    const verdict = await zaphodReview(
      { prompt: prompt(), shots, diff },
      { think: cassette(reviewValue({}), seen) },
    );
    assert.equal(verdict.verdict, "PASS");
    assert.equal(verdict.truths[0]?.status, "FOUND");
    assert.equal(seen.length, 1);
    const request = seen[0];
    assert.ok(request);
    assert.equal(request.task, "zaphod-vision");
    assert.equal(request.effort, "high");
    assert.deepEqual(request.images, shots);
    const payload = JSON.parse(request.input) as { truths: string[]; diff: string };
    assert.deepEqual(payload.truths, [TRUTH]);
    assert.equal(payload.diff, diff);
  });

  test("zaphod vision replays a recorded cassette through the adapter", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hh-zaphod-"));
    const cassetteDir = path.join(dir, "cassettes");
    const shot = path.join(dir, "fold.png");
    const value = reviewValue({});
    let spawns = 0;
    let args: readonly string[] = [];
    const spawnImpl: SpawnLike = async (request) => {
      spawns += 1;
      args = request.args;
      return {
        status: 0,
        stdout: JSON.stringify({
          text: JSON.stringify(value),
          stopReason: "end_turn",
          usage: { input_tokens: 12, output_tokens: 9 },
        }),
        stderr: "",
        timedOut: false,
        errorCode: null,
      };
    };
    const seen: ThinkRequest<unknown>[] = [];
    const recorded: typeof think = (req, deps) => {
      seen.push(req);
      return think(req, {
        ...deps,
        spawnImpl,
        projectDir: dir,
        cassetteDir,
        config: defaultConfig(),
        flags: ADAPTER_FLAGS,
        env: { HH_CASSETTE: "record", PATH: "" },
      });
    };
    try {
      writeFileSync(shot, "fold", "utf8");
      const first = await zaphodReview(
        { prompt: prompt(), shots: [shot], diff: "hero color shifted toward paper" },
        { think: recorded },
      );
      assert.equal(spawns, 1);
      assert.equal(first.verdict, "PASS");
      assert.equal(first.truths[0]?.status, "FOUND");
      assert.equal(seen.length, 1);
      const request = seen[0];
      assert.ok(request);
      assert.equal(request.task, "zaphod-vision");
      assert.equal(request.schema?.type, "object");
      assert.ok(request.schema?.required?.includes("truths"));
      assert.ok(request.schema?.required?.includes("pillars"));
      assert.ok(request.schema?.required?.includes("jury"));
      assert.deepEqual(request.images, [shot]);
      assert.equal(args.includes("--json-schema"), true);
      assert.equal(args.some((arg) => arg.includes(TRUTH)), true);
      const replayed: typeof think = (req, deps) =>
        think(req, {
          ...deps,
          spawnImpl: async () => {
            throw new Error("spawned during replay");
          },
          projectDir: dir,
          cassetteDir,
          config: defaultConfig(),
          flags: ADAPTER_FLAGS,
          env: { HH_CASSETTE: "replay", PATH: "" },
        });
      const second = await zaphodReview(
        { prompt: prompt(), shots: [shot], diff: "hero color shifted toward paper" },
        { think: replayed },
      );
      assert.equal(spawns, 1);
      assert.equal(second.verdict, "PASS");
      assert.equal(second.truths[0]?.status, "FOUND");
      assert.deepEqual(second.jury, first.jury);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("once-over and Forty-Two reviews ask for xhigh", async () => {
    const efforts: Array<string | undefined> = [];
    const think = async (request: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
      efforts.push(request.effort);
      return { value: reviewValue({}), raw: "{}", durationMs: 1, cassette: "hit" };
    };
    await zaphodReview({ prompt: prompt({ kind: "once-over" }), shots: [], diff: "" }, { think });
    await zaphodReview({ prompt: prompt({ tier: "Forty-Two" }), shots: [], diff: "" }, { think });
    await zaphodReview({ prompt: prompt({ effort: "xhigh" }), shots: [], diff: "" }, { think });
    assert.deepEqual(efforts, ["xhigh", "xhigh", "xhigh"]);
  });

  test("a two-round FIX ends as a known issue", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hh-fix-"));
    const ran: string[] = [];
    try {
      const think = cassette(reviewValue({ pillar: "FIX", fixes: ["Raise the towel contrast on the fold."] }), []);
      const initial = await zaphodReview({ prompt: prompt(), shots: ["a.png"], diff: "color" }, { think });
      assert.equal(initial.verdict, "FIX");
      assert.equal(initial.fixRound, 0);
      const result = await applyFixLoop({
        projectDir: dir,
        initial,
        nextReview: async (fixRound) =>
          zaphodReview({ prompt: prompt(), shots: ["a.png"], diff: "color", fixRound }, { think }),
        runPrompt: async (file) => {
          ran.push(file);
          const text = readFileSync(file, "utf8");
          assert.equal(text.includes("!"), false);
          assert.equal(text.includes("\u2014"), false);
          assert.match(text, /Keep the motion libraries already chosen\./);
          return 0;
        },
      });
      assert.equal(result.verdict, "PASS_WITH_KNOWN_ISSUES");
      assert.equal(result.roundsRun, 2);
      assert.equal(ran.length, 2);
      assert.equal(result.filesWritten.length, 2);
      assert.match(path.basename(result.filesWritten[0] ?? ""), /^round-1-fix-1\.md$/);
      assert.match(path.basename(result.filesWritten[1] ?? ""), /^round-2-fix-1\.md$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a site that does not boot escalates and writes no fix prompts", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hh-fix-"));
    try {
      const initial = await zaphodReview(
        { prompt: prompt(), shots: [], diff: "" },
        { think: cassette(reviewValue({ boots: false }), []) },
      );
      assert.equal(initial.verdict, "ESCALATE");
      let calls = 0;
      const result = await applyFixLoop({
        projectDir: dir,
        initial,
        nextReview: async () => initial,
        runPrompt: async () => {
          calls += 1;
          return 0;
        },
      });
      assert.equal(result.verdict, "ESCALATE");
      assert.equal(result.filesWritten.length, 0);
      assert.equal(calls, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a BLOCKER pillar escalates on the first review", async () => {
    const verdict = await zaphodReview(
      { prompt: prompt(), shots: [], diff: "" },
      { think: cassette(reviewValue({ pillar: "BLOCKER" }), []) },
    );
    assert.equal(verdict.verdict, "ESCALATE");
    assert.equal(verdict.fixes.length, 0);
  });

  test("a bad vision payload throws instead of passing", async () => {
    await assert.rejects(
      () => zaphodReview({ prompt: prompt(), shots: [], diff: "" }, { think: cassette({ nope: true }, []) }),
      /Zaphod schema failed/,
    );
  });

  test("a blocked phone run escalates", async () => {
    const verdict = await zaphodReview(
      { prompt: prompt(), shots: [], diff: "", phoneBlocked: true },
      { think: cassette(reviewValue({}), []) },
    );
    assert.equal(verdict.verdict, "ESCALATE");
    assert.equal(verdict.jury.blocked, true);
  });

  test("a jury score outside 0 to 10 throws", async () => {
    await assert.rejects(
      () =>
        zaphodReview(
          { prompt: prompt(), shots: [], diff: "" },
          { think: cassette(reviewValue({ brand: 11 }), []) },
        ),
      /brand is 11/,
    );
  });

  test("slop in the model copy is a FIX", async () => {
    const verdict = await zaphodReview(
      { prompt: prompt(), shots: [], diff: "Wow! in the diff stays out of the lint." },
      { think: cassette(reviewValue({ copy: "Wow!" }), []) },
    );
    assert.ok(verdict.slopHits > 0);
    assert.equal(verdict.verdict, "FIX");
    assert.ok(verdict.fixes.length >= 1);
  });

  test("the forty-two once-over sits before Mostly Harmless", async () => {
    const queued: QueueEntry[] = [
      { id: "001-home", kind: "build", status: "queued", phase: "improbability-drive" },
      { id: "090-harmless", kind: "build", status: "queued", phase: "mostly-harmless" },
    ];
    const placed = insertOnceOver(queued);
    assert.equal(placed[1]?.id, ONCE_OVER_ID);
    assert.equal(placed[1]?.phase, "improbability-drive");
    assert.equal(placed[1]?.kind, "review");
    assert.equal(placed[2]?.id, "090-harmless");
    assert.equal(insertOnceOver(placed).filter((item) => item.id === ONCE_OVER_ID).length, 1);
    assert.equal(insertOnceOver([{ id: "001-home", kind: "build", status: "queued" }]).at(-1)?.id, ONCE_OVER_ID);

    const dir = mkdtempSync(path.join(os.tmpdir(), "hh-once-"));
    try {
      const written = await writeOnceOver(dir, queued);
      const again = await writeOnceOver(dir, written);
      assert.equal(again.filter((item) => item.id === ONCE_OVER_ID).length, 1);
      const disk = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "queue.json"), "utf8")) as {
        items: Array<Record<string, unknown>>;
      };
      assert.equal(disk.items.some((item) => Object.hasOwn(item, "phase")), false);
      assert.equal(disk.items[1]?.id, ONCE_OVER_ID);
      const promptFile = readFileSync(path.join(dir, ".hitchhiker", "prompts", `${ONCE_OVER_ID}.md`), "utf8");
      assert.match(promptFile, /effort: xhigh/);
      assert.equal(promptFile.includes("!"), false);
      assert.equal(promptFile.includes("\u2014"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the lighthouse config keeps three mobile runs at 90", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lhci-run.ts"),
      "utf8",
    );
    assert.match(source, /minScore:\s*0\.9/);
    assert.match(source, /numberOfRuns:\s*3/);
    assert.match(source, /formFactor:\s*"mobile"/);
    assert.equal(source.includes("0.8"), false);
    const config = lhciCollectConfig(["https://127.0.0.1/"], "chrome", "lhci-upload");
    assert.equal(config.ci.collect.numberOfRuns, 3);
    assert.equal(config.ci.collect.settings.formFactor, "mobile");
    for (const key of ["performance", "accessibility", "best-practices", "seo"]) {
      assert.equal(config.ci.assert.assertions[`categories:${key}`]?.[1].minScore, 0.9);
    }
  });

  test("contrast of the starter ink on paper clears 4.5", () => {
    assert.ok(contrastRatio("rgb(27, 22, 18)", "rgb(243, 236, 223)") >= 4.5);
    assert.equal(contrastRatio("nope", "nope"), 0);
  });

  test("link check flags broken hrefs and missing ids", async () => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/ok.css") {
        res.writeHead(200, { "content-type": "text/css" });
        res.end("body{color:#111}");
        return;
      }
      if (pathname !== "/") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><title>Tiny</title>
<link rel="stylesheet" href="/ok.css"></head><body>
<h1>Tiny page</h1>
<p id="here">Enough crawlable text for the weight gate to accept this fixture page.</p>
<a href="/missing">Gone</a>
<a href="#absent">No id</a>
<a href="#here">Has id</a>
<a href="https://example.com/out">Out</a>
<a href="mailto:tea@example.com">Mail</a>
</body></html>`);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    try {
      const result = await checkLinks(`http://127.0.0.1:${address.port}/`, ["/"]);
      assert.equal(result.pass, false);
      assert.ok(result.broken.some((href) => href.endsWith("/missing")));
      assert.ok(result.broken.includes("#absent"));
      assert.equal(result.broken.some((href) => href.includes("example.com")), false);
      assert.equal(result.broken.includes("#here"), false);
      assert.equal(result.broken.some((href) => href.startsWith("mailto:")), false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test("a dead preview fails closed", { timeout: 300_000 }, async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const result = await runGates(`http://127.0.0.1:${address.port}/`, ["/"]);
    assert.equal(result.pass, false);
    assert.equal(result.lighthouse[0]?.status, "BLOCKER");
    assert.equal(result.lighthouse[0]?.scores, null);
    assert.ok(result.console.errors > 0);
    assert.ok(result.console.failedRequests > 0);
  });

  test("the starter fixture clears the real phone gates", { timeout: 600_000 }, async () => {
    const site = await startFixtureSite();
    const shotsDir = await mkdtemp(path.join(os.tmpdir(), "hh-shots-"));
    try {
      assert.match(site.url, /^https:\/\/127\.0\.0\.1:\d+$/);
      const shots = await captureReviewShots(`${site.url}/`, ["main"], shotsDir);
      assert.equal(shots.length, 16);
      for (const file of shots) assert.ok(statSync(file).size > 0);

      const gates = await runGates(`${site.url}/`, ["/", "/credits"]);
      const detail = JSON.stringify(
        {
          lighthouse: gates.lighthouse,
          axe: {
            status: gates.axe.status,
            notes: gates.axe.notes,
            violations: gates.axe.violations,
            keyboard: gates.axe.keyboard,
            reducedMotion: gates.axe.reducedMotion,
            contrastRatio: gates.axe.contrastRatio,
          },
          console: gates.console,
          links: { broken: gates.links.broken, bytes: gates.links.bytes, pass: gates.links.pass },
          weight: gates.weight,
        },
        null,
        2,
      );
      assert.equal(gates.console.errors, 0, detail);
      assert.equal(gates.console.failedRequests, 0, detail);
      assert.equal(gates.axe.status, "PASS", detail);
      assert.equal(gates.axe.keyboard, true, detail);
      assert.equal(gates.axe.reducedMotion, true, detail);
      assert.ok(gates.axe.contrastRatio >= 4.5, detail);
      assert.deepEqual(gates.links.broken, [], detail);
      assert.equal(gates.weight.status, "PASS", detail);
      assert.ok(gates.weight.bytes > 0 && gates.weight.bytes <= 1_500_000, detail);
      for (const row of gates.lighthouse) {
        assert.equal(row.status, "PASS", `${row.route} ${row.reasons.join(" | ")}`);
        assert.ok(row.scores !== null);
        assert.ok(row.runs >= 3, row.route);
        const scores = row.scores;
        for (const score of [scores.performance, scores.accessibility, scores.bestPractices, scores.seo]) {
          assert.ok(points(score) >= 90, `${row.route} ${score}`);
        }
      }
      assert.equal(gates.pass, true, detail);
    } finally {
      await site.close();
      rmSync(shotsDir, { recursive: true, force: true });
    }
  });
});

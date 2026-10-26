import assert from "node:assert/strict";
import { createServer } from "node:http";
import https from "node:https";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { judgeLhRuns, lhciCollectConfig } from "../src/lhci-run.ts";
import { evaluateMedianPhone, type LhScores } from "../src/lighthouse-gate.ts";
import { checkLinks } from "../src/link-check.ts";
import { startFixtureSite } from "../src/playwright-opener.ts";
import { ONCE_OVER_ID, insertOnceOver, writeOnceOver, type QueueEntry } from "../src/site-once-over.ts";
import { falseVisualBans, zaphodReview, type SitePrompt } from "../src/zaphod-vision.ts";
import { removeTempDir } from "./remove-temp.ts";

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
    ...falseVisualBans(),
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

function readHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`GET ${url} returned ${res.statusCode ?? 0}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
    req.on("error", reject);
  });
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
      removeTempDir(dir);
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
      removeTempDir(dir);
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
      removeTempDir(dir);
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
      removeTempDir(dir);
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
    assert.match(source, /throttlingMethod:\s*"simulate"/);
    assert.equal(source.includes("0.8"), false);
    const config = lhciCollectConfig(["https://127.0.0.1/"], "chrome", "lhci-upload");
    assert.equal(config.ci.collect.numberOfRuns, 3);
    assert.equal(config.ci.collect.settings.formFactor, "mobile");
    assert.equal(config.ci.collect.settings.throttlingMethod, "simulate");
    assert.equal(config.ci.assert.aggregationMethod, "median");
    for (const key of ["performance", "accessibility", "best-practices", "seo"]) {
      assert.equal(config.ci.assert.assertions[`categories:${key}`]?.[1].minScore, 0.9);
    }
  });

  test("the phone gate scores the median of three runs", () => {
    const sample = (performance: number): { scores: LhScores } => ({
      scores: { performance, accessibility: 1, bestPractices: 1, seo: 1 },
    });
    const noisy = judgeLhRuns("/", [sample(0.8), sample(0.96), sample(0.97)], true, "");
    assert.equal(noisy.status, "PASS");
    assert.equal(noisy.runs, 3);
    assert.equal(noisy.scores?.performance, 0.96);
    assert.equal(noisy.reasons.length, 0);

    const low = judgeLhRuns("/", [sample(0.8), sample(0.8), sample(0.97)], true, "");
    assert.equal(low.status, "BLOCKER");
    assert.equal(low.scores?.performance, 0.8);
    assert.match(low.reasons.join("\n"), /Phone performance is 80, below the floor of 90/);

    const short = judgeLhRuns("/", [sample(1), sample(1)], true, "");
    assert.equal(short.status, "BLOCKER");
    assert.match(short.reasons.join("\n"), /Expected 3 mobile runs and found 2/);

    const asserted = judgeLhRuns("/", [sample(1), sample(1), sample(1)], false, "LHCI assert failed.");
    assert.equal(asserted.status, "BLOCKER");
    assert.match(asserted.reasons.join("\n"), /LHCI assert failed/);
  });

  test("the speed gate agrees with the three-run median", () => {
    const sample = (performance: number): LhScores => ({
      performance,
      accessibility: 1,
      bestPractices: 1,
      seo: 1,
    });
    const wrapped = (performance: number): { scores: LhScores } => ({ scores: sample(performance) });
    const cases = [
      [0.8, 0.96, 0.97],
      [0.8, 0.8, 0.97],
      [1, 1],
    ] as const;
    for (const values of cases) {
      const runs = values.map((value) => sample(value));
      const judged = judgeLhRuns("/", values.map((value) => wrapped(value)), true, "");
      assert.equal(evaluateMedianPhone(runs).status, judged.status);
    }
  });

  test("the starter page inlines critical CSS and has no render-blocking head resource", async () => {
    const site = await startFixtureSite();
    try {
      for (const route of ["/", "/credits"]) {
        const html = await readHttps(`${site.url}${route}`);
        assert.equal(/<link\b[^>]*stylesheet/i.test(html), false, route);
        assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(html), false, route);
        const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
        assert.ok(scripts.length > 0, route);
        for (const tag of scripts) assert.match(tag, /type="application\/ld\+json"/);
        assert.match(html, /<style>[\s\S]*--paper:\s*#f3ecdf/);
        assert.match(html, /a:focus-visible/);
        assert.equal(html.includes("/blank.css"), false, route);
      }
    } finally {
      await site.close();
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
});

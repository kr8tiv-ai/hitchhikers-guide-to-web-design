/**
 * BUG-079. Approving the brief, then picking a direction, rewrites the
 * brand kit the approve page reads. The model is stubbed.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const LINE = "Noted for this desk run.";
const TYPE_ANSWER =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const REFERENCES =
  "Patagonia: love. Big quiet photography and plain type. Aesop: love. Restraint, lots of empty space, small calm type. Kinfolk: love. Slow editorial scroll and soft color. Airbnb Luxe: love. Cereal: meh, too cold.";

const KEYS = [
  "goal",
  "visitor",
  "action",
  "offer",
  "vibe",
  "references",
  "exists",
  "protected",
  "motion",
  "limits",
  "hosting",
  "maintainer",
  "pages",
  "features",
  "cadence",
  "languages",
  "imagery",
  "budget",
  "session",
  "logo",
  "palette",
  "coverage",
] as const;

function seed(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    `questions:
  - id: DP-1.5
    module: the-question
    depth: [express, standard, deep]
    ask: "What type should the site use?"
    why: "The type."
    input: [text]
    skip_default: "Type not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    `${JSON.stringify([
      { id: "DP-1.5", status: "ANSWERED", value: TYPE_ANSWER },
      { id: "DP-5.5", status: "ANSWERED", value: "Bright and airy, on soft sand." },
      { id: "DP-5.2", status: "ANSWERED", value: REFERENCES },
      { id: "DP-1.2", status: "ANSWERED", value: "Jungle green, sunset gold, ocean blue, soft sand, and a near-black green." },
    ])}\n`,
  );
  const draft: Record<string, string> = {};
  for (const key of KEYS) draft[key] = LINE;
  draft.offer = "Ocean-view farms in Costa Rica are sold direct.";
  draft.vibe = "The feel is calm, warm, and honest.";
  draft.references = REFERENCES;
  draft.motion = "Motion appetite is 4 of 10. Gentle parallax plays on the hero photo only.";
  draft.hosting = "Cloudflare Pages.";
  draft.pages = "Home. Farms: a grid and a detail page.";
  draft.features = "A contact form.";
  draft.imagery =
    'Photography. A mix: my own hero; free open-license stock for the non-farm pages, captioned as not a listed farm; farm pages show only the hero crop labelled "Photos coming soon" until I photograph them; AI stills only to fill gaps. Up to 50 dollars total for AI stills; no video. No video at launch.';
  draft.logo =
    "Logo file paradise-found-logo.png: a thin crescent arc over a horizon line, PARADISE FOUND in wide caps, and 'Find your calm.' under it. I'm happy with it. Maybe a white version for dark backgrounds.";
  draft.palette = "Jungle green, sunset gold, ocean blue, soft sand, and a near-black green.";
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, planApproved: false, error: "", fallback: false })}\n`,
  );
}

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function kitText(html: string): string {
  return /<section data-brand-kit>[\s\S]*?<pre>([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? "";
}

function artPrompt(dir: string): string {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  for (const name of readdirSync(folder)) {
    if (!/^\d{3}\.md$/.test(name)) continue;
    const text = readFileSync(path.join(folder, name), "utf8");
    if (text.includes("REQ-ART-DIRECTION")) return text;
  }
  assert.fail("art prompt");
}

const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
  throw new Error(req.task);
};

test("a picked direction rewrites the brand kit on Approvals", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-approve-243f-"));
  seed(dir);
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/approve");
    assert.equal(home.status, 200);
    const token = tokenFrom(home.body);
    const drafted = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(drafted.status, 303);
    const page = await raw(handle.port, "GET", "/approve");
    const before = kitText(page.body);
    assert.match(before, /Dealt families: Syne and Spline Sans/);
    assert.match(page.body, /data-pick-direction="dir-patagonia"/);
    const picked = await raw(
      handle.port,
      "POST",
      "/api/direction",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ id: "dir-patagonia", reason: "The owner loves Patagonia's big quiet photography." }),
    );
    assert.equal(picked.status, 200);
    const after = await raw(handle.port, "GET", "/approve");
    const kit = kitText(after.body);
    assert.match(kit, /Picked families: Boska and General Sans/);
    assert.match(kit, /words win over Boska/);
    assert.equal(kit.includes("Syne"), false);
    assert.equal(kit.includes("Spline Sans"), false);
    const prompt = artPrompt(dir);
    assert.match(prompt, /Families: Boska and General Sans/);
    assert.equal(prompt.includes("Syne"), false);
    const snapshot = prompt;
    const planned = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(planned.status, 303);
    assert.equal(artPrompt(dir), snapshot);
    const stages = await raw(handle.port, "GET", "/approve");
    assert.match(stages.body, /data-design-stage="sitemap"/);
    assert.match(kitText(stages.body), /Picked families: Boska and General Sans/);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

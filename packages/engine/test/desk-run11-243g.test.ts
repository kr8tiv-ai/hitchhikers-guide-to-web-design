/**
 * Desk Run 11 design stages. The style guide follows the owner's sans
 * wish, fluid clamps reach both ends, buttons clear body contrast, the
 * sitemap uses the brief, a reference names the site, and DESIGN.md
 * does not repeat a section. The model is not called.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseDirection, readDirectionDeal, renderDirectionBlock, type DirectionDeal } from "../src/brand/directions.ts";
import { contrastRatio, writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { TYPE_LIBRARY } from "../src/brand/type-library.ts";
import { typeScaleFor } from "../src/brand/type-scale.ts";
import { planFromBrief } from "../src/spec/brief-plan.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";
import { renderDesignMd } from "../src/spec/design-outputs.ts";

const TYPE_ANSWER =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const COLOURS =
  "Jungle green, sunset gold, and ocean blue, from the hero photo, plus soft sand and a near-black green. Sunset gold is the accent. Soft sand is the page.";
const REFERENCES =
  "Patagonia: love. Big quiet photography and plain type. Aesop: love. Restraint, lots of empty space, small calm type. Kinfolk: love. Slow editorial scroll and soft color. Airbnb Luxe: love. Cereal: meh, too cold.";
const PAGES =
  "Pages: Home; Farms (grid plus map, filters, a detail page per farm with gallery, specs, map and prefilled inquiry); Live on the Land (caretaker program with sign-up form); How Buying Works (steps with independent lawyers, glossary: folio real, plano catastrado, escritura, ZMT); Eco-Building and Food; About; Contact. Footer: legal disclaimer, privacy, EN/ES switch, newsletter.";

const RUN11_ANSWERS = [
  { id: "DP-2.7", value: "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers." },
  { id: "DP-2.8", value: PAGES },
  { id: "DP-1.5", value: TYPE_ANSWER },
  { id: "DP-1.2", value: COLOURS },
  { id: "DP-5.1", value: "Patagonia: big quiet photography and plain type." },
  { id: "DP-5.2", value: REFERENCES },
  { id: "DP-5.5", value: "Bright and airy, on soft sand." },
  { id: "DP-5.6", value: "Photography." },
  { id: "DP-6.2", value: "4." },
];

const PICKED_FONTS = { display: "Boska", body: "General Sans", source: "picked direction" };

function run11Brief(): string {
  return [
    "# Site Brief",
    "",
    "## Offer",
    "",
    "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers.",
    "",
    "## Vibe",
    "",
    "The feel is calm, warm, and honest. It should never be salesy, cluttered, or loud.",
    "",
    "## References",
    "",
    REFERENCES,
    "",
    "## Motion",
    "",
    "Motion appetite is 4 of 10. Gentle parallax plays on the hero photo only.",
    "",
    "## Imagery",
    "",
    "Photography. Fields at dusk on soft sand.",
    "",
    "## Colours",
    "",
    COLOURS,
    "",
    "## Pages",
    "",
    PAGES,
    "",
    "## Hosting",
    "",
    "Cloudflare Pages.",
    "",
  ].join("\n");
}

function project(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function approve(dir: string, markdown: string): void {
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(path.join(hitch, "SITE-BRIEF.md"), markdown, "utf8");
  writeFileSync(
    path.join(hitch, "brief-yes.json"),
    `${JSON.stringify({ approved: true, at: "2026-10-26T16:07:13.039Z" })}\n`,
    "utf8",
  );
  writeFileSync(path.join(hitch, "interview.json"), `${JSON.stringify(RUN11_ANSWERS)}\n`, "utf8");
}

function quoted(source: string, key: string): string {
  const match = new RegExp(`${key}: ("(?:\\\\.|[^"\\\\])*")`).exec(source);
  assert.ok(match?.[1], key);
  return JSON.parse(match[1]) as string;
}

function displayFamily(markdown: string): string {
  const match = /typography:\s*\n\s*display:\s*\n\s*fontFamily:\s*"([^"]+)"/.exec(markdown);
  assert.ok(match?.[1], "display fontFamily");
  return match[1];
}

function preferredRem(clamp: string, viewportPx: number): { min: number; max: number; preferred: number } {
  const match = /clamp\(([0-9.]+)rem,\s*([0-9.-]+)rem \+ ([0-9.]+)vw,\s*([0-9.]+)rem\)/.exec(clamp);
  assert.ok(match, clamp);
  const min = Number(match[1]);
  const intercept = Number(match[2]);
  const slope = Number(match[3]);
  const max = Number(match[4]);
  const preferred = intercept + (slope / 100) * (viewportPx / 16);
  return { min, max, preferred };
}

function sectionBodies(markdown: string): Map<string, string> {
  const without = markdown.startsWith("---\n") ? markdown.slice(markdown.indexOf("\n---\n") + 5) : markdown;
  const bodies = new Map<string, string>();
  for (const part of without.split(/^## /m).slice(1)) {
    const breakAt = part.indexOf("\n");
    const heading = (breakAt < 0 ? part : part.slice(0, breakAt)).trim();
    const body = (breakAt < 0 ? "" : part.slice(breakAt + 1)).trim();
    assert.equal(bodies.has(heading), false, heading);
    bodies.set(heading, body);
  }
  return bodies;
}

function pageSections(sitemap: string, title: string): string[] {
  const lines = sitemap.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`- ${title} at `));
  assert.ok(start >= 0, title);
  const sections: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^- /.test(line) || /^## /.test(line)) break;
    if (/^\s+-\s+/.test(line)) sections.push(line.replace(/^\s+-\s+/, "").trim());
  }
  return sections;
}

function wireSections(wireframe: string, title: string): string[] {
  const chunk = wireframe.split(`## ${title}\n`)[1]?.split(/^## /m)[0] ?? "";
  return [...chunk.matchAll(/\| ([^|\n]+?)\s+\|/g)].map((match) => (match[1] ?? "").trim()).filter((label) => label !== "");
}

function pageTitles(sitemap: string): string[] {
  return [...sitemap.matchAll(/^- (.+?) at \S+/gm)].map((match) => match[1] ?? "");
}

function buttonColours(markdown: string): { text: string; background: string } {
  const text = /textColor:\s*"([^"]+)"/.exec(markdown)?.[1] ?? "";
  const background = /backgroundColor:\s*"([^"]+)"/.exec(markdown)?.[1] ?? "";
  const color = (token: string): string => {
    if (/^#[0-9a-fA-F]{6}$/.test(token)) return token.toLowerCase();
    const ref = /^\{colors\.([A-Za-z][\w-]*)\}$/.exec(token);
    assert.ok(ref?.[1], token);
    const hex = new RegExp(`^\\s*${ref[1]}:\\s*"(#[0-9a-fA-F]{6})"`, "m").exec(markdown)?.[1];
    assert.ok(hex, ref[1]);
    return hex.toLowerCase();
  };
  return { text: color(text), background: color(background) };
}

function statedPairs(markdown: string): { label: string; text: string; background: string; ratio: number }[] {
  const pairs: { label: string; text: string; background: string; ratio: number }[] = [];
  for (const match of markdown.matchAll(/([A-Za-z][\w -]*?) text (#[0-9a-fA-F]{6}) on (#[0-9a-fA-F]{6}) at ([0-9.]+) to 1/g)) {
    pairs.push({
      label: match[1] ?? "",
      text: (match[2] ?? "").toLowerCase(),
      background: (match[3] ?? "").toLowerCase(),
      ratio: Number(match[4]),
    });
  }
  return pairs;
}

function licensedFoundrySans(name: string, foundry: string): boolean {
  return TYPE_LIBRARY.some((pair) => {
    if (pair.foundry !== foundry || pair.ship === "trial-only") return false;
    if (pair.display !== name && pair.body !== name) return false;
    const clause = pair.display === name ? (pair.rationale.split(/\band\b/i)[0] ?? "") : (pair.rationale.split(/\band\b/i)[1] ?? pair.rationale);
    return /\b(?:sans|grotesque|grotesk)\b/i.test(clause);
  });
}

test("fluid type clamps equal the minimum at 360px and the maximum at 1440px", () => {
  const scale = typeScaleFor(TYPE_ANSWER);
  const roles = {
    display: scale.display,
    heading: scale.heading,
    title: scale.title,
    body: scale.body,
    caption: scale.caption,
  };
  for (const [role, clamp] of Object.entries(roles)) {
    const atMin = preferredRem(clamp, 360);
    const atMax = preferredRem(clamp, 1440);
    assert.ok(Math.abs(atMin.preferred - atMin.min) <= 0.01, `${role} at 360 is ${atMin.preferred}, minimum ${atMin.min}`);
    assert.ok(Math.abs(atMax.preferred - atMax.max) <= 0.01, `${role} at 1440 is ${atMax.preferred}, maximum ${atMax.max}`);
  }
});

test("a direction reference names the site, and an unknown url uses the host", () => {
  const kit = renderDirectionBlock({
    pickedId: null,
    directions: [
      {
        id: "dir-lando-norris",
        name: "Depth instead of a second pitch",
        description: "Depth and a single object do the explaining.",
        citationId: "lando-norris",
        title: "Depth instead of a second pitch",
        url: "https://landonorris.com/",
        display: "New Title",
        body: "General Sans",
        sectionOrder: ["hero", "essay", "gallery", "colophon"],
        hue: "#101400",
      },
      {
        id: "dir-patagonia",
        name: "Big quiet photography",
        description: "A wide photograph carries the page.",
        citationId: "patagonia",
        title: "Patagonia",
        url: "https://www.patagonia.com/",
        display: "Boska",
        body: "General Sans",
        sectionOrder: ["hero", "gallery", "story", "visit"],
        hue: "#1f6b4a",
      },
      {
        id: "dir-example",
        name: "A studied page",
        description: "An unknown host.",
        citationId: "not-in-the-library",
        title: "A studied page",
        url: "https://www.example.com/path",
        display: "Switzer",
        body: "Switzer",
        sectionOrder: ["hero"],
        hue: "#111111",
      },
    ],
  } satisfies DirectionDeal);
  assert.match(kit, /### Depth instead of a second pitch/);
  assert.match(kit, /Reference: Lando Norris\. https:\/\/landonorris\.com\//);
  assert.doesNotMatch(kit, /Reference: Depth instead of a second pitch/);
  assert.match(kit, /Reference: Patagonia\. https:\/\/www\.patagonia\.com\//);
  assert.match(kit, /Reference: example\.com\. https:\/\/www\.example\.com\/path/);
});

test("DESIGN.md writes each section once and does not repeat the intro", () => {
  const design = renderDesignMd(run11Brief(), RUN11_ANSWERS, PICKED_FONTS);
  const bodies = sectionBodies(design);
  assert.ok(bodies.has("Color"));
  assert.ok(bodies.has("Type scale"));
  assert.ok(bodies.has("Colors"));
  assert.ok(bodies.has("Typography"));
  const intro = (design.split(/^# Design\s*\n/m)[1] ?? "").split(/^## /m)[0]?.trim() ?? "";
  assert.notEqual(intro, "");
  assert.notEqual(bodies.get("Overview"), intro);
  const seen = new Map<string, string>();
  for (const [heading, body] of bodies) {
    const prior = seen.get(body);
    assert.equal(prior, undefined, `${heading} repeats ${prior ?? ""}`);
    seen.set(body, heading);
  }
});

test("every normal-size text pair in the style guide clears 4.5 to 1", () => {
  const design = renderDesignMd(run11Brief(), RUN11_ANSWERS, PICKED_FONTS);
  const button = buttonColours(design);
  const buttonRatio = contrastRatio(button.text, button.background);
  assert.ok(buttonRatio >= 4.5, `button ${button.text} on ${button.background} is ${buttonRatio}`);
  const pairs = statedPairs(design);
  const statedButton = pairs.find((pair) => pair.label === "Button");
  assert.ok(statedButton, "the style guide states the button ratio");
  assert.equal(statedButton.text, button.text);
  assert.equal(statedButton.background, button.background);
  assert.ok(Math.abs(statedButton.ratio - buttonRatio) <= 0.01);
  assert.ok(pairs.length >= 3);
  for (const pair of pairs) {
    const actual = contrastRatio(pair.text, pair.background);
    assert.ok(actual >= 4.5, `${pair.label} ${pair.text} on ${pair.background} is ${actual}`);
    assert.ok(Math.abs(pair.ratio - actual) <= 0.01, pair.label);
  }
});

test("a serif display yields to a licensed sans from the same foundry when the body is also a serif", () => {
  const design = renderDesignMd("# Site Brief\n\n## Type\n\nLight, wide, airy sans for headings.\n", [
    { id: "DP-1.5", value: "Light, wide, airy sans for headings." },
  ], { display: "Boska", body: "Boska", source: "picked direction" });
  const display = displayFamily(design);
  assert.notEqual(display, "Boska");
  const foundry = TYPE_LIBRARY.find((pair) => pair.display === "Boska")?.foundry ?? "";
  assert.equal(licensedFoundrySans(display, foundry), true, display);
  const displayBlock = /typography:\s*\n\s*display:\s*\n\s*fontFamily:\s*"([^"]+)"/.exec(design)?.[1] ?? "";
  assert.equal(displayBlock.includes("Boska"), false);
});

test("Run 11 sitemap, wireframe, and style guide follow the brief and the sans wish", () => {
  const dir = project("hh-243g-");
  try {
    const markdown = run11Brief();
    approve(dir, markdown);
    writeBrandKit(dir, RUN11_ANSWERS);
    const prompts = path.join(dir, ".hitchhiker", "prompts");
    mkdirSync(prompts, { recursive: true });
    writeFileSync(
      path.join(prompts, "001.md"),
      "Acceptance: Type voice: Light, wide, airy sans for headings like the logo. Families: Syne and Spline Sans.\n",
      "utf8",
    );
    chooseDirection(dir, "dir-patagonia", "The owner loves Patagonia's big quiet photography.");
    const picked = readDirectionDeal(dir);
    const direction = picked?.directions.find((item) => item.id === "dir-patagonia");
    assert.ok(direction);
    assert.ok(direction.sectionOrder.length > 1);

    const before = planFromBrief(markdown, RUN11_ANSWERS);
    advanceDesignStages(dir, { brief: markdown, answers: RUN11_ANSWERS });
    const sitemap = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    assert.deepEqual(pageTitles(sitemap), before.pages.map((page) => page.title));
    assert.deepEqual(planFromBrief(markdown, RUN11_ANSWERS).requirements, before.requirements);

    const home = pageSections(sitemap, "Home");
    assert.ok(home.length > 1, home.join(", "));
    for (const section of direction.sectionOrder) assert.ok(home.includes(section), section);

    const farms = pageSections(sitemap, "Farms");
    for (const section of ["grid", "map", "filters"]) assert.ok(farms.includes(section), farms.join(", "));
    const detail = pageSections(sitemap, "Farm detail");
    for (const section of ["gallery", "specs", "map", "inquiry"]) assert.ok(detail.includes(section), detail.join(", "));
    const buying = pageSections(sitemap, "How Buying Works");
    for (const section of ["steps", "glossary"]) assert.ok(buying.includes(section), buying.join(", "));
    const land = pageSections(sitemap, "Live on the Land");
    assert.ok(land.includes("sign-up"), land.join(", "));

    advanceDesignStages(dir, { brief: markdown, answers: RUN11_ANSWERS, approval: { stage: "sitemap", text: "Approved." } });
    const wireframe = readFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "utf8");
    assert.deepEqual(wireSections(wireframe, "Home"), home);
    assert.deepEqual(wireSections(wireframe, "Farms"), farms);
    assert.deepEqual(wireSections(wireframe, "Farm detail"), detail);

    advanceDesignStages(dir, { brief: markdown, answers: RUN11_ANSWERS, approval: { stage: "wireframe", text: "Approved." } });
    const design = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.equal(displayFamily(design), "General Sans");
    assert.match(design, /Families: General Sans\./);
    assert.doesNotMatch(design, /fontFamily: "Boska"/);
    assert.doesNotMatch(design, /Families: [^.\n]*Boska/);
    const brand = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    const type = /## Type\n\n([\s\S]*?)\n## /.exec(brand)?.[1] ?? "";
    assert.match(type, /Picked families: General Sans\./);
    assert.equal(type.includes("Boska"), false);
    const source = readFileSync(path.join(dir, "src", "data", "brand.ts"), "utf8");
    assert.equal(quoted(source, "display"), "General Sans");
    assert.equal(quoted(source, "body"), "General Sans");
    const prompt = readFileSync(path.join(prompts, "001.md"), "utf8");
    assert.match(prompt, /Families: General Sans\./);
    assert.equal(prompt.includes("Boska"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

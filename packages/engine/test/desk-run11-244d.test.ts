/**
 * Desk Run 11: an unset contact stays a missing fact, component chrome speaks
 * to the visitor, and the offer and disclaimer are said once. The close check
 * fails a placeholder address, page narration, and a sentence repeated past
 * the footer plus the inquiry form. A prompt that does not own the file is
 * left alone. QA and launch read the whole site.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  ensureSiteBuild,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { generateSkeleton, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import {
  formatPlaceholderContactFailure,
  formatRepeatedSentenceFailure,
  scanPlaceholderContacts,
  scanRepeatedSentences,
} from "../src/spec/site-surface.ts";
import { scanVisibleCopy, VISIBLE_COPY_PATTERNS } from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

function immediate(): BuildSpawn {
  return () => ({ pid: 244401, done: Promise.resolve(ok()) });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

function promptFor(requirement: string, file: string): string {
  return [
    "## Task",
    "",
    `Prompt 001. ${requirement}`,
    `Files: ${file}`,
    `Requirements: ${requirement}`,
    "",
    "## Design language",
    "",
    "Example only.",
    "",
  ].join("\n");
}

function writeHtml(dir: string, files: Record<string, string>): void {
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(dir, "dist", rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, html, "utf8");
  }
}

function nameProject(dir: string, name: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name })}\n`, "utf8");
}

async function runBuild(dir: string, prompt: string, html: Record<string, string>): Promise<{ reason: string; status: string }> {
  nameProject(dir, "Example Site");
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), prompt, "utf8");
  writeHtml(dir, html);
  setProjectBuildRunner(dir, immediate());
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  return { reason: readBuildRun(dir)?.reason ?? "", status: readBuildRun(dir)?.status ?? "" };
}

function taskText(prompt: SitePromptSkeleton): string {
  return [prompt.title, ...(prompt.acceptance ?? [])].join(" ");
}

function byRequirement(prompts: readonly SitePromptSkeleton[], id: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.requirements.includes(id));
  assert.ok(found, id);
  return found;
}

function byTitle(prompts: readonly SitePromptSkeleton[], title: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.title === title);
  assert.ok(found, title);
  return found;
}

const DISCLAIMER = "One legal line belongs in the footer and may be shown only once more.";
const SHORT = "A short legal line stays once in the footer for guests.";
const TWELVE = "One legal line belongs in the footer and may be shown once.";

function page(body: string): string {
  return `<!doctype html><html><head><title>Farm | Example Site</title><meta name="description" content="Ask about this farm."></head><body>${body}</body></html>`;
}

function copies(sentence: string, count: number): string {
  return Array.from({ length: count }, () => `<p>${sentence}</p>`).join("");
}

const NARRATION = [
  "Read this line",
  "The line is on this page.",
  "You can read this page in English or in Spanish. You stay on this page.",
  "English comes first. Spanish comes second.",
  "English. You are still on this page.",
  "One email, held here",
  "This email stays on this page.",
  "A WhatsApp number is not listed on this page.",
  "What is known about this farm is written here.",
  "The top edge is ocean blue and the bottom edge is jungle green. They are not a pin.",
  "Choose the mark to read this farm.",
];

const RESERVED = [".example", ".test", ".invalid", "example.com", "example.org", "555-"];

test("component, data, and form prompts forbid an invented contact", () => {
  const prompts = generateSkeleton({
    pages: [
      { id: "home", title: "Home", sections: ["hero"], route: "/" },
      { id: "farm-detail", title: "Farm detail", sections: ["inquiry"], route: "/farms/[id]" },
    ],
    effects: [],
    features: [
      "contact form",
      "farm inquiry prefilled with farm id",
      "footer legal disclaimer",
      "EN-ES toggle",
      "footer newsletter signup",
      "WhatsApp link",
      "favorites",
      "map",
      "gallery",
      "filters, sort, and URL state",
    ],
    integrations: [],
    seoItems: ["sitemap"],
    stack: "astro",
    protectedPaths: [],
    brief: "Paradise Found lists private farms.",
  }).prompts;

  const jobs = [
    byRequirement(prompts, "REQ-ROUTES"),
    byTitle(prompts, "Build the hero layout on Home."),
    byTitle(prompts, "Add the feature: contact form."),
    byTitle(prompts, "Add the feature: farm inquiry prefilled with farm id."),
  ];
  for (const prompt of jobs) {
    const text = taskText(prompt);
    for (const form of RESERVED) assert.ok(text.includes(form), `${prompt.title} ${form}`);
    assert.match(text, /missing-fact state/);
    assert.match(text, /sending is not connected yet/);
    assert.match(text, /no transport is shown/);
    assert.match(text, /next real step/);
  }

  const vite = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: ["contact form"],
    integrations: [],
    seoItems: [],
    stack: "vite-react",
    protectedPaths: [],
    brief: "Paradise Found lists private farms.",
  }).prompts;
  const viteForm = byTitle(vite, "Add the feature: contact form.");
  assert.ok(viteForm.filesModified.some((file) => file.startsWith("src/world/Feature")));
  assert.match(taskText(viteForm), /555-/);
  assert.match(taskText(viteForm), /sending is not connected yet/);
});

test("copy prompts and component chrome speak to the visitor", () => {
  const prompts = generateSkeleton({
    pages: [
      { id: "home", title: "Home", sections: ["hero"], route: "/" },
      { id: "farm-detail", title: "Farm detail", sections: ["inquiry"], route: "/farms/[id]" },
    ],
    effects: [],
    features: [
      "contact form",
      "footer legal disclaimer",
      "EN-ES toggle",
      "footer newsletter signup",
      "WhatsApp link",
      "favorites",
      "map",
      "gallery",
      "filters, sort, and URL state",
    ],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "Paradise Found lists private farms.",
  }).prompts;

  const chrome = [
    byRequirement(prompts, "REQ-COPY-hero"),
    byRequirement(prompts, "REQ-ELEVATE-COPY"),
    byRequirement(prompts, "REQ-LAYOUT"),
    byRequirement(prompts, "REQ-NAV"),
    byTitle(prompts, "Add the feature: contact form."),
    byTitle(prompts, "Add the feature: footer legal disclaimer."),
    byTitle(prompts, "Add the feature: EN-ES toggle."),
    byTitle(prompts, "Add the feature: footer newsletter signup."),
    byTitle(prompts, "Add the feature: WhatsApp link."),
    byTitle(prompts, "Add the feature: favorites."),
    byTitle(prompts, "Add the feature: map."),
    byTitle(prompts, "Add the feature: gallery."),
    byTitle(prompts, "Add the feature: filters, sort, and URL state."),
  ];
  for (const prompt of chrome) {
    const text = taskText(prompt);
    assert.match(text, /Speak to the visitor in calm, warm, plain sentences about what they can do/);
    assert.match(text, /Never describe the page, its layout, its colours, its position on screen/);
    assert.match(text, /written here/);
    assert.match(text, /on this page/);
    assert.match(text, /held here/);
    assert.match(text, /not listed on this page/);
    assert.match(text, /is not a pin/);
    assert.match(text, /Never restate a requirement as copy/);
  }
});

test("the farm page and the layout say the disclaimer and the offer once", () => {
  const prompts = generateSkeleton({
    pages: [
      { id: "home", title: "Home", sections: ["hero"], route: "/" },
      { id: "farm-detail", title: "Farm detail", sections: ["inquiry"], route: "/farms/[id]" },
    ],
    effects: [],
    features: ["footer legal disclaimer", "farm inquiry prefilled with farm id", "favorites", "gallery", "map"],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "Paradise Found lists private farms.",
  }).prompts;

  const holders = [
    byRequirement(prompts, "REQ-LAYOUT"),
    byTitle(prompts, "Add the Farm detail route."),
    byTitle(prompts, "Place real copy in the inquiry section."),
    byTitle(prompts, "Build the inquiry layout on Farm detail."),
    byTitle(prompts, "Add the feature: footer legal disclaimer."),
    byTitle(prompts, "Add the feature: farm inquiry prefilled with farm id."),
    byTitle(prompts, "Add the feature: favorites."),
    byTitle(prompts, "Add the feature: gallery."),
    byTitle(prompts, "Add the feature: map."),
  ];
  for (const prompt of holders) {
    const text = taskText(prompt);
    assert.match(text, /legal disclaimer appears once in the footer/);
    assert.match(text, /at most once next to the inquiry form/);
    assert.match(text, /offer line appears once per page/);
    assert.match(text, /Other sections do not repeat them/);
  }
  assert.equal(taskText(byTitle(prompts, "Add the Home route.")).includes("once per page"), false);
  assert.equal(taskText(byRequirement(prompts, "REQ-COPY-hero")).includes("once per page"), false);
});

test("a placeholder contact fails and names the file, and a real address passes", () => {
  const dir = tempDir("hh-244d-place-");
  try {
    writeHtml(dir, {
      "farm/index.html": page("<p>Messages go to hello@paradisefound.example</p>"),
      "form/index.html": page('<form data-destination="hello@paradisefound.example"></form>'),
      "phone/index.html": page('<a href="tel:555-0100">Call</a>'),
      "post/index.html": page('<form action="https://example.org/send"></form>'),
      "real/index.html": page('<a href="mailto:hello@paradisefound.com">hello@paradisefound.com</a>'),
      "plain/index.html": page("<p>Ask about this farm.</p>"),
      "near/index.html": page("<p>notexample.com</p><p>https://paradisefound.com</p>"),
      "hidden/index.html": page(
        "<!-- hello@paradisefound.example --><script>const to = 'hello@paradisefound.example';</script><style>.a{color:example.com}</style><p>Photos coming soon.</p>",
      ),
    });
    const root = path.join(dir, "dist");
    const hits = scanPlaceholderContacts(root);
    const reason = formatPlaceholderContactFailure(hits);
    assert.match(reason, /Placeholder contact failed/);
    assert.match(reason, /dist\/farm\/index\.html/);
    assert.match(reason, /Messages go to hello@paradisefound\.example/);
    assert.match(reason, /dist\/form\/index\.html: data-destination="hello@paradisefound\.example"/);
    assert.match(reason, /dist\/phone\/index\.html: href="tel:555-0100"/);
    assert.match(reason, /dist\/post\/index\.html: action="https:\/\/example\.org\/send"/);
    for (const file of ["real/index.html", "plain/index.html", "near/index.html", "hidden/index.html"]) {
      assert.equal(hits.some((hit) => hit.file === file), false, file);
    }
    assert.deepEqual(scanPlaceholderContacts(path.join(dir, "missing")), []);
    assert.equal(formatPlaceholderContactFailure([]), "");

    const many: Record<string, string> = {};
    for (let index = 0; index < 41; index += 1) {
      many[`n-${String(index).padStart(2, "0")}/index.html`] = page("<p>hello@paradisefound.example</p>");
    }
    const capped = tempDir("hh-244d-cap-");
    try {
      writeHtml(capped, many);
      const cappedReason = formatPlaceholderContactFailure(scanPlaceholderContacts(path.join(capped, "dist")));
      const listed = cappedReason.split("\n").filter((line) => line.startsWith("dist/"));
      assert.equal(listed.length, 40);
      assert.match(cappedReason, /\.\.\. and 1 more/);
    } finally {
      removeTempDir(capped);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("page narration fails and ordinary farm sentences pass", () => {
  const ids = VISIBLE_COPY_PATTERNS.map((pattern) => pattern.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    "on-this-page",
    "held-here",
    "you-stay-on-this-page",
    "still-on-this-page",
    "not-listed-on-this-page",
    "comes-first-second",
    "is-not-a-pin",
    "top-edge",
    "read-this-line",
    "choose-the-mark",
    "written-here",
  ]) {
    assert.ok(ids.includes(id), id);
    assert.equal(VISIBLE_COPY_PATTERNS.find((pattern) => pattern.id === id)?.scope, "copy");
  }

  const dir = tempDir("hh-244d-narr-");
  try {
    const files: Record<string, string> = {};
    NARRATION.forEach((sentence, index) => {
      files[`line-${String(index).padStart(2, "0")}.html`] = `<p>${sentence}</p>`;
    });
    files["ok.html"] = [
      "<p>Ask about this farm.</p>",
      "<p>Photos coming soon.</p>",
      "<p>Save this farm to your shortlist.</p>",
      "<p>Sending is not connected yet.</p>",
    ].join("");
    writeHtml(dir, files);
    const hits = scanVisibleCopy(path.join(dir, "dist"));
    NARRATION.forEach((sentence, index) => {
      const file = `line-${String(index).padStart(2, "0")}.html`;
      assert.ok(hits.some((hit) => hit.file === file), sentence);
    });
    assert.equal(hits.some((hit) => hit.file === "ok.html"), false);
    assert.ok(NARRATION.length >= 8);
  } finally {
    removeTempDir(dir);
  }
});

test("the same long sentence fails on the third copy and passes on the second", () => {
  assert.equal(DISCLAIMER.split(/\s+/).length, 14);
  assert.equal(SHORT.split(/\s+/).length, 11);
  assert.equal(TWELVE.split(/\s+/).length, 12);
  const long = `${Array.from({ length: 14 }, () => "extraordinarily").join(" ")}.`;
  const dir = tempDir("hh-244d-repeat-");
  try {
    writeHtml(dir, {
      "farm/index.html": page(copies(DISCLAIMER, 3)),
      "twice/index.html": page(copies(DISCLAIMER, 2)),
      "short/index.html": page(copies(SHORT, 3)),
      "twelve/index.html": page(copies(TWELVE, 3)),
      "once/index.html": page(copies(DISCLAIMER, 1)),
      "long/index.html": page(copies(long, 3)),
    });
    const hits = scanRepeatedSentences(path.join(dir, "dist"));
    const reason = formatRepeatedSentenceFailure(hits);
    assert.match(reason, /Repeated sentence failed/);
    assert.match(reason, /dist\/farm\/index\.html: One legal line belongs in the footer and may be shown only once more\./);
    assert.match(reason, /dist\/twelve\/index\.html:/);
    assert.equal(hits.some((hit) => hit.file === "twice/index.html"), false);
    assert.equal(hits.some((hit) => hit.file === "short/index.html"), false);
    assert.equal(hits.some((hit) => hit.file === "once/index.html"), false);
    const longHit = hits.find((hit) => hit.file === "long/index.html");
    assert.ok(longHit);
    assert.equal(reason.includes(long), false);
    assert.match(longHit.detail, /^extraordinarily/);
    assert.ok(longHit.detail.length < long.length);
    assert.equal(formatRepeatedSentenceFailure([]), "");
  } finally {
    removeTempDir(dir);
  }
});

test("a prompt that does not own the file is not failed, and a QA prompt is", async () => {
  const owned = tempDir("hh-244d-own-");
  const other = tempDir("hh-244d-other-");
  const component = tempDir("hh-244d-comp-");
  const launch = tempDir("hh-244d-qa-");
  const clean = tempDir("hh-244d-clean-");
  const body = `${page(`<p>Messages go to hello@paradisefound.example</p><form data-destination="hello@paradisefound.example"></form>${copies(DISCLAIMER, 3)}`)}`;
  const bad = { "farm/index.html": body };
  try {
    const owner = await runBuild(owned, promptFor("REQ-PAGE-farm", "src/pages/farm.astro"), bad);
    assert.equal(owner.status, "failed");
    assert.match(owner.reason, /Placeholder contact failed/);
    assert.match(owner.reason, /dist\/farm\/index\.html/);
    assert.match(owner.reason, /hello@paradisefound\.example/);
    assert.match(owner.reason, /data-destination="hello@paradisefound\.example"/);
    assert.match(owner.reason, /Repeated sentence failed/);
    assert.match(owner.reason, /One legal line belongs in the footer/);

    const skipped = await runBuild(other, promptFor("REQ-PAGE-home", "src/pages/index.astro"), bad);
    assert.equal(skipped.status, "passed");
    assert.equal(skipped.reason, "");

    const footer = await runBuild(component, promptFor("REQ-STRUCT-footer", "src/components/Footer.astro"), bad);
    assert.equal(footer.status, "passed");
    assert.equal(footer.reason, "");

    const qa = await runBuild(launch, promptFor("REQ-LAUNCH", "src/styles/tokens.css"), bad);
    assert.equal(qa.status, "failed");
    assert.match(qa.reason, /Placeholder contact failed/);
    assert.match(qa.reason, /dist\/farm\/index\.html/);
    assert.match(qa.reason, /Repeated sentence failed/);

    const quiet = await runBuild(clean, promptFor("REQ-PAGE-farm", "src/pages/farm.astro"), {
      "farm/index.html": page("<p>Ask about this farm.</p><p>Photos coming soon.</p>"),
    });
    assert.equal(quiet.status, "passed");
    assert.equal(quiet.reason, "");
  } finally {
    await cleanup(owned);
    await cleanup(other);
    await cleanup(component);
    await cleanup(launch);
    await cleanup(clean);
  }
});

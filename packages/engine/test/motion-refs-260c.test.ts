/**
 * 260c: optional motion clips and approximate section crops.
 * Providers are fakes. No network and no real Grok call.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import {
  ConfigError,
  approveComp,
  approveMotionRef,
  approvedMotionRefs,
  compCandidateRel,
  defaultConfig,
  draftMotionRefs,
  listComps,
  motionClipRel,
  parseConfig,
  prepareSiteBuild,
  sectionCropRel,
  type CompView,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a visit.";
const KEY = "xai-test-key-260c-do-not-leak";
const HOME_REF = "reference/renders/home.png";

const HOME_AND_VISIT = `# Sitemap

## Primary

- Home at /
  - still water
  - the path
  - the shore
  - the dock
- Visit at /visit
  - arrival
`;

const TWO_BANDS = `# Sitemap

## Primary

- Home at /
  - the path
  - the reeds
`;

const THREE_BANDS = `# Sitemap

## Primary

- Home at /
  - still water
  - the path
  - the shore
`;

interface VideoCall {
  model: string;
  prompt: string;
  seconds: number;
  resolution: string;
  aspect?: string;
  referenceImages?: readonly string[];
  generateAudio?: boolean;
  image?: string;
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-260c-"));
}

function projectPath(dir: string, rel: string): string {
  return path.join(dir, ...rel.split("/"));
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function writeSitemap(dir: string, body: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), body, "utf8");
}

function writeConfig(dir: string, config: Record<string, unknown>): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "config.json"), `${JSON.stringify(config)}\n`, "utf8");
}

function writeMedia(dir: string, settings: Record<string, unknown>): void {
  const folder = path.join(dir, ".hitchhiker", "assets");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "media.json"), `${JSON.stringify(settings)}\n`, "utf8");
}

function plant(dir: string, route: string, view: CompView, bytes: Buffer): string {
  const rel = compCandidateRel(route, view, 1);
  const abs = projectPath(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  return rel;
}

function fakePng(label: string): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(label)]);
}

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    c ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Small RGB PNG. Each row is one flat colour so sliced bands stay distinct. */
function rgbPng(width: number, height: number, colorAt: (y: number) => [number, number, number]): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    const [red, green, blue] = colorAt(y);
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function headerOnlyPng(height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(4, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function notes(dir: string): string {
  const file = path.join(dir, "reference", "comps", "README.md");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8");
}

function recordingProvider(calls: VideoCall[], bytes = "clip-bytes"): {
  startVideo(req: VideoCall): Promise<{ id: string }>;
  pollVideo(id: string): Promise<{ bytes: Uint8Array }>;
} {
  return {
    async startVideo(req) {
      calls.push(req);
      return { id: `job-${calls.length}` };
    },
    async pollVideo() {
      return { bytes: Buffer.from(bytes) };
    },
  };
}

function writeLedDocs(dir: string): void {
  writeFileSync(
    path.join(dir, "DESIGN.md"),
    [
      "# Design",
      "",
      "## Signature moments",
      "",
      "- id: shore-hold",
      "- name: Shore hold",
      "- description: The shore holds still. The water moves past it.",
      "- section: the shore",
      "- recipe: pinnedTimeline",
      "- approach: pin the band",
      "- fallback: a still frame",
      "- echoes: none",
      "- budget: maxJsKb 12, maxFrameMs 16, lcp 2.5, cls 0.1",
      "",
      "## Motion constitution",
      "",
      "Easings: brand-out: power3.out.",
      "Duration bands: story 0.8-1.4s.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(dir, "MOTION.md"),
    [
      "# MOTION",
      "",
      "- still water: motion-led",
      "- the dock: motion-led",
      "- arrival: motion-led",
      "- home-scroll on documentElement (page home, kind smooth-scroll, taxonomy A1): lenis.",
      "",
    ].join("\n"),
    "utf8",
  );
}

function sectionMotion(dir: string, id: string): { motion?: string; motionApproved?: { sha256: string } } | undefined {
  const page = listComps(dir).pages.find((item) => item.route === "/");
  return page?.sections.find((item) => item.id === id);
}

test("design.motionRefs defaults and rejects unknown or out of range values", () => {
  const defaults = defaultConfig().design.motionRefs;
  assert.deepEqual(defaults, {
    enabled: true,
    model: "grok-imagine-video-1.5-lite",
    seconds: 6,
    resolution: "480p",
    max: 3,
  });
  const partial = parseConfig({ design: { minReferenceImages: 4 } });
  assert.deepEqual(partial.design.motionRefs, defaults);
  assert.deepEqual(partial.design.comps, defaultConfig().design.comps);
  const off = parseConfig({ design: { motionRefs: { enabled: false } } });
  assert.equal(off.design.motionRefs.enabled, false);
  assert.equal(off.design.motionRefs.model, defaults.model);
  assert.equal(off.design.motionRefs.seconds, defaults.seconds);
  assert.equal(off.design.motionRefs.resolution, defaults.resolution);
  assert.equal(off.design.motionRefs.max, defaults.max);
  assert.throws(() => parseConfig({ design: { motionRefs: { nope: true } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { model: "grok-imagine-image" } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { seconds: 0 } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { seconds: 16 } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { max: -1 } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { resolution: "4k" } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { motionRefs: { enabled: "yes" } } }), ConfigError);
});

test("only motion-led sections get clips, capped at max, from the approved comp", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME_AND_VISIT);
    writeLedDocs(dir);
    writeConfig(dir, { design: { comps: { long: false }, motionRefs: { max: 2 } } });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("home-desktop")));
    const calls: VideoCall[] = [];
    const written = await draftMotionRefs(dir, { provider: recordingProvider(calls) });
    assert.deepEqual(written, [motionClipRel("/", "still-water"), motionClipRel("/", "the-shore")]);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.deepEqual(call.referenceImages, [HOME_REF]);
      assert.equal(call.generateAudio, false);
      assert.equal(call.model, "grok-imagine-video-1.5-lite");
      assert.equal(call.seconds, 6);
      assert.equal(call.resolution, "480p");
      assert.equal(call.aspect, "16:9");
      assert.equal(call.image, undefined);
    }
    const stillPrompt = readFileSync(projectPath(dir, motionClipRel("/", "still-water").replace(/\.mp4$/, ".prompt.txt")), "utf8");
    const shorePrompt = readFileSync(projectPath(dir, motionClipRel("/", "the-shore").replace(/\.mp4$/, ".prompt.txt")), "utf8");
    assert.equal(stillPrompt, calls[0]?.prompt);
    assert.equal(shorePrompt, calls[1]?.prompt);
    for (const prompt of [stillPrompt, shorePrompt]) {
      assert.equal(prompt.includes("Direction:"), true);
      assert.equal(prompt.includes("Pin:"), true);
      assert.equal(prompt.includes("Parallax:"), true);
      assert.equal(prompt.includes("Reveal order:"), true);
      assert.equal(prompt.includes("Easing feel:"), true);
      assert.equal(prompt.includes("brand-out power3.out"), true);
      assert.equal(prompt.includes("No readable text."), true);
      assert.equal(prompt.includes("\u2014"), false);
      assert.equal(prompt.includes("!"), false);
    }
    assert.equal(stillPrompt.includes("Pin: none"), true);
    assert.equal(stillPrompt.includes("band 1 of 4"), true);
    assert.equal(stillPrompt.toLowerCase().includes("still water"), false);
    assert.equal(shorePrompt.includes("Pin: hold"), true);
    assert.equal(shorePrompt.includes("band 3 of 4"), true);
    assert.equal(shorePrompt.toLowerCase().includes("the shore"), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "the-path"))), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "the-dock"))), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/visit", "arrival"))), false);

    const again = await draftMotionRefs(dir, { provider: recordingProvider(calls) });
    assert.deepEqual(again, []);
    assert.equal(calls.length, 2);

    assert.deepEqual(approvedMotionRefs(dir), []);
    assert.throws(() => approveMotionRef(dir, "/", "the-path"), /No motion clip for that section/);
    const approval = approveMotionRef(dir, "/", "still-water");
    assert.equal(approval.file, motionClipRel("/", "still-water"));
    assert.equal(approval.sha256, sha256(projectPath(dir, approval.file)));
    assert.match(approval.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const passed = approvedMotionRefs(dir);
    assert.equal(passed.length, 1);
    assert.equal(passed[0]?.sectionId, "still-water");
    assert.equal(passed[0]?.route, "/");
    assert.equal(passed[0]?.sha256, approval.sha256);
    assert.equal(approvedMotionRefs(dir).some((item) => item.sectionId === "the-shore"), false);

    writeFileSync(projectPath(dir, approval.file), Buffer.from("tampered-clip"));
    assert.deepEqual(approvedMotionRefs(dir), []);
    assert.equal(sectionMotion(dir, "still-water")?.motion, motionClipRel("/", "still-water"));
    assert.equal(sectionMotion(dir, "still-water")?.motionApproved, undefined);
  } finally {
    removeTempDir(dir);
  }
});

test("config overrides are sent on the video request", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, TWO_BANDS);
    writeFileSync(
      path.join(dir, "MOTION.md"),
      "- the path: motion-led\n",
      "utf8",
    );
    writeConfig(dir, {
      design: {
        comps: { long: false },
        motionRefs: { model: "grok-imagine-video-1.5", seconds: 8, resolution: "720p", max: 1 },
      },
    });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("desktop")));
    const calls: VideoCall[] = [];
    await draftMotionRefs(dir, { provider: recordingProvider(calls) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, "grok-imagine-video-1.5");
    assert.equal(calls[0]?.seconds, 8);
    assert.equal(calls[0]?.resolution, "720p");
    assert.equal(calls[0]?.aspect, "16:9");
    assert.equal(calls[0]?.generateAudio, false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "the-reeds"))), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a motion assignment marks its section and a page scroll owner does not", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, TWO_BANDS);
    writeFileSync(
      path.join(dir, "MOTION.md"),
      [
        "- home-scroll on documentElement (page home, kind smooth-scroll, taxonomy A1): lenis.",
        "- reeds on the-reeds (page home, kind scroll-sequence, taxonomy C2): gsap.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeConfig(dir, { design: { comps: { long: false } } });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("desktop")));
    const calls: VideoCall[] = [];
    const written = await draftMotionRefs(dir, { provider: recordingProvider(calls) });
    assert.deepEqual(written, [motionClipRel("/", "the-reeds")]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.prompt.includes("a smooth settle"), true);
    assert.equal(calls[0]?.prompt.includes("band 2 of 2"), true);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "the-path"))), false);
  } finally {
    removeTempDir(dir);
  }
});

test("disabled motion refs draft no clips and no crops", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    writeFileSync(path.join(dir, "MOTION.md"), "- still water: motion-led\n", "utf8");
    writeConfig(dir, { design: { motionRefs: { enabled: false } } });
    const painted = rgbPng(4, 6, (y) => [y * 20, 0, 0]);
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", painted));
    approveComp(dir, "/", "desktop-long", plant(dir, "/", "desktop-long", painted));
    const calls: VideoCall[] = [];
    const written = await draftMotionRefs(dir, { provider: recordingProvider(calls) });
    assert.deepEqual(written, []);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "still-water"))), false);
    assert.equal(existsSync(projectPath(dir, sectionCropRel("/", "still-water"))), false);
    const page = listComps(dir).pages.find((item) => item.route === "/");
    assert.ok(page);
    for (const section of page.sections) {
      assert.equal(section.band, undefined);
      assert.equal(section.crop, undefined);
      assert.equal(section.motion, undefined);
    }
    assert.equal(existsSync(path.join(dir, "reference", "comps", "README.md")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a provider failure writes a note and does not block the build", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    writeFileSync(path.join(dir, "MOTION.md"), "- still water: motion-led\n- the path: motion-led\n", "utf8");
    writeConfig(dir, { design: { comps: { long: false } } });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("desktop")));
    approveComp(dir, "/", "mobile", plant(dir, "/", "mobile", fakePng("phone")));
    let calls = 0;
    const written = await draftMotionRefs(dir, {
      key: KEY,
      provider: {
        async startVideo() {
          calls += 1;
          throw new Error(`provider down ${KEY}`);
        },
        async pollVideo() {
          return { bytes: Buffer.from("nope") };
        },
      },
    });
    assert.deepEqual(written, []);
    assert.equal(calls, 1);
    const readme = notes(dir);
    assert.equal(readme.includes("provider down"), true);
    assert.equal(readme.includes(KEY), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "still-water"))), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "the-path"))), false);
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("an approved long sketch is sliced into approximate section bands", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    const painted = rgbPng(4, 6, (y) => [y < 2 ? 10 : y < 4 ? 80 : 200, 20, 30]);
    approveComp(dir, "/", "desktop-long", plant(dir, "/", "desktop-long", painted));
    const written = await draftMotionRefs(dir);
    assert.deepEqual(written, []);
    const page = listComps(dir).pages.find((item) => item.route === "/");
    assert.ok(page);
    const bands = page.sections.map((section) => section.band);
    assert.deepEqual(bands, [
      { y: 0, height: 2, approximate: true },
      { y: 2, height: 2, approximate: true },
      { y: 4, height: 2, approximate: true },
    ]);
    const crops = page.sections.map((section) => {
      assert.equal(section.crop, sectionCropRel("/", section.id));
      const bytes = readFileSync(projectPath(dir, section.crop ?? ""));
      return { size: pngSize(bytes), bytes };
    });
    assert.deepEqual(crops.map((crop) => crop.size), [
      { width: 4, height: 2 },
      { width: 4, height: 2 },
      { width: 4, height: 2 },
    ]);
    assert.equal(crops[0]?.bytes.equals(crops[1]?.bytes ?? Buffer.alloc(0)), false);
    assert.equal(crops[1]?.bytes.equals(crops[2]?.bytes ?? Buffer.alloc(0)), false);
    assert.equal(notes(dir).includes("could not be sliced"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a long sketch that cannot be sliced still records approximate bands", async () => {
  const truncated = tempDir();
  const garbage = tempDir();
  try {
    writeSitemap(truncated, THREE_BANDS);
    approveComp(truncated, "/", "desktop-long", plant(truncated, "/", "desktop-long", headerOnlyPng(5)));
    await draftMotionRefs(truncated);
    const shortPage = listComps(truncated).pages.find((item) => item.route === "/");
    assert.deepEqual(
      shortPage?.sections.map((section) => section.band),
      [
        { y: 0, height: 2, approximate: true },
        { y: 2, height: 2, approximate: true },
        { y: 4, height: 1, approximate: true },
      ],
    );
    for (const section of shortPage?.sections ?? []) {
      assert.equal(section.crop, undefined);
      assert.equal(existsSync(projectPath(truncated, sectionCropRel("/", section.id))), false);
    }
    const shortNote = notes(truncated);
    assert.equal(shortNote.includes("approximate"), true);
    assert.equal(shortNote.includes("could not be sliced"), true);

    writeSitemap(garbage, THREE_BANDS);
    approveComp(garbage, "/", "desktop-long", plant(garbage, "/", "desktop-long", Buffer.from("this is not a png")));
    await draftMotionRefs(garbage);
    const fallback = listComps(garbage).pages.find((item) => item.route === "/");
    assert.deepEqual(
      fallback?.sections.map((section) => section.band),
      [
        { y: 0, height: 960, approximate: true },
        { y: 960, height: 960, approximate: true },
        { y: 1920, height: 960, approximate: true },
      ],
    );
    for (const section of fallback?.sections ?? []) {
      assert.equal(existsSync(projectPath(garbage, sectionCropRel("/", section.id))), false);
    }
    assert.equal(notes(garbage).includes("could not be sliced"), true);
  } finally {
    removeTempDir(truncated);
    removeTempDir(garbage);
  }
});

test("grok-cli video instructions carry the approved comp path and audio off", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    writeFileSync(path.join(dir, "MOTION.md"), "- still water: motion-led\n", "utf8");
    writeConfig(dir, { design: { comps: { long: false } } });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("desktop")));
    const instructions: string[] = [];
    await draftMotionRefs(dir, {
      spawn: async (request) => {
        const flag = request.args.indexOf("--prompt-file");
        const promptFile = request.args[flag + 1] ?? "";
        const text = readFileSync(promptFile, "utf8");
        instructions.push(text);
        const destLine = text.split("\n").find((line) => line.startsWith("Save the video bytes to ")) ?? "";
        writeFileSync(destLine.slice("Save the video bytes to ".length), Buffer.from("cli-video"));
        return { status: 0, stdout: "", stderr: "", timedOut: false, errorCode: null };
      },
    });
    assert.equal(instructions.length, 1);
    const instruction = instructions[0] ?? "";
    assert.equal(instruction.includes("Use these reference images as video inputs:"), true);
    assert.equal(instruction.includes(path.resolve(dir, HOME_REF)), true);
    assert.equal(instruction.includes("generate_audio: false"), true);
    const prompt = readFileSync(projectPath(dir, motionClipRel("/", "still-water").replace(/\.mp4$/, ".prompt.txt")), "utf8");
    assert.equal(prompt.includes("Direction:"), true);
    assert.equal(prompt.includes("No readable text."), true);
    assert.equal(readFileSync(projectPath(dir, motionClipRel("/", "still-water"))).toString(), "cli-video");
  } finally {
    removeTempDir(dir);
  }
});

test("the API path quotes the clip, sends the comp as a data URI, and keeps audio off", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    writeFileSync(path.join(dir, "MOTION.md"), "- still water: motion-led\n", "utf8");
    writeConfig(dir, { imagineBudgetUsd: 1, design: { comps: { long: false } } });
    writeMedia(dir, { order: ["api"], api: true, browser: false });
    const painted = rgbPng(4, 2, () => [12, 40, 90]);
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", painted));
    const calls: VideoCall[] = [];
    const fetched: string[] = [];
    await draftMotionRefs(dir, {
      key: KEY,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetched.push(url);
        assert.equal(url, "https://cdn.example/motion.mp4");
        return new Response(Buffer.from("api-video"), { status: 200, headers: { "content-type": "video/mp4" } });
      },
      client: {
        async startVideo(req) {
          calls.push(req);
          return { id: "job-260c" };
        },
        async pollVideo() {
          return { url: "https://cdn.example/motion.mp4" };
        },
      },
    });
    assert.equal(calls.length, 1);
    const desktop = readFileSync(projectPath(dir, HOME_REF));
    assert.deepEqual(calls[0]?.referenceImages, [`data:image/png;base64,${desktop.toString("base64")}`]);
    assert.equal(calls[0]?.generateAudio, false);
    assert.equal(calls[0]?.model, "grok-imagine-video-1.5-lite");
    assert.equal(calls[0]?.seconds, 6);
    assert.equal(calls[0]?.resolution, "480p");
    assert.equal(calls[0]?.aspect, "16:9");
    assert.equal(calls[0]?.image, undefined);
    assert.deepEqual(fetched, ["https://cdn.example/motion.mp4"]);
    const spend = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "assets", "spend.json"), "utf8")) as {
      spentUsd: number;
    };
    assert.equal(spend.spentUsd, 0.12);
    assert.equal(readFileSync(projectPath(dir, motionClipRel("/", "still-water"))).toString(), "api-video");
    assert.equal(notes(dir).includes(KEY), false);
  } finally {
    removeTempDir(dir);
  }
});

test("an API clip over the budget is a note and does not call Imagine", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_BANDS);
    writeFileSync(path.join(dir, "MOTION.md"), "- still water: motion-led\n", "utf8");
    writeConfig(dir, { imagineBudgetUsd: 0, design: { comps: { long: false } } });
    writeMedia(dir, { order: ["api"], api: true, browser: false });
    approveComp(dir, "/", "desktop", plant(dir, "/", "desktop", fakePng("desktop")));
    let starts = 0;
    let fetches = 0;
    const written = await draftMotionRefs(dir, {
      key: KEY,
      fetchImpl: async () => {
        fetches += 1;
        return new Response(Buffer.from("nope"), { status: 200 });
      },
      client: {
        async startVideo() {
          starts += 1;
          return { id: "job-should-not-run" };
        },
        async pollVideo() {
          return { url: "https://cdn.example/motion.mp4" };
        },
      },
    });
    assert.deepEqual(written, []);
    assert.equal(starts, 0);
    assert.equal(fetches, 0);
    assert.equal(notes(dir).includes("Cap exceeded"), true);
    assert.equal(notes(dir).includes(KEY), false);
    assert.equal(existsSync(projectPath(dir, motionClipRel("/", "still-water"))), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    removeTempDir(dir);
  }
});

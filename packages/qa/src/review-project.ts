/**
 * Build the ReviewProject an elevate round passes into gateProblems.
 * index.html and the lab file are required. Missing measurements stay
 * missing. This module does not invent a page, a device run, or a score.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { briefAsksForWebglHero, type QueueFile } from "@hitchhiker/engine";
import type { SectionShot } from "./beauty-gate.ts";
import type { PhonePictureSignals, ReviewProject } from "./review-runners.ts";
import type { TypeWorld } from "./type-gate.ts";
import { VISUAL_BAN_KEYS } from "./zaphod-vision.ts";

export interface ElevateReviewGap {
  path: string;
  produce: string;
}

export type ElevateReviewLoad =
  | { ok: true; project: ReviewProject }
  | { ok: false; gaps: readonly ElevateReviewGap[]; message: string };

const LAB_REL = ".hitchhiker/review/lab.json";
const WORLDS = ["editorial", "3d-world", "playful", "brutalist", "product", "fashion", "civic"] as const;
const QUEUE_STATUS = ["queued", "running", "passed", "failed", "interrupted", "fixing", "escalated", "paused"] as const;
const MARKS = ["color", "aria", "text"] as const;

const INDEX_PRODUCE =
  "Build the site so index.html is at the project root. The type gate reads that file. Prompts alone do not build the page.";
const LAB_PRODUCE =
  "Write .hitchhiker/review/lab.json from the device lab. Include the measured device runs, with heavy set to true or false, the nav sample, with currentMark set to color, aria, or text, and the self-score, with creativity from 0 to 10. Elevate does not invent these.";

export function loadElevateReview(projectDir: string): ElevateReviewLoad {
  const root = path.resolve(projectDir);
  const gaps: ElevateReviewGap[] = [];
  const html = readIndex(root, gaps);
  const lab = readLab(root, gaps);
  if (html === null || lab === null) return refused(gaps);
  const project = buildProject(root, html, lab, gaps);
  if (project === null) return refused(gaps);
  return { ok: true, project };
}

function refused(gaps: readonly ElevateReviewGap[]): ElevateReviewLoad {
  const lines = ["Elevate refused. The review gates need a built page and a lab. Nothing was invented.", ""];
  for (const gap of gaps) {
    lines.push(`Missing: ${gap.path}`, gap.produce, "");
  }
  return { ok: false, gaps, message: lines.join("\n").trimEnd() };
}

function readIndex(root: string, gaps: ElevateReviewGap[]): string | null {
  const file = path.join(root, "index.html");
  if (!existsSync(file)) {
    gaps.push({ path: "index.html", produce: INDEX_PRODUCE });
    return null;
  }
  return readFileSync(file, "utf8");
}

function readLab(root: string, gaps: ElevateReviewGap[]): Record<string, unknown> | null {
  const file = path.join(root, ".hitchhiker", "review", "lab.json");
  if (!existsSync(file)) {
    gaps.push({ path: LAB_REL, produce: LAB_PRODUCE });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    gaps.push({
      path: LAB_REL,
      produce: ".hitchhiker/review/lab.json is not valid JSON. Write it from the device lab. Elevate does not invent the measurements.",
    });
    return null;
  }
  if (!isRecord(parsed)) {
    gaps.push({
      path: LAB_REL,
      produce: ".hitchhiker/review/lab.json is not a lab object. Write it from the device lab. Elevate does not invent the measurements.",
    });
    return null;
  }
  return parsed;
}

function buildProject(
  root: string,
  html: string,
  lab: Record<string, unknown>,
  gaps: ElevateReviewGap[],
): ReviewProject | null {
  const before = gaps.length;
  const world = readWorld(lab, gaps);
  const page = readText(lab, "page", gaps);
  const section = readText(lab, "section", gaps);
  const brief = readBrief(root, lab, gaps);
  const artDirection = readProse(root, lab, ".hitchhiker/ART-DIRECTION.md", "artDirection", gaps);
  const designLanguage = readProse(root, lab, ".hitchhiker/DESIGN-LANGUAGE.md", "designLanguage", gaps);
  const scores = readScores(lab, gaps);
  const phoneSignals = readPhone(lab, gaps);
  const palette = readPalette(lab, gaps);
  const devices = readDevices(lab, gaps);
  const nav = readNav(lab, gaps);
  const self = readSelf(lab, gaps);
  const shots = readShots(lab, gaps);
  const matrixProjects = readMatrixProjects(lab, gaps);
  const matrixSections = readStringList(lab, "matrixSections", gaps);
  const queue = readQueue(root, gaps);
  if (
    gaps.length !== before ||
    world === null ||
    page === null ||
    section === null ||
    brief === null ||
    artDirection === null ||
    designLanguage === null ||
    scores === null ||
    phoneSignals === null ||
    palette === null ||
    devices === null ||
    nav === null ||
    self === null ||
    shots === null ||
    matrixProjects === null ||
    matrixSections === null ||
    queue === null
  ) {
    return null;
  }
  return {
    root,
    pageSource: html,
    pageFile: "index.html",
    shots,
    world,
    matrixProjects,
    matrixSections,
    matrixHooks: closedHooks(),
    mobileDocument: () => {
      throw new Error("The lab did not include this mobile document. Run the device lab.");
    },
    motionSample: () => {
      throw new Error("The lab did not include this reduced-motion sample. Run the device lab.");
    },
    sweepSample: () => {
      throw new Error("The lab did not include this state sweep. Run the device lab.");
    },
    brief,
    asksFor3d: briefAsksForWebglHero(brief),
    html,
    phoneSignals,
    devices,
    nav,
    palette,
    self,
    scores,
    queue,
    gateIds: readGateIds(lab, queue),
    round: nextRound(root),
    artDirection,
    designLanguage,
    now: new Date().toISOString(),
    page,
    section,
  };
}

function closedHooks(): ReviewProject["matrixHooks"] {
  return {
    engineReady() {
      return undefined;
    },
    screenshot() {
      return Promise.reject(new Error("The lab did not include this device capture. Run the device lab."));
    },
    detail() {
      return Promise.reject(new Error("The lab did not include this detail capture. Run the device lab."));
    },
    scrollStrip() {
      return Promise.reject(new Error("The lab did not include this scroll strip. Run the device lab."));
    },
  };
}

function readWorld(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): TypeWorld | null {
  const value = lab.world;
  if (typeof value === "string" && (WORLDS as readonly string[]).includes(value)) return value as TypeWorld;
  gaps.push(fieldGap("world"));
  return null;
}

function readText(lab: Record<string, unknown>, key: string, gaps: ElevateReviewGap[]): string | null {
  const value = lab[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  gaps.push(fieldGap(key));
  return null;
}

function readBrief(root: string, lab: Record<string, unknown>, gaps: ElevateReviewGap[]): string | null {
  for (const rel of ["SITE-BRIEF.md", ".hitchhiker/SITE-BRIEF.md", "BRIEF.md"]) {
    const text = readOptional(root, rel);
    if (text !== "") return text;
  }
  if (typeof lab.brief === "string" && lab.brief.trim() !== "") return lab.brief.trim();
  gaps.push({
    path: "SITE-BRIEF.md",
    produce:
      "Add a non-empty brief at SITE-BRIEF.md, .hitchhiker/SITE-BRIEF.md, or BRIEF.md, or set brief in .hitchhiker/review/lab.json. Elevate does not invent the brief.",
  });
  return null;
}

function readProse(
  root: string,
  lab: Record<string, unknown>,
  rel: string,
  key: string,
  gaps: ElevateReviewGap[],
): string | null {
  const fromFile = readOptional(root, rel);
  if (fromFile !== "") return fromFile;
  const value = lab[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  gaps.push({
    path: rel,
    produce: `Add ${key} to .hitchhiker/review/lab.json, or write ${rel}. Elevate does not invent it.`,
  });
  return null;
}

function readScores(
  lab: Record<string, unknown>,
  gaps: ElevateReviewGap[],
): ReviewProject["scores"] | null {
  const scores = lab.scores;
  if (!isRecord(scores)) {
    gaps.push(fieldGap("scores"));
    return null;
  }
  const brand = finite(scores.brand);
  const craft = finite(scores.craft);
  const clarity = finite(scores.clarity);
  const performance = finite(scores.performance);
  if (brand === null) gaps.push(fieldGap("scores.brand"));
  if (craft === null) gaps.push(fieldGap("scores.craft"));
  if (clarity === null) gaps.push(fieldGap("scores.clarity"));
  if (performance === null) gaps.push(fieldGap("scores.performance"));
  if (brand === null || craft === null || clarity === null || performance === null) return null;
  return { brand, craft, clarity, performance };
}

function readPhone(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): PhonePictureSignals | null {
  const signals = lab.phoneSignals;
  if (!isRecord(signals)) {
    gaps.push(fieldGap("phoneSignals"));
    return null;
  }
  const reducedMotion = boolField(signals.reducedMotion);
  const viewportWidth = finite(signals.viewportWidth);
  const saveData = boolField(signals.saveData);
  const cores = finite(signals.cores);
  if (reducedMotion === null) gaps.push(fieldGap("phoneSignals.reducedMotion"));
  if (viewportWidth === null) gaps.push(fieldGap("phoneSignals.viewportWidth"));
  if (saveData === null) gaps.push(fieldGap("phoneSignals.saveData"));
  if (cores === null) gaps.push(fieldGap("phoneSignals.cores"));
  if (reducedMotion === null || viewportWidth === null || saveData === null || cores === null) return null;
  const phone: PhonePictureSignals = { reducedMotion, viewportWidth, saveData, cores };
  if ("webglAvailable" in signals) {
    if (typeof signals.webglAvailable !== "boolean") {
      gaps.push(fieldGap("phoneSignals.webglAvailable"));
      return null;
    }
    phone.webglAvailable = signals.webglAvailable;
  }
  if ("tierOverride" in signals) {
    const tier = signals.tierOverride;
    if (tier !== 0 && tier !== 1 && tier !== 2 && tier !== 3) {
      gaps.push(fieldGap("phoneSignals.tierOverride"));
      return null;
    }
    phone.tierOverride = tier;
  }
  return phone;
}

function readPalette(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): ReviewProject["palette"] | null {
  const palette = lab.palette;
  if (!isRecord(palette) || !isRecord(palette.shares)) {
    gaps.push(fieldGap("palette"));
    return null;
  }
  const enabled = boolField(palette.enabled);
  const dominant = share(palette.shares.dominant);
  const secondary = share(palette.shares.secondary);
  const accent = share(palette.shares.accent);
  if (enabled === null) gaps.push(fieldGap("palette.enabled"));
  if (dominant === null) gaps.push(fieldGap("palette.shares.dominant"));
  if (secondary === null) gaps.push(fieldGap("palette.shares.secondary"));
  if (accent === null) gaps.push(fieldGap("palette.shares.accent"));
  if (enabled === null || dominant === null || secondary === null || accent === null) return null;
  return { enabled, shares: { dominant, secondary, accent } };
}

function readDevices(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): ReviewProject["devices"] | null {
  const devices = lab.devices;
  if (!isRecord(devices)) {
    gaps.push(fieldGap("devices"));
    return null;
  }
  let ok = true;
  if (typeof devices.heavy !== "boolean") {
    gaps.push(fieldGap("devices.heavy"));
    ok = false;
  }
  for (const key of ["mobile", "desktop", "tablet"] as const) {
    if (!isRecord(devices[key])) {
      gaps.push(fieldGap(`devices.${key}`));
      ok = false;
    }
  }
  if (!ok) return null;
  // Inner device runs stay as measured. The gate fails closed when a run is thin.
  return devices as unknown as ReviewProject["devices"];
}

function readNav(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): ReviewProject["nav"] | null {
  const nav = lab.nav;
  if (!isRecord(nav)) {
    gaps.push(fieldGap("nav"));
    return null;
  }
  const mark = nav.currentMark;
  if (typeof mark !== "string" || !(MARKS as readonly string[]).includes(mark)) {
    gaps.push(fieldGap("nav.currentMark"));
    return null;
  }
  // The rest of the nav sample stays as measured. The gate fails closed when a field is thin.
  return nav as unknown as ReviewProject["nav"];
}

function readSelf(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): ReviewProject["self"] | null {
  const self = lab.self;
  if (!isRecord(self)) {
    gaps.push(fieldGap("self"));
    return null;
  }
  const creativity = finite(self.creativity);
  if (creativity === null || creativity < 0 || creativity > 10) {
    gaps.push(fieldGap("self.creativity"));
    return null;
  }
  // The rest of the self-score stays as measured. The gate fails closed when a field is thin.
  return self as unknown as ReviewProject["self"];
}

function readShots(lab: Record<string, unknown>, gaps: ElevateReviewGap[]): SectionShot[] | null {
  if (!Array.isArray(lab.shots)) {
    gaps.push(fieldGap("shots"));
    return null;
  }
  const shots: SectionShot[] = [];
  for (const item of lab.shots) {
    const shot = asShot(item);
    if (shot === null) {
      gaps.push(fieldGap("shots"));
      return null;
    }
    shots.push(shot);
  }
  return shots;
}

function asShot(value: unknown): SectionShot | null {
  if (!isRecord(value)) return null;
  const page = text(value.page);
  const section = text(value.section);
  const screenshot = text(value.screenshot);
  const reason = typeof value.reason === "string" ? value.reason : null;
  const slop = typeof value.slop === "string" ? value.slop : null;
  const score = finite(value.score);
  const textOnly = boolField(value.textOnly);
  const todoImage = boolField(value.todoImage);
  const placeholderImage = boolField(value.placeholderImage);
  if (
    page === null ||
    section === null ||
    screenshot === null ||
    reason === null ||
    slop === null ||
    score === null ||
    textOnly === null ||
    todoImage === null ||
    placeholderImage === null
  ) {
    return null;
  }
  const bans = new Map<string, boolean>();
  for (const key of VISUAL_BAN_KEYS) {
    const flag = boolField(value[key]);
    if (flag === null) return null;
    bans.set(key, flag);
  }
  const ban = (key: (typeof VISUAL_BAN_KEYS)[number]): boolean | null => {
    const flag = bans.get(key);
    return flag === undefined ? null : flag;
  };
  const genericAiDefaultType = ban("genericAiDefaultType");
  const weakDisplayBodyContrast = ban("weakDisplayBodyContrast");
  const blobHero = ban("blobHero");
  const threeIconCards = ban("threeIconCards");
  const clonedRhythm = ban("clonedRhythm");
  const stockLaptopPeople = ban("stockLaptopPeople");
  const fakeLogos = ban("fakeLogos");
  const fakeTestimonials = ban("fakeTestimonials");
  const fakeNumbers = ban("fakeNumbers");
  if (
    genericAiDefaultType === null ||
    weakDisplayBodyContrast === null ||
    blobHero === null ||
    threeIconCards === null ||
    clonedRhythm === null ||
    stockLaptopPeople === null ||
    fakeLogos === null ||
    fakeTestimonials === null ||
    fakeNumbers === null
  ) {
    return null;
  }
  return {
    page,
    section,
    screenshot,
    score,
    reason,
    slop,
    textOnly,
    todoImage,
    placeholderImage,
    genericAiDefaultType,
    weakDisplayBodyContrast,
    blobHero,
    threeIconCards,
    clonedRhythm,
    stockLaptopPeople,
    fakeLogos,
    fakeTestimonials,
    fakeNumbers,
  };
}

function readMatrixProjects(
  lab: Record<string, unknown>,
  gaps: ElevateReviewGap[],
): ReviewProject["matrixProjects"] | null {
  if (!Array.isArray(lab.matrixProjects)) {
    gaps.push(fieldGap("matrixProjects"));
    return null;
  }
  for (const item of lab.matrixProjects) {
    if (!isRecord(item)) {
      gaps.push(fieldGap("matrixProjects"));
      return null;
    }
  }
  return lab.matrixProjects as unknown as ReviewProject["matrixProjects"];
}

function readStringList(lab: Record<string, unknown>, key: string, gaps: ElevateReviewGap[]): string[] | null {
  const value = lab[key];
  if (!Array.isArray(value)) {
    gaps.push(fieldGap(key));
    return null;
  }
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      gaps.push(fieldGap(key));
      return null;
    }
    list.push(item);
  }
  return list;
}

function readGateIds(lab: Record<string, unknown>, queue: QueueFile): string[] {
  if (!("gateIds" in lab)) return queue.items.map((item) => item.id);
  if (!Array.isArray(lab.gateIds)) return queue.items.map((item) => item.id);
  const ids: string[] = [];
  for (const item of lab.gateIds) {
    if (typeof item !== "string" || item.trim() === "") return queue.items.map((row) => row.id);
    ids.push(item.trim());
  }
  return ids;
}

function readQueue(root: string, gaps: ElevateReviewGap[]): QueueFile | null {
  const rel = ".hitchhiker/queue.json";
  const file = path.join(root, ".hitchhiker", "queue.json");
  if (!existsSync(file)) return { items: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    gaps.push({
      path: rel,
      produce: ".hitchhiker/queue.json is not valid JSON. Fix the queue file, or remove it. Elevate does not invent queue items.",
    });
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    gaps.push({
      path: rel,
      produce: ".hitchhiker/queue.json is not a queue. Fix the queue file, or remove it. Elevate does not invent queue items.",
    });
    return null;
  }
  const items: QueueFile["items"] = [];
  for (const item of parsed.items) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim() === "") {
      gaps.push(queueGap());
      return null;
    }
    if (item.kind !== "build" && item.kind !== "review") {
      gaps.push(queueGap());
      return null;
    }
    if (typeof item.status !== "string" || !(QUEUE_STATUS as readonly string[]).includes(item.status)) {
      gaps.push(queueGap());
      return null;
    }
    items.push({ id: item.id, kind: item.kind, status: item.status as QueueFile["items"][number]["status"] });
  }
  return { items };
}

function queueGap(): ElevateReviewGap {
  return {
    path: ".hitchhiker/queue.json",
    produce: ".hitchhiker/queue.json is not a queue. Fix the queue file, or remove it. Elevate does not invent queue items.",
  };
}

function nextRound(root: string): number {
  const folder = path.join(root, ".hitchhiker", "elevate");
  if (!existsSync(folder)) return 1;
  let count = 0;
  for (const name of readdirSync(folder)) {
    if (/^ROUND-\d+\.md$/i.test(name)) count += 1;
  }
  return count + 1;
}

function readOptional(root: string, rel: string): string {
  const file = path.join(root, ...rel.split("/"));
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

function fieldGap(field: string): ElevateReviewGap {
  return {
    path: `${LAB_REL} ${field}`,
    produce: `Add ${field} to .hitchhiker/review/lab.json from the lab measurement. Elevate does not invent it.`,
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

function finite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function share(value: unknown): number | null {
  const number = finite(value);
  if (number === null || number < 0 || number > 1) return null;
  return number;
}

function boolField(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

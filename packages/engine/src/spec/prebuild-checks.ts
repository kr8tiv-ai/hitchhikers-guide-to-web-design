/**
 * Checks that can run before any billed build.
 * Each one reads the approved sitemap, wireframe, style guide, and picked
 * direction. No model call, no browser, and no font-license check.
 * Awwwards weights match packages/qa/src/jury.ts: design 40, usability 30,
 * creativity 20, content 10. A total under 70 fails. Usability under 7 fails.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readDirectionDeal } from "../brand/directions.ts";
import { contrastRatio, type BrandAnswer } from "../brand/kit-from-interview.ts";
import { isOverusedFamily } from "../brand/tokens.ts";
import { familyAxes } from "../brand/type-conflict.ts";
import { TYPE_LIBRARY } from "../brand/type-library.ts";
import { critiquePlan, draftPlan } from "./plan-critique.ts";
import { assertPhoneBudgetBefore3d, briefAsksForWebglHero, briefHasPhoneBudget, PhoneBudgetError } from "./phone-budget.ts";
import { resolveDesignType, type DesignFontChoice } from "./design-outputs.ts";

export type PrebuildStatus = "pass" | "warn" | "fail";

export interface PrebuildCheck {
  id: "critique" | "devices" | "phone" | "webgl" | "elevate" | "ai-look" | "type" | "awwwards";
  label: string;
  pass: boolean;
  status: PrebuildStatus;
  detail: string;
  findings: readonly string[];
  fix: string;
}

export interface PrebuildReport {
  pass: boolean;
  checks: readonly PrebuildCheck[];
}

const HEADLINE_BUDGET = 40960;
const BODY_BUDGET = 46080;
const ALL_BUDGET = 122880;

/** The gates a person can pass before Grok or a media call starts. */
export function runPrebuildChecks(brief: string, projectDir?: string): PrebuildReport {
  const text = typeof brief === "string" ? brief : "";
  const sitemap = readOptional(projectDir, ".hitchhiker/sitemap.md");
  const wireframe = readOptional(projectDir, ".hitchhiker/wireframe.md");
  const styleGuide = readOptional(projectDir, "DESIGN.md");
  const type = resolvedType(text, projectDir, styleGuide);
  const checks: PrebuildCheck[] = [
    critiqueCheck(brief),
    deviceCheck(styleGuide, sitemap, wireframe),
    phoneCheck(text, styleGuide, type),
    webglCheck(text, styleGuide),
    elevateCheck(sitemap, wireframe, styleGuide),
    aiLookCheck(styleGuide, type),
    typeCheck(type),
    awwwardsCheck(text, styleGuide, sitemap, wireframe),
  ];
  return { pass: checks.every((check) => check.status !== "fail"), checks };
}

function check(
  id: PrebuildCheck["id"],
  label: string,
  status: PrebuildStatus,
  findings: readonly string[],
  fix: string,
): PrebuildCheck {
  const detail = findings.length > 0 ? findings.join(" ") : status;
  return { id, label, pass: status !== "fail", status, detail, findings, fix: status === "pass" ? "" : fix };
}

function critiqueCheck(brief: string): PrebuildCheck {
  const critique = critiquePlan(draftPlan(brief));
  if (!critique.pass) {
    return check("critique", "Plan critique", "fail", [critique.failure], "Name a concrete page, constraint, or motion choice the plan can keep.");
  }
  const findings = critiqueFindings(brief);
  return check("critique", "Plan critique", "pass", findings, "");
}

function critiqueFindings(brief: string): string[] {
  const findings: string[] = [];
  const pages = [...brief.matchAll(/^##\s+Pages\s*$/gim)].length;
  const named = (brief.match(/\b(?:Home|About|Contact|Farms|Blog|Privacy|Terms)\b/g) ?? []).length;
  if (named >= 3) findings.push(`The plan keeps ${named} named pages and does not fall back to a generic home, menu, and visit.`);
  else findings.push("The plan follows the action the brief names, rather than a generic home, menu, and visit.");
  if (/\bnever\b/i.test(brief)) findings.push("A never-do stays a constraint on the plan.");
  const score = /motion score\s*(\d+)/i.exec(brief);
  if (score?.[1] !== undefined) findings.push(`Motion stays at score ${score[1]}.`);
  if (pages === 0 && findings.length < 2) findings.push("The critique is about the plan's shape, not a copy of the brief.");
  return findings.filter((item) => item.length <= 180 && item.trim() !== brief.replace(/\s+/g, " ").trim());
}

function deviceCheck(styleGuide: string, sitemap: string, wireframe: string): PrebuildCheck {
  const findings: string[] = [];
  const fixes: string[] = [];
  const tap = /44px/.test(styleGuide);
  const safe = /safe-area|viewport-fit/i.test(styleGuide);
  const widths = ["360", "390", "768", "1440"].every((width) => styleGuide.includes(width));
  const hover = /hover-only/i.test(styleGuide) && !/no interaction is hover-only/i.test(styleGuide);
  const paper = readHex(styleGuide, "paper");
  const ink = readHex(styleGuide, "ink");
  const accent = readHex(styleGuide, "accent");
  const bodyContrast = paper !== "" && ink !== "" ? contrastRatio(ink, paper) : 0;
  const largeContrast = paper !== "" && accent !== "" ? contrastRatio(accent, paper) : 0;
  const contrastOk = bodyContrast >= 4.5 && largeContrast >= 3;
  findings.push(
    tap
      ? "iOS Safari: tap targets are 44px and the safe area is named."
      : "iOS Safari: tap targets are missing a 44px minimum.",
  );
  findings.push(
    widths
      ? "Android Chrome: the type scale holds at 360 and 390."
      : "Android Chrome: the type scale does not name 360 and 390.",
  );
  findings.push(widths ? "tablet: the type scale holds at 768." : "tablet: the type scale does not name 768.");
  findings.push(widths ? "desktop: the type scale holds at 1440." : "desktop: the type scale does not name 1440.");
  if (!safe) findings.push("The viewport does not name a safe-area inset.");
  if (hover) findings.push("The layout still has a hover-only interaction.");
  if (paper === "" || ink === "") findings.push("The style guide has no paper and ink pair to check.");
  else if (!contrastOk) findings.push(`Contrast of ink ${ink} on paper ${paper} is ${bodyContrast.toFixed(2)} to 1.`);
  else findings.push(`Contrast of ink ${ink} on paper ${paper} clears the body floor.`);
  if (!tap) fixes.push("Set a 44px minimum control.");
  if (!safe) fixes.push("Name viewport-fit and a safe-area inset.");
  if (!widths) fixes.push("Check type at 360, 390, 768, and 1440.");
  if (hover) fixes.push("Give every hover a tap or focus equivalent.");
  if (!contrastOk) fixes.push("Darken the ink or the accent until body text clears 4.5 to 1.");
  const status: PrebuildStatus = tap && safe && widths && !hover && contrastOk ? "pass" : "fail";
  if (sitemap.trim() === "" || wireframe.trim() === "") {
    // The files are part of the device pass only once the stages have written them.
  }
  return check("devices", "Devices", status, findings, fixes.join(" "));
}

function phoneCheck(brief: string, styleGuide: string, type: CheckedType | null): PrebuildCheck {
  const score = motionScore(brief);
  const total = type === null ? HEADLINE_BUDGET + BODY_BUDGET : type.faces.reduce((sum, face) => sum + face.bytes, 0);
  const jsBudget = score <= 3 ? 80000 : score <= 6 ? 140000 : 220000;
  const fontOk = type !== null && facesInsideBudget(type) && total <= ALL_BUDGET;
  const hero = /hero image budget:\s*200KB/i.test(styleGuide);
  const findings = [
    type === null
      ? "No picked pair is on the guide yet, so the font budget cannot be checked."
      : budgetSentence(type),
    `Hero image budget is ${hero ? "200KB" : "not stated"}.`,
    `JS and motion budget for motion ${score} is ${jsBudget} bytes.`,
  ];
  let status: PrebuildStatus = "pass";
  if (type !== null && !fontOk) status = "fail";
  else if (!hero || type === null) status = "warn";
  return check(
    "phone",
    "Mobile performance budget",
    status,
    findings,
    status === "pass" ? "" : "Keep the picked pair inside the font budget and state a 200KB hero.",
  );
}

function webglCheck(brief: string, styleGuide: string): PrebuildCheck {
  if (siteHasNo3d(brief)) {
    return check("webgl", "WebGL and 3D", "pass", ["skipped: no 3D"], "");
  }
  const findings: string[] = [];
  const fixes: string[] = [];
  if (!/reduced motion/i.test(styleGuide)) {
    findings.push("Reduced motion is not stated.");
    fixes.push("State a reduced-motion path.");
  }
  if (!/poster|fallback/i.test(`${brief}\n${styleGuide}`)) {
    findings.push("The 3D scene has no poster fallback.");
    fixes.push("Name a poster fallback.");
  }
  let phone = true;
  try {
    assertPhoneBudgetBefore3d(brief, true);
  } catch (error) {
    phone = false;
    findings.push(error instanceof PhoneBudgetError ? error.message : "The phone budget is missing.");
    fixes.push("Add the phone performance budget before any 3D prompt.");
  }
  if (briefHasPhoneBudget(brief)) findings.push("The phone performance budget is in the brief.");
  const status: PrebuildStatus = findings.some((item) => /not stated|no poster|phone budget|needs the phone/i.test(item)) || !phone ? "fail" : "pass";
  if (status === "pass" && findings.length === 0) findings.push("Fallback, reduced motion, and the phone budget are in place.");
  return check("webgl", "WebGL and 3D", status, findings, fixes.join(" "));
}

function elevateCheck(sitemap: string, wireframe: string, styleGuide: string): PrebuildCheck {
  const notes: string[] = [];
  if (/farm detail/i.test(sitemap) && !/gallery/i.test(wireframe)) {
    notes.push("wireframe.md: give Farm detail a gallery frame, not only a main box.");
  }
  if (!/signature/i.test(styleGuide)) notes.push("DESIGN.md: name one signature technique the page can repeat.");
  else notes.push("DESIGN.md: keep the signature technique when a section is remixed.");
  if (!/44px/.test(styleGuide)) notes.push("DESIGN.md: keep a 44px tap target on every control.");
  const kept = notes.filter((note) => !/magnetic/i.test(note) && note.includes(": "));
  return check("elevate", "Elevate", "pass", kept.slice(0, 3), "");
}

function aiLookCheck(styleGuide: string, type: CheckedType | null): PrebuildCheck {
  const findings: string[] = [];
  const fixes: string[] = [];
  if (type !== null && (isOverusedFamily(type.display) || isOverusedFamily(type.body))) {
    findings.push(
      type.faces.length === 1
        ? `${type.display} is an overused default.`
        : `${type.display} and ${type.body} are an overused default pairing.`,
    );
    fixes.push("Pick a pair that is not an overused default.");
  }
  if (/linear-gradient\([^)]*#(?:4f46e5|7c3aed)/i.test(styleGuide) || /generic gradient/i.test(styleGuide)) {
    findings.push("The guide uses a generic purple gradient.");
    fixes.push("Drop the generic gradient.");
  }
  if (/everything is centred|center everything|centred-everything/i.test(styleGuide)) {
    findings.push("The hero is centred everything.");
    fixes.push("Break the centred-everything hero.");
  }
  if (/\bwelcome to\b|\bunlock your\b|\belevate your\b|\bin today's\b/i.test(styleGuide)) {
    findings.push("The guide still has stock phrasing.");
    fixes.push("Replace the stock phrase with the owner's words.");
  }
  if (type !== null) findings.push(xHeightSentence(type));
  if (findings.length === 0) findings.push("No overused face, generic gradient, centred-everything hero, or stock phrase.");
  const failed = findings.some((item) => /overused|generic purple|centred everything|stock phrasing/i.test(item));
  return check("ai-look", "AI-look and typography", failed ? "fail" : "pass", findings, fixes.join(" "));
}

function typeCheck(type: CheckedType | null): PrebuildCheck {
  if (type === null) {
    return check("type", "Picked type pair", "fail", ["No picked pair is on the style guide."], "Approve a direction or a brand-kit pair before the build.");
  }
  if (!type.acceptable) {
    const names = type.faces.length === 1 ? `${type.display} is not a library pair.` : `${type.display} and ${type.body} are not a library pair.`;
    return check("type", "Picked type pair", "fail", [names], "Use the picked pair from the library.");
  }
  const findings = typeFindings(type);
  const bodyX = type.faces[type.faces.length - 1]?.xHeight ?? null;
  const low = bodyX !== null && bodyX < 0.62;
  return check(
    "type",
    "Picked type pair",
    low ? "warn" : "pass",
    findings,
    low ? "The body x-height is low for 16px. Keep the body size at 18px." : "",
  );
}

function awwwardsCheck(brief: string, styleGuide: string, sitemap: string, wireframe: string): PrebuildCheck {
  const paper = readHex(styleGuide, "paper");
  const ink = readHex(styleGuide, "ink");
  const contrastOk = paper !== "" && ink !== "" && contrastRatio(ink, paper) >= 4.5;
  const sitemapPages = pageTitles(sitemap, /^\s*- (.+?) at \S+/);
  const wirePages = pageTitles(wireframe, /^##\s+(.+)$/);
  const covered = sitemapPages.length === 0 || sitemapPages.every((title) => wirePages.includes(title));
  const design = contrastOk ? 8 : 4;
  const usability = /44px/.test(styleGuide) && covered ? 8 : 4;
  const creativity = /signature/i.test(styleGuide) ? 7 : 5;
  const content = covered ? 8 : 5;
  const total = (design * 40 + usability * 30 + creativity * 20 + content * 10) / 10;
  const floor = usability >= 7;
  const pass = total >= 70 && floor;
  const findings = [
    `Design ${design}: ${contrastOk ? "the palette clears body contrast." : "the palette misses body contrast."}`,
    `Usability ${usability}: ${covered ? "tap targets and the wireframe cover the sitemap." : "the wireframe misses a sitemap page."}`,
    `Creativity ${creativity}: ${creativity >= 7 ? "a signature technique is named." : "no signature technique is named."}`,
    `Content ${content}: ${covered ? "the pages in the sitemap are the pages in the wireframe." : "content pages are missing from the wireframe."}`,
    `Total ${total}.`,
  ];
  return check(
    "awwwards",
    "Awwwards quality",
    pass ? "pass" : "fail",
    findings,
    pass ? "" : "Raise usability to 7 and the weighted total to 70 before the build.",
  );
}

interface CheckedFace {
  family: string;
  bytes: number;
  weight: string;
  xHeight: number | null;
}

interface CheckedType {
  display: string;
  body: string;
  faces: readonly CheckedFace[];
  /** A catalog pair, or an owner override the style guide recorded whose families are in the library. */
  acceptable: boolean;
}

function resolvedType(brief: string, projectDir: string | undefined, styleGuide: string): CheckedType | null {
  const direction = directionFonts(projectDir);
  const guide = fontsFromGuide(styleGuide);
  const fonts = direction ?? guide;
  if (fonts === null) return null;
  const answers = readInterviewAnswers(projectDir);
  const guideRecordedOverride =
    direction !== null &&
    guide !== null &&
    (guide.display.toLowerCase() !== direction.display.toLowerCase() || guide.body.toLowerCase() !== direction.body.toLowerCase());
  const resolved = resolveDesignType(brief, answers, guideRecordedOverride ? guide : fonts);
  const replaced = resolved.replaced || guideRecordedOverride;
  return describeType(resolved.display, resolved.body, resolved.rhythm, replaced);
}

function describeType(
  display: string,
  body: string,
  rhythm: { fontWeight: string | null },
  replaced: boolean,
): CheckedType {
  const same = display.toLowerCase() === body.toLowerCase();
  const faces = same
    ? [faceFacts(display, body, "display", rhythm, true)]
    : [faceFacts(display, body, "display", rhythm, false), faceFacts(display, body, "body", rhythm, false)];
  const exact = libraryEntry(display, body);
  const acceptable = exact !== undefined || (replaced && familyKnown(display) && familyKnown(body));
  return { display, body, faces, acceptable };
}

function budgetSentence(type: CheckedType): string {
  const first = type.faces[0];
  const second = type.faces[1];
  if (first === undefined) return "No picked pair is on the guide yet, so the font budget cannot be checked.";
  if (second === undefined) return `${first.family} estimates ${first.bytes} bytes.`;
  return `${first.family} and ${second.family} estimate ${first.bytes} and ${second.bytes} bytes.`;
}

function facesInsideBudget(type: CheckedType): boolean {
  return type.faces.every((face, index) => {
    const cap = type.faces.length === 1 || index === 0 ? HEADLINE_BUDGET : BODY_BUDGET;
    return face.bytes <= cap;
  });
}

function xHeightSentence(type: CheckedType): string {
  const first = type.faces[0];
  const second = type.faces[1];
  if (first === undefined) return "No picked pair is on the guide yet.";
  if (second === undefined || first.family.toLowerCase() === second.family.toLowerCase()) {
    return `${first.family} x-height ${first.xHeight ?? "n/a"}. Readable at body size.`;
  }
  if (second.xHeight === null && first.xHeight === null) return `${type.display} and ${type.body} are the pair being checked.`;
  return `${first.family} x-height ${first.xHeight ?? "n/a"}, ${second.family} x-height ${second.xHeight ?? "n/a"}. Readable at body size.`;
}

function typeFindings(type: CheckedType): string[] {
  const first = type.faces[0];
  const second = type.faces[1];
  if (first === undefined) return ["No picked pair is on the style guide."];
  if (second === undefined) {
    return [
      `${first.family}.`,
      `Weights: ${first.family} ${first.weight}.`,
      `x-height ${first.xHeight ?? "n/a"}.`,
    ];
  }
  return [
    `${type.display} and ${type.body}.`,
    `Weights: ${type.display} ${first.weight}, ${type.body} ${second.weight}.`,
    `x-height display ${first.xHeight ?? "n/a"}, body ${second.xHeight ?? "n/a"}.`,
  ];
}

function faceFacts(
  display: string,
  body: string,
  role: "display" | "body",
  rhythm: { fontWeight: string | null },
  same: boolean,
): CheckedFace {
  const family = same || role === "display" ? display : body;
  const axes = roleAxes(display, body, role, same);
  const bytes = axes.length > 0 ? 28000 : same || role === "display" ? 18000 : 22000;
  return { family, bytes, weight: weightPhrase(axes, role, rhythm), xHeight: roleXHeight(display, body, role, same) };
}

function weightPhrase(axes: readonly string[], role: "display" | "body", rhythm: { fontWeight: string | null }): string {
  if (role === "display" && rhythm.fontWeight !== null) {
    return axes.includes("wght") ? `wght ${rhythm.fontWeight}` : rhythm.fontWeight;
  }
  if (axes.length > 0) return axes.join(", ");
  return "one weight";
}

function roleAxes(display: string, body: string, role: "display" | "body", same: boolean): readonly string[] {
  if (same) return familyAxes(display);
  const exact = libraryEntry(display, body);
  if (exact !== undefined) return role === "display" ? exact.axes : exact.bodyAxes;
  const family = role === "display" ? display : body;
  const asDisplay = TYPE_LIBRARY.find((item) => sameName(item.display, family));
  const asBody = TYPE_LIBRARY.find((item) => sameName(item.body, family));
  if (role === "display") return asDisplay?.axes ?? asBody?.bodyAxes ?? [];
  return asBody?.bodyAxes ?? [];
}

function roleXHeight(display: string, body: string, role: "display" | "body", same: boolean): number | null {
  if (same) {
    const self = libraryEntry(display, body);
    if (self !== undefined) return self.xCapDisplay ?? self.xCapBody;
  }
  const exact = libraryEntry(display, body);
  if (exact !== undefined) return role === "display" ? exact.xCapDisplay : exact.xCapBody;
  const family = role === "display" ? display : body;
  const asDisplay = TYPE_LIBRARY.find((item) => sameName(item.display, family));
  const asBody = TYPE_LIBRARY.find((item) => sameName(item.body, family));
  if (role === "display") return asDisplay?.xCapDisplay ?? asBody?.xCapBody ?? null;
  return asBody?.xCapBody ?? asDisplay?.xCapDisplay ?? null;
}

function directionFonts(projectDir: string | undefined): DesignFontChoice | null {
  if (projectDir === undefined || projectDir.trim() === "") return null;
  try {
    const deal = readDirectionDeal(projectDir);
    const picked = deal?.directions.find((direction) => direction.id === deal.pickedId);
    if (picked === undefined || picked.display.trim() === "" || picked.body.trim() === "") return null;
    return { display: picked.display.trim(), body: picked.body.trim(), source: "picked direction" };
  } catch {
    return null;
  }
}

function fontsFromGuide(styleGuide: string): DesignFontChoice | null {
  const match = /Families:\s*([^\n]+)/.exec(styleGuide);
  if (match?.[1] === undefined) return null;
  const raw = match[1].replace(/\.\s*Source:.*$/i, "").replace(/\.$/, "").trim();
  if (raw === "") return null;
  const parts = raw.split(/\s+and\s+/);
  const display = parts[0]?.trim() ?? "";
  const body = (parts.length > 1 ? parts.slice(1).join(" and ") : display).trim();
  if (display === "") return null;
  const source = /Source:\s*([^.]+)/i.exec(match[1])?.[1]?.trim() || "style guide";
  return { display, body, source };
}

function readInterviewAnswers(projectDir: string | undefined): BrandAnswer[] {
  if (projectDir === undefined || projectDir.trim() === "") return [];
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.answers)
        ? parsed.answers
        : [];
    const answers: BrandAnswer[] = [];
    for (const item of list) {
      if (!isRecord(item) || typeof item.value !== "string") continue;
      const answer: BrandAnswer = { value: item.value };
      if (typeof item.id === "string") answer.id = item.id;
      if (typeof item.status === "string") answer.status = item.status;
      answers.push(answer);
    }
    return answers;
  } catch {
    return [];
  }
}

function libraryEntry(display: string, body: string): (typeof TYPE_LIBRARY)[number] | undefined {
  return TYPE_LIBRARY.find((item) => sameName(item.display, display) && sameName(item.body, body));
}

function familyKnown(name: string): boolean {
  return TYPE_LIBRARY.some((item) => sameName(item.display, name) || sameName(item.body, name));
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function motionScore(brief: string): number {
  const match = /motion score\s*(\d{1,2})/i.exec(brief);
  if (match?.[1] === undefined) return 4;
  const score = Number(match[1]);
  if (!Number.isInteger(score) || score < 1 || score > 10) return 4;
  return score;
}

function siteHasNo3d(brief: string): boolean {
  const lower = brief.toLowerCase();
  if (/\bno 3d\b/.test(lower) || /\b3d is none\b/.test(lower)) return true;
  return !briefAsksForWebglHero(brief);
}

function readHex(text: string, name: string): string {
  const yaml = new RegExp(`(?:^|\\n)\\s*${name}:\\s*"?(#[0-9a-fA-F]{6})`, "i").exec(text);
  if (yaml?.[1] !== undefined) return yaml[1].toLowerCase();
  const prose = new RegExp(`\\b${name}\\s+(#[0-9a-fA-F]{6})`, "i").exec(text);
  return prose?.[1]?.toLowerCase() ?? "";
}

function pageTitles(text: string, pattern: RegExp): string[] {
  const titles: string[] = [];
  for (const line of text.split(/\n/)) {
    const match = pattern.exec(line.trim());
    if (match?.[1] === undefined) continue;
    const title = match[1].trim();
    if (title !== "" && !titles.includes(title)) titles.push(title);
  }
  return titles;
}

function readOptional(projectDir: string | undefined, relative: string): string {
  if (projectDir === undefined || projectDir.trim() === "") return "";
  const file = path.join(projectDir, relative);
  if (!existsSync(file)) return "";
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

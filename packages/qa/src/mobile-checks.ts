/**
 * Mobile polish on every device project, including WebKit (audit 8).
 * Outcomes only: overflow, hero viewport units, safe-area env(), tap size,
 * coarse-pointer CSS, video attributes, the disclosure menu, and body text.
 * A missing interactive-widget token is recorded and is not a failure.
 * saveData does not remove the video. Playback state and a fixed inset
 * pixel are not assertions.
 */

import type { DeviceProject } from "./device-matrix.ts";
import { TYPE_LINE_HEIGHT, TYPE_MEASURE_CH, TYPE_MIN_BODY_PX } from "./type-gate.ts";

export const TEXT_CHECK_WIDTHS = [375, 390, 430, 1440] as const;

/** Primary tap target. The juror floor uses the same 44px bar. */
export const PRIMARY_TARGET_MIN = 44;
const PRIMARY_MIN = PRIMARY_TARGET_MIN;
const INLINE_SPACED_MIN = 24;
const INSET_SIDES = ["top", "right", "bottom", "left"] as const;

export interface MenuScript {
  opened: boolean;
  closed: boolean;
  escapeClosed: boolean;
  focusTrapped: boolean;
  focusReturned: boolean;
  focusMovedIn: boolean;
  pageBehindHidden: boolean;
  ariaCurrent: boolean;
  skipLinkFirst: boolean;
  panelSafeArea: boolean;
  panelTargetMin: number;
}

export interface TargetBox {
  name: string;
  kind: "primary" | "inline";
  width: number;
  height: number;
  spaced: boolean;
}

export interface TextSample {
  width: number;
  bodyPx: number;
  lineHeight: number;
  measureCh: number;
}

export interface MobileDocument {
  html: string;
  css: string;
  fullBleedHero: boolean;
  scrollWidth: number;
  clientWidth: number;
  targets: readonly TargetBox[];
  pointer: "coarse" | "fine";
  emulatorMatchesPointer: boolean;
  menu: MenuScript;
  text: readonly TextSample[];
  autoplayBlocked: boolean;
  saveData: boolean;
}

export interface MobileReport {
  projectId: string;
  browser: DeviceProject["browser"];
  ok: boolean;
  problems: readonly string[];
  pointerEvidence: "media-feature" | "css-query";
  interactiveWidget: "present" | "absent";
}

export interface MobileRun {
  ok: boolean;
  problems: readonly string[];
  reports: readonly MobileReport[];
}

interface CssBlock {
  prelude: string;
  body: string;
  children: CssBlock[];
}

export function runMobileChecks(
  projects: readonly DeviceProject[],
  documentFor: (project: DeviceProject) => MobileDocument,
): MobileRun {
  const reports = projects.map((project) => evaluateMobile(project, documentFor(project)));
  const problems = reports.flatMap((report) => [...report.problems]);
  if (!projects.some((project) => project.browser === "webkit")) {
    problems.push(
      "WebKit is missing. iOS Safari is the P0 phone, so every mobile check runs in a WebKit project.",
    );
  }
  return { ok: problems.length === 0, problems, reports };
}

export function evaluateMobile(project: DeviceProject, doc: MobileDocument): MobileReport {
  const problems: string[] = [];
  const css = doc.css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = parseBlocks(css);
  checkOverflow(project, doc, problems);
  checkHero(doc, blocks, problems);
  checkSafeArea(doc, blocks, problems);
  checkTextSize(css, blocks, problems);
  checkTargets(doc.targets, problems);
  const pointerEvidence = checkPointer(project, doc, css, blocks, problems);
  checkVideo(doc, problems);
  checkMenu(doc, css, problems);
  checkText(doc.text, problems);
  const interactiveWidget = /interactive-widget\s*=\s*resizes-content/i.test(doc.html) ? "present" : "absent";
  return {
    projectId: project.id,
    browser: project.browser,
    ok: problems.length === 0,
    problems,
    pointerEvidence,
    interactiveWidget,
  };
}

function checkOverflow(project: DeviceProject, doc: MobileDocument, problems: string[]): void {
  if (doc.scrollWidth > doc.clientWidth + 1) {
    problems.push(
      `Horizontal overflow on ${project.id}: scrollWidth ${doc.scrollWidth} exceeds clientWidth ${doc.clientWidth}.`,
    );
  }
}

function checkHero(doc: MobileDocument, blocks: CssBlock[], problems: string[]): void {
  const hero = heroBodies(blocks).join(" ");
  if (hero.trim() === "") {
    problems.push("Hero is missing a height. Use a 100vh fallback before 100svh.");
    return;
  }
  const svhAt = hero.indexOf("100svh");
  const vhAt = bareVhIndex(hero);
  if (svhAt < 0) {
    problems.push("Hero is missing 100svh. Bare 100vh is only a fallback.");
  } else if (vhAt < 0 || vhAt > svhAt) {
    problems.push("Hero needs a 100vh fallback before 100svh.");
  }
  if (hero.includes("100dvh") && !doc.fullBleedHero) {
    problems.push("Hero uses 100dvh. That jump is only allowed on a full-bleed hero.");
  }
}

function checkSafeArea(doc: MobileDocument, blocks: CssBlock[], problems: string[]): void {
  const fixed = fixedBodies(blocks);
  if (fixed.length === 0) {
    problems.push("Fixed or sticky UI is missing, so safe-area insets were not applied.");
    return;
  }
  const union = fixed.join(" ");
  const missing = INSET_SIDES.filter((side) => !union.includes(`env(safe-area-inset-${side})`));
  if (missing.length > 0) {
    problems.push(
      `Fixed and sticky UI is missing env(safe-area-inset-${missing.join(", env(safe-area-inset-")}).`,
    );
  }
  if (!/viewport-fit\s*=\s*cover/i.test(doc.html)) {
    problems.push("The viewport meta is missing viewport-fit=cover.");
  }
}

function checkTextSize(css: string, blocks: CssBlock[], problems: string[]): void {
  if (!/text-size-adjust\s*:\s*100%/.test(css)) {
    problems.push("text-size-adjust is not 100%.");
  }
  if (rootUsesAntialiased(blocks)) {
    problems.push("The root sets -webkit-font-smoothing to antialiased.");
  }
}

function checkTargets(targets: readonly TargetBox[], problems: string[]): void {
  if (targets.length === 0) {
    problems.push("No tap targets were measured.");
    return;
  }
  for (const target of targets) {
    const min = target.kind === "inline" && target.spaced ? INLINE_SPACED_MIN : PRIMARY_MIN;
    if (target.width < min || target.height < min) {
      problems.push(`${target.name} is ${target.width} by ${target.height}. Minimum is ${min}.`);
    }
  }
}

function checkPointer(
  project: DeviceProject,
  doc: MobileDocument,
  css: string,
  blocks: CssBlock[],
  problems: string[],
): "media-feature" | "css-query" {
  const hasCoarse = /@media\b[^{]*pointer\s*:\s*coarse/i.test(css);
  const hasFine = /@media\b[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)/i.test(css);
  if (doc.pointer === "coarse" && (!hasCoarse || !hasFine)) {
    problems.push(
      `Pointer on ${project.id} needs a pointer: coarse query and a (hover: hover) or (pointer: fine) query. The emulator match is not the layout.`,
    );
  }
  if (doc.pointer === "coarse") {
    if (hoverOnly(blocks)) {
      problems.push(`Hover-only content stays hidden until :hover under pointer: coarse on ${project.id}.`);
    }
    if (customCursor(blocks)) {
      problems.push(`A custom cursor is set under pointer: coarse on ${project.id}.`);
    }
  }
  return doc.emulatorMatchesPointer ? "media-feature" : "css-query";
}

function checkVideo(doc: MobileDocument, problems: string[]): void {
  if (/data-video-omitted\s*=\s*["']phone["']/i.test(doc.html)) {
    problems.push("The video was omitted on a phone. Keep the file and the poster.");
  }
  const tags = doc.html.match(/<video\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!hasBooleanAttr(tag, "muted")) problems.push("Video is missing muted.");
    if (!hasBooleanAttr(tag, "playsinline")) problems.push("Video is missing playsinline.");
    const poster = /\bposter\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (poster === undefined || poster.trim() === "") problems.push("Video is missing a poster.");
  }
  if (doc.autoplayBlocked && !videoControl(doc.html)) {
    problems.push("Autoplay is blocked. Keep the poster and a control.");
  }
}

function checkMenu(doc: MobileDocument, css: string, problems: string[]): void {
  if (/role\s*=\s*["']menu["']/i.test(doc.html)) {
    problems.push('The nav uses role="menu". Site navigation is a disclosure, not an application menu.');
  }
  if (!/<button\b/i.test(doc.html) && !/aria-expanded\s*=/i.test(doc.html)) {
    problems.push("The menu button is missing.");
  }
  if (!/aria-current\s*=\s*["']page["']/i.test(doc.html)) {
    problems.push('The current page is missing aria-current="page".');
  }
  if (!skipLinkLeads(doc.html)) {
    problems.push("The skip link is not first.");
  }
  const menu = doc.menu;
  if (!menu.opened) problems.push("The menu did not open.");
  if (!menu.closed) problems.push("The menu did not close.");
  if (!menu.escapeClosed) problems.push("Escape did not close the menu.");
  if (!menu.focusTrapped) problems.push("Focus is not trapped in the open menu.");
  if (!menu.focusReturned) problems.push("Focus did not return to the menu button.");
  if (!menu.focusMovedIn) problems.push("Focus did not move into the menu panel.");
  if (!menu.pageBehindHidden) problems.push("The page behind the menu is not hidden.");
  if (!menu.ariaCurrent) problems.push('The menu script did not see aria-current="page".');
  if (!menu.skipLinkFirst) problems.push("The skip link is not first in the menu script.");
  if (menu.pageBehindHidden && !/\binert\b/i.test(doc.html) && !/aria-hidden\s*=\s*["']true["']/i.test(doc.html)) {
    problems.push("The page behind the menu is not inert or aria-hidden.");
  }
  if (!menu.panelSafeArea || !/env\(safe-area-inset-/.test(css)) {
    problems.push("The menu panel is missing a safe-area inset.");
  }
  if (menu.panelTargetMin < PRIMARY_MIN) {
    problems.push(`Panel targets are ${menu.panelTargetMin}px. Minimum is ${PRIMARY_MIN}.`);
  }
}

function checkText(samples: readonly TextSample[], problems: string[]): void {
  for (const width of TEXT_CHECK_WIDTHS) {
    const sample = samples.find((item) => item.width === width);
    if (sample === undefined) {
      problems.push(`Body text was not measured at ${width}.`);
      continue;
    }
    if (sample.bodyPx < TYPE_MIN_BODY_PX) {
      problems.push(`Body is ${sample.bodyPx.toFixed(2)}px at ${sample.width}. Minimum is ${TYPE_MIN_BODY_PX}px.`);
    }
    if (sample.lineHeight + 1e-6 < TYPE_LINE_HEIGHT.min || sample.lineHeight - 1e-6 > TYPE_LINE_HEIGHT.max) {
      problems.push(
        `Body line-height is ${sample.lineHeight.toFixed(2)} at ${sample.width}. Required range is ${TYPE_LINE_HEIGHT.min} to ${TYPE_LINE_HEIGHT.max}.`,
      );
    }
    if (sample.measureCh + 0.05 < TYPE_MEASURE_CH.min || sample.measureCh - 0.05 > TYPE_MEASURE_CH.max) {
      problems.push(
        `Measure is ${sample.measureCh.toFixed(1)}ch at ${sample.width}. Required range is ${TYPE_MEASURE_CH.min} to ${TYPE_MEASURE_CH.max}.`,
      );
    }
  }
}

function skipLinkLeads(html: string): boolean {
  const skip = html.search(/<a\b[^>]*(?:class\s*=\s*["'][^"']*\bskip\b[^"']*["']|href\s*=\s*["']#content["'])/i);
  const first = html.search(/<(?:button|nav)\b/i);
  return skip >= 0 && (first < 0 || skip < first);
}

function videoControl(html: string): boolean {
  if (/data-video-control\b/i.test(html)) return true;
  const tags = html.match(/<video\b[^>]*>/gi) ?? [];
  return tags.some((tag) => hasBooleanAttr(tag, "controls"));
}

function hasBooleanAttr(tag: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|>|/)`, "i").test(tag);
}

function bareVhIndex(css: string): number {
  const match = /(?<![\w-])100vh\b/.exec(css);
  return match === null ? -1 : match.index;
}

function heroBodies(blocks: CssBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.prelude.startsWith("@")) out.push(...heroBodies(block.children));
    else if (/\bhero\b/i.test(block.prelude)) out.push(block.body);
  }
  return out;
}

function fixedBodies(blocks: CssBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.prelude.startsWith("@")) out.push(...fixedBodies(block.children));
    else if (/position\s*:\s*(?:fixed|sticky)\b/i.test(block.body)) out.push(block.body);
  }
  return out;
}

function rootUsesAntialiased(blocks: CssBlock[]): boolean {
  for (const block of blocks) {
    if (block.prelude.startsWith("@")) {
      if (rootUsesAntialiased(block.children)) return true;
      continue;
    }
    const root = /(?:^|,)\s*(?::root|html|body)\b/i.test(block.prelude);
    if (root && /-webkit-font-smoothing\s*:\s*antialiased/i.test(block.body)) return true;
  }
  return false;
}

function isFineMedia(prelude: string): boolean {
  return prelude.startsWith("@") && /hover\s*:\s*hover|pointer\s*:\s*fine/i.test(prelude);
}

function hoverOnly(blocks: CssBlock[]): boolean {
  let hidden = false;
  let revealed = false;
  const walk = (list: CssBlock[]): void => {
    for (const block of list) {
      if (isFineMedia(block.prelude)) continue;
      if (block.prelude.startsWith("@")) {
        walk(block.children);
        continue;
      }
      const hover = /:hover\b/i.test(block.prelude);
      if (!hover && /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\b/i.test(block.body)) {
        hidden = true;
      }
      if (
        hover &&
        /display\s*:\s*(?:block|flex|grid)\b|visibility\s*:\s*visible|opacity\s*:\s*(?:1\b|0\.[1-9])/i.test(block.body)
      ) {
        revealed = true;
      }
    }
  };
  walk(blocks);
  return hidden && revealed;
}

function customCursor(blocks: CssBlock[]): boolean {
  for (const block of blocks) {
    if (isFineMedia(block.prelude)) continue;
    if (block.prelude.startsWith("@")) {
      if (customCursor(block.children)) return true;
      continue;
    }
    if (/cursor\s*:\s*(?:none|url\s*\()/i.test(block.body)) return true;
  }
  return false;
}

function parseBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf("{", cursor);
    if (open < 0) break;
    const prelude = css.slice(cursor, open).trim();
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      const char = css[end];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      end += 1;
    }
    const inner = css.slice(open + 1, end - 1);
    const atRule = prelude.startsWith("@");
    blocks.push({
      prelude,
      body: atRule ? "" : inner.trim(),
      children: atRule ? parseBlocks(inner) : [],
    });
    cursor = end;
  }
  return blocks;
}

export interface JurorMobileInput {
  scrollWidth: number;
  clientWidth: number;
  controls: readonly { width: number; height: number }[];
  textPx: readonly number[];
  hoverOnlyControls: number;
  videos: readonly { autoplay: boolean; muted: boolean }[];
}

export interface JurorMobileRow {
  id: "horizontal-overflow" | "control-under-44" | "text-under-16" | "hover-only-control" | "video-autoplay-sound";
  yes: boolean;
  evidence: string;
}

/** Yes or no rows from mobile measurements. Evidence names Playwright. */
export function jurorMobileEvidence(input: JurorMobileInput): {
  overflow: JurorMobileRow;
  control: JurorMobileRow;
  text: JurorMobileRow;
  hover: JurorMobileRow;
  video: JurorMobileRow;
} {
  const overflow = input.scrollWidth > input.clientWidth;
  const small = input.controls.find(
    (control) => control.width < PRIMARY_TARGET_MIN || control.height < PRIMARY_TARGET_MIN,
  );
  const smallText = input.textPx.find((size) => size < TYPE_MIN_BODY_PX);
  const hover = input.hoverOnlyControls > 0;
  const loud = input.videos.find((video) => video.autoplay && !video.muted);
  return {
    overflow: {
      id: "horizontal-overflow",
      yes: !overflow,
      evidence: overflow
        ? `Playwright measured scroll width ${input.scrollWidth} against client width ${input.clientWidth}.`
        : `Playwright measured no horizontal overflow at client width ${input.clientWidth}.`,
    },
    control: {
      id: "control-under-44",
      yes: small === undefined,
      evidence: small === undefined
        ? `Playwright measured no control under ${PRIMARY_TARGET_MIN}px.`
        : `Playwright measured a control at ${small.width} by ${small.height}, under ${PRIMARY_TARGET_MIN}px.`,
    },
    text: {
      id: "text-under-16",
      yes: smallText === undefined,
      evidence: smallText === undefined
        ? `Playwright measured no text under ${TYPE_MIN_BODY_PX}px.`
        : `Playwright measured text at ${smallText}px, under ${TYPE_MIN_BODY_PX}px.`,
    },
    hover: {
      id: "hover-only-control",
      yes: !hover,
      evidence: hover
        ? `Playwright found ${input.hoverOnlyControls} hover-only control.`
        : "Playwright found no hover-only control.",
    },
    video: {
      id: "video-autoplay-sound",
      yes: loud === undefined,
      evidence: loud === undefined
        ? "Playwright found no video that autoplays with sound."
        : "Playwright found a video that autoplays with sound.",
    },
  };
}

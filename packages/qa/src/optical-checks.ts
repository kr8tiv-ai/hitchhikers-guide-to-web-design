/**
 * Optical micro-detail checks (245x).
 *
 * Pure evaluators. The runner collects the facts, including ink boxes,
 * forced :hover and :focus-visible, and a prefers-reduced-motion pass.
 * Each finding uses the 245c shape. The one-line fix instruction is
 * `detail`. summaryForModel and opticalFixInstructions print it unchanged.
 *
 * Centring tolerance is strictly above the ratio, so 1.5% still passes.
 * A negative text-indent follows the ink: an opening quote that pulls the
 * ink left is `text-indent: -0.12em` or `hanging-punctuation: first`.
 * One or two purely centred sections are fixes. Three or more in a row
 * are one blocker. Display tracking is judged at 1440. DESIGN.md lines
 * `id: breaks-grid` and `id: centred: intentional` skip those sections.
 * `baseline unit: Npx` overrides design.optical.baselineUnit.
 */

import { defaultConfig, type OpticalConfig } from "@hitchhiker/engine";
import type { Finding } from "./cdp-assertions.ts";

export const OPTICAL_BASELINE_TOLERANCE_PX = 1;
export const OPTICAL_DISPLAY_MIN_PX = 40;
export const OPTICAL_SYMMETRY_RUN = 2;
export const OPTICAL_MARGIN_TOLERANCE_PX = 1;

const OPEN_QUOTE = /^["'\u201C\u2018\u00AB\u2039]/;
const TRAIL_PUNCT = /[.!?,:;\u2026\u201D\u2019\u00BB]$/;
const OUTLINE_PROPS = new Set(["outline-style", "outline-width", "outline-color", "outline-offset"]);
const AUTHORED_OUTLINE = new Set(["solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]);

export const OPTICAL_STATE_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "box-shadow",
  "transform",
  "text-decoration-line",
  "text-decoration-color",
  "opacity",
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  "font-weight",
  "letter-spacing",
  "filter",
  "translate",
  "scale",
] as const;

export interface OpticalCentringSample {
  selector: string;
  text: string;
  boxLeft: number;
  boxWidth: number;
  inkLeft: number;
  inkWidth: number;
  centred: boolean;
  fontSizePx?: number;
}

export interface OpticalBaselineSample {
  selector: string;
  sectionId: string;
  lineHeightPx: number;
  lineTops: readonly number[];
}

export interface OpticalTrackingSample {
  selector: string;
  fontSizePx: number;
  letterSpacing: string;
  textTransform: string;
  text?: string;
  allCaps?: boolean;
}

export interface OpticalSymmetrySample {
  sectionId: string;
  selector: string;
  contentLeft: number;
  contentRight: number;
  containerLeft: number;
  containerRight: number;
  centredText: boolean;
  hasOffset: boolean;
}

export interface OpticalStateSample {
  selector: string;
  visible: boolean;
  hoverChanged: readonly string[];
  focusChanged: readonly string[];
  focusIsUaOutlineOnly: boolean;
  missingVisibleFocus: boolean;
}

export interface OpticalMotionSample {
  selector: string;
  animates: boolean;
  present: boolean;
  opacity: number;
  offCanvas: boolean;
  keepsLayout: boolean;
  blank: boolean;
}

export interface OpticalFacts {
  centring?: readonly OpticalCentringSample[];
  baselines?: readonly OpticalBaselineSample[];
  tracking?: readonly OpticalTrackingSample[];
  symmetry?: readonly OpticalSymmetrySample[];
  states?: readonly OpticalStateSample[];
  motion?: readonly OpticalMotionSample[];
}

export interface OpticalOptions {
  width?: number;
  baselineUnit?: number;
  centringTolerance?: number;
  designMd?: string;
  breaksGrid?: readonly string[];
  centredIntentional?: readonly string[];
  enabled?: boolean;
}

export interface OpticalMarks {
  breaksGrid: string[];
  centredIntentional: string[];
  /** Null when DESIGN.md does not name a unit. */
  baselineUnit: number | null;
}

export interface ReducedMotionRaw {
  present: boolean;
  opacity?: number;
  display?: string;
  visibility?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  text?: string;
  backgroundColor?: string;
  borderTopWidth?: string;
  hasMedia?: boolean;
}

export interface ReducedMotionState {
  present: boolean;
  opacity: number;
  offCanvas: boolean;
  keepsLayout: boolean;
  blank: boolean;
}

export interface OpticalCollectPayload {
  centring: OpticalCentringSample[];
  baselines: OpticalBaselineSample[];
  tracking: OpticalTrackingSample[];
  symmetry: OpticalSymmetrySample[];
  stateTargets: string[];
  motionTargets: string[];
}

export interface OpticalReportLike {
  blockers?: readonly Finding[];
  fixes?: readonly Finding[];
  reports?: readonly { blockers: readonly Finding[]; fixes: readonly Finding[] }[];
}

export function opticalDefaults(): OpticalConfig {
  return { ...defaultConfig().design.optical };
}

export function opticalMarksFromDesign(markdown: string): OpticalMarks {
  const breaksGrid: string[] = [];
  const centredIntentional: string[] = [];
  let baselineUnit: number | null = null;
  const unit = /baseline(?:\s+unit)?\s*:\s*(\d+(?:\.\d+)?)\s*px/i.exec(markdown);
  if (unit?.[1] !== undefined) {
    const value = Number(unit[1]);
    if (Number.isFinite(value) && value > 0) baselineUnit = value;
  }
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s*[-*]?\s*([A-Za-z][\w-]*)\s*:\s*(.+?)\s*$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const id = match[1];
    const value = match[2].replace(/\.$/, "").trim();
    if (/^breaks-grid\b/i.test(value) && !breaksGrid.includes(id)) breaksGrid.push(id);
    if (/^centred:\s*intentional\b/i.test(value) && !centredIntentional.includes(id)) centredIntentional.push(id);
  }
  return { breaksGrid, centredIntentional, baselineUnit };
}

export function evaluateOptical(
  facts: OpticalFacts | undefined,
  options: OpticalOptions = {},
): { blockers: Finding[]; fixes: Finding[] } {
  const blockers: Finding[] = [];
  const fixes: Finding[] = [];
  if (options.enabled === false || facts === undefined) return { blockers, fixes };
  const defaults = opticalDefaults();
  const marks = opticalMarksFromDesign(options.designMd ?? "");
  const unit = marks.baselineUnit ?? options.baselineUnit ?? defaults.baselineUnit;
  const tolerance = options.centringTolerance ?? defaults.centringTolerance;
  const breaks = new Set([...(options.breaksGrid ?? []), ...marks.breaksGrid]);
  const intentional = new Set([...(options.centredIntentional ?? []), ...marks.centredIntentional]);
  const width = options.width ?? 0;
  for (const sample of facts.centring ?? []) {
    const hit = judgeCentring(sample, tolerance);
    if (hit !== null) fixes.push(hit);
  }
  for (const sample of facts.baselines ?? []) {
    const hit = judgeBaseline(sample, unit, breaks);
    if (hit !== null) fixes.push(hit);
  }
  for (const sample of facts.tracking ?? []) {
    const hit = judgeTracking(sample, width);
    if (hit !== null) fixes.push(hit);
  }
  judgeSymmetry(facts.symmetry ?? [], width, intentional, blockers, fixes);
  for (const sample of facts.states ?? []) {
    const judged = judgeState(sample);
    for (const hit of judged) {
      if (hit.actual === "no visible focus") blockers.push(hit);
      else fixes.push(hit);
    }
  }
  for (const sample of facts.motion ?? []) {
    const hit = judgeMotion(sample);
    if (hit !== null) blockers.push(hit);
  }
  return { blockers, fixes };
}

/** Exact instruction lines, blockers then fixes, with no OPTICAL heading. */
export function opticalFixInstructions(report: OpticalReportLike): string {
  const rows = report.reports
    ? report.reports.flatMap((item) => [...item.blockers, ...item.fixes])
    : [...(report.blockers ?? []), ...(report.fixes ?? [])];
  return rows
    .filter((item) => item.kind.startsWith("optical."))
    .map((item) => item.detail)
    .join("\n");
}

export function opticalStateFromStyles(input: {
  selector: string;
  visible: boolean;
  rest: Readonly<Record<string, string>>;
  hover: Readonly<Record<string, string>>;
  focus: Readonly<Record<string, string>>;
}): OpticalStateSample {
  const hoverChanged = changedProps(input.rest, input.hover).filter((name) => !OUTLINE_PROPS.has(name));
  const focusChanged = changedProps(input.rest, input.focus);
  const designed = focusChanged.filter((name) => !OUTLINE_PROPS.has(name));
  const outlineStyle = (input.focus["outline-style"] ?? "").trim().toLowerCase();
  const outlineOnly = designed.length === 0 && focusChanged.some((name) => OUTLINE_PROPS.has(name));
  const focusIsUaOutlineOnly = outlineOnly && !AUTHORED_OUTLINE.has(outlineStyle);
  return {
    selector: input.selector,
    visible: input.visible,
    hoverChanged,
    focusChanged,
    focusIsUaOutlineOnly,
    missingVisibleFocus: input.visible && focusChanged.length === 0,
  };
}

export function reducedMotionReading(raw: ReducedMotionRaw): ReducedMotionState {
  if (!raw.present) {
    return { present: false, opacity: 0, offCanvas: true, keepsLayout: false, blank: true };
  }
  const opacity = typeof raw.opacity === "number" && Number.isFinite(raw.opacity) ? raw.opacity : 1;
  const width = raw.width ?? 0;
  const height = raw.height ?? 0;
  const x = raw.x ?? 0;
  const y = raw.y ?? 0;
  const viewWidth = raw.viewportWidth ?? 0;
  const viewHeight = raw.viewportHeight ?? 0;
  const offCanvas =
    width > 0 &&
    height > 0 &&
    viewWidth > 0 &&
    viewHeight > 0 &&
    (x + width <= 0 || y + height <= 0 || x >= viewWidth || y >= viewHeight);
  const display = raw.display ?? "block";
  const visibility = raw.visibility ?? "visible";
  const keepsLayout = display !== "none" && visibility !== "hidden" && width > 0 && height > 0;
  const text = (raw.text ?? "").trim();
  const background = (raw.backgroundColor ?? "").replace(/\s+/g, "").toLowerCase();
  const transparent =
    background === "" || background === "transparent" || background === "rgba(0,0,0,0)" || /rgba\(0,0,0,0(?:\.0+)?\)/.test(background);
  const border = Number.parseFloat(raw.borderTopWidth ?? "0");
  const blank = text === "" && transparent && !(border > 0) && raw.hasMedia !== true;
  return { present: true, opacity, offCanvas, keepsLayout, blank };
}

export function opticalMotionFromReading(input: {
  selector: string;
  animates: boolean;
  reduced: ReducedMotionState | null;
}): OpticalMotionSample {
  if (!input.animates) {
    return {
      selector: input.selector,
      animates: false,
      present: true,
      opacity: 1,
      offCanvas: false,
      keepsLayout: true,
      blank: false,
    };
  }
  if (input.reduced === null || !input.reduced.present) {
    return {
      selector: input.selector,
      animates: true,
      present: false,
      opacity: 0,
      offCanvas: true,
      keepsLayout: false,
      blank: true,
    };
  }
  return {
    selector: input.selector,
    animates: true,
    present: true,
    opacity: input.reduced.opacity,
    offCanvas: input.reduced.offCanvas,
    keepsLayout: input.reduced.keepsLayout,
    blank: input.reduced.blank,
  };
}

export function readOpticalPayload(value: unknown): OpticalCollectPayload {
  const empty: OpticalCollectPayload = {
    centring: [],
    baselines: [],
    tracking: [],
    symmetry: [],
    stateTargets: [],
    motionTargets: [],
  };
  const record = asRecord(value);
  if (record === null) return empty;
  return {
    centring: Array.isArray(record.centring) ? record.centring.flatMap(readCentring) : [],
    baselines: Array.isArray(record.baselines) ? record.baselines.flatMap(readBaseline) : [],
    tracking: Array.isArray(record.tracking) ? record.tracking.flatMap(readTracking) : [],
    symmetry: Array.isArray(record.symmetry) ? record.symmetry.flatMap(readSymmetry) : [],
    stateTargets: Array.isArray(record.stateTargets) ? record.stateTargets.flatMap(readSelector) : [],
    motionTargets: Array.isArray(record.motionTargets) ? record.motionTargets.flatMap(readSelector) : [],
  };
}

export function motionSamplesFromReadings(value: unknown): OpticalMotionSample[] {
  if (!Array.isArray(value)) return [];
  const samples: OpticalMotionSample[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record === null || typeof record.selector !== "string" || record.selector === "") continue;
    if (record.present === false) {
      samples.push(opticalMotionFromReading({ selector: record.selector, animates: true, reduced: null }));
      continue;
    }
    const reduced = reducedMotionReading({
      present: true,
      opacity: numberOr(record.opacity, 1),
      display: typeof record.display === "string" ? record.display : "block",
      visibility: typeof record.visibility === "string" ? record.visibility : "visible",
      x: numberOr(record.x, 0),
      y: numberOr(record.y, 0),
      width: numberOr(record.width, 0),
      height: numberOr(record.height, 0),
      viewportWidth: numberOr(record.viewportWidth, 0),
      viewportHeight: numberOr(record.viewportHeight, 0),
      text: typeof record.text === "string" ? record.text : "",
      backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : "",
      borderTopWidth: typeof record.borderTopWidth === "string" ? record.borderTopWidth : "0px",
      hasMedia: record.hasMedia === true,
    });
    samples.push(opticalMotionFromReading({ selector: record.selector, animates: true, reduced }));
  }
  return samples;
}

export function opticalCollectExpression(sectionIds: readonly string[]): string {
  return `(() => {
    try {
      const sectionIds = ${JSON.stringify(sectionIds)};
      const ident = (id) => /^[A-Za-z_][\\w-]*$/.test(id);
      const rootFor = (id) => {
        const selectors = [];
        const safe = String(id).replace(/"/g, "");
        if (ident(id)) selectors.push("#" + CSS.escape(id), "section." + CSS.escape(id), "." + CSS.escape(id));
        selectors.push('[data-section="' + safe + '"]', '[data-section-id="' + safe + '"]');
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node) return { node, selector };
        }
        return null;
      };
      const selectorOf = (node) => {
        if (node.id) return "#" + CSS.escape(node.id);
        const parts = [];
        let current = node;
        while (current && current.nodeType === 1 && parts.length < 4) {
          let part = String(current.tagName || "").toLowerCase();
          if (current.id) {
            parts.unshift("#" + CSS.escape(current.id));
            break;
          }
          const parent = current.parentElement;
          if (parent) {
            const same = [];
            for (const child of parent.children) {
              if (child.tagName === current.tagName) same.push(child);
            }
            if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(current) + 1) + ")";
          }
          const raw = typeof current.className === "string" ? current.className : "";
          const className = raw.trim().split(/\\s+/).filter(Boolean)[0];
          if (className) part += "." + CSS.escape(className);
          parts.unshift(part);
          current = parent;
        }
        return parts.join(" > ");
      };
      const num = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const measureInk = (node, style) => {
        const text = String(node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
        if (text === "") return null;
        const rect = node.getBoundingClientRect();
        const padL = num(style.paddingLeft);
        const padR = num(style.paddingRight);
        const contentLeft = rect.left + padL;
        const contentWidth = Math.max(0, rect.width - padL - padR);
        const line = text.split("\\n").map((part) => part.trim()).filter(Boolean)[0] || text;
        let inkLeft = 0;
        let inkWidth = 0;
        if (ctx) {
          const dir = style.direction === "rtl" ? "rtl" : "ltr";
          const align = style.textAlign;
          let canvasAlign = "left";
          if (align === "center") canvasAlign = "center";
          else if (align === "right") canvasAlign = "right";
          else if (align === "end") canvasAlign = dir === "rtl" ? "left" : "right";
          else if (align === "start") canvasAlign = dir === "rtl" ? "right" : "left";
          ctx.direction = dir;
          ctx.textAlign = canvasAlign;
          ctx.font = style.font || [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
          const metrics = ctx.measureText(line);
          const left = metrics.actualBoundingBoxLeft;
          const right = metrics.actualBoundingBoxRight;
          if (typeof left === "number" && typeof right === "number" && left + right > 0) {
            inkWidth = left + right;
            let alignAt = contentLeft;
            if (canvasAlign === "center") alignAt = contentLeft + contentWidth / 2;
            else if (canvasAlign === "right") alignAt = contentLeft + contentWidth;
            inkLeft = alignAt - left;
          }
        }
        if (inkWidth <= 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const box = range.getBoundingClientRect();
          inkLeft = box.left;
          inkWidth = box.width;
        }
        const parent = node.parentElement;
        const prect = parent ? parent.getBoundingClientRect() : rect;
        const boxMid = rect.left + rect.width / 2;
        const parentMid = prect.left + prect.width / 2;
        const hugs = inkWidth > 0 && contentWidth <= inkWidth + 8;
        const boxCentred = Math.abs(boxMid - parentMid) <= 1 && rect.width < prect.width - 2;
        return {
          selector: selectorOf(node),
          text: line.slice(0, 180),
          boxLeft: contentLeft,
          boxWidth: contentWidth || rect.width,
          inkLeft,
          inkWidth,
          centred: style.textAlign === "center" || (boxCentred && hugs),
          fontSizePx: num(style.fontSize),
        };
      };
      const animates = (node, style) => {
        if (style.animationName && style.animationName !== "none") return true;
        const durations = String(style.transitionDuration || "").split(",");
        if (style.transitionProperty !== "none" && durations.some((part) => num(part) > 0)) return true;
        return typeof node.getAnimations === "function" && node.getAnimations().length > 0;
      };
      const centring = [];
      const baselines = [];
      const tracking = [];
      const symmetry = [];
      const stateTargets = [];
      const motionTargets = [];
      const seenState = new Set();
      const seenMotion = new Set();
      for (const id of sectionIds) {
        const found = rootFor(id);
        if (!found) continue;
        const root = found.node;
        for (const node of root.querySelectorAll("h1, h2, h3")) {
          if (centring.length >= 40) break;
          const sample = measureInk(node, getComputedStyle(node));
          if (sample && sample.centred && sample.inkWidth > 0) centring.push(sample);
        }
        const sectionTop = root.getBoundingClientRect().top;
        for (const node of root.querySelectorAll("p, li")) {
          if (baselines.length >= 80) break;
          const style = getComputedStyle(node);
          const range = document.createRange();
          range.selectNodeContents(node);
          const lineTops = [];
          for (const rect of range.getClientRects()) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            lineTops.push(Math.round((rect.top - sectionTop) * 100) / 100);
          }
          baselines.push({
            selector: selectorOf(node),
            sectionId: id,
            lineHeightPx: num(style.lineHeight),
            lineTops,
          });
        }
        for (const node of root.querySelectorAll("h1, h2, h3, p, span, a, button, small, figcaption, label")) {
          if (tracking.length >= 80) break;
          const style = getComputedStyle(node);
          const fontSizePx = num(style.fontSize);
          const text = String(node.innerText || "").replace(/\\s+/g, " ").trim();
          const letters = text.replace(/[^A-Za-z]/g, "");
          const allCaps = letters.length >= 2 && letters === letters.toUpperCase();
          if (fontSizePx < 40 && style.textTransform !== "uppercase" && !allCaps) continue;
          tracking.push({
            selector: selectorOf(node),
            fontSizePx,
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform,
            text: text.slice(0, 80),
            allCaps,
          });
        }
        const sectionRect = root.getBoundingClientRect();
        const content = root.querySelector(":scope > .container, :scope > .inner, :scope > div") || root;
        const contentRect = content.getBoundingClientRect();
        const texts = [];
        for (const node of root.querySelectorAll("h1, h2, h3, p")) texts.push(node);
        const centredText = texts.length > 0 && texts.every((node) => getComputedStyle(node).textAlign === "center");
        let hasOffset = false;
        for (const node of root.querySelectorAll("img, video, figure, [data-offset]")) {
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || sectionRect.width <= 0) continue;
          const mid = rect.left + rect.width / 2;
          const centre = sectionRect.left + sectionRect.width / 2;
          if (Math.abs(mid - centre) > sectionRect.width * 0.08) hasOffset = true;
        }
        symmetry.push({
          sectionId: id,
          selector: found.selector,
          contentLeft: contentRect.left,
          contentRight: contentRect.right,
          containerLeft: sectionRect.left,
          containerRight: sectionRect.right,
          centredText,
          hasOffset,
        });
        for (const node of root.querySelectorAll("a, button, [role=button], input")) {
          if (stateTargets.length >= 60) break;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (style.display === "none" || style.visibility === "hidden" || num(style.opacity) === 0) continue;
          const selector = selectorOf(node);
          if (seenState.has(selector)) continue;
          seenState.add(selector);
          stateTargets.push({ selector });
        }
        const walk = [root];
        for (const node of root.querySelectorAll("*")) {
          if (walk.length >= 200) break;
          walk.push(node);
        }
        for (const node of walk) {
          if (motionTargets.length >= 40) break;
          const style = getComputedStyle(node);
          if (!animates(node, style)) continue;
          const selector = selectorOf(node);
          if (seenMotion.has(selector)) continue;
          seenMotion.add(selector);
          motionTargets.push({ selector });
        }
      }
      return JSON.stringify({ centring, baselines, tracking, symmetry, stateTargets, motionTargets });
    } catch (error) {
      return JSON.stringify({ centring: [], baselines: [], tracking: [], symmetry: [], stateTargets: [], motionTargets: [] });
    }
  })()`;
}

export function opticalMotionExpression(selectors: readonly string[]): string {
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const view = { width: window.innerWidth, height: window.innerHeight };
    const rows = [];
    for (const selector of selectors) {
      let node = null;
      try { node = document.querySelector(selector); } catch (error) { node = null; }
      if (!node) {
        rows.push({ selector, present: false });
        continue;
      }
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      rows.push({
        selector,
        present: true,
        opacity: Number.parseFloat(style.opacity),
        display: style.display,
        visibility: style.visibility,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: view.width,
        viewportHeight: view.height,
        text: String(node.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 80),
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        hasMedia: !!node.querySelector("img, video, canvas, svg"),
      });
    }
    return JSON.stringify(rows);
  })()`;
}

function judgeCentring(sample: OpticalCentringSample, tolerance: number): Finding | null {
  if (!sample.centred || !(sample.boxWidth > 0) || !(sample.inkWidth > 0)) return null;
  const boxCentre = sample.boxLeft + sample.boxWidth / 2;
  const inkCentre = sample.inkLeft + sample.inkWidth / 2;
  const offset = inkCentre - boxCentre;
  if (Math.abs(offset) / sample.boxWidth <= tolerance) return null;
  const px = Math.round(Math.abs(offset));
  const side = offset < 0 ? "left" : "right";
  const cause = inkCause(sample.text);
  const indent = indentFor(offset, sample.fontSizePx);
  return finding(
    "optical.centring",
    sample.selector,
    `${px}px ${side}`,
    `ink centred within ${percent(tolerance)} of the line`,
    `${sample.selector} is mathematically centred; ink sits ${px}px ${side} of centre because of ${cause}; shift with text-indent: ${indent} or hanging-punctuation: first`,
  );
}

function judgeBaseline(sample: OpticalBaselineSample, unit: number, breaks: ReadonlySet<string>): Finding | null {
  if (breaks.has(sample.sectionId) || !(sample.lineHeightPx > 0) || !(unit > 0)) return null;
  const expected = `multiple of ${trimNum(unit)}px`;
  const instruction = `${sample.selector} line box is off the ${trimNum(unit)}px baseline; set line-height to a multiple of ${trimNum(unit)}px (within ${OPTICAL_BASELINE_TOLERANCE_PX}px).`;
  if (offGrid(sample.lineHeightPx, unit)) {
    return finding("optical.baseline", sample.selector, `line-height ${trimNum(sample.lineHeightPx)}px`, expected, instruction);
  }
  for (let index = 1; index < sample.lineTops.length; index += 1) {
    const previous = sample.lineTops[index - 1];
    const current = sample.lineTops[index];
    if (previous === undefined || current === undefined) continue;
    const gap = current - previous;
    if (!offGrid(gap, unit)) continue;
    return finding(
      "optical.baseline",
      sample.selector,
      `step ${trimNum(gap)}px`,
      expected,
      `${sample.selector} line box steps ${trimNum(gap)}px, off the ${trimNum(unit)}px baseline; set the line box to a multiple of ${trimNum(unit)}px (within ${OPTICAL_BASELINE_TOLERANCE_PX}px).`,
    );
  }
  return null;
}

function judgeTracking(sample: OpticalTrackingSample, width: number): Finding | null {
  const display = width === 1440 && sample.fontSizePx >= OPTICAL_DISPLAY_MIN_PX;
  const caps = sample.fontSizePx < OPTICAL_DISPLAY_MIN_PX && isAllCaps(sample);
  if (display && isNormalTracking(sample.letterSpacing)) {
    return finding(
      "optical.tracking",
      sample.selector,
      "normal",
      "-0.02em",
      `${sample.selector} is display text at ${trimNum(sample.fontSizePx)}px with letter-spacing: normal; set tracking from the type scale, e.g. -0.02em`,
    );
  }
  if (caps && !isPositiveTracking(sample.letterSpacing)) {
    const shown = isNormalTracking(sample.letterSpacing) ? "normal" : oneLine(sample.letterSpacing);
    return finding(
      "optical.tracking",
      sample.selector,
      shown,
      "positive tracking, e.g. 0.08em",
      `${sample.selector} is all-caps at ${trimNum(sample.fontSizePx)}px with letter-spacing: ${shown}; set positive tracking, e.g. 0.08em`,
    );
  }
  return null;
}

function judgeSymmetry(
  samples: readonly OpticalSymmetrySample[],
  width: number,
  intentional: ReadonlySet<string>,
  blockers: Finding[],
  fixes: Finding[],
): void {
  if (width !== 1440) return;
  let streak: OpticalSymmetrySample[] = [];
  const close = (): void => {
    if (streak.length > OPTICAL_SYMMETRY_RUN) {
      const selector = streak.map((item) => item.selector).join(", ");
      blockers.push(
        finding(
          "optical.symmetry",
          selector,
          "purely centred, no asymmetric breathing room",
          "an offset element or centred: intentional",
          `${selector} are purely centred in a row, no asymmetric breathing room; offset one section so the run is not a centred stack.`,
        ),
      );
    } else {
      for (const item of streak) {
        fixes.push(
          finding(
            "optical.symmetry",
            item.selector,
            "purely centred, no asymmetric breathing room",
            "an offset element or centred: intentional",
            `${item.selector} is purely centred, no asymmetric breathing room; offset the media or the type block.`,
          ),
        );
      }
    }
    streak = [];
  };
  for (const sample of samples) {
    if (isPure(sample) && !intentional.has(sample.sectionId)) streak.push(sample);
    else close();
  }
  close();
}

function judgeState(sample: OpticalStateSample): Finding[] {
  if (!sample.visible) return [];
  const found: Finding[] = [];
  if (sample.missingVisibleFocus) {
    found.push(
      finding(
        "optical.states",
        sample.selector,
        "no visible focus",
        "a visible :focus-visible style",
        `${sample.selector} has no visible focus; add a :focus-visible style that is not the browser outline alone.`,
      ),
    );
  } else if (sample.focusIsUaOutlineOnly) {
    found.push(
      finding(
        "optical.states",
        sample.selector,
        "browser default focus ring",
        "a designed focus style",
        `${sample.selector} shows only the browser default focus ring; replace the UA outline with a designed :focus-visible style (colour, shadow, or underline).`,
      ),
    );
  }
  if (sample.hoverChanged.length === 0) {
    found.push(
      finding(
        "optical.states",
        sample.selector,
        "no hover change",
        "a designed hover style",
        `${sample.selector} does not change on hover; set a designed :hover (colour, background, or underline).`,
      ),
    );
  }
  return found;
}

function judgeMotion(sample: OpticalMotionSample): Finding | null {
  if (!sample.animates) return null;
  const expected = "opacity 1, on canvas, layout kept, designed fallback";
  if (!sample.present) {
    return finding(
      "optical.reducedMotion",
      sample.selector,
      "removed",
      expected,
      `${sample.selector} is removed under prefers-reduced-motion; keep it in layout with a designed static fallback at opacity 1.`,
    );
  }
  if (sample.opacity < 0.99) {
    const shown = sample.opacity === 0 ? "opacity 0" : `opacity ${trimNum(sample.opacity)}`;
    return finding(
      "optical.reducedMotion",
      sample.selector,
      shown,
      expected,
      `${sample.selector} stays at ${shown} under prefers-reduced-motion; show a designed static fallback at opacity 1.`,
    );
  }
  if (sample.offCanvas) {
    return finding(
      "optical.reducedMotion",
      sample.selector,
      "off-canvas",
      expected,
      `${sample.selector} sits off-canvas under prefers-reduced-motion; keep the designed fallback in view at opacity 1.`,
    );
  }
  if (!sample.keepsLayout) {
    return finding(
      "optical.reducedMotion",
      sample.selector,
      "layout removed",
      expected,
      `${sample.selector} loses its layout under prefers-reduced-motion; keep the designed fallback in flow at opacity 1.`,
    );
  }
  if (sample.blank) {
    return finding(
      "optical.reducedMotion",
      sample.selector,
      "blank",
      expected,
      `${sample.selector} reduced-motion fallback is blank; give it the designed static treatment at opacity 1.`,
    );
  }
  return null;
}

function isPure(sample: OpticalSymmetrySample): boolean {
  const left = sample.contentLeft - sample.containerLeft;
  const right = sample.containerRight - sample.contentRight;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (Math.abs(left - right) > OPTICAL_MARGIN_TOLERANCE_PX) return false;
  return sample.centredText && !sample.hasOffset;
}

function isNormalTracking(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" || trimmed === "normal" || trimmed === "0" || trimmed === "0px" || trimmed === "0em" || trimmed === "initial";
}

function isPositiveTracking(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (isNormalTracking(trimmed)) return false;
  const amount = Number.parseFloat(trimmed);
  if (Number.isFinite(amount)) return amount > 0;
  return !trimmed.startsWith("-");
}

function isAllCaps(sample: OpticalTrackingSample): boolean {
  if (sample.textTransform.trim().toLowerCase() === "uppercase" || sample.allCaps === true) return true;
  const letters = (sample.text ?? "").replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

function inkCause(text: string): string {
  const trimmed = text.trim();
  if (OPEN_QUOTE.test(trimmed)) return "the opening quote";
  if (TRAIL_PUNCT.test(trimmed)) return "the trailing punctuation";
  if (/^[A-Z]/.test(trimmed)) return "the leading cap";
  return "the side bearings";
}

function indentFor(offset: number, fontSizePx: number | undefined): string {
  const sign = offset < 0 ? "-" : "";
  const mag = Math.abs(offset);
  if (fontSizePx !== undefined && fontSizePx > 0) {
    const em = Math.round((mag / fontSizePx) * 100) / 100;
    return `${sign}${trimNum(em)}em`;
  }
  return `${sign}${Math.round(mag)}px`;
}

function offGrid(value: number, unit: number): boolean {
  if (!Number.isFinite(value) || !(unit > 0)) return false;
  const nearest = Math.round(value / unit) * unit;
  return Math.abs(value - nearest) > OPTICAL_BASELINE_TOLERANCE_PX;
}

function changedProps(rest: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): string[] {
  const names = new Set([...Object.keys(rest), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const name of names) {
    if ((rest[name] ?? "") !== (next[name] ?? "")) changed.push(name);
  }
  return changed;
}

function percent(value: number): string {
  const shown = Math.round(value * 1000) / 10;
  return `${trimNum(shown)}%`;
}

function readCentring(value: unknown): OpticalCentringSample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  const sample: OpticalCentringSample = {
    selector: record.selector,
    text: typeof record.text === "string" ? record.text : "",
    boxLeft: numberOr(record.boxLeft, 0),
    boxWidth: numberOr(record.boxWidth, 0),
    inkLeft: numberOr(record.inkLeft, 0),
    inkWidth: numberOr(record.inkWidth, 0),
    centred: record.centred === true,
  };
  if (typeof record.fontSizePx === "number" && Number.isFinite(record.fontSizePx)) sample.fontSizePx = record.fontSizePx;
  return [sample];
}

function readBaseline(value: unknown): OpticalBaselineSample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  const lineTops = Array.isArray(record.lineTops)
    ? record.lineTops.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  return [
    {
      selector: record.selector,
      sectionId: typeof record.sectionId === "string" ? record.sectionId : "",
      lineHeightPx: numberOr(record.lineHeightPx, 0),
      lineTops,
    },
  ];
}

function readTracking(value: unknown): OpticalTrackingSample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  const sample: OpticalTrackingSample = {
    selector: record.selector,
    fontSizePx: numberOr(record.fontSizePx, 0),
    letterSpacing: typeof record.letterSpacing === "string" ? record.letterSpacing : "normal",
    textTransform: typeof record.textTransform === "string" ? record.textTransform : "none",
  };
  if (typeof record.text === "string") sample.text = record.text;
  if (typeof record.allCaps === "boolean") sample.allCaps = record.allCaps;
  return [sample];
}

function readSymmetry(value: unknown): OpticalSymmetrySample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  return [
    {
      sectionId: typeof record.sectionId === "string" ? record.sectionId : "",
      selector: record.selector,
      contentLeft: numberOr(record.contentLeft, 0),
      contentRight: numberOr(record.contentRight, 0),
      containerLeft: numberOr(record.containerLeft, 0),
      containerRight: numberOr(record.containerRight, 0),
      centredText: record.centredText === true,
      hasOffset: record.hasOffset === true,
    },
  ];
}

function readSelector(value: unknown): string[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string" || record.selector === "") return [];
  return [record.selector];
}

function finding(kind: string, selector: string, actual: string, expected: string, detail: string): Finding {
  return {
    kind,
    selector: oneLine(selector),
    actual: oneLine(actual),
    expected: oneLine(expected),
    detail: oneLine(detail),
  };
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

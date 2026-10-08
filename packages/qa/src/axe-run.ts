/**
 * Axe, keyboard, and reduced-motion collection (prompt 126, judged by 123).
 *
 * Serious and critical axe impacts fail. evaluateA11y also fails moderate,
 * and this runner keeps that stricter floor. A crash is BLOCKER.
 */

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { evaluateA11y, type A11yViolation } from "./a11y-gate.ts";
import { withChromium } from "./playwright-opener.ts";

export interface AxeResult {
  status: "PASS" | "BLOCKER";
  violations: A11yViolation[];
  notes: string[];
  keyboard: boolean;
  reducedMotion: boolean;
  contrastRatio: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function failed(message: string): AxeResult {
  return {
    status: "BLOCKER",
    violations: [],
    notes: [`Axe failed closed. ${message}`],
    keyboard: false,
    reducedMotion: false,
    contrastRatio: 0,
  };
}

function parseColor(value: string): Rgb | undefined {
  const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(value);
  if (match === null) return undefined;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (![r, g, b, alpha].every((part) => Number.isFinite(part))) return undefined;
  if (alpha === 0) return undefined;
  return { r, g, b };
}

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (fg === undefined || bg === undefined) return 0;
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function asImpact(value: string | null | undefined, id: string): A11yViolation {
  if (value === "minor" || value === "moderate" || value === "serious" || value === "critical") {
    return { impact: value, id };
  }
  return { impact: "serious", id };
}

async function sampleContrast(page: Page): Promise<number> {
  const colors = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { body: unknown; documentElement: unknown };
      getComputedStyle: (el: unknown) => { color: string; backgroundColor: string };
    };
    const body = view.getComputedStyle(view.document.body);
    const root = view.getComputedStyle(view.document.documentElement);
    const bodyBg = body.backgroundColor;
    const transparent = bodyBg === "transparent" || bodyBg === "rgba(0, 0, 0, 0)";
    return { color: body.color, background: transparent ? root.backgroundColor : bodyBg };
  });
  return contrastRatio(colors.color, colors.background);
}

interface FocusEl {
  tagName: string;
  textContent: string | null;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => {
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

async function keyboardPath(page: Page): Promise<boolean> {
  const expected = await page
    .locator(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    )
    .count();
  if (expected === 0) return false;
  const seen = new Set<string>();
  for (let step = 0; step < expected + 2; step += 1) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(() => {
      const view = globalThis as unknown as {
        document: {
          activeElement: FocusEl | null;
          body: FocusEl;
          documentElement: FocusEl;
        };
        getComputedStyle: (el: FocusEl) => { visibility: string; display: string; opacity: string };
        innerHeight: number;
        innerWidth: number;
      };
      const el = view.document.activeElement;
      if (el === null || el === view.document.body || el === view.document.documentElement) return null;
      const style = view.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible =
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < view.innerHeight &&
        rect.left < view.innerWidth;
      if (!visible) return null;
      const href = el.tagName === "A" ? (el.getAttribute("href") ?? "") : "";
      return `${el.tagName}:${href}:${(el.textContent ?? "").trim()}`;
    });
    if (current !== null) seen.add(current);
  }
  return seen.size >= expected;
}

async function motionWithinLimit(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<unknown> };
      getComputedStyle: (el: unknown) => { animationDuration: string; transitionDuration: string };
    };
    const limit = 0.2;
    const seconds = (value: string): number => {
      let max = 0;
      for (const part of value.split(",")) {
        const match = /^([\d.]+)(ms|s)$/.exec(part.trim());
        if (match === null) continue;
        const amount = Number(match[1]);
        const unit = match[2] === "ms" ? amount / 1000 : amount;
        if (Number.isFinite(unit) && unit > max) max = unit;
      }
      return max;
    };
    for (const node of view.document.querySelectorAll("*")) {
      const style = view.getComputedStyle(node);
      if (seconds(style.animationDuration) > limit) return false;
      if (seconds(style.transitionDuration) > limit) return false;
    }
    return true;
  });
}

async function openAxe(url: string): Promise<AxeResult> {
  return withChromium(async (browser) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 375, height: 812 },
    });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      const builder = new AxeBuilder({
        page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"],
      });
      const scan = await builder.analyze();
      const violations: A11yViolation[] = [];
      for (const item of scan.violations) {
        if (typeof item.id !== "string" || item.id.length === 0) continue;
        violations.push(asImpact(item.impact, item.id));
      }
      const ratio = await sampleContrast(page);
      const keyboard = await keyboardPath(page);
      await page.close();
      const calm = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 375, height: 812 },
        reducedMotion: "reduce",
      });
      let reducedMotion = false;
      try {
        const motionPage = await calm.newPage();
        await motionPage.goto(url, { waitUntil: "load", timeout: 20_000 });
        reducedMotion = await motionWithinLimit(motionPage);
      } finally {
        await calm.close();
      }
      const judged = evaluateA11y({
        violations,
        hasKeyboardPath: keyboard,
        hasReducedMotion: reducedMotion,
        contrastRatio: ratio,
        motionUsed: true,
      });
      return {
        status: judged.status,
        violations,
        notes: judged.notes,
        keyboard,
        reducedMotion,
        contrastRatio: ratio,
      };
    } finally {
      await context.close();
    }
  });
}

export async function runAxe(url: string): Promise<AxeResult> {
  try {
    return await openAxe(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Axe crashed.";
    return failed(message);
  }
}

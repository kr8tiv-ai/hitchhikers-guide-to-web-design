/**
 * Nav and footer craft (audit 12, second half).
 *
 * The bar is set in the brand type. A face the person named is allowed,
 * including a face the type gate would otherwise refuse. The current page
 * is marked in text or with aria-current, not by colour alone. Keyboard
 * order matches the visual order. Targets are at least 44px. The menu is
 * a disclosure: it opens, and Escape closes it.
 *
 * The footer is the last scene. Contrast uses passesBodyContrast.
 * This module does not launch a browser.
 */

import { isOverusedFamily, passesBodyContrast } from "@hitchhiker/engine";

const TARGET_MIN = 44;

export interface NavTarget {
  name: string;
  width: number;
  height: number;
}

export interface NavFooterInput {
  navFamily: string;
  brandFamilies: readonly string[];
  namedFamilies: readonly string[];
  currentMark: "color" | "aria" | "text";
  html: string;
  css: string;
  tabOrder: readonly string[];
  visualOrder: readonly string[];
  navTargets: readonly NavTarget[];
  phoneButton: NavTarget;
  pointer: "fine" | "coarse";
  barHides: boolean;
  recallTarget: NavTarget | null;
  barCoversFocused: boolean;
  menuOpened: boolean;
  menuEscapeClosed: boolean;
  footerLinks: readonly string[];
  footerLinksReached: readonly string[];
  focusRingVisible: boolean;
  footerInk: string;
  footerPaper: string;
}

export interface NavFooterResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
}

interface CssRule {
  selector: string;
  body: string;
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function listed(name: string, names: readonly string[]): boolean {
  return names.some((item) => sameName(item, name));
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sizeReason(target: NavTarget): string | null {
  if (target.width >= TARGET_MIN && target.height >= TARGET_MIN) return null;
  return `${target.name} is ${target.width} by ${target.height}. Minimum is ${TARGET_MIN}.`;
}

function footerBlock(html: string): string {
  return /<footer\b[^>]*>[\s\S]*?<\/footer>/i.exec(html)?.[0] ?? "";
}

function cssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = match[1]?.trim() ?? "";
    const body = match[2] ?? "";
    if (selector.length > 0) rules.push({ selector, body });
  }
  return rules;
}

function footerHasSafeArea(css: string): boolean {
  return cssRules(css).some(
    (rule) => /footer/i.test(rule.selector) && /env\(\s*safe-area-inset-bottom\s*\)/i.test(rule.body),
  );
}

function hoverOnlyColumns(css: string): boolean {
  const rules = cssRules(css);
  const hidden = rules.some(
    (rule) =>
      /footer/i.test(rule.selector) &&
      /column/i.test(rule.selector) &&
      !/:hover/i.test(rule.selector) &&
      /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\b/i.test(rule.body),
  );
  const shown = rules.some(
    (rule) =>
      /footer/i.test(rule.selector) &&
      /column/i.test(rule.selector) &&
      /:hover/i.test(rule.selector) &&
      /display\s*:\s*block|visibility\s*:\s*visible|opacity\s*:\s*1\b/i.test(rule.body),
  );
  return hidden && shown;
}

function readMark(mark: NavFooterInput["currentMark"]): NavFooterInput["currentMark"] {
  if (mark === "color" || mark === "aria" || mark === "text") return mark;
  throw new Error("currentMark must be color, aria, or text.");
}

/** Measured nav and footer craft. A miss is a blocker. */
export function evaluateNavFooter(input: NavFooterInput): NavFooterResult {
  const reasons: string[] = [];
  const mark = readMark(input.currentMark);
  const family = input.navFamily.trim();
  if (/role\s*=\s*["']menu["']/i.test(input.html)) {
    reasons.push('The nav uses role="menu". Site navigation is a disclosure, not an application menu.');
  }
  if (!input.menuOpened) reasons.push("The menu did not open.");
  if (!input.menuEscapeClosed) reasons.push("Escape did not close the menu.");
  if (!listed(family, input.brandFamilies)) {
    reasons.push(`Nav type is ${family}. The bar is set in the brand type.`);
  }
  if (isOverusedFamily(family) && !listed(family, input.namedFamilies)) {
    reasons.push(`Nav type is ${family}. A default face is not the brand type unless the person named it.`);
  }
  if (mark === "color") {
    reasons.push("The current page is marked by colour alone.");
  } else if (mark === "aria" && !/aria-current\s*=\s*["']page["']/i.test(input.html)) {
    reasons.push('The current page is missing aria-current="page".');
  } else if (mark === "text" && !/data-current\s*=\s*["']page["']/i.test(input.html)) {
    reasons.push("The current page is missing a text mark.");
  }
  if (!sameOrder(input.tabOrder, input.visualOrder)) {
    reasons.push("Keyboard order does not match the visual order.");
  }
  for (const target of input.navTargets) {
    const reason = sizeReason(target);
    if (reason !== null) reasons.push(reason);
  }
  const button = sizeReason(input.phoneButton);
  if (button !== null) reasons.push(button);
  if (input.pointer === "coarse" && input.barHides) {
    if (input.recallTarget === null) {
      reasons.push(`The recall target is missing. Minimum is ${TARGET_MIN}.`);
    } else {
      const recall = sizeReason(input.recallTarget);
      if (recall !== null) reasons.push(recall);
    }
    if (input.barCoversFocused) reasons.push("The bar covers the focused element.");
  }
  const footer = footerBlock(input.html);
  if (!/\bwordmark\b/i.test(footer)) reasons.push("The footer is missing a wordmark.");
  if (!/\bcolophon\b/i.test(footer)) reasons.push("The footer is missing a colophon.");
  if (!/href\s*=\s*["']#top["']/i.test(footer) && !/data-back-to-top\b/i.test(footer)) {
    reasons.push("The footer is missing a way back to the top.");
  }
  if (!/\bcredits?\b/i.test(footer)) reasons.push("The footer is missing the credit line.");
  if (!footerHasSafeArea(input.css)) reasons.push("The footer is missing a safe-area inset.");
  if (hoverOnlyColumns(input.css)) reasons.push("Footer columns appear only on hover.");
  if (!passesBodyContrast(input.footerInk, input.footerPaper)) {
    reasons.push("Footer contrast is below 4.5 to 1.");
  }
  for (const href of input.footerLinks) {
    if (!input.footerLinksReached.includes(href)) reasons.push(`Footer link ${href} is not reached.`);
  }
  if (!input.focusRingVisible) reasons.push("The footer focus ring is not visible.");
  return { status: reasons.length === 0 ? "PASS" : "BLOCKER", reasons };
}

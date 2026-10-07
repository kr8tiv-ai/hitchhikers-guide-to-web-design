/**
 * CSS scroll-driven reveals for a native scroller.
 * animation-timeline is inside @supports. Content stays visible without it.
 * This module must not run on a Lenis page.
 */

export type ScrollOwnerName = "lenis+scrolltrigger" | "native" | "none";

export const CSS_SCROLL_BLOCK = [
  "@keyframes hh-rise {",
  "  from { opacity: 0; transform: translateY(12px); }",
  "  to { opacity: 1; transform: none; }",
  "}",
  "@supports (animation-timeline: view()) {",
  "  .hh-reveal {",
  "    animation-name: hh-rise;",
  "    animation-duration: auto;",
  "    animation-fill-mode: both;",
  "    animation-timeline: view();",
  "    animation-range: entry 0% cover 40%;",
  "  }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  .hh-reveal {",
  "    animation: none;",
  "    opacity: 1;",
  "    transform: none;",
  "  }",
  "}",
].join("\n");

export function cssScrollFor(owner: ScrollOwnerName): string {
  if (owner === "lenis+scrolltrigger") {
    throw new Error("CSS scroll-driven animations do not run on a Lenis page.");
  }
  if (owner === "none") return "";
  return CSS_SCROLL_BLOCK;
}

export function installCssScroll(owner: ScrollOwnerName): HTMLStyleElement | null {
  const css = cssScrollFor(owner);
  if (css.length === 0 || typeof document === "undefined") return null;
  const style = document.createElement("style");
  style.setAttribute("data-hh", "css-scroll");
  style.textContent = css;
  document.head.append(style);
  return style;
}

/**
 * Skeletons for a generated site's src/scripts/motion.ts and src/scripts/webgl.ts.
 *
 * MotionPlan is a narrow structural copy of the object planMotion returns
 * (packages/engine/src/spec/motion.ts). The engine package entry does not
 * re-export that type, and a deep import is forbidden, so the shape lives
 * here: scrollOwner, assignments, warnings, markdown.
 *
 * The Guide chose one scroll owner per page. This file does not claim that
 * Lenis documented CSS timelines.
 */

export type ScrollOwner = "lenis+scrolltrigger" | "native" | "none";

export type MotionLib =
  | "gsap"
  | "lenis"
  | "three"
  | "ogl"
  | "motion"
  | "anime"
  | "theatre"
  | "css-scroll"
  | "vanilla";

export interface MotionAssignment {
  id: string;
  library: MotionLib;
  element: string;
}

export interface MotionPlan {
  scrollOwner: Record<string, ScrollOwner>;
  assignments: readonly MotionAssignment[];
  warnings: readonly string[];
  markdown: string;
}

export class MotionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotionContractError";
  }
}

interface EffectRef {
  id: string;
  library: MotionLib;
  element: string;
  page: string;
  kind: string;
}

const MOTION_LIBS: readonly MotionLib[] = [
  "gsap",
  "lenis",
  "three",
  "ogl",
  "motion",
  "anime",
  "theatre",
  "css-scroll",
  "vanilla",
];

const SCROLL_OWNERS: readonly ScrollOwner[] = ["lenis+scrolltrigger", "native", "none"];

const HEAVY: readonly MotionLib[] = ["three", "ogl", "theatre"];

function isMotionLib(value: string): value is MotionLib {
  return (MOTION_LIBS as readonly string[]).includes(value);
}

function isScrollOwner(value: string): value is ScrollOwner {
  return (SCROLL_OWNERS as readonly string[]).includes(value);
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const bodyStart = markdown.indexOf("\n", start);
  if (bodyStart === -1) return "";
  const rest = markdown.slice(bodyStart + 1);
  const next = rest.search(/\n## /);
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.replace(/^\n+/, "").replace(/\n+$/, "");
}

function parseScrollOwners(markdown: string): Map<string, ScrollOwner> {
  const owners = new Map<string, ScrollOwner>();
  const block = section(markdown, "Scroll owner");
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed === "none") continue;
    if (
      trimmed.includes("lenis+scrolltrigger") &&
      (trimmed.includes("animation-timeline") || trimmed.includes("css-scroll") || /\bnative\b/.test(trimmed))
    ) {
      throw new MotionContractError(
        "MOTION.md contains both lenis+scrolltrigger and animation-timeline. The Guide chose one scroll owner.",
      );
    }
    const match = /^- (.+): (lenis\+scrolltrigger|native|none)\s*$/.exec(trimmed);
    const page = match?.[1];
    const owner = match?.[2];
    if (page === undefined || owner === undefined || !isScrollOwner(owner)) continue;
    const previous = owners.get(page);
    if (previous !== undefined && previous !== owner) {
      throw new MotionContractError(
        `Page ${page} names both scroll owners. The Guide chose one scroll owner.`,
      );
    }
    owners.set(page, owner);
  }
  return owners;
}

function parseAssignments(markdown: string): EffectRef[] {
  const found: EffectRef[] = [];
  const block = section(markdown, "Assignments");
  const pattern =
    /^- (.+?) on (.+?) \(page ([^,]+), kind ([^,]+), taxonomy ([^)]+)\): ([a-z0-9+-]+)\./;
  for (const line of block.split("\n")) {
    const match = pattern.exec(line.trim());
    if (match === null) continue;
    const id = match[1];
    const element = match[2];
    const page = match[3];
    const kind = match[4];
    const library = match[6];
    if (
      id === undefined ||
      element === undefined ||
      page === undefined ||
      kind === undefined ||
      library === undefined ||
      !isMotionLib(library)
    ) {
      continue;
    }
    found.push({ id, element, page, kind, library });
  }
  return found;
}

function uses(plan: MotionPlan, library: MotionLib): boolean {
  return plan.assignments.some((item) => item.library === library);
}

function hasLenis(plan: MotionPlan): boolean {
  return uses(plan, "lenis") || Object.values(plan.scrollOwner).includes("lenis+scrolltrigger");
}

function hasNative(plan: MotionPlan): boolean {
  return uses(plan, "css-scroll") || Object.values(plan.scrollOwner).includes("native");
}

function hasGsap(plan: MotionPlan): boolean {
  return uses(plan, "gsap") || uses(plan, "lenis") || hasLenis(plan);
}

function hasHeavy(plan: MotionPlan): boolean {
  return HEAVY.some((library) => uses(plan, library));
}

function assertExclusive(plan: MotionPlan): void {
  if (plan.markdown.includes("lenis+scrolltrigger") && plan.markdown.includes("animation-timeline")) {
    throw new MotionContractError(
      "MOTION.md contains both lenis+scrolltrigger and animation-timeline. The Guide chose one scroll owner.",
    );
  }

  const parsedOwners = parseScrollOwners(plan.markdown);
  for (const [page, owner] of parsedOwners) {
    const stated = plan.scrollOwner[page];
    if (stated !== undefined && stated !== owner) {
      throw new MotionContractError(
        `Scroll owner for ${page} disagrees with MOTION.md. The Guide chose one scroll owner.`,
      );
    }
  }
  for (const [page, owner] of Object.entries(plan.scrollOwner)) {
    const parsed = parsedOwners.get(page);
    if (parsed !== undefined && parsed !== owner) {
      throw new MotionContractError(
        `Scroll owner for ${page} disagrees with MOTION.md. The Guide chose one scroll owner.`,
      );
    }
  }

  const parsed = parseAssignments(plan.markdown);
  const byPage = new Map<string, Set<MotionLib>>();
  for (const item of parsed) {
    const set = byPage.get(item.page);
    if (set === undefined) byPage.set(item.page, new Set([item.library]));
    else set.add(item.library);
  }
  for (const [page, libraries] of byPage) {
    if (libraries.has("lenis") && libraries.has("css-scroll")) {
      throw new MotionContractError(
        `Page ${page} names both lenis and css-scroll. The Guide chose one scroll owner.`,
      );
    }
    const owner = plan.scrollOwner[page] ?? parsedOwners.get(page);
    if (owner === "lenis+scrolltrigger" && libraries.has("css-scroll")) {
      throw new MotionContractError(
        `Page ${page} names both lenis and css-scroll. The Guide chose one scroll owner.`,
      );
    }
    if (owner === "native" && libraries.has("lenis")) {
      throw new MotionContractError(
        `Page ${page} names both lenis and css-scroll. The Guide chose one scroll owner.`,
      );
    }
  }

  if (uses(plan, "lenis") && uses(plan, "css-scroll") && byPage.size === 0) {
    const owners = new Set(Object.values(plan.scrollOwner));
    const split = owners.has("lenis+scrolltrigger") && owners.has("native") && Object.keys(plan.scrollOwner).length > 1;
    if (!split) {
      throw new MotionContractError(
        "MotionPlan names both lenis and css-scroll. The Guide chose one scroll owner.",
      );
    }
  }
}

function effectsOf(plan: MotionPlan): EffectRef[] {
  const parsed = parseAssignments(plan.markdown);
  const byId = new Map(parsed.map((item) => [item.id, item]));
  const onlyPage = Object.keys(plan.scrollOwner).length === 1 ? Object.keys(plan.scrollOwner)[0] : undefined;
  return plan.assignments.map((item) => {
    const extra = byId.get(item.id);
    return {
      id: item.id,
      library: item.library,
      element: item.element,
      page: extra?.page ?? onlyPage ?? "",
      kind: extra?.kind ?? "",
    };
  });
}

function ofLibrary(effects: readonly EffectRef[], library: MotionLib): EffectRef[] {
  return effects.filter((item) => item.library === library);
}

function header(scriptName: string): string[] {
  return [
    "/**",
    " * Generated from MOTION.md.",
    ` * Site script: src/scripts/${scriptName}.`,
    " * This file should not be hand-forked into a second ticker.",
    " * The Guide chose one scroll owner.",
    " */",
  ];
}

function warningLines(plan: MotionPlan): string[] {
  const lines: string[] = [];
  const lenisPlan = hasLenis(plan);
  const nativeOnly = hasNative(plan) && !lenisPlan;
  for (const warning of plan.warnings) {
    const flat = warning.replace(/\s+/g, " ").replace(/\*\//g, "* /").trim();
    if (flat.length === 0) continue;
    if (nativeOnly && /lenis/i.test(flat)) continue;
    if (lenisPlan && !hasNative(plan) && flat.includes("animation-timeline")) continue;
    lines.push(`// ${flat}`);
  }
  if (lines.length > 0) lines.push("");
  return lines;
}

function pagesWith(plan: MotionPlan, owner: ScrollOwner): string[] {
  return Object.entries(plan.scrollOwner)
    .filter((entry) => entry[1] === owner)
    .map((entry) => entry[0]);
}

function bootWhen(page: string, statement: string): string {
  return `  if (onThisPage(${JSON.stringify(page)})) ${statement}`;
}

function bootWhenAny(pages: readonly string[], statement: string): string {
  const list = pages.length > 0 ? pages : [""];
  return `  if (${JSON.stringify(list)}.some((page) => onThisPage(page))) ${statement}`;
}

function renderMotionModule(plan: MotionPlan): string {
  assertExclusive(plan);
  const effects = effectsOf(plan);
  const gsapOn = hasGsap(plan);
  const lenisOn = hasLenis(plan);
  const nativeOn = hasNative(plan);
  const lines: string[] = [...header("motion.ts"), ...warningLines(plan)];

  const imports: string[] = [];
  if (gsapOn) imports.push('import gsap from "gsap";');
  const plugins: string[] = [];
  const needsScrollTrigger = lenisOn || effects.some((item) => item.kind === "scroll-sequence");
  const needsSplitText = effects.some((item) => item.kind === "text-split");
  if (needsScrollTrigger) {
    imports.push('import { ScrollTrigger } from "gsap/ScrollTrigger";');
    plugins.push("ScrollTrigger");
  }
  if (needsSplitText) {
    imports.push('import { SplitText } from "gsap/SplitText";');
    plugins.push("SplitText");
  }
  if (lenisOn) imports.push('import Lenis from "lenis";');
  if (uses(plan, "motion")) imports.push('import { inView } from "motion";');
  if (uses(plan, "anime")) imports.push('import anime from "animejs";');
  if (uses(plan, "theatre")) imports.push('import { getProject } from "@theatre/core";');
  if (uses(plan, "ogl")) imports.push('import { Program } from "ogl";');
  if (hasHeavy(plan)) imports.push('import { getContext } from "./webgl";');
  if (imports.length > 0) {
    lines.push(...imports, "");
  }
  if (plugins.length > 0) {
    lines.push(`gsap.registerPlugin(${plugins.join(", ")});`, "");
  }
  if (uses(plan, "theatre")) {
    lines.push("// Pin @theatre/core at 0.7.2. Do not import studio.", "");
  }

  lines.push(
    "export function prefersReducedMotion(): boolean {",
    '  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;',
    "}",
    "",
    "export function keepContentVisible(): void {",
    '  document.documentElement.style.visibility = "visible";',
    "}",
    "",
  );

  if (gsapOn) {
    lines.push(
      "// Single ticker helper.",
      "export function onTick(cb: (time: number) => void): () => void {",
      "  const wrapped = (time: number): void => {",
      "    if (prefersReducedMotion()) return;",
      "    cb(time);",
      "  };",
      "  gsap.ticker.add(wrapped);",
      "  return () => {",
      "    gsap.ticker.remove(wrapped);",
      "  };",
      "}",
      "",
    );
  } else {
    lines.push(
      "const tickerListeners = new Set<(time: number) => void>();",
      "let tickerScheduled = false;",
      "",
      "// Single ticker helper.",
      "export function onTick(cb: (time: number) => void): () => void {",
      "  tickerListeners.add(cb);",
      "  const run = (time: number): void => {",
      "    tickerScheduled = false;",
      "    if (prefersReducedMotion()) return;",
      "    for (const listener of tickerListeners) listener(time);",
      "    if (tickerListeners.size > 0) {",
      "      tickerScheduled = true;",
      "      requestAnimationFrame(run);",
      "    }",
      "  };",
      "  if (!tickerScheduled && !prefersReducedMotion()) {",
      "    tickerScheduled = true;",
      "    run(0);",
      "  }",
      "  return () => {",
      "    tickerListeners.delete(cb);",
      "  };",
      "}",
      "",
    );
  }

  if (hasHeavy(plan)) {
    lines.push(
      "// Calm phone path. Heavy effects must call calmPhonePath.",
      "export function calmPhonePath(effectId: string): boolean {",
      "  if (effectId.length === 0) return true;",
      '  return window.matchMedia("(max-width: 430px)").matches;',
      "}",
      "",
    );
  }

  if (Object.keys(plan.scrollOwner).length > 0) {
    lines.push(`export const scrollOwner = ${JSON.stringify(plan.scrollOwner)} as const;`, "");
  }

  if (effects.length > 0) {
    lines.push(
      "function motionNode(name: string): HTMLElement | null {",
      "  const byId = document.getElementById(name);",
      "  if (byId instanceof HTMLElement) return byId;",
      '  const nodes = document.querySelectorAll("[data-hh-motion]");',
      "  for (const node of nodes) {",
      "    if (node instanceof HTMLElement && node.dataset.hhMotion === name) return node;",
      "  }",
      "  return null;",
      "}",
      "",
    );
  }

  const boot: string[] = [];
  const needsPageGate = effects.length > 0 || lenisOn || nativeOn;
  if (needsPageGate) {
    lines.push(
      "// Set documentElement.dataset.page to the MOTION.md page name.",
      "function onThisPage(page: string): boolean {",
      "  if (page.length === 0) return true;",
      "  const current = document.documentElement.dataset.page ?? \"\";",
      "  return current.length === 0 || current === page;",
      "}",
      "",
    );
  }

  if (lenisOn) {
    lines.push(
      "function startLenis(): void {",
      "  if (prefersReducedMotion()) return;",
      "  const lenis = new Lenis();",
      "  lenis.on(\"scroll\", ScrollTrigger.update);",
      "  onTick((time) => {",
      "    lenis.raf(time * 1000);",
      "  });",
      "}",
      "",
    );
    boot.push(bootWhenAny(pagesWith(plan, "lenis+scrolltrigger"), "startLenis();"));
  }

  if (nativeOn) {
    const targets = [...new Set(ofLibrary(effects, "css-scroll").map((item) => item.element))];
    const selectors = targets.map((element) => {
      const safe = element.replace(/[^a-zA-Z0-9_-]/g, "");
      const name = safe.length > 0 ? safe : "hh-target";
      return `[data-hh-motion="${name}"]`;
    });
    const selector = selectors.length > 0 ? selectors.join(", ") : ".hh-native-scroll";
    const css = [
      "@keyframes hh-rise {",
      "  from { opacity: 0; transform: translateY(12px); }",
      "  to { opacity: 1; transform: translateY(0); }",
      "}",
      `@supports (animation-timeline: view()) {`,
      `  ${selector} {`,
      "    animation-name: hh-rise;",
      "    animation-duration: auto;",
      "    animation-timeline: view();",
      "    animation-range: entry 0% cover 40%;",
      "  }",
      "}",
    ].join("\n");
    const cssLiteral = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    lines.push(
      "function installNativeTimeline(): void {",
      "  if (prefersReducedMotion()) return;",
      "  const style = document.createElement(\"style\");",
      "  style.setAttribute(\"data-hh\", \"native-scroll\");",
      `  style.textContent = \`${cssLiteral}\`;`,
      "  document.head.append(style);",
      "}",
      "",
    );
    boot.push(bootWhenAny(pagesWith(plan, "native"), "installNativeTimeline();"));
  }

  const gsapEffects = ofLibrary(effects, "gsap");
  if (gsapEffects.length > 0) {
    const gsapBody = [
      "function bindGsap(target: string, kind: string): void {",
      "  if (prefersReducedMotion()) return;",
    ];
    if (needsSplitText) {
      gsapBody.push(
        "  if (kind === \"text-split\") {",
        "    const split = SplitText.create(target, { type: \"lines\" });",
        "    gsap.from(split.lines, { opacity: 0, y: 16, duration: 0.8 });",
        "    return;",
        "  }",
      );
    }
    if (needsScrollTrigger) {
      gsapBody.push(
        "  if (kind === \"scroll-sequence\") {",
        "    ScrollTrigger.create({",
        "      trigger: target,",
        "      start: \"top bottom\",",
        "      end: \"bottom top\",",
        "      scrub: 0.6,",
        "    });",
        "    return;",
        "  }",
      );
    }
    gsapBody.push("  gsap.to(target, { opacity: 1, y: 0, duration: 0.8 });", "}", "");
    lines.push(...gsapBody);
    for (const effect of gsapEffects) {
      boot.push(bootWhen(effect.page, `bindGsap(${JSON.stringify(effect.element)}, ${JSON.stringify(effect.kind)});`));
    }
  }

  const vanillaEffects = ofLibrary(effects, "vanilla");
  if (vanillaEffects.length > 0) {
    lines.push(
      "function bindVanilla(target: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  const node = motionNode(target);",
      "  if (node === null) return;",
      "  const observer = new IntersectionObserver((entries) => {",
      "    for (const entry of entries) {",
      "      if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;",
      "      entry.target.style.opacity = \"1\";",
      "    }",
      "  });",
      "  observer.observe(node);",
      "}",
      "",
    );
    for (const effect of vanillaEffects) {
      boot.push(bootWhen(effect.page, `bindVanilla(${JSON.stringify(effect.element)});`));
    }
  }

  const animeEffects = ofLibrary(effects, "anime");
  if (animeEffects.length > 0) {
    lines.push(
      "function bindAnime(target: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  const node = motionNode(target);",
      "  if (node === null) return;",
      "  anime({",
      "    targets: node,",
      "    opacity: [0, 1],",
      "    delay: anime.stagger(80),",
      "    duration: 700,",
      "    easing: \"easeOutCubic\",",
      "  });",
      "}",
      "",
    );
    for (const effect of animeEffects) {
      boot.push(bootWhen(effect.page, `bindAnime(${JSON.stringify(effect.element)});`));
    }
  }

  const motionEffects = ofLibrary(effects, "motion");
  if (motionEffects.length > 0) {
    lines.push(
      "function bindMotion(target: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  inView(target, (element) => {",
      "    if (element instanceof HTMLElement) element.style.opacity = \"1\";",
      "  });",
      "}",
      "",
    );
    for (const effect of motionEffects) {
      boot.push(bootWhen(effect.page, `bindMotion(${JSON.stringify(effect.element)});`));
    }
  }

  if (uses(plan, "three")) {
    lines.push(
      "function mountThree(effectId: string, canvasId: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  if (calmPhonePath(effectId)) return;",
      "  const node = motionNode(canvasId);",
      "  if (!(node instanceof HTMLCanvasElement)) return;",
      "  if (node.id.length === 0) node.id = canvasId;",
      "  // three would load here: import(\"three\")",
      "  const gl = getContext(node.id);",
      "  onTick(() => {",
      "    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);",
      "  });",
      "}",
      "",
    );
    for (const effect of ofLibrary(effects, "three")) {
      boot.push(bootWhen(effect.page, `mountThree(${JSON.stringify(effect.id)}, ${JSON.stringify(effect.element)});`));
    }
  }

  if (uses(plan, "ogl")) {
    lines.push(
      "function mountOgl(effectId: string, canvasId: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  if (calmPhonePath(effectId)) return;",
      "  const node = motionNode(canvasId);",
      "  if (!(node instanceof HTMLCanvasElement)) return;",
      "  if (node.id.length === 0) node.id = canvasId;",
      "  void Program;",
      "  const gl = getContext(node.id);",
      "  onTick(() => {",
      "    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);",
      "  });",
      "}",
      "",
    );
    for (const effect of ofLibrary(effects, "ogl")) {
      boot.push(bootWhen(effect.page, `mountOgl(${JSON.stringify(effect.id)}, ${JSON.stringify(effect.element)});`));
    }
  }

  if (uses(plan, "theatre")) {
    lines.push(
      "function mountTheatre(effectId: string): void {",
      "  if (prefersReducedMotion()) return;",
      "  if (calmPhonePath(effectId)) return;",
      "  const project = getProject(\"hh-motion\");",
      "  onTick(() => {",
      "    void project;",
      "  });",
      "}",
      "",
    );
    for (const effect of ofLibrary(effects, "theatre")) {
      boot.push(bootWhen(effect.page, `mountTheatre(${JSON.stringify(effect.id)});`));
    }
  }

  lines.push(
    "export function bootMotion(): void {",
    "  keepContentVisible();",
    "  if (prefersReducedMotion()) return;",
    ...boot,
    "}",
    "",
    "if (typeof window !== \"undefined\") bootMotion();",
    "",
  );

  return lines.join("\n");
}

function renderWebglModule(plan: MotionPlan): string {
  assertExclusive(plan);
  const lines = [...header("webgl.ts"), ""];
  if (!hasHeavy(plan)) {
    lines.push(
      "// No WebGL assignment. one context per page. This module does not create a context.",
      "export function getContext(): never {",
      "  throw new Error(\"No WebGL assignment. one context per page\");",
      "}",
      "",
    );
    return lines.join("\n");
  }

  lines.push(
    "// one context per page",
    "let shared: WebGL2RenderingContext | null = null;",
    "let sharedId: string | null = null;",
    "",
    "export function getContext(canvasId = \"hh-canvas\"): WebGL2RenderingContext {",
    "  if (shared !== null && sharedId === canvasId) return shared;",
    "  if (shared !== null && sharedId !== canvasId) {",
    "    throw new Error(\"one context per page\");",
    "  }",
    "  const canvas = document.getElementById(canvasId);",
    "  if (!(canvas instanceof HTMLCanvasElement)) {",
    "    throw new Error(\"Missing canvas \" + canvasId);",
    "  }",
    "  const gl = canvas.getContext(\"webgl2\");",
    "  if (gl === null) {",
    "    throw new Error(\"WebGL2 is unavailable\");",
    "  }",
    "  shared = gl;",
    "  sharedId = canvasId;",
    "  return shared;",
    "}",
    "",
  );
  return lines.join("\n");
}

export { renderMotionModule, renderWebglModule };

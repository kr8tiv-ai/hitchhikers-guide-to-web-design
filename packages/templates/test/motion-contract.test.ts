import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  renderMotionModule as exportedMotion,
  renderWebglModule as exportedWebgl,
} from "../src/index.ts";
import {
  MotionContractError,
  renderMotionModule,
  renderWebglModule,
  type MotionPlan,
} from "../src/motion-contract.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

interface EffectRequest {
  id: string;
  kind: string;
  element: string;
  page: string;
}

interface PlanInput {
  requests: EffectRequest[];
  appetite: number;
  stack: "astro" | "next" | "vite-react" | "sveltekit";
  allowHeavy?: boolean;
}

type PlanMotion = (input: PlanInput) => MotionPlan;

const planMotion = await loadPlanMotion();

async function loadPlanMotion(): Promise<PlanMotion> {
  const modulePath = path.resolve(here, "..", "..", "engine", "src", "spec", "motion.ts");
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  if (loaded === null || typeof loaded !== "object" || !("planMotion" in loaded)) {
    throw new Error("planMotion did not load.");
  }
  const candidate = loaded.planMotion;
  if (typeof candidate !== "function") {
    throw new Error("planMotion did not load.");
  }
  return candidate as PlanMotion;
}

function effect(id: string, kind: string, element: string, page: string): EffectRequest {
  return { id, kind, element, page };
}

function count(source: string, needle: string): number {
  let found = 0;
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(needle, from);
    if (at === -1) return found;
    found += 1;
    from = at + needle.length;
  }
  return found;
}

function staticImports(source: string): string[] {
  return source.split("\n").filter((line) => line.trimStart().startsWith("import "));
}

function codeLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

function functionSpan(source: string, name: string): { start: number; end: number } {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, name);
  const brace = source.indexOf("{", start);
  assert.notEqual(brace, -1, name);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1 };
    }
  }
  assert.fail(`unclosed ${name}`);
}

function assertHeader(source: string): void {
  assert.match(source, /Generated from MOTION\.md/);
  assert.match(source, /should not be hand-forked into a second ticker/);
  assert.match(source, /The Guide chose one scroll owner/);
  assert.equal(/official/i.test(source), false);
  assert.equal(/documented/i.test(source), false);
}

function assertReducedMotion(source: string): void {
  assert.match(codeLines(source), /matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)/);
  assert.equal(/autoplay/i.test(source), false);
  const boot = source.slice(functionSpan(source, "bootMotion").start, functionSpan(source, "bootMotion").end);
  assert.ok(boot.indexOf("keepContentVisible") < boot.indexOf("prefersReducedMotion"));
  assert.match(source, /visibility = "visible"/);
}

function assertSingleTicker(source: string, gsap: boolean): void {
  assert.equal(count(source, "function onTick"), 1);
  const span = functionSpan(source, "onTick");
  const body = source.slice(span.start, span.end);
  if (gsap) {
    assert.equal(count(source, "requestAnimationFrame"), 0);
    assert.equal(count(source, "gsap.ticker"), 2);
    assert.equal(count(body, "gsap.ticker"), 2);
    return;
  }
  assert.equal(count(source, "requestAnimationFrame"), 1);
  assert.equal(count(body, "requestAnimationFrame"), 1);
  assert.equal(source.includes("gsap.ticker"), false);
  assert.equal(source.includes('from "gsap"'), false);
}

test("the package barrel exports the motion renderers", () => {
  assert.equal(exportedMotion, renderMotionModule);
  assert.equal(exportedWebgl, renderWebglModule);
});

test("a lenis plan wires ScrollTrigger on gsap.ticker and skips the css timeline", () => {
  const plan = planMotion({
    requests: [effect("story", "scroll-sequence", "stage", "home")],
    appetite: 5,
    stack: "astro",
  });
  const source = renderMotionModule(plan);
  assertHeader(source);
  assertReducedMotion(source);
  assertSingleTicker(source, true);
  assert.match(source, /ScrollTrigger/);
  assert.match(source, /gsap\.ticker/);
  assert.equal(source.includes("animation-timeline"), false);
  assert.match(staticImports(source).join("\n"), /from "lenis"/);
  assert.match(staticImports(source).join("\n"), /from "gsap"/);
  const start = source.slice(functionSpan(source, "startLenis").start, functionSpan(source, "startLenis").end);
  assert.ok(start.indexOf("prefersReducedMotion") < start.indexOf("new Lenis"));
  const bind = source.slice(functionSpan(source, "bindGsap").start, functionSpan(source, "bindGsap").end);
  assert.ok(bind.indexOf("prefersReducedMotion") < bind.indexOf("scrub"));
  const gate = source.slice(functionSpan(source, "onThisPage").start, functionSpan(source, "onThisPage").end);
  assert.match(gate, /return current\.length === 0 \|\| current === page;/);
  const imports = staticImports(source).join("\n");
  assert.equal(imports.includes('from "three"'), false);
  assert.equal(imports.includes('from "ogl"'), false);
  assert.equal(imports.includes('from "motion"'), false);
  assert.equal(imports.includes('from "animejs"'), false);
  assert.equal(imports.includes("@theatre/core"), false);
  assert.equal(source.includes("@theatre/studio"), false);
});

test("a native css plan sets animation-timeline and does not name lenis", () => {
  const plan = planMotion({
    requests: [effect("reveal", "light-reveal", "title", "home")],
    appetite: 2,
    stack: "astro",
  });
  const source = renderMotionModule(plan);
  assertHeader(source);
  assertReducedMotion(source);
  assertSingleTicker(source, false);
  assert.match(source, /animation-timeline/);
  assert.equal(/lenis/i.test(source), false);
  assert.equal(staticImports(source).length, 0);
  const webgl = renderWebglModule(plan);
  assertHeader(webgl);
  assert.match(webgl, /function getContext/);
  assert.match(webgl, /one context per page/);
  assert.equal(webgl.includes("webgl2"), false);
  assert.equal(count(webgl, "requestAnimationFrame"), 0);
});

test("a native scroll sequence keeps gsap on the native scroller", () => {
  const plan = planMotion({
    requests: [effect("story", "scroll-sequence", "stage", "home")],
    appetite: 2,
    stack: "astro",
  });
  const source = renderMotionModule(plan);
  assertHeader(source);
  assertSingleTicker(source, true);
  assert.match(source, /animation-timeline/);
  assert.match(source, /ScrollTrigger/);
  assert.equal(/lenis/i.test(source), false);
  assert.match(codeLines(source), /matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)/);
});

test("vanilla motion has no gsap import and one rAF helper", () => {
  const plan = planMotion({
    requests: [effect("fade", "tiny-fade", "panel", "home")],
    appetite: 1,
    stack: "astro",
  });
  const source = renderMotionModule(plan);
  assertHeader(source);
  assertReducedMotion(source);
  assertSingleTicker(source, false);
  assert.equal(staticImports(source).length, 0);
  assert.equal(source.includes("calmPhonePath"), false);
  const vanilla = source.slice(functionSpan(source, "bindVanilla").start, functionSpan(source, "bindVanilla").end);
  assert.equal(vanilla.includes("requestAnimationFrame"), false);
});

test("an empty plan respects reduced motion and does nothing else", () => {
  const plan = planMotion({ requests: [], appetite: 1, stack: "astro" });
  const source = renderMotionModule(plan);
  assertHeader(source);
  assertReducedMotion(source);
  assertSingleTicker(source, false);
  assert.equal(staticImports(source).length, 0);
  assert.equal(source.includes("startLenis"), false);
  assert.equal(source.includes("animation-timeline"), false);
  assert.equal(source.includes("calmPhonePath"), false);
  assert.equal(source.includes("mountThree"), false);
});

test("libraries that were not picked are not imported", () => {
  const motion = planMotion({
    requests: [effect("island", "react-island", "card", "home")],
    appetite: 2,
    stack: "next",
  });
  const motionSource = renderMotionModule(motion);
  assert.deepEqual(staticImports(motionSource), ['import { inView } from "motion";']);
  assertSingleTicker(motionSource, false);
  assert.equal(motionSource.includes("animation-timeline"), false);
  assert.equal(/lenis/i.test(motionSource), false);

  const anime = planMotion({
    requests: [
      effect("fade", "tiny-fade", "panel", "home"),
      effect("mark", "svg-stagger", "logo", "home"),
    ],
    appetite: 2,
    stack: "astro",
  });
  const animeSource = renderMotionModule(anime);
  assert.deepEqual(staticImports(animeSource), ['import anime from "animejs";']);
  assert.equal(count(animeSource, "requestAnimationFrame"), 1);
  const animeBody = animeSource.slice(functionSpan(animeSource, "bindAnime").start, functionSpan(animeSource, "bindAnime").end);
  const vanillaBody = animeSource.slice(
    functionSpan(animeSource, "bindVanilla").start,
    functionSpan(animeSource, "bindVanilla").end,
  );
  assert.equal(animeBody.includes("requestAnimationFrame"), false);
  assert.equal(vanillaBody.includes("requestAnimationFrame"), false);
});

test("three, theatre, and ogl share one context and the calm phone hook", () => {
  const heavy = planMotion({
    requests: [
      effect("hero", "3d", "model", "home"),
      effect("film", "cinematic-timeline", "camera", "home"),
    ],
    appetite: 9,
    stack: "astro",
  });
  const source = renderMotionModule(heavy);
  const webgl = renderWebglModule(heavy);
  assertHeader(source);
  assertHeader(webgl);
  assertSingleTicker(source, true);
  assert.equal(source.includes("animation-timeline"), false);
  assert.match(source, /ScrollTrigger/);
  assert.match(source, /\/\/ three would load here: import\("three"\)/);
  assert.equal(staticImports(source).some((line) => line.includes('from "three"')), false);
  assert.match(source, /Pin @theatre\/core at 0\.7\.2\. Do not import studio\./);
  assert.match(staticImports(source).join("\n"), /from "@theatre\/core"/);
  assert.equal(source.includes("@theatre/studio"), false);
  assert.equal(source.includes("@latest"), false);
  assert.match(source, /Calm phone path\. Heavy effects must call calmPhonePath\./);
  const three = source.slice(functionSpan(source, "mountThree").start, functionSpan(source, "mountThree").end);
  const theatre = source.slice(functionSpan(source, "mountTheatre").start, functionSpan(source, "mountTheatre").end);
  assert.match(three, /calmPhonePath\(/);
  assert.match(theatre, /calmPhonePath\(/);
  assert.equal(three.includes("requestAnimationFrame"), false);
  assert.equal(theatre.includes("requestAnimationFrame"), false);
  assert.match(three, /onTick\(/);
  assert.match(theatre, /onTick\(/);
  assert.match(webgl, /export function getContext/);
  assert.match(webgl, /one context per page/);
  assert.match(webgl, /if \(shared !== null && sharedId === canvasId\) return shared;/);
  assert.match(webgl, /if \(shared !== null && sharedId !== canvasId\)/);
  assert.match(webgl, /throw new Error\("one context per page"\)/);
  assert.match(webgl, /canvas\.getContext\("webgl2"\)/);
  assert.equal(count(webgl, "requestAnimationFrame"), 0);
  assert.equal(webgl.includes("@theatre/studio"), false);

  const shader = planMotion({
    requests: [effect("grain", "shader", "wash", "home")],
    appetite: 6,
    stack: "astro",
  });
  const shaderSource = renderMotionModule(shader);
  const shaderWebgl = renderWebglModule(shader);
  assert.match(staticImports(shaderSource).join("\n"), /from "ogl"/);
  assert.equal(staticImports(shaderSource).some((line) => line.includes('from "three"')), false);
  assert.equal(shaderSource.includes('import("three")'), false);
  assert.match(shaderSource, /calmPhonePath\(/);
  assert.equal(shaderSource.includes("animation-timeline"), false);
  assert.match(shaderWebgl, /function getContext/);
  assert.match(shaderWebgl, /one context per page/);
  assertSingleTicker(shaderSource, true);
});

test("a sveltekit warning is copied as a comment", () => {
  const plan = planMotion({
    requests: [effect("island", "react-island", "card", "home")],
    appetite: 4,
    stack: "sveltekit",
  });
  const source = renderMotionModule(plan);
  assert.match(source, /^\/\/ .*The 3D ecosystem is thinner\.$/m);
  assert.match(source, /sveltekit/);
  assertSingleTicker(source, true);
  assert.equal(source.includes("animation-timeline"), false);
});

test("lenis and native pages can share a module without sharing a scroller", () => {
  const plan = planMotion({
    requests: [
      effect("story", "scroll-sequence", "stage", "home"),
      effect("reveal", "light-reveal", "title", "about"),
    ],
    appetite: 5,
    stack: "astro",
  });
  const source = renderMotionModule(plan);
  assert.match(source, /lenis/);
  assert.match(source, /animation-timeline/);
  assert.match(source, /data-hh-motion="title"/);
  assert.equal(source.includes('data-hh-motion="stage"'), false);
  assert.match(source, /\["home"\]\.some\(\(page\) => onThisPage\(page\)\)\) startLenis\(\)/);
  assert.match(source, /\["about"\]\.some\(\(page\) => onThisPage\(page\)\)\) installNativeTimeline\(\)/);
  const gate = source.slice(functionSpan(source, "onThisPage").start, functionSpan(source, "onThisPage").end);
  assert.match(gate, /An unset page must not start both scroll owners/);
  assert.match(gate, /if \(page\.length === 0\) return false;/);
  assert.match(gate, /return current === page;/);
  assert.equal(gate.includes("current.length === 0"), false);
  assertSingleTicker(source, true);
});

test("markdown that names both scroll mechanisms is refused", () => {
  const plan = planMotion({
    requests: [effect("reveal", "light-reveal", "title", "home")],
    appetite: 2,
    stack: "astro",
  });
  const broken: MotionPlan = {
    ...plan,
    markdown: plan.markdown.replace("## Coexistence", "animation-timeline\n\n## Coexistence"),
  };
  assert.throws(() => renderMotionModule(broken), MotionContractError);
  assert.throws(() => renderWebglModule(broken), /one scroll owner/);
});

test("one page cannot list lenis and css-scroll even if planMotion did not build it", () => {
  const plan: MotionPlan = {
    scrollOwner: { home: "lenis+scrolltrigger" },
    assignments: [
      { id: "a", library: "lenis", element: "documentElement" },
      { id: "b", library: "css-scroll", element: "title" },
    ],
    warnings: [],
    markdown: [
      "# MOTION",
      "",
      "## Scroll owner",
      "",
      "- home: lenis+scrolltrigger",
      "",
      "## Assignments",
      "",
      "- a on documentElement (page home, kind smooth-scroll, taxonomy A1): lenis. Drives the scroller.",
      "- b on title (page home, kind css-scroll, taxonomy A2): css-scroll. Native timeline.",
      "",
      "## Warnings",
      "",
      "None.",
      "",
      "## Coexistence",
      "",
      "One scroll owner per page.",
      "",
    ].join("\n"),
  };
  assert.throws(() => renderMotionModule(plan), /both lenis and css-scroll/);
});

test("a scroll owner line that disagrees with the plan is refused", () => {
  const plan = planMotion({
    requests: [effect("reveal", "light-reveal", "title", "home")],
    appetite: 2,
    stack: "astro",
  });
  const broken: MotionPlan = {
    ...plan,
    markdown: plan.markdown.replace("- home: native", "- home: lenis+scrolltrigger"),
  };
  assert.throws(() => renderMotionModule(broken), /disagrees with MOTION\.md/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CoexistenceError,
  MOTION_LIBS,
  MotionError,
  planMotion,
  type EffectRequest,
  type MotionLib,
  type MotionPlan,
} from "../src/spec/motion.ts";

const NINE: readonly MotionLib[] = [
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

function effect(id: string, kind: string, element: string, page: string): EffectRequest {
  return { id, kind, element, page };
}

function libraries(plan: MotionPlan): MotionLib[] {
  return plan.assignments.map((item) => item.library);
}

function libraryFor(plan: MotionPlan, id: string): MotionLib | undefined {
  return plan.assignments.find((item) => item.id === id)?.library;
}

function assertDoc(plan: MotionPlan): void {
  assert.equal(plan.markdown.includes("!"), false);
  assert.equal(plan.markdown.includes("\r"), false);
  assert.equal(plan.markdown.includes("\u2014"), false);
  assert.equal(plan.markdown.includes("@theatre/studio"), false);
  assert.equal(plan.markdown.includes("gsap fallback"), false);
  assert.match(plan.markdown, /No GSAP fallback\./);
  assert.match(plan.markdown, /The stack pick comes from decideStack\./);
  assert.match(plan.markdown, /Appetite is a weight ceiling\./);
  const toolkit = plan.markdown.split("\n").find((line) => line.startsWith("Toolkit:"));
  assert.equal(toolkit, `Toolkit: ${NINE.join(", ")}.`);
  assert.deepEqual([...MOTION_LIBS], [...NINE]);
  const lenisPages = pagesUsing(plan.markdown, "lenis");
  for (const page of pagesUsing(plan.markdown, "css-scroll")) {
    assert.equal(lenisPages.has(page), false, page);
  }
}

function pagesUsing(markdown: string, library: MotionLib): Set<string> {
  const pages = new Set<string>();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("- ")) continue;
    const owner = line.split(": ").at(-1) ?? "";
    if (!owner.startsWith(`${library}.`)) continue;
    const found = /\(page ([^,]+), kind /.exec(line);
    if (found?.[1] !== undefined) pages.add(found[1]);
  }
  return pages;
}

test("a light reveal at appetite 2 assigns css-scroll and stays native", () => {
  const plan = planMotion({
    requests: [effect("reveal", "light-reveal", "title", "home")],
    appetite: 2,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "reveal"), "css-scroll");
  assert.equal(libraries(plan).includes("lenis"), false);
  assert.deepEqual(plan.scrollOwner, { home: "native" });
  assert.match(plan.markdown, /taxonomy A2, A5/);
  assertDoc(plan);
});

test("a light reveal stays on css-scroll at appetite 10 when the page does not ask for Lenis", () => {
  const plan = planMotion({
    requests: [effect("reveal", "light-reveal", "title", "about")],
    appetite: 10,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "reveal"), "css-scroll");
  assert.equal(libraries(plan).includes("lenis"), false);
  assert.equal(plan.scrollOwner.about, "native");
  assertDoc(plan);
});

test("a scroll sequence at appetite 5 assigns gsap and lenis", () => {
  const plan = planMotion({
    requests: [effect("story", "scroll-sequence", "stage", "home")],
    appetite: 5,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "story"), "gsap");
  assert.equal(libraries(plan).includes("lenis"), true);
  assert.equal(plan.scrollOwner.home, "lenis+scrolltrigger");
  assert.match(plan.markdown, /taxonomy A3, A4/);
  assert.match(plan.markdown, /Lenis drives ScrollTrigger on gsap\.ticker\./);
  assertDoc(plan);
});

test("a scroll sequence below appetite 3 stays on gsap without Lenis", () => {
  const plan = planMotion({
    requests: [effect("story", "scroll-sequence", "stage", "home")],
    appetite: 2,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "story"), "gsap");
  assert.equal(libraries(plan).includes("lenis"), false);
  assert.equal(plan.scrollOwner.home, "native");
  assertDoc(plan);
});

test("a light reveal on a Lenis page uses GSAP", () => {
  const plan = planMotion({
    requests: [
      effect("story", "scroll-sequence", "stage", "home"),
      effect("reveal", "light-reveal", "title", "home"),
    ],
    appetite: 5,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "story"), "gsap");
  assert.equal(libraryFor(plan, "reveal"), "gsap");
  assert.equal(libraries(plan).includes("css-scroll"), false);
  assert.equal(plan.scrollOwner.home, "lenis+scrolltrigger");
  assertDoc(plan);
});

test("adding a css-scroll effect to a Lenis plan throws CoexistenceError", () => {
  assert.throws(
    () =>
      planMotion({
        requests: [
          effect("story", "scroll-sequence", "stage", "home"),
          effect("native", "css-scroll", "aside", "home"),
        ],
        appetite: 5,
        stack: "astro",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CoexistenceError);
      assert.match(error.message, /css-scroll/);
      assert.match(error.message, /Lenis/);
      assert.match(error.message, /Neither effect was dropped/);
      assert.equal(error.message.includes("!"), false);
      return true;
    },
  );
});

test("Lenis and css-scroll may live on different pages", () => {
  const plan = planMotion({
    requests: [
      effect("story", "scroll-sequence", "stage", "home"),
      effect("reveal", "light-reveal", "title", "about"),
    ],
    appetite: 5,
    stack: "astro",
  });
  assert.equal(plan.scrollOwner.home, "lenis+scrolltrigger");
  assert.equal(plan.scrollOwner.about, "native");
  assert.equal(libraryFor(plan, "reveal"), "css-scroll");
  assert.equal(libraryFor(plan, "story"), "gsap");
  assertDoc(plan);
});

test("an explicit css-scroll page demands native scroll and does not throw", () => {
  const plan = planMotion({
    requests: [effect("panel", "css-scroll", "band", "visit")],
    appetite: 7,
    stack: "next",
  });
  assert.equal(libraryFor(plan, "panel"), "css-scroll");
  assert.equal(libraries(plan).includes("lenis"), false);
  assert.equal(plan.scrollOwner.visit, "native");
  assertDoc(plan);
});

test("theatre assignment names core and the markdown refuses studio", () => {
  const plan = planMotion({
    requests: [effect("film", "cinematic-timeline", "camera", "home")],
    appetite: 9,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "film"), "theatre");
  assert.match(plan.markdown, /@theatre\/core/);
  assert.match(plan.markdown, /pinned at 0\.7\.2/);
  assert.match(plan.markdown, /never studio/);
  assert.match(plan.markdown, /taxonomy C4, A8/);
  assert.equal(plan.markdown.includes("@theatre/studio"), false);
  assert.equal(plan.markdown.includes("gsap fallback"), false);
  assertDoc(plan);
});

test("the cinematic family id is the same theatre assignment", () => {
  const plan = planMotion({
    requests: [effect("film", "cinematic", "camera", "home")],
    appetite: 4,
    stack: "astro",
    allowHeavy: false,
  });
  assert.equal(libraryFor(plan, "film"), "theatre");
  assert.match(plan.warnings.join(" "), /starts at level 9/);
  assert.match(plan.markdown, /@theatre\/core/);
  assertDoc(plan);
});

test("appetite 4 with a 3d request and allowHeavy false does not assign three", () => {
  const plan = planMotion({
    requests: [effect("hero", "3d", "model", "home")],
    appetite: 4,
    stack: "astro",
    allowHeavy: false,
  });
  assert.equal(libraries(plan).includes("three"), false);
  assert.equal(libraryFor(plan, "hero"), "vanilla");
  assert.match(plan.warnings.join("\n"), /phone still or prerender/);
  assert.match(plan.markdown, /phone still or prerender/);
  assert.match(plan.markdown, /taxonomy F3/);
  assertDoc(plan);
});

test("allowHeavy assigns three below the level 8 ceiling", () => {
  const plan = planMotion({
    requests: [effect("hero", "3d", "model", "home")],
    appetite: 4,
    stack: "vite-react",
    allowHeavy: true,
  });
  assert.equal(libraryFor(plan, "hero"), "three");
  assert.equal(plan.warnings.some((item) => item.includes("phone still or prerender")), false);
  assertDoc(plan);
});

test("appetite 8 assigns three for a 3d moment", () => {
  const plan = planMotion({
    requests: [effect("hero", "three-hero", "model", "home")],
    appetite: 8,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "hero"), "three");
  assertDoc(plan);
});

test("two effects on the same element with different libraries throw", () => {
  assert.throws(
    () =>
      planMotion({
        requests: [
          effect("story", "scroll-sequence", "hero", "home"),
          effect("mark", "svg-stagger", "hero", "home"),
        ],
        appetite: 5,
        stack: "astro",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CoexistenceError);
      assert.match(error.message, /two owners/);
      assert.match(error.message, /hero/);
      return true;
    },
  );
});

test("the same element may use one library twice, and the same name on another page", () => {
  const plan = planMotion({
    requests: [
      effect("split", "text-split", "hero", "home"),
      effect("again", "scroll-sequence", "hero", "home"),
      effect("mark", "svg-stagger", "hero", "about"),
    ],
    appetite: 5,
    stack: "astro",
  });
  assert.equal(libraryFor(plan, "split"), "gsap");
  assert.equal(libraryFor(plan, "again"), "gsap");
  assert.equal(libraryFor(plan, "mark"), "anime");
  assert.match(plan.markdown, /taxonomy E1, E2/);
  assert.match(plan.markdown, /taxonomy B1, B2/);
  assertDoc(plan);
});

test("the toolkit line lists all nine libraries on a calm plan and on an empty plan", () => {
  const calm = planMotion({
    requests: [effect("fade", "tiny-fade", "panel", "home")],
    appetite: 1,
    stack: "astro",
  });
  assert.equal(libraryFor(calm, "fade"), "vanilla");
  assert.deepEqual(calm.scrollOwner, { home: "none" });
  assert.match(calm.markdown, /taxonomy H1, H2, H3/);
  assertDoc(calm);

  const empty = planMotion({ requests: [], appetite: 1, stack: "astro" });
  assert.deepEqual(empty.scrollOwner, {});
  assert.deepEqual(empty.assignments, []);
  assert.match(empty.markdown, /## Scroll owner\n\nnone/);
  assert.match(empty.markdown, /Toolkit: gsap, lenis, three, ogl, motion, anime, theatre, css-scroll, vanilla\./);
  assertDoc(empty);
});

test("appetite outside 1 to 10 throws", () => {
  const requests = [effect("fade", "tiny-fade", "panel", "home")];
  for (const appetite of [0, 11, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => planMotion({ requests, appetite, stack: "astro" }),
      (error: unknown) => {
        assert.ok(error instanceof MotionError);
        assert.equal(error instanceof CoexistenceError, false);
        assert.match(error.message, /1 to 10/);
        return true;
      },
    );
  }
  planMotion({ requests, appetite: 1, stack: "astro" });
  planMotion({ requests, appetite: 10, stack: "astro" });
});

test("an unknown kind throws", () => {
  assert.throws(
    () =>
      planMotion({
        requests: [effect("x", "sparkle", "dot", "home")],
        appetite: 3,
        stack: "astro",
      }),
    (error: unknown) => {
      assert.ok(error instanceof MotionError);
      assert.match(error.message, /Unknown effect kind "sparkle"/);
      return true;
    },
  );
});

test("magnetic buttons are refused", () => {
  assert.throws(
    () =>
      planMotion({
        requests: [effect("btn", "magnetic", "cta", "home")],
        appetite: 5,
        stack: "astro",
      }),
    /Magnetic buttons are banned/,
  );
});

test("sveltekit treats react-island as gsap and warns about the thinner 3D ecosystem", () => {
  const plan = planMotion({
    requests: [effect("island", "react-island", "card", "home")],
    appetite: 4,
    stack: "sveltekit",
  });
  assert.equal(libraryFor(plan, "island"), "gsap");
  assert.equal(libraries(plan).includes("motion"), false);
  assert.match(plan.warnings.join("\n"), /The 3D ecosystem is thinner\./);
  assert.match(plan.markdown, /taxonomy D5, D4/);
  assertDoc(plan);
});

test("astro turns react-island into gsap, and next and vite-react assign motion", () => {
  const astro = planMotion({
    requests: [effect("island", "spring-ui", "card", "home")],
    appetite: 3,
    stack: "astro",
  });
  assert.equal(libraryFor(astro, "island"), "gsap");
  assert.match(astro.warnings.join(" "), /astro/);
  assertDoc(astro);

  for (const stack of ["next", "vite-react"] as const) {
    const plan = planMotion({
      requests: [effect("island", "react-island", "card", "home")],
      appetite: 3,
      stack,
    });
    assert.equal(libraryFor(plan, "island"), "motion");
    assert.equal(plan.warnings.length, 0);
    assertDoc(plan);
  }
});

test("a shader uses ogl until three is assigned, then stays on three", () => {
  const alone = planMotion({
    requests: [effect("grain", "shader", "wash", "home")],
    appetite: 6,
    stack: "astro",
  });
  assert.equal(libraryFor(alone, "grain"), "ogl");
  assert.equal(libraries(alone).includes("three"), false);
  assert.match(alone.markdown, /taxonomy F1/);
  assertDoc(alone);

  const shared = planMotion({
    requests: [
      effect("hero", "3d", "model", "home"),
      effect("grain", "shader", "wash", "home"),
    ],
    appetite: 8,
    stack: "astro",
  });
  assert.equal(libraryFor(shared, "hero"), "three");
  assert.equal(libraryFor(shared, "grain"), "three");
  assert.match(shared.warnings.join("\n"), /one WebGL context/i);
  assertDoc(shared);

  const otherPage = planMotion({
    requests: [
      effect("hero", "3d", "model", "home"),
      effect("grain", "shader", "wash", "about"),
    ],
    appetite: 8,
    stack: "astro",
  });
  assert.equal(libraryFor(otherPage, "grain"), "ogl");
  assert.equal(otherPage.warnings.some((item) => /one WebGL context/i.test(item)), false);
  assertDoc(otherPage);
});

test("smooth scroll at appetite 3 assigns lenis, and below 3 it does not", () => {
  const high = planMotion({
    requests: [effect("scroll", "smooth-scroll", "scroller", "home")],
    appetite: 3,
    stack: "astro",
  });
  assert.equal(libraryFor(high, "scroll"), "lenis");
  assert.equal(high.scrollOwner.home, "lenis+scrolltrigger");
  assert.equal(libraries(high).filter((item) => item === "lenis").length, 1);
  assertDoc(high);

  const low = planMotion({
    requests: [effect("scroll", "smooth-scroll", "scroller", "home")],
    appetite: 2,
    stack: "astro",
  });
  assert.equal(libraryFor(low, "scroll"), "vanilla");
  assert.equal(libraries(low).includes("lenis"), false);
  assert.match(low.warnings.join(" "), /appetite 3/);
  assertDoc(low);
});

test("planMotion is exported", () => {
  assert.equal(typeof planMotion, "function");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTION_LIBS } from "../src/spec/motion.ts";
import { SITE_RULES as rulesFromModule } from "../src/spec/site-rules.ts";
import {
  MOTION_BIND_SENTENCE,
  SITE_MODEL,
  SITE_PHASES,
  SITE_RULES,
  SLICES_BY_PHASE,
  SitePromptError,
  generateSkeleton,
  type SitePromptSkeleton,
  type SiteSkeletonInput,
  type SiteStack,
} from "../src/spec/site-prompts.ts";

const TURNS = { medium: 40, high: 60, xhigh: 80 } as const;

function calmInput(stack: SiteStack = "astro"): SiteSkeletonInput {
  return {
    pages: [
      { id: "home", title: "Home", sections: ["hero", "offer", "proof"] },
      { id: "work", title: "Work", sections: ["selected", "process"] },
      { id: "visit", title: "Visit", sections: ["hours", "find"] },
    ],
    effects: [{ id: "hero-mark", library: "css-scroll", sectionId: "hero", page: "home" }],
    features: ["contact form"],
    integrations: ["resend"],
    seoItems: ["sitemap", "json-ld"],
    stack,
    protectedPaths: ["src/pages/index.astro#splash"],
  };
}

function tinyInput(stack: SiteStack = "astro"): SiteSkeletonInput {
  return {
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: [],
    stack,
    protectedPaths: [],
  };
}

function expectReview(prompts: readonly SitePromptSkeleton[]): void {
  let start = 0;
  while (start < prompts.length) {
    const phase = prompts[start]?.phase;
    let end = start + 1;
    while (end < prompts.length && prompts[end]?.phase === phase) end += 1;
    const count = end - start;
    for (let offset = 0; offset < count; offset += 1) {
      const prompt = prompts[start + offset];
      assert.ok(prompt);
      const want = (offset + 1) % 3 === 0 || offset === count - 1;
      assert.equal(prompt.reviewAfter, want, `${prompt.phase} ${prompt.id}`);
    }
    start = end;
  }
}

test("RULES is one constant shared with the skeleton module", () => {
  assert.equal(SITE_RULES, rulesFromModule);
  assert.equal(SITE_RULES.includes("!"), false);
  assert.match(SITE_RULES, /TypeScript strict/);
  assert.match(SITE_RULES, /MIT-compatible/);
  assert.match(SITE_RULES, /GPL and AGPL are out/);
  assert.match(SITE_RULES, /@theatre\/studio/);
  assert.match(SITE_RULES, /@theatre\/core only, pinned, never @latest/);
  assert.match(SITE_RULES, /Motion toolkit \(D-001\)/);
  assert.match(SITE_RULES, /Import only the libraries this prompt names/);
  assert.match(SITE_RULES, /Do not load every motion library on this page/);
  assert.match(SITE_RULES, /One scroll owner per page/);
  assert.match(SITE_RULES, /One ticker/);
  assert.match(SITE_RULES, /One WebGL context/);
  assert.match(SITE_RULES, /Reduced motion/);
  assert.match(SITE_RULES, /at least 90/);
  assert.match(SITE_RULES, /no invented testimonials/);
  assert.match(SITE_RULES, /no lorem/);
  assert.match(SITE_RULES, /no exclamation marks/);
});

test("a 3-page calm fixture yields 50 to 150 real entries", () => {
  const { prompts, warnings } = generateSkeleton(calmInput());
  assert.equal(warnings.length, 0);
  assert.ok(prompts.length >= 50 && prompts.length <= 150, `count ${prompts.length}`);
  assert.equal(prompts.some((prompt) => /filler/i.test(prompt.title)), false);
  assert.equal(prompts.some((prompt) => /filler/i.test(prompt.id)), false);
  assert.equal(prompts.some((prompt) => prompt.requirements.some((id) => /filler/i.test(id))), false);

  const phases = new Set(prompts.map((prompt) => prompt.phase));
  for (const phase of SITE_PHASES) {
    assert.equal(phases.has(phase), true, phase);
  }
  let lastRank = -1;
  for (const prompt of prompts) {
    const rank = SITE_PHASES.indexOf(prompt.phase);
    assert.ok(rank >= lastRank);
    lastRank = rank;
    assert.ok(SLICES_BY_PHASE[prompt.phase].includes(prompt.slice));
    assert.equal(prompt.model, SITE_MODEL);
    assert.equal(prompt.maxTurns, TURNS[prompt.effort]);
    assert.equal(prompt.title.includes("!"), false);
    assert.equal(/\blorem\b/i.test(prompt.title), false);
    assert.equal(/as before|see above|same as previous/i.test(prompt.title), false);
    assert.deepEqual(prompt.protected, ["src/pages/index.astro#splash"]);
  }
  assert.notEqual(prompts[0]?.protected, prompts[1]?.protected);
  expectReview(prompts);

  prompts.forEach((prompt, index) => {
    assert.equal(prompt.id, String(index + 1).padStart(3, "0"));
    if (index === 0) {
      assert.deepEqual(prompt.dependsOn, []);
    } else {
      assert.deepEqual(prompt.dependsOn, [String(index).padStart(3, "0")]);
    }
  });

  const once = prompts.filter((prompt) => prompt.kind === "once-over");
  assert.equal(once.length, 1);
  const finalPass = once[0];
  assert.ok(finalPass);
  assert.equal(finalPass.tier, "Forty-Two");
  assert.equal(finalPass.effort, "xhigh");
  assert.equal(finalPass.phase, "improbability-drive");
  const onceAt = prompts.findIndex((prompt) => prompt.kind === "once-over");
  const harmlessAt = prompts.findIndex((prompt) => prompt.phase === "mostly-harmless");
  assert.equal(onceAt + 1, harmlessAt);

  const home = prompts.find((prompt) => prompt.requirements.includes("REQ-PAGE-home"));
  assert.ok(home?.filesModified.includes("src/pages/index.astro"));
  const hero = prompts.find((prompt) => prompt.requirements.includes("REQ-STRUCT-hero"));
  assert.equal(hero?.slice, "Infinite Improbability");
  assert.equal(
    prompts.some((prompt) => prompt.phase === "improbability-drive" && prompt.slice === "Heart of Gold"),
    false,
  );

  const motion = prompts.filter((prompt) => prompt.library !== undefined);
  assert.equal(motion.length, 1);
  assert.equal(motion[0]?.library, "css-scroll");
  assert.equal(motion[0]?.slice, "Pan Galactic Gargle Blaster");
  assert.ok(motion[0]?.title.includes(MOTION_BIND_SENTENCE));
  assert.equal(prompts.some((prompt) => prompt.slice === "Magrathea"), false);
  assert.equal(prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))), false);

  const clock = prompts.find((prompt) => prompt.requirements.includes("REQ-MOTION-CLOCK"));
  assert.ok(clock);
  assert.equal(clock.library, undefined);
  assert.match(clock.title, /Import no effect library/);
  for (const lib of MOTION_LIBS) {
    if (lib === "motion") continue;
    assert.equal(clock.title.includes(lib), false, lib);
  }

  const contact = prompts.find((prompt) => prompt.requirements.includes("REQ-FEAT-contact-form"));
  assert.equal(contact?.tier, "Cup of Tea");
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-INT-resend")));
  assert.ok(prompts.some((prompt) => prompt.title.startsWith("Deploy only after an explicit yes")));
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-HANDOFF")));
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-LAUNCH")));
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-JURY")));
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-ELEVATE-TYPE")));
  assert.ok(prompts.some((prompt) => prompt.requirements.includes("REQ-GATE-LIGHTHOUSE")));
});

test("the same input is stable and is not padded on a second call", () => {
  const first = generateSkeleton(calmInput());
  const second = generateSkeleton(calmInput());
  assert.deepEqual(second, first);
});

test("a one-page site stays under 50 and warns instead of padding", () => {
  const { prompts, warnings } = generateSkeleton(tinyInput());
  assert.ok(prompts.length < 50, `count ${prompts.length}`);
  assert.ok(prompts.length > 0);
  assert.equal(warnings.length, 1);
  const warning = warnings[0] ?? "";
  assert.match(warning, /Before we jump/);
  assert.match(warning, /Deep Thought/);
  assert.match(warning, /under-planned/);
  assert.match(warning, /under 50/);
  assert.match(warning, /Nothing was merged/);
  assert.equal(prompts.some((prompt) => /filler/i.test(prompt.title)), false);
  expectReview(prompts);
  for (const phase of SITE_PHASES) {
    assert.equal(prompts.some((prompt) => prompt.phase === phase), true, phase);
  }
});

test("more than 150 prompts throws and asks for milestones", () => {
  const pages = Array.from({ length: 8 }, (_, pageIndex) => ({
    id: `page-${pageIndex}`,
    title: `Page ${pageIndex}`,
    sections: Array.from({ length: 8 }, (__, sectionIndex) => `p${pageIndex}-s${sectionIndex}`),
  }));
  assert.throws(
    () =>
      generateSkeleton({
        pages,
        effects: [],
        features: [],
        integrations: [],
        seoItems: [],
        stack: "astro",
        protectedPaths: [],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SitePromptError);
      assert.match(error.message, /split into milestones/i);
      assert.match(error.message, /over 150/);
      return true;
    },
  );
});

test("duplicate page ids and an effect with no section throw", () => {
  const base = tinyInput();
  assert.throws(
    () =>
      generateSkeleton({
        ...base,
        pages: [
          { id: "home", title: "Home", sections: ["hero"] },
          { id: "home", title: "Again", sections: ["other"] },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SitePromptError);
      assert.match(error.message, /Duplicate page id "home"/);
      return true;
    },
  );
  assert.throws(
    () =>
      generateSkeleton({
        ...base,
        effects: [{ id: "rise", library: "gsap", sectionId: "missing", page: "home" }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SitePromptError);
      assert.match(error.message, /sectionId "missing" matches no page/);
      return true;
    },
  );
});

test("lenis and css-scroll on one page throw", () => {
  assert.throws(
    () =>
      generateSkeleton({
        ...tinyInput(),
        pages: [{ id: "home", title: "Home", sections: ["hero", "offer"] }],
        effects: [
          { id: "smooth", library: "lenis", sectionId: "hero", page: "home" },
          { id: "native", library: "css-scroll", sectionId: "offer", page: "home" },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SitePromptError);
      assert.match(error.message, /One scroll owner per page/);
      return true;
    },
  );
});

test("3D entries appear only for three, ogl, and theatre", () => {
  const { prompts } = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero", "shader", "reel"] }],
    effects: [
      { id: "orbit", library: "three", sectionId: "hero", page: "home" },
      { id: "grain", library: "ogl", sectionId: "shader", page: "home" },
      { id: "take", library: "theatre", sectionId: "reel", page: "home" },
    ],
    features: [],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
  });
  const scenes = prompts.filter((prompt) => prompt.slice === "Magrathea");
  assert.deepEqual(
    scenes.map((prompt) => prompt.library).sort(),
    ["ogl", "theatre", "three"],
  );
  assert.equal(prompts.some((prompt) => prompt.slice === "Pan Galactic Gargle Blaster"), false);
  assert.equal(prompts.filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))).length, 3);
  for (const prompt of scenes) {
    assert.equal(prompt.tier, "Heart of Gold");
    assert.equal(prompt.effort, "xhigh");
    assert.ok(prompt.title.includes(MOTION_BIND_SENTENCE));
    assert.ok(prompt.title.startsWith(`Bind ${prompt.library} `));
    for (const lib of MOTION_LIBS) {
      if (lib === prompt.library) continue;
      assert.equal(prompt.title.includes(`Bind ${lib} `), false);
    }
  }
  const theatre = scenes.find((prompt) => prompt.library === "theatre");
  assert.match(theatre?.title ?? "", /pinned at 0\.7\.2/);
  assert.match(theatre?.title ?? "", /never studio/);
  assert.equal(theatre?.title.includes("@theatre/studio"), false);
});

test("sveltekit still gets entries and warns that templates are thinner", () => {
  const { prompts, warnings } = generateSkeleton(calmInput("sveltekit"));
  assert.ok(prompts.length >= 50 && prompts.length <= 150);
  assert.ok(warnings.some((warning) => /templates are thinner/.test(warning)));
  assert.ok(prompts.some((prompt) => prompt.filesModified.includes("src/routes/+page.svelte")));
  assert.equal(prompts.some((prompt) => prompt.filesModified.some((file) => file.endsWith(".astro"))), false);
});

test("next and vite paths stay on those stacks", () => {
  const next = generateSkeleton(calmInput("next"));
  assert.equal(next.warnings.length, 0);
  assert.ok(next.prompts.some((prompt) => prompt.filesModified.includes("src/app/page.tsx")));
  assert.equal(next.prompts.some((prompt) => prompt.filesModified.some((file) => file.endsWith(".astro"))), false);

  const vite = generateSkeleton(calmInput("vite-react"));
  assert.ok(vite.prompts.some((prompt) => prompt.filesModified.includes("vite.config.ts")));
  assert.ok(vite.prompts.some((prompt) => prompt.filesModified.includes("src/world/World.tsx")));
  assert.equal(vite.prompts.some((prompt) => prompt.filesModified.some((file) => file.includes("src/app/"))), false);
});

test("a payment feature is Gargle Blaster and an unknown library throws", () => {
  const { prompts } = generateSkeleton({
    ...tinyInput(),
    features: ["stripe checkout"],
  });
  const feature = prompts.find((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-FEAT-")));
  assert.equal(feature?.tier, "Gargle Blaster");
  assert.equal(feature?.effort, "high");
  assert.throws(
    () =>
      generateSkeleton({
        ...tinyInput(),
        effects: [{ id: "spin", library: "jquery", sectionId: "hero", page: "home" }],
      }),
    /Unknown library "jquery"/,
  );
});

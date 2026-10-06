---
id: "073"
kind: build
phase: deep-thought
slice: The Ultimate Question
title: "Assign one library per effect in MOTION.md"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["072", "017"]
files: ["packages/engine/src/spec/motion.ts", "packages/engine/test/motion.test.ts"]
requirements: ["HH-MOTION-01"]
review_checkpoint_embedded: false
---

# 073. Assign one library per effect in MOTION.md

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

## Goal

Write MOTION.md that assigns exactly one owner library to each chosen effect. The full toolkit is available: GSAP including ScrollTrigger and SplitText, Lenis, Three.js, OGL or raw WebGL2, Motion, anime.js, Theatre core, CSS scroll-driven animations, and vanilla JS. Appetite caps how heavy the effect may be. It does not delete a library from the Guide. There is no GSAP replacement path.

## Why this prompt exists

If two libraries animate the same element, the site will hitch and the phone budget will die. The picker is the product decision D-001 asked for.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- DECISIONS.md D-001
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 15.1, 15.2, and 15.3
- hh-build-plan/RESEARCH-ADDENDUM.md motion toolkit section
- context/research/04-motion-taxonomy.md (A1–H3 ids; each EffectRequest.kind maps to an A1–H3 id)

## Files to create or change

- packages/engine/src/spec/motion.ts
- packages/engine/test/motion.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Libraries enum: gsap, lenis, three, ogl, motion, anime, theatre, css-scroll, vanilla. An EffectRequest has id, kind, and level. pickEffects(requests, appetite) returns assignments. Rules: scroll-linked sequence defaults to gsap. Smooth scroll, if appetite is at least 3 and the user did not demand native CSS, assigns lenis and sets scrollOwner to `lenis+scrolltrigger`. scrollOwner is decided per page (route). On a page with any css-scroll effect, that page's owner is `native` and Lenis is not assigned on that page. Other pages may use `lenis+scrolltrigger`. A test fails if both appear on the same page. Three is assigned for kind `3d` when the appetite weight ceiling (v2 §8.3 table) allows a 3D moment (level 8 and up by default, or the user's explicit choice). Otherwise a 3d request is rewritten to a note `phone still or prerender` with owner vanilla or gsap, and a warning, unless the user set allowHeavy true. Theatre is assigned only for kind `cinematic-timeline` and the note says `@theatre/core` pinned, never studio. Motion is assigned only when stack pick is next or vite-react and kind is `react-island`. On Astro, that kind becomes gsap. anime.js only for kind `svg-stagger` and the element id must not already have gsap. css-scroll is the default for kind `light-reveal` on native-scroll pages at any appetite; GSAP is used for light reveals on Lenis pages. vanilla for kind `tiny-fade`. Unknown kind throws. renderMotionMd(plan) includes a toolkit line that names every library as shipped with the Guide even if this site uses a subset. It includes `No GSAP fallback.`

## Interfaces and data shapes

```ts
export type MotionLib = "gsap" | "lenis" | "three" | "ogl" | "motion" | "anime" | "theatre" | "css-scroll" | "vanilla";

export interface EffectRequest { id: string; kind: string; element: string; page: string; }

export interface MotionPlan {
  scrollOwner: Record<string, "lenis+scrolltrigger" | "native" | "none">;
  assignments: Array<{ id: string; library: MotionLib; element: string }>;
  warnings: string[];
  markdown: string;
}

export function planMotion(input: {
  requests: EffectRequest[];
  appetite: number;
  stack: "astro" | "next" | "vite-react" | "sveltekit";
  allowHeavy?: boolean;
}): MotionPlan;
```

## Steps

1. Implement the rules. Test that a light-reveal at appetite 2 assigns css-scroll and scrollOwner native, and does not assign lenis.

2. Test that a scroll sequence at appetite 5 assigns gsap and lenis and scrollOwner lenis+scrolltrigger.

3. Test that adding a css-scroll effect to a lenis plan throws CoexistenceError. Do not silently drop one.

4. Test theatre assignment mentions core and the markdown does not contain `@theatre/studio` or `gsap fallback`.

5. Test appetite 4 with a 3d request and allowHeavy false does not assign three. It warns.

6. Test two effects on the same element with different libraries throw.

7. The markdown toolkit line lists all nine library ids.

8. Appetite outside 1 to 10 throws.

9. Export planMotion.

## Edge cases

- Empty requests produce scrollOwner none and an empty assignment list, and the toolkit line remains.
- sveltekit stack treats react-island as gsap and adds a warning about a thinner 3D ecosystem.
- ogl is chosen for kind `shader` only when three is not already assigned. If three is assigned, shader stays on three and the warning says one WebGL context.

## Acceptance criteria

- [ ] Lenis and CSS scroll-driven animations are never both selected.
- [ ] The toolkit line names every D-001 library.
- [ ] No GSAP fallback wording exists.
- [ ] Two owners on one element throw.

## must_haves

truths:

- One library owns each effect.
- Appetite is a weight ceiling.
- Theatre means core, not studio.

artifacts:

- packages/engine/src/spec/motion.ts

key_links:

- planMotion is the source of MOTION.md.
- Stack pick comes from decideStack.

prohibitions:

- Do not add a MIT-only GSAP alternative.
- Do not assign @theatre/studio.
- Do not drop a library from the toolkit line because this site is calm.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/073.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): pick one motion library per effect
```

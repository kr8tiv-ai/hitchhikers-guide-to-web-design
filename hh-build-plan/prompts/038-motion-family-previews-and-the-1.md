---
id: "038"
kind: build
phase: dont-panic
slice: Pan Galactic Gargle Blaster
title: "Motion family previews and the 1–10 slider"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["010", "034"]
files: ["packages/app/src/motion-previews/index.ts", "packages/app/src/motion-previews/families.ts", "packages/app/src/motion-previews/previews/gsap-scroll.ts", "packages/app/src/motion-previews/previews/css-scroll.ts", "packages/app/src/motion-previews/previews/split-text.ts", "packages/app/src/motion-previews/previews/three-hero.ts", "packages/app/src/motion-previews/previews/shader-ogl.ts", "packages/app/src/motion-previews/previews/motion-spring.ts", "packages/app/src/motion-previews/previews/anime-stagger.ts", "packages/app/src/motion-previews/previews/theatre-sequence.ts", "packages/app/src/motion-previews/previews/lenis-smooth.ts", "packages/app/src/motion-previews/previews/vanilla-fade.ts", "packages/app/src/motion-previews/slider.ts", "packages/app/src/motion-previews/movie-explainer.ts", "packages/app/test/motion-previews.test.ts", "packages/app/e2e/motion-previews.spec.ts", "packages/app/package.json", "NOTICE"]
requirements: ["HH-INT-07"]
review_checkpoint_embedded: false
---

# 038. Motion family previews and the 1–10 slider

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

Show the user what motion means before asking how much they want (Module 6, DP-6.x). Tiny looping previews per motion family (grouped from research/04 ids A1–H3), each built with the toolkit itself and naming its tool in one clause, with one or two real example links. A 1 to 10 appetite slider with a live preview and the weight-ceiling explanation from v2 §8.3. A full-movie versus choose-your-own-adventure explainer with cost notes (Q17).

## Why this prompt exists

People cannot answer "how much motion?" in the abstract. Seeing a calm fade next to a pinned scroll scene and a shader hero makes the answer real, and it proves the D-001 toolkit is integrated, not listed.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/research/04-motion-taxonomy.md (A1–H3) and context/research/06-library-stack.md
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.3 and 15
- context/matt-answers.md Q17 and Q18
- DECISIONS.md D-001
- packages/app/src/design/motion.ts (015)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/app/src/motion-previews/index.ts
- packages/app/src/motion-previews/families.ts
- packages/app/src/motion-previews/previews/gsap-scroll.ts
- packages/app/src/motion-previews/previews/css-scroll.ts
- packages/app/src/motion-previews/previews/split-text.ts
- packages/app/src/motion-previews/previews/three-hero.ts
- packages/app/src/motion-previews/previews/shader-ogl.ts
- packages/app/src/motion-previews/previews/motion-spring.ts
- packages/app/src/motion-previews/previews/anime-stagger.ts
- packages/app/src/motion-previews/previews/theatre-sequence.ts
- packages/app/src/motion-previews/previews/lenis-smooth.ts
- packages/app/src/motion-previews/previews/vanilla-fade.ts
- packages/app/src/motion-previews/slider.ts
- packages/app/src/motion-previews/movie-explainer.ts
- packages/app/test/motion-previews.test.ts
- packages/app/e2e/motion-previews.spec.ts
- packages/app/package.json
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

families.ts maps research/04 groups to preview modules: scroll-linked sequence (GSAP ScrollTrigger in a scroll container), light reveal (CSS scroll-driven animation-timeline with @supports fallback), text split (GSAP SplitText), 3D hero (Three.js, tiny lazy scene, one WebGL context), shader transition (OGL or raw WebGL2 noise/distortion), spring UI (Motion's vanilla animate API), SVG stagger (anime.js scoped), cinematic timeline (Theatre.js @theatre/core playing a tiny checked-in state JSON; never @theatre/studio), smooth scroll (Lenis inside a demo scroller wired to ScrollTrigger on gsap.ticker), tiny fade (vanilla JS). Each preview mounts into a 320x200 frame, lazy-imports only its library on first view (IntersectionObserver), pauses when off-screen, and shows a still with a caption under prefers-reduced-motion. All previews share one requestAnimationFrame via gsap.ticker; only one WebGL preview is live at a time (others show a poster). slider.ts maps 1 to 10 to the v2 §8.3 weight ceilings and shows which families unlock at each level, with a phone-weight note. movie-explainer.ts explains a full scroll-film versus choose-your-own-adventure branching site with honest cost and effort notes (Imagine video tiers from 053, no invented prices). Add each library as a dependency of @hitchhiker/app at a pinned version and record it in NOTICE.

## Interfaces and data shapes

```ts
export interface MotionFamily { id: string; researchIds: string[]; label: string; tool: "gsap" | "css-scroll" | "three" | "ogl" | "motion" | "anime" | "theatre" | "lenis" | "vanilla"; toolClause: string; examples: string[]; minLevel: number; mount(el: HTMLElement): Promise<() => void> }
export const families: MotionFamily[];
export function familiesForLevel(level: number): MotionFamily[];
export function weightCeiling(level: number): { maxJsKb: number; webgl: boolean; note: string };
```

## Steps

1. Write families.ts covering every research/04 group with one tool each and minLevel values from v2 §8.3.

2. Write each preview module with lazy import, off-screen pause, and a reduced-motion still.

3. Enforce one ticker and one live WebGL context; test with a fake ticker that only one rAF loop is registered.

4. Write slider.ts and weightCeiling with tests at levels 1, 5, and 10.

5. Write movie-explainer.ts with cost notes taken from the 053 price table.

6. Mount the previews into the DP-6.x card on the desk and add a /motion route.

7. Write a Playwright e2e at 375 and 1440 that scrolls the previews, moves the slider, and checks reduced-motion stills via emulateMedia.

## Edge cases

- WebGL unavailable: show the poster and a one-line note.
- Theatre state JSON missing: the preview shows a still and logs a warning; never fetch studio.
- Low-end phone: previews above the current slider level stay posters until tapped.

## Acceptance criteria

- [ ] Every family has a preview naming its tool in one clause, with example links.
- [ ] Reduced motion shows stills.
- [ ] Screenshots at 375 and 1440 in the summary.
- [ ] Only one rAF loop and one live WebGL context.

## must_haves

truths:

- The whole D-001 toolkit is visibly integrated in the app.
- Motion appetite is chosen after seeing examples.
- Previews are light on phones.

artifacts:

- packages/app/src/motion-previews/families.ts
- packages/app/src/motion-previews/slider.ts
- packages/app/src/motion-previews/movie-explainer.ts

key_links:

- The DP-6.x card mounts families via index.ts.
- weightCeiling matches the table the motion picker (073) uses.

prohibitions:

- Do not bundle @theatre/studio.
- Do not run two rAF loops or two live WebGL contexts.
- Do not show magnetic buttons as an option.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/app exec playwright test e2e/motion-previews.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/038.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(motion): live motion family previews and the appetite slider
```

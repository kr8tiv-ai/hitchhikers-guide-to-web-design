---
id: "088"
kind: build
phase: deep-thought
slice: Earth Mk II Blueprints
title: "Plan sections and name the hero Infinite Improbability"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["069", "073"]
files: ["packages/engine/src/spec/sections.ts", "packages/engine/test/sections.test.ts"]
requirements: ["HH-SPEC-04"]
review_checkpoint_embedded: false
---

# 088. Plan sections and name the hero Infinite Improbability

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

Turn the page list and the motion plan into SECTION-PLAN.md and a short VISUAL-DIRECTION.md. The hero section's slice name is Infinite Improbability. One wow per section. A section without a crawlable text note fails if it is motion-led.

## Why this prompt exists

Generated sites were going to reuse the name Heart of Gold for the hero and collide with the brand slice. The rename is already decided. The planner has to use it.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 5.2 (hero slice is Infinite Improbability)
- packages/engine/src/spec/prd.ts
- packages/engine/src/spec/motion.ts

## Files to create or change

- packages/engine/src/spec/sections.ts
- packages/engine/test/sections.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

planSections({ pages, motion }) returns markdown. pages are `{ id, title, purpose }`. The first page's first section is the hero and its slice field is `Infinite Improbability`. Other sections get plain names from the purpose. Each section has one effect id from the motion plan or `none`. Two wows in one section throw. A 3d or theatre effect requires a `textFallback` sentence. Missing textFallback throws. VISUAL-DIRECTION.md is a second return field: light, type, and the signature moment from the answers if provided, else `Not decided.`

## Interfaces and data shapes

```ts
export interface PageInput { id: string; title: string; purpose: string; }

export function planSections(input: {
  pages: PageInput[];
  assignments: Array<{ id: string; library: string; element: string }>;
  textFallbacks: Record<string, string>;
}): { sectionPlan: string; visual: string };
```

## Steps

1. Require at least one page. The first section id is `hero` and the slice name in the markdown is exactly `Infinite Improbability`.

2. Map effect ids onto sections by a `sectionId` you add to a parallel array, or by putting the effect on the hero if only one effect exists. Keep it explicit: EffectRequest in this function is `{ sectionId, effectId }`. Change the input to that. Do not guess.

3. Two effect ids on one section throw.

4. Library three or theatre without a text fallback throws.

5. visual markdown contains the hero slice name too.

6. Test a two-page input.

7. No lorem.

8. Export planSections.

## Edge cases

- A page with an empty purpose throws.
- Duplicate page ids throw.
- textFallback shorter than 20 characters throws for heavy effects.

## Acceptance criteria

- [ ] The hero slice is Infinite Improbability.
- [ ] A section cannot have two wows.
- [ ] Heavy effects without a text fallback throw.

## must_haves

truths:

- Heart of Gold is not the hero slice name.
- Every heavy section has crawlable text.
- One effect per section.

artifacts:

- packages/engine/src/spec/sections.ts

key_links:

- planSections uses library names from the motion plan.

prohibitions:

- Do not name the hero Heart of Gold.
- Do not emit lorem.
- Do not hide text in a canvas-only hero.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/088.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): plan sections and the hero slice name
```

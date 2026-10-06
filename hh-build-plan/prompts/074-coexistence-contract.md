---
id: "074"
kind: build
phase: deep-thought
slice: The Ultimate Question
title: "Encode the ticker, scroll, and WebGL coexistence rules"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["073"]
files: ["packages/templates/src/motion-contract.ts", "packages/templates/test/motion-contract.test.ts"]
requirements: ["HH-MOTION-02"]
review_checkpoint_embedded: true
---

# 074. Encode the ticker, scroll, and WebGL coexistence rules

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

Generate the site's `src/scripts/motion.ts` and `src/scripts/webgl.ts` skeletons from a MotionPlan. One gsap.ticker drives Three, Theatre, and raw WebGL when those assignments exist. Lenis is wired to ScrollTrigger only when scrollOwner says so. Reduced motion turns Lenis off, skips scrub, and leaves content visible. The calm phone path is a comment and a function stub that heavy effects must call.

## Why this prompt exists

A picker that writes markdown and a template that starts three animation loops will still fail on a phone. The contract has to be code.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 15.2
- packages/engine/src/spec/motion.ts
- hh-build-plan/RESEARCH-ADDENDUM.md coexistence notes (engineering conclusion, not a fake Lenis quote)

## Files to create or change

- packages/templates/src/motion-contract.ts
- packages/templates/test/motion-contract.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderMotionModule(plan) returns a TypeScript source string. It imports gsap only if some assignment uses gsap or lenis. It does not import every library. Dynamic import comments show where three would load. If scrollOwner is native, the file must not import lenis. If scrollOwner is lenis+scrolltrigger, the file must not set a CSS animation-timeline. webgl factory is a function `getContext()` that returns the existing context or creates one, and throws if called twice for a second canvas id. Reduced-motion branch is in the source as a real `matchMedia` check, not a comment. Include a function `onTick(cb)` that subscribes to gsap.ticker when gsap is in the graph, or to a single requestAnimationFrame loop when it is not. Never two loops. The test parses the string. It does not execute WebGL.

## Interfaces and data shapes

```ts
export function renderMotionModule(plan: MotionPlan): string;
export function renderWebglModule(plan: MotionPlan): string;
```

## Steps

1. When the plan uses lenis, the source contains `ScrollTrigger` and `gsap.ticker` and does not contain `animation-timeline`.

2. When the plan is native, the source contains `animation-timeline` and does not contain `lenis`.

3. When the plan assigns three or theatre or ogl, renderWebglModule contains `getContext` and the sentence `one context per page`.

4. Reduced motion source contains `prefers-reduced-motion` and does not autoplay.

5. A plan with both scroll owners cannot exist if planMotion threw. Add a defensive throw if the markdown somehow contains both phrases.

6. Theatre comment in the source says pin `@theatre/core` and do not import studio.

7. The generated file header says it was generated from MOTION.md and should not be hand-forked into a second ticker.

8. Test a vanilla-only plan: no gsap import, one rAF helper.

9. Export the renderers from the templates package. Templates may import the MotionPlan type. If importing the engine type pulls too much, duplicate a narrow structural type in the template file and document it.

## Edge cases

- Empty plan still returns a module that respects reduced motion and does nothing else.
- Sveltekit warning in the plan is copied as a comment.
- The string `requestAnimationFrame` appears at most in the single helper, not inside each library block. Test by counting occurrences.

## Acceptance criteria

- [ ] Lenis plans and native plans are mutually exclusive in the output.
- [ ] One ticker helper exists.
- [ ] Reduced motion is code.
- [ ] Studio is not imported.

## must_haves

truths:

- Generated motion code follows the coexistence rules.
- Libraries that were not picked are not imported.
- Heavy effects have a calm-path hook.

artifacts:

- packages/templates/src/motion-contract.ts

key_links:

- renderMotionModule consumes MotionPlan from planMotion.

prohibitions:

- Do not import @theatre/studio.
- Do not start a second animation loop per library.
- Do not claim Lenis officially documented CSS timelines. The comment should say the Guide chose one scroll owner.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/templates test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/074.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(templates): generate the motion coexistence modules
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `075-review-072-074.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `072` Write the stack decision record (The Ultimate Question, Gargle Blaster, high)
- `073` Assign one library per effect in MOTION.md (The Ultimate Question, Forty-Two, xhigh)
- `074` Encode the ticker, scroll, and WebGL coexistence rules (The Ultimate Question, Heart of Gold, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

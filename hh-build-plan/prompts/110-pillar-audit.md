---
id: "110"
kind: build
phase: improbability-drive
slice: Zaphod
title: "Score the six pillars plus motion and brand"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["109"]
files: ["packages/qa/src/pillars.ts", "packages/qa/test/pillars.test.ts"]
requirements: ["HH-REVIEW-03"]
review_checkpoint_embedded: true
---

# 110. Score the six pillars plus motion and brand

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

Score eight pillars: copy, visuals, color, type, spacing, experience, motion, and brand. Each is PASS, FIX, or BLOCKER with a note. Motion is BLOCKER when the report says two scroll owners. Brand is BLOCKER when a testimonial was invented. A missing note is invalid.

## Why this prompt exists

The six visual pillars miss a second ticker and a fake review. The extra two are the Guide's.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.3
- packages/knowledge/packs/anti-slop/SKILL.md

## Files to create or change

- packages/qa/src/pillars.ts
- packages/qa/test/pillars.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Pillar name union as above. review(pillars) returns the worst status. BLOCKER beats FIX beats PASS. requireMotionAndBrand throws if those keys are absent. The function does not look at pixels. It scores structured notes the screenshot step and the truth linter will fill later.

## Interfaces and data shapes

```ts
export type PillarName = "copy" | "visuals" | "color" | "type" | "spacing" | "experience" | "motion" | "brand";
export type PillarStatus = "PASS" | "FIX" | "BLOCKER";
export function summarizePillars(rows: Array<{ name: PillarName; status: PillarStatus; note: string }>): { worst: PillarStatus; missing: PillarName[] };
```

## Steps

1. Require all eight names. Missing ones are listed and worst is BLOCKER.

2. Empty note throws.

3. A motion BLOCKER produces worst BLOCKER even if the others pass.

4. Test the ordering.

5. Reject a duplicate name.

6. Do not mention a GSAP fallback as an allowed fix. If the note contains `replace GSAP`, throw.

7. Export the function.

8. No browser.

## Edge cases

- Unknown pillar name throws.
- Status values outside the union throw at runtime if a string sneaks in. Check with a set.

## Acceptance criteria

- [ ] All eight pillars are required.
- [ ] Motion and brand can block the review.
- [ ] A note that suggests replacing GSAP is rejected.

## must_haves

truths:

- The audit has eight pillars, not six.
- The worst status is computed, not guessed.

artifacts:

- packages/qa/src/pillars.ts

key_links:

- Motion BLOCKER is how coexistence failures surface in review.

prohibitions:

- Do not drop motion or brand.
- Do not allow a replace-GSAP note.
- Do not score from a screenshot file in this prompt.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/110.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): score eight review pillars
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `111-review-108-110.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `108` Capture reviewer screenshots at four widths with same-environment baselines (Zaphod, Heart of Gold, high)
- `109` Check a prompt's truths against evidence (Zaphod, Heart of Gold, high)
- `110` Score the six pillars plus motion and brand (Zaphod, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

---
id: "069"
kind: build
phase: deep-thought
slice: Seven and a Half Million Years
title: "Generate the seventeen-section PRD and the assumptions list"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["068", "059", "011"]
files: ["packages/engine/src/spec/prd.ts", "packages/engine/test/prd.test.ts"]
requirements: ["HH-SPEC-02"]
review_checkpoint_embedded: false
---

# 069. Generate the seventeen-section PRD and the assumptions list

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

Write PRD.md with seventeen numbered sections plus an assumptions list of every ASSUMED and SOFT answer. The non-functional section states Lighthouse mobile at least 90 in all four categories (performance, accessibility, best practices, SEO) on real mobile runs of what a phone actually gets (D-006), WCAG 2.2 AA, and current-minus-two browsers. Missing required fields throw instead of producing a PRD.

## Why this prompt exists

A PRD that hides assumptions will be approved as if the user had decided. The list is how Deep Thought stays honest.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 10.2 and 12
- packages/engine/src/brand/brain.ts
- packages/engine/src/required.ts
- CONTEXT-PACKAGE.md (v1) section 10.2

## Files to create or change

- packages/engine/src/spec/prd.ts
- packages/engine/test/prd.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Section titles, in order (v1 §10.2): Summary (goal, one action, site types), Users and personas, KPIs and tracking plan, Positioning and messaging hierarchy, Information architecture, Section plan summary, Functional requirements (REQ-IDs), Content requirements, Visual and motion requirements, 3D and media requirements, Non-functional requirements, Tech stack decision, Deploy plan, Assumptions, Out of scope / Version 2 list, Risks, Approval. Number them 1 to 17. Assumptions is section 14 and lists every ASSUMED and SOFT field. Each assumption line is `- id: value (ASSUMED|SOFT)`. ANSWERED lines do not appear there. Non-goals include `A full Shopify store is out unless a later escalation says otherwise.` Motion section says the toolkit is chosen per effect in MOTION.md and is not a library dump on every page. Do not write `$10-20`. Section 17 Approval is `PRD approval: pending`. The narrative text of sections 1, 4, 6, 9 and 16 is drafted by Grok through the 011 adapter (structured output) and validated here; this renderer owns structure, assumptions, REQ-IDs and the approval block.

## Interfaces and data shapes

```ts
export function renderPrd(input: {
  answers: AnswerRecord[];
  brandMarkdown: string;
  name: string;
}): { markdown: string };
```

## Steps

1. Throw if missingRequired(answers) is non-empty.

2. Render all 17 headings. The test splits on /^## /m or the numbered form you choose. Use `## 1. Summary` style so the test can count 17.

3. Assumptions include SKIPPED only when you also stored them as ASSUMED in a parallel list. AnswerRecord uses SKIPPED not ASSUMED. Treat SKIPPED and SOFT as assumptions. The line status word is SKIPPED or SOFT to match the type. Document that SKIPPED means the value is the assumed text.

4. Brand section is the first 120 words of brand markdown, not the whole file, plus a pointer `.hitchhiker/BRAND.md`.

5. Non-functional section contains the exact digits 90 and the phrase `real mobile`.

6. A test with a SOFT DP-5.3 expects that id under Assumptions and not a claim that the vibe was decided.

7. Pending approval line is present.

8. No exclamation marks.

9. Export renderPrd. Pure function. Caller writes the file.

## Edge cases

- Brand markdown over 120 words is cut on a word boundary.
- An answer value with a newline is flattened to spaces inside the assumption line.
- Section count other than 17 fails the test you write.

## Acceptance criteria

- [ ] Seventeen sections exist in order.
- [ ] SOFT and SKIPPED answers are listed as assumptions.
- [ ] The real-mobile Lighthouse floor is 90 in all four categories.
- [ ] Missing required fields throw.

## must_haves

truths:

- The PRD does not pretend assumptions were decisions.
- Phone performance is specified here, not invented later by QA.
- Full storefronts are a non-goal by default.

artifacts:

- packages/engine/src/spec/prd.ts

key_links:

- renderPrd calls missingRequired and quotes BRAND.md by path.

prohibitions:

- Do not invent a conversion rate.
- Do not mark the PRD approved.
- Do not omit the assumptions list.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/069.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): render the seventeen-section PRD
```

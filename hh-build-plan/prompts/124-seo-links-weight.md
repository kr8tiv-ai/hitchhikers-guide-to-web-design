---
id: "124"
kind: build
phase: mostly-harmless
slice: Nutrimatic Test
title: "Check titles, crawlable text, links, and weight budgets"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["122"]
files: ["packages/qa/src/weight-gate.ts", "packages/qa/test/weight-gate.test.ts"]
requirements: ["HH-QA-03"]
review_checkpoint_embedded: true
---

# 124. Check titles, crawlable text, links, and weight budgets

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

Block a page with an empty title, more than one h1, no crawlable text, or a broken in-site link from a list the caller supplies. Apply a byte budget that shrinks as appetite drops. Level 2 cannot ship a multi-megabyte physics payload. The budget function is explicit and tested.

## Why this prompt exists

Motion weight is how a calm brochure becomes a game download. SEO basics are how a pretty page stays invisible.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 12 and 15.3
- packages/knowledge/packs/seo/SKILL.md

## Files to create or change

- packages/qa/src/weight-gate.ts
- packages/qa/test/weight-gate.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

budgetBytes(appetite) returns a number. Appetite 1-2: 500_000. 3-5: 1_500_000. 6-8: 4_000_000. 9-10: 8_000_000. evaluatePage({ title, h1Count, textLength, brokenLinks, bytes, appetite }) blocks when title is empty, h1Count is not 1, textLength is under 40, brokenLinks is non-empty, or bytes exceed the budget. Do not fetch links. The caller passes them.

## Interfaces and data shapes

```ts
export function budgetBytes(appetite: number): number;
export function evaluatePage(input: { title: string; h1Count: number; textLength: number; brokenLinks: string[]; bytes: number; appetite: number }): { status: "PASS" | "BLOCKER"; reasons: string[] };
```

## Steps

1. Implement the budget steps and test the boundaries 2, 3, 5, 6, 8, 9.

2. Empty title blocks.

3. Zero h1 and two h1 both block.

4. A broken link blocks and the reason includes the href.

5. Bytes one over the budget block.

6. A passing fixture returns PASS.

7. Appetite outside 1-10 throws.

8. Export both.

## Edge cases

- Whitespace-only title is empty.
- textLength 40 passes. 39 blocks.

## Acceptance criteria

- [ ] Budgets step with appetite.
- [ ] Basic SEO structure is enforced.
- [ ] Over-budget pages block.

## must_haves

truths:

- Low appetite cannot carry a heavy payload.
- The checker does not crawl.

artifacts:

- packages/qa/src/weight-gate.ts

key_links:

- Appetite levels match the interview table.

prohibitions:

- Do not fetch URLs.
- Do not give level 2 a physics-sized budget.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/124.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): gate SEO structure and weight
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `125-review-122-124.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `122` Gate Lighthouse on real mobile runs: all four scores at 90 (Nutrimatic Test, Heart of Gold, xhigh)
- `123` Check axe, keyboard, reduced motion, and contrast (Nutrimatic Test, Heart of Gold, high)
- `124` Check titles, crawlable text, links, and weight budgets (Nutrimatic Test, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

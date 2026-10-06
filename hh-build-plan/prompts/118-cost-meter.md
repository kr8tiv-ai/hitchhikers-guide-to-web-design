---
id: "118"
kind: build
phase: improbability-drive
slice: Eddie
title: "Show counts in subscription mode and measured tokens in API mode"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["006", "116"]
files: ["packages/engine/src/cost.ts", "packages/engine/test/cost.test.ts", "packages/app/src/dashboard.ts"]
requirements: ["HH-DRIVE-10"]
review_checkpoint_embedded: true
---

# 118. Show counts in subscription mode and measured tokens in API mode

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

Render a cost line that, in subscription mode, shows prompt counts and not a dollar price. In API mode, show a dollar figure only when the caller passes measured token counts and the price card. Never display `$10-20` or any other unsourced run price. Imagine dollars stay in the Imagine client.

## Why this prompt exists

The old illustration of ten to twenty dollars was being read as a quote. The meter is where that mistake would reach the user.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 20
- hh-build-plan/RESEARCH-ADDENDUM.md pricing section
- packages/app/src/dashboard.ts

## Files to create or change

- packages/engine/src/cost.ts
- packages/engine/test/cost.test.ts
- packages/app/src/dashboard.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

formatCost({ mode, promptsRun, promptsTotal, inputTokens, outputTokens }) returns a string. subscription ignores tokens and returns `Prompts ${n} of ${total}.` API mode without tokens returns `API mode. No measured tokens yet.` API mode with tokens uses a function priceTokens that takes rates as arguments so you do not hardcode a future price. If rates are provided, multiply and show two decimal places with the card date the caller passes. If the caller passes a string containing `$10-20`, throw. Update the dashboard placeholder to call formatCost. The test covers both modes.

## Interfaces and data shapes

```ts
export function formatCost(input: {
  mode: "subscription" | "api";
  promptsRun: number;
  promptsTotal: number;
  inputTokens?: number;
  outputTokens?: number;
  rates?: { inputPerMillion: number; outputPerMillion: number; cardDate: string };
}): string;
```

## Steps

1. Subscription format is exact and contains no `$`.

2. API without rates or tokens returns the not-measured sentence.

3. API with 1_000_000 input tokens at 2 dollars per million returns a line containing `2.00` and the card date.

4. Throw if any free-text field contains `$10-20`. There is no free-text field. Throw if promptsTotal is 0.

5. Negative tokens throw.

6. Wire dashboard to show the subscription line for an empty measurement so the placeholder sentence is gone. Update the dashboard test.

7. Do not call a billing API.

8. Export formatCost.

## Edge cases

- promptsRun greater than promptsTotal throws.
- Rates without a cardDate throw.

## Acceptance criteria

- [ ] Subscription output has counts and no dollar sign.
- [ ] API output without measurements does not invent a price.
- [ ] The dashboard uses the helper.

## must_haves

truths:

- Unsourced run prices are not shown.
- Dollars require measured tokens and an explicit rate card.

artifacts:

- packages/engine/src/cost.ts

key_links:

- The dashboard cost line calls formatCost.

prohibitions:

- Do not print $10-20.
- Do not bill anything.
- Do not treat SuperGrok as an API price.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/118.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): add an honest cost line
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `119-review-116-118.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `116` Render the local drive dashboard (Eddie, Heart of Gold, xhigh)
- `117` Update STATE.md as each prompt finishes (Eddie, Gargle Blaster, high)
- `118` Show counts in subscription mode and measured tokens in API mode (Eddie, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

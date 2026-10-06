---
id: "070"
kind: build
phase: deep-thought
slice: Seven and a Half Million Years
title: "Write KPIS.md with ranges labeled as assumptions"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["069"]
files: ["packages/engine/src/spec/kpis.ts", "packages/engine/test/kpis.test.ts"]
requirements: ["HH-SPEC-03"]
review_checkpoint_embedded: true
---

# 070. Write KPIS.md with ranges labeled as assumptions

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

Turn DP-2.4 answers into KPIS.md. If the user gave no numbers, write the primary KPI name from the site type and the sentence `No baseline was given. Do not invent one.` If they gave a current number and a goal, store them as labeled measurements. Any conversion range you mention must be marked assumption and must come from the user's words.

## Why this prompt exists

Invented KPIs become fake success criteria in the prompt package. The helper's job is to refuse the invention.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 8.3 DP-2.4
- packages/engine/src/site-types.ts
- packages/engine/src/spec/prd.ts

## Files to create or change

- packages/engine/src/spec/kpis.ts
- packages/engine/test/kpis.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderKpis({ siteType, answerText }) returns markdown. Look up the kpi phrase in SITE_TYPES. Parse integers the user wrote. If two integers exist, call them current and goal only if the text also contains the words current and goal. Otherwise list them as `Numbers mentioned:` without assigning meaning. Never emit a percent the user did not write. The tea shop fixture with empty answer text produces the refusal sentence.

## Interfaces and data shapes

```ts
export function renderKpis(input: { siteType: string; answerText: string }): string;
```

## Steps

1. Unknown site type throws and lists the known ids.

2. Empty answer returns the KPI name and the refusal sentence.

3. Text `current 10 goal 20` produces those labels. Text `10 and 20` produces Numbers mentioned and does not say current.

4. A percent in the user text is copied and prefixed with `From the user:`. A percent you would have added yourself is not present. Test by snapshotting that the only `%` matches the input.

5. No exclamation marks.

6. Keep it under 200 words.

7. Export the function.

8. Do not read analytics APIs.

## Edge cases

- Commas in 1,200 are allowed. Parse by stripping commas between digits.
- Negative numbers throw.
- The refusal sentence is exact so the test can find it.

## Acceptance criteria

- [ ] Empty input does not invent a baseline.
- [ ] Unlabeled numbers are not called a goal.
- [ ] The site type's KPI phrase appears.

## must_haves

truths:

- KPIs without data stay empty of fake precision.
- Percents originate in the user's answer.

artifacts:

- packages/engine/src/spec/kpis.ts

key_links:

- renderKpis reads SITE_TYPES.

prohibitions:

- Do not invent conversion rates.
- Do not call an analytics API.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/070.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): write KPIS.md without invented baselines
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `071-review-068-070.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `068` Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site (Seven and a Half Million Years, Gargle Blaster, high)
- `069` Generate the seventeen-section PRD and the assumptions list (Seven and a Half Million Years, Heart of Gold, high)
- `070` Write KPIS.md with ranges labeled as assumptions (Seven and a Half Million Years, Cup of Tea, medium)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

---
id: "131"
kind: build
phase: mostly-harmless
slice: Slartibartfast's Fjords
title: "Elevate loop live, detail pass, copy refinement"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["128", "130", "126"]
files: ["packages/qa/src/elevate-loop.ts", "packages/qa/src/detail-pass.ts", "packages/qa/src/copy-refine.ts", "packages/qa/test/elevate-loop.test.ts", "packages/qa/test/cassettes/elevate/README.md", "packages/cli/src/commands/elevate.ts"]
requirements: ["HH-QA-10"]
review_checkpoint_embedded: false
---

# 131. Elevate loop live, detail pass, copy refinement

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

Make `/hh-elevate` work end to end: a cold xhigh review produces at most 8 ranked upgrades (128), the user picks, picks become prompts, the same review loop runs, gates re-run, and a regression is refused (130). It is repeatable. Add the Slartibartfast detail pass (kerning, optical alignment, hover and focus states, 404, favicon, OG image, empty and error states, print styles) and a post-build copy refinement in the brand voice with per-item approve or reject (Q15, Q30).

## Why this prompt exists

Matt wants users to be able to ask "how could this be better?" as often as they like (Q30), and the last 5% of craft is what separates award sites from good ones.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/matt-answers.md Q15 and Q30
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/qa/src/elevate.ts (128) and elevate-run.ts (130)
- packages/qa/src/zaphod-vision.ts and the gate runners (142)
- .hitchhiker/brand/VOICE.md format from 051
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/qa/src/elevate-loop.ts
- packages/qa/src/detail-pass.ts
- packages/qa/src/copy-refine.ts
- packages/qa/test/elevate-loop.test.ts
- packages/qa/test/cassettes/elevate/README.md
- packages/cli/src/commands/elevate.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

elevate-loop.ts: round(projectDir) captures fresh screenshots (142 opener), calls planElevate's model path at xhigh, shows the ranked list, takes the user's picks, writes one prompt per pick (golden Elevate template from 092), runs them through the live runner, re-runs all gates, and applies 130's rule: any gate regression reverts that pick's commit and reports why. Rounds are numbered and logged in .hitchhiker/elevate/ROUND-N.md. detail-pass.ts is a checklist-driven prompt set (one prompt per area) with Playwright checks where measurable (404 route exists, favicon and OG tags present, focus visible on every interactive element, print stylesheet hides nav). copy-refine.ts asks Grok to propose voice-consistent rewrites for headings, CTAs, and microcopy, each validated by the anti-slop linter (112) and lintClaims, and shown as approve or reject cards; approved changes become a single copy prompt.

## Interfaces and data shapes

```ts
export function elevateRound(projectDir: string, deps: { think: typeof think; pick: (items: ElevateItem[]) => Promise<ElevateItem[]>; runPrompt: (file: string) => Promise<void>; gates: () => Promise<GateResult> }): Promise<{ applied: string[]; refused: Array<{ id: string; reason: string }> }>;
export function detailChecks(url: string): Promise<Array<{ area: string; ok: boolean; note: string }>>;
export function proposeCopy(pages: string[], voice: string, deps: { think: typeof think }): Promise<Array<{ id: string; before: string; after: string; why: string }>>;
```

## Steps

1. Write elevateRound with injected deps; cassette e2e of one round where one pick regresses Lighthouse and is refused.

2. Write detailChecks against the fixture site.

3. Write proposeCopy with the linter and lintClaims validation and approve cards.

4. Add hh elevate to the CLI (the /hh-elevate skill calls it).

5. Log each round to .hitchhiker/elevate/ROUND-N.md.

## Edge cases

- The user picks nothing: the round ends politely with no changes.
- All picks regress: nothing is kept and the report says why.
- Copy proposals that add an exclamation mark or a banned word are dropped.

## Acceptance criteria

- [ ] A cassette e2e of one Elevate round includes one refused regression.
- [ ] The detail pass reports each area.
- [ ] Copy changes need per-item approval.

## must_haves

truths:

- Elevate is repeatable and never keeps a regression.
- The detail pass covers the small things award juries notice.
- Copy refinement stays in the brand voice.

artifacts:

- packages/qa/src/elevate-loop.ts
- packages/qa/src/detail-pass.ts
- packages/qa/src/copy-refine.ts

key_links:

- elevateRound uses planElevate (128) and the regression rule (130).
- Gate results come from 142's runners.

prohibitions:

- Do not keep a change that regresses a gate.
- Do not apply copy without approval.
- Do not exceed eight upgrades per round.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
pnpm --filter @hitchhiker/cli test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/131.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(elevate): live Elevate rounds, detail pass, and copy refinement
```

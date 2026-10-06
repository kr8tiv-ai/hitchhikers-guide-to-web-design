---
id: "128"
kind: build
phase: mostly-harmless
slice: Total Perspective Vortex
title: "Plan at most eight Elevate upgrades"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["127", "078", "011"]
files: ["packages/qa/src/elevate.ts", "packages/qa/test/elevate.test.ts"]
requirements: ["HH-QA-06"]
review_checkpoint_embedded: true
---

# 128. Plan at most eight Elevate upgrades

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

Plan one Elevate round. Grok 4.7 at xhigh (through the 011 adapter) reads the live local site cold (screenshots at four widths plus code plus BRAND, VOICE, MOTION) and answers "How could I possibly improve this?" with at most eight upgrades ranked by impact vs effort. Each is tagged by pass (type and spacing → motion → imagery → copy) or as a standout feature (hero interaction, scroll storytelling, non-magnetic cursor, 3D moment, micro-interactions, sound toggle, transitions, easter egg), each with phone weight and a reduced-motion version. planElevate validates the model output (cap 8, file named, no magnetic, no exclamation, no banned words). The user picks; picks become prompts.

## Why this prompt exists

An open-ended polish pass expands forever and sneaks slop back in. Eight is the cap in the spec.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/knowledge/packs/anti-slop/SKILL.md

## Files to create or change

- packages/qa/src/elevate.ts
- packages/qa/test/elevate.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

planElevate(notes) takes strings and returns up to 8 items `{ file, change }`. A note that does not name a file is dropped and counted in `skipped`. More than 8 candidates keeps the first 8 after sorting by the order given, and records `truncated: true`. Reject a change that contains an exclamation mark or the phrase `add a magnetic`. Empty input returns an empty list and truncated false.

## Interfaces and data shapes

```ts
export function planElevate(notes: string[]): { items: Array<{ file: string; change: string }>; skipped: number; truncated: boolean };
```

## Steps

1. Parse a note format `file: change` you document. Notes without a colon are skipped.

2. Cap at 8. Test 9 valid notes yield truncated true and length 8.

3. Reject magnetic and exclamation changes by skipping them and counting skipped. Do not throw the whole plan away.

4. The function name and file name may contain elevate. The change text may not contain the standalone word elevate. Test that.

5. Do not write files.

6. Export planElevate.

7. The model call goes through the 011 adapter (`think({ task: 'elevate-plan', schema, effort: 'xhigh' })`). Unit tests replay a recorded cassette; the live call is exercised in 131.

8. Keep items in input order.

## Edge cases

- Duplicate file and change pairs are deduped.
- A path with `..` is skipped.

## Acceptance criteria

- [ ] The cap is 8.
- [ ] Magnetic upgrades are skipped.
- [ ] Nothing is applied.

## must_haves

truths:

- Elevate is a bounded plan.
- It does not reintroduce banned patterns.

artifacts:

- packages/qa/src/elevate.ts

key_links:

- Notes are meant to come from pillar FIX rows.

prohibitions:

- Do not apply edits.
- Do not exceed eight items.
- Do not plan a magnetic button.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/128.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): plan at most eight Elevate upgrades
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `129-review-126-128.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `126` Live drive, vision review, real gates, console gate, live dogfood (Vogon Constructor Fleet, Forty-Two, xhigh)
- `127` Score the four-part jury (Total Perspective Vortex, Gargle Blaster, high)
- `128` Plan at most eight Elevate upgrades (Total Perspective Vortex, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

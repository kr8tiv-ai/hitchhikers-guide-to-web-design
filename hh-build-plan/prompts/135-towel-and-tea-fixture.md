---
id: "135"
kind: build
phase: mostly-harmless
slice: Towel & Tea
title: "Freeze the Towel and Tea eval fixture"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["043", "059"]
files: ["evals/towel-and-tea/transcript.json", "evals/towel-and-tea/expected-brief.json", "evals/towel-and-tea/expected-brand.json", "packages/engine/test/towel-tea.test.ts"]
requirements: ["HH-QA-09"]
review_checkpoint_embedded: false
---

# 135. Freeze the Towel and Tea eval fixture

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

Commit a fictional tea company fixture: a frozen interview transcript, the expected brief fields, and expected brand tokens. The test replays the transcript through the interview types or through compile helpers and compares the required fields. It replays recorded cassettes instead of calling Grok live; the live dogfood run is 126. Aura Homes is not required.

## Why this prompt exists

Without a fixture, every eval depends on a live subscription and a missing client. This is the regression net for the compilers.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 19 eval note
- hh-build-plan/CRITIQUE.md Q-B (Towel and Tea is the default fixture)
- packages/engine/src/required.ts
- packages/engine/src/brand/brain.ts

## Files to create or change

- evals/towel-and-tea/transcript.json
- evals/towel-and-tea/expected-brief.json
- evals/towel-and-tea/expected-brand.json
- packages/engine/test/towel-tea.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

The company is Towel & Tea, a fictional loose-leaf shop. Visitor wants a tin. Action is buy. Vibe is earthy. Anti-vibe is neon. Motion is skipped so the assumed level applies. Hosting is no idea. expected-brief.json lists those strings. expected-brand.json lists a paper and ink hex that passes contrast, or the test computes contrast on the hexes you store. No real person's name. No real address. No API key.

## Interfaces and data shapes

```ts
export function loadFixture(dir: string): { answers: AnswerRecord[]; brief: Record<string, string> };
```

## Steps

1. Write the three JSON files. Keep them small.

2. The test loads them and asserts required ids are non-empty.

3. Assert contrast on the expected ink and paper is at least 4.5 using the token helper.

4. Assert the transcript contains no exclamation mark and no real email.

5. Assert the string `Aura Homes` is absent.

6. Do not call fetch.

7. Add a loader in the test file or in the engine. Prefer the test file if you want zero production API.

8. Document in a one-line JSON comment is illegal. Put a readme only if you need it. The prompt's file list does not include a readme. Skip the readme.

## Edge cases

- Invalid JSON fails the test, which is what you want.
- The fixture is deterministic. No Date.now in the expected files.

## Acceptance criteria

- [ ] The fixture loads and covers the required fields.
- [ ] Brand colors pass contrast.
- [ ] No live model and no Aura Homes dependency.

## must_haves

truths:

- Evals have a frozen fictional client.
- The fixture contains no secrets and no real personal data.

artifacts:

- evals/towel-and-tea/transcript.json
- evals/towel-and-tea/expected-brief.json

key_links:

- expected fields match the required id list.

prohibitions:

- Do not call Grok.
- Do not use a real customer's data.
- Do not require Aura Homes.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/135.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
test: add the Towel and Tea fixture
```


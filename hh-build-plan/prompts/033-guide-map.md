---
id: "033"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Show phase progress and resume from the home index"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["007", "030"]
files: ["packages/app/src/map.ts", "packages/app/test/map.test.ts", "packages/cli/src/main.ts"]
requirements: ["HH-APP-03"]
review_checkpoint_embedded: false
---

# 033. Show phase progress and resume from the home index

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

Render the six locked phases as a map, highlight the phase in STATE.md, and add `hh progress`, `hh pause`, and `hh resume` that read and write that state. Pause stores a next action. Resume does not restart the interview at DP-0.1 if a cursor exists.
Also render the per-module Guide map: for each interview module, counts and ids by status (answered, suggested, assumed, soft, imported, to do), so the user sees what is done and not done.

## Why this prompt exists

A long interview that cannot be paused will be abandoned. The map is how a user sees that Babel Fish is later, not lost.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 5.1 and 18 (`/hh-progress`, `/hh-pause`, `/hh-resume`)
- packages/engine/src/state.ts
- packages/engine/src/home-index.ts

## Files to create or change

- packages/app/src/map.ts
- packages/app/test/map.test.ts
- packages/cli/src/main.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Phase names are exactly Don't Panic, Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, and So Long and Thanks for All the Fish. renderMap(state) returns HTML ordered list. The current phase has data-current=true. Others do not. Unknown phase throws. hh progress --project <dir> prints the phase, slice, prompt id, and next action as plain lines. hh pause --project <dir> --message <text> sets nextAction and writes state through saveState. hh resume --project <dir> prints the prompt id and exits 0. It does not launch Grok. If state is missing, progress exits 1 with `No project state yet.` CLI parsing stays dependency-free. The app map is pure HTML. Wire a note in the shell only if you can do it without breaking the shell equality test: prefer not to change index.html. The map is its own render function the desk can mount later.

## Interfaces and data shapes

```ts
export function renderGuideMap(answers: AnswerRecord[], tree: Question[]): string;
export const PHASES: readonly string[];

export function renderMap(state: GuideState): string;

export function parseCli(argv: string[]): { cmd: "progress" | "pause" | "resume"; project: string; message?: string };
```

## Steps

1. Put PHASES in map.ts. renderMap escapes nextAction and marks one current phase.

2. A test with phase Babel Fish expects data-current only on that item, and expects all six names.

3. parseCli handles the three commands. Missing --project throws a usage string that names the flag.

4. Implement the three commands in packages/cli/src/main.ts using loadState and saveState. Pause with an empty message throws.

5. Resume prints `resume: <promptId>` and does not modify the file. The test uses a temp project and compares mtime or file text before and after.

6. Progress on a fixture state prints the slice. No emoji.

7. Do not create the six phase directories in the user's project in this prompt. That is a Deep Thought writer.

8. Add cli tests for parseCli and for pause/resume against a temp dir. Export parseCli for the test.

9. Keep doctor behavior from the earlier prompt working. Run the cli tests.

## Edge cases

- A message with a newline is rejected so STATE.md headings cannot be injected.
- An unknown command still exits 2.
- Phase name comparison is exact. `dont panic` throws in renderMap.

## Acceptance criteria

- [ ] The map lists the six locked names and marks one current.
- [ ] Pause then a new loadState returns the message.
- [ ] Resume does not rewrite STATE.md.
- [ ] Doctor tests still pass.
- [ ] A fixture with 3 answered, 2 skipped, 1 soft renders those counts in the right module.

## must_haves

truths:

- Progress reads the same GuideState the interview writes.
- Resume does not reset the cursor.
- Phase names match the locked list.

artifacts:

- packages/app/src/map.ts
- packages/cli/src/main.ts

key_links:

- pause calls saveState.
- renderMap uses GuideState.phase.

prohibitions:

- Do not rename a phase.
- Do not start a headless Grok session from resume.
- Do not write `.planning/`.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/cli test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/033.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): add the phase map and pause/resume
```


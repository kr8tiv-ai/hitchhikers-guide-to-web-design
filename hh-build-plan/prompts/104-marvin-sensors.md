---
id: "104"
kind: build
phase: improbability-drive
slice: Marvin
title: "Detect stalls, crashes, and build failures"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["096"]
files: ["packages/orchestrator/src/sensors.ts", "packages/orchestrator/test/sensors.test.ts"]
requirements: ["HH-MARVIN-01"]
review_checkpoint_embedded: false
---

# 104. Detect stalls, crashes, and build failures

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

Classify a run's event stream. No JSON event for 120 seconds is a stall. A non-zero exit is a crash. A line that matches a test failure or a TypeScript error is a build failure. The classifier is pure. Time is injected.

## Why this prompt exists

The watchdog that guesses from vibes will restart healthy long jobs. The one that only watches the exit code will sit forever on a hung stream.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.2
- packages/orchestrator/src/runner.ts

## Files to create or change

- packages/orchestrator/src/sensors.ts
- packages/orchestrator/test/sensors.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

SensorEvent is `{ t: number, kind: 'json' | 'exit' | 'log', text?: string, code?: number }`. classify(events, now) returns ok, stall, crash, or build-failed. Stall if the last json event is older than 120_000 ms and there is no exit. Exit code 0 with no build pattern is ok. Exit non-zero is crash unless a build pattern appeared, in which case build-failed wins because it is more specific. Patterns: `error TS`, `FAIL`, `AssertionError`. Do not match the word `failed` inside `failed to parse` as build-failed if you can avoid it. Prefer the three patterns.

## Interfaces and data shapes

```ts
export type SensorVerdict = "ok" | "stall" | "crash" | "build-failed";
export function classifyRun(events: Array<{ t: number; kind: string; text?: string; code?: number }>, now: number): SensorVerdict;
```

## Steps

1. Implement classifyRun. Test a json event at t=0 and now=119000 returns ok.

2. now=121000 with no exit returns stall.

3. An exit 1 without a pattern returns crash.

4. A log `error TS2322` then exit 1 returns build-failed.

5. Exit 0 returns ok even if the last json is old, because the run finished.

6. Empty events at now 0 return ok. Empty events at now 120001 return stall.

7. Do not start a timer in the test. Pass now.

8. Export classifyRun.

## Edge cases

- Negative now throws.
- Events out of order are sorted by t before the check.
- The pattern match is case-sensitive for `FAIL` so a sentence `fail the vibe check` does not trip. Document that.

## Acceptance criteria

- [ ] The 120 second stall boundary is tested on both sides.
- [ ] Build errors outrank a generic crash.
- [ ] A finished exit 0 is ok.

## must_haves

truths:

- Stalls are detected from the event clock.
- The classifier does not spawn processes.

artifacts:

- packages/orchestrator/src/sensors.ts

key_links:

- Events are the streaming-json records the runner will collect later.

prohibitions:

- Do not sleep 120 seconds in the test.
- Do not kill a process in this prompt.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/104.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): classify stalls and build failures
```


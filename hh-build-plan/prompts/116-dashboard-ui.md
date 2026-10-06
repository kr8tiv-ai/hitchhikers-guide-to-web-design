---
id: "116"
kind: build
phase: improbability-drive
slice: Eddie
title: "Render the local drive dashboard"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["114", "030", "010", "034"]
files: ["packages/app/src/dashboard.ts", "packages/app/src/dashboard.css", "packages/app/test/dashboard.test.ts"]
requirements: ["HH-DRIVE-08"]
review_checkpoint_embedded: false
---

# 116. Render the local drive dashboard

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

Render the /hh-dashboard route (served by 034, styled by 010) with: phase and slice progress, the prompt queue with status (queued, running, review, fixing, passed, escalated, paused), model and effort used, duration, Imagine spend and API-mode measured cost (a slot that 118, which runs right after this prompt, fills), the live session stream (tail of streaming-json), the last screenshots at 375 and 1440 per review, Zaphod verdicts with links to reviews/NNN-REVIEW.md, Marvin's watchdog log, the Lighthouse trend, open escalations with one-click answers, and buttons Pause, Approve, Elevate, Deploy (each routed through the existing approval gates). Heading: "Drive". It is not xAI's grok dashboard.

## Why this prompt exists

The user needs to see whether the queue is paused. A terminal-only status will be missed, and cloning the vendor dashboard would confuse two products.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 4 and 14
- packages/orchestrator/src/queue-file.ts
- packages/app/src/shell.css

## Files to create or change

- packages/app/src/dashboard.ts
- packages/app/src/dashboard.css
- packages/app/test/dashboard.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderDashboard(queue) returns HTML. Each row has data-id and data-status. Pause is a button `Pause`. Do not include a Start button that would launch grok. Status colors use the shell ink and a single green only if contrast passes. No indigo, no gradient, no three marketing cards. Empty queue copy is `No drive queued.` The test checks structure, the absent Start label, and banned classes.

## Interfaces and data shapes

```ts
export function renderDashboard(queue: { items: Array<{ id: string; kind: string; status: string }> }): string;
```

## Steps

1. Render rows in order. Escape ids.

2. Include the pause button once, not per row, so the user pauses the drive rather than a single historical row. The button has data-action=pause.

3. Assert `grok dashboard` does not appear. The heading is Drive.

4. Assert no exclamation marks and no indigo class.

5. Empty items render the empty sentence and still render Pause as disabled via aria-disabled.

6. CSS uses the shell variables and a max-width so 375 does not overflow horizontally. No fixed 1440 width.

7. Do not fetch.

8. Export renderDashboard.

## Edge cases

- Unknown status throws.
- More than 200 rows throws so a bug cannot dump an unbounded page. The caller can paginate later.

## Acceptance criteria

- [ ] Rows show id and status.
- [ ] There is no Start control.
- [ ] Empty and banned-pattern tests pass.
- [ ] 375 and 1440 screenshots match the 010 comps; no default-looking table.

## must_haves

truths:

- The dashboard reads a queue object and does not launch work.
- It is visually the Guide's desk, not a default admin theme.

artifacts:

- packages/app/src/dashboard.ts

key_links:

- The queue shape matches QueueFile.

prohibitions:

- Do not add a button that starts grok.
- Do not use a purple gradient.
- Do not call this the grok dashboard.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/116.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): render the drive dashboard
```

---
id: "168"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Map links, compact footer, and trimmed transcript"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["167"]
files: ["packages/app/src/server/routes.ts", "packages/app/src/server/card.ts", "packages/app/src/client/desk.ts", "packages/app/test/"]
review_checkpoint_embedded: false
---

# 168. Map links, compact footer, and trimmed transcript

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

Additional rules for this session only:

- The desk keeps its cream editorial look. No new palette, no gradients, no exclamation marks in copy.
- Every UI change ships with a test against rendered HTML (or the route response), plus a note on 375 and 1440 widths. If no browser is available, say so; do not claim a visual pass.

## Goal

Map phases become links (Desk, Brand, Approvals, Drive) with `aria-current="step"` on the current one. Under 720px the map collapses to `Don't Panic · 2/22` with a disclosure. The footer line becomes the next action only (`Saved · DP-0.2 · 20 left`). The transcript keeps the last three turns behind an `Earlier` disclosure, and previous answers get an Edit action.

## Why this prompt exists

The map is decoration, the footer repeats status, and a long transcript buries the current question.

## Read first

- hh-build-plan/CONTEXT-PACKAGE.v2.md
- DECISIONS.md and context/matt-answers.md (authority)
- packages/app/src/server/routes.ts, packages/app/src/server/card.ts, packages/app/src/client/desk.ts
- packages/app/src/design/ (tokens, type, components)
- the existing app tests under packages/app/test/

## Files to create or change

- `packages/app/src/server/routes.ts`
- `packages/app/src/server/card.ts`
- `packages/app/src/client/desk.ts`
- `packages/app/test/`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No new routes.
- Edit reuses the existing answer save path; no new storage.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Audit each item; skip what exists.
3. Implement in the shared layout and desk client.
4. Tests: map links have the right hrefs and exactly one aria-current=step; compact map markup present; footer text matches the pattern; transcript with five turns renders three plus an Earlier disclosure; Edit appears on prior answers.
5. Run verification.

## Acceptance criteria

- [ ] Each map phase is a link and exactly one has aria-current="step".
- [ ] Under 720px the map shows a compact count with a disclosure.
- [ ] The footer shows the next action only.
- [ ] Only the last three turns show by default; the rest sit behind Earlier.
- [ ] Previous answers have an Edit action.

## must_haves

truths:

- Each map phase is a link and exactly one has aria-current="step".
- Under 720px the map shows a compact count with a disclosure.
- The footer shows the next action only.
- Only the last three turns show by default; the rest sit behind Earlier.
- Previous answers have an Edit action.

artifacts:

- app tests for map, footer, and transcript

key_links:

- Map hrefs point at routes that exist in routes.ts.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/app test
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/168.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(app): linked map, next-action footer, and trimmed transcript
```

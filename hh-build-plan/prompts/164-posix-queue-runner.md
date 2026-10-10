---
id: "164"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Add a macOS and Linux runner for the build queue"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["159"]
files: [".hh-driver/run-build.mjs", ".hh-driver/README.md", "packages/qa/test/driver-runner.test.ts"]
review_checkpoint_embedded: false
---

# 164. Add a macOS and Linux runner for the build queue

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

- Do NOT modify .hh-driver/run-build.ps1 or its behavior.
- Node built-ins only. Use node:path, node:os, node:child_process. No new dependencies.

## Goal

Add a Node runner (.hh-driver/run-build.mjs) that mirrors run-build.ps1 on macOS and Linux: runs hh-build-plan/prompts/NNN-*.md in order, each in a fresh `grok -p ... -m <model> --effort <effort>` session, parses id/kind/effort from front matter with the same rules, requires exactly one new commit and a clean tree per prompt, pushes to origin main only after checkpoint and once-over kinds, resumes from .hh-driver/STATE.json last_done, honors BLOCKED.md and a pause file, and keeps a single-instance lock. Document it in .hh-driver/README.md.

## Why this prompt exists

The queue runner is PowerShell only, so non-Windows contributors cannot run the plan.

## Read first

- .hh-driver/run-build.ps1 (read all of it, mirror its rules)
- .hh-driver/ contents and STATE.json shape
- hh-build-plan/prompts/158 and 159 front matter

## Files to create or change

- `.hh-driver/run-build.mjs`
- `.hh-driver/README.md`
- `packages/qa/test/driver-runner.test.ts`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No change to run-build.ps1.
- No change to STATE.json shape.
- Do not launch the runner in this session.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Read run-build.ps1 end to end and list its behaviors.
3. Implement run-build.mjs with the same state and log files. Export pure helpers (parseFrontMatter, readPrompt, nextPrompts, shouldPush) so tests need no grok.
4. Tests on the pure helpers against real prompt files: front matter regex results equal what the ps1 regexes give for 157, 158, 159; shouldPush true only for checkpoint and once-over; resume picks last_done + 1.
5. Write the README section. Run verification.

## Acceptance criteria

- [ ] The pure helpers parse id, kind, effort and commit message like run-build.ps1.
- [ ] Push happens only for checkpoint and once-over kinds.
- [ ] Resume starts at last_done + 1.
- [ ] run-build.ps1 is byte-identical to before.

## must_haves

truths:

- The pure helpers parse id, kind, effort and commit message like run-build.ps1.
- Push happens only for checkpoint and once-over kinds.
- Resume starts at last_done + 1.
- run-build.ps1 is byte-identical to before.

artifacts:

- .hh-driver/run-build.mjs
- .hh-driver/README.md
- packages/qa/test/driver-runner.test.ts

key_links:

- README names both runners and when to use each.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm --filter @hitchhiker/qa test
git diff --exit-code -- .hh-driver/run-build.ps1
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/164.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(driver): add a node runner for macOS and Linux
```

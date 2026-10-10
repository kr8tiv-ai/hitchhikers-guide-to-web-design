---
id: "162"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Print the real command table for unknown hh subcommands"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["160"]
files: ["packages/cli/src/main.ts", "packages/cli/src/commands-table.ts", "packages/cli/test/unknown-command.test.ts"]
review_checkpoint_embedded: false
---

# 162. Print the real command table for unknown hh subcommands

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

- Exit code 2 for an unknown subcommand. Never run doctor as a side effect.

## Goal

An unknown subcommand (`hh drive`, `hh dont-panic`) currently falls through to the doctor usage string. Print the real command table instead: implemented commands (install, app, assets, tools, mostly-harmless, elevate, progress, pause, resume, doctor) versus skill-only slash commands (those that exist only as slash commands in the Grok plugin skills), then exit with code 2. Do not run doctor.

## Why this prompt exists

Typing a slash-command name in the shell gives a doctor-flavored error that hides which commands exist.

## Read first

- DECISIONS.md and context/matt-answers.md (authority)
- README.md
- package.json (root) and packages/cli/package.json
- packages/cli/src/main.ts and packages/cli/test/
- packages/grok-plugin/ (skills and slash command names)

## Files to create or change

- `packages/cli/src/main.ts`
- `packages/cli/src/commands-table.ts`
- `packages/cli/test/unknown-command.test.ts`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No new implemented commands.
- No change to the behavior of existing commands, including bare `hh` and `hh --help`.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Read main.ts dispatch and derive the skill-only list from packages/grok-plugin rather than hardcoding a guess.
3. Add commands-table.ts exporting the table renderer; wire the unknown-command branch to print it to stderr and exit 2.
4. Tests: unknown name exits 2, output lists every implemented command and at least one skill-only name, output does not contain doctor report lines, and hh doctor still works.
5. Run verification.

## Acceptance criteria

- [ ] `hh drive` and `hh dont-panic` exit 2.
- [ ] The output lists the ten implemented commands and the skill-only slash commands.
- [ ] Doctor does not run on an unknown subcommand.
- [ ] Known commands behave as before.

## must_haves

truths:

- `hh drive` and `hh dont-panic` exit 2.
- The output lists the ten implemented commands and the skill-only slash commands.
- Doctor does not run on an unknown subcommand.
- Known commands behave as before.

artifacts:

- packages/cli/src/commands-table.ts
- packages/cli/test/unknown-command.test.ts

key_links:

- Implemented list matches the dispatch table in main.ts.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/cli test
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/162.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
fix(cli): print the command table for unknown subcommands
```

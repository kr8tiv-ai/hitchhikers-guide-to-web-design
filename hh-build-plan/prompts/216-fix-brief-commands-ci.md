---
id: "216"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Sync grok-plugin COMMANDS with the new hh brief CLI subcommand so CI is green"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["215"]
files: ["packages/grok-plugin/src/commands.ts", "packages/grok-plugin/skills/", "packages/grok-plugin/test/commands.test.ts", "packages/cli/src/main.ts", "packages/cli/src/commands/brief.ts", "packages/cli/src/commands-table.ts"]
review_checkpoint_embedded: false
---

# 216. Sync grok-plugin COMMANDS with the new hh brief CLI subcommand so CI is green
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

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.
- Do not edit run-build.ps1, the driver, `STATE.json`, `.hh-driver/`, or `hh-build-plan/`. Work on `main`. Do not stash.

## Goal

Main is red in the CI workflow on tip `f65d841e` (prompt 215) and on `a602cd0c` (BUG-003). The grok-plugin unit test `packages/grok-plugin/test/commands.test.ts:241` "COMMANDS matches the hh CLI subcommands" fails on ubuntu-latest, macos-latest, and windows-latest. It is deterministic, not a flake. Prompt 215's BUG-027 commit `40c88881` added `hh brief` to the CLI (`packages/cli/src/main.ts` case `"brief"`, `packages/cli/src/commands/brief.ts`, `packages/cli/src/commands-table.ts`) but did not add a matching entry to `COMMANDS` in `packages/grok-plugin/src/commands.ts`. Find the real gap and close it so the test passes on every OS with every assertion intact, and the plugin still installs a coherent skill set for `brief`.

## Known failures

1. 2026-10-13, CI run 38359691800 on f65d841e (all three OSes): `not ok 4 - COMMANDS matches the hh CLI subcommands` at commands.test.ts:245. Expected (from `cliSubcommandsFromSource` on `packages/cli/src/main.ts`) includes `'brief'` between `'assets'` and `'context'`. Actual (from `COMMANDS.map(...).sort()`) has no `'brief'`.
2. 2026-10-13, CI run 38359477380 on a602cd0c: the same failure on all three OSes. Audit green on both commits. E2E still running at the time this prompt was queued; do not treat a later E2E result as a reason to skip this CI fix.
3. Commit 24df65f5 (prompt 214) was fully green for CI/E2E/Audit, so the break landed with the brief CLI work from 215.

## Read first

- `packages/grok-plugin/src/commands.ts` (`COMMANDS`, `SKILL_NAMES`, `cliSubcommandsFromSource`)
- `packages/grok-plugin/test/commands.test.ts` (especially "COMMANDS matches the hh CLI subcommands" and "skill directories are the 22 commands plus the guide persona")
- `packages/cli/src/main.ts` (the `"brief"` case) and `packages/cli/src/commands/brief.ts`
- `packages/cli/src/commands-table.ts`
- An existing short skill such as `packages/grok-plugin/skills/hh-next/SKILL.md` or `hh-save/SKILL.md` as the template if a new skill is required
- `git show 40c88881 --stat` and the brief desk/engine files it added
- `.hh-driver/FLAKES.md` if present
- `gh run view 38359691800 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. Run `pnpm --filter @hitchhiker/grok-plugin test` and confirm the COMMANDS mismatch. If a later commit already turned this test green, prove it with the run id, change nothing else, and finish.
2. Diff the sorted CLI subcommands against `COMMANDS`. Confirm `'brief'` is the only missing name (or list every missing name with evidence).
3. Fix the root cause in the product: add `brief` to `COMMANDS` with the same shape as its peers (`name`, `cli`, `skillDir`, `sideEffect`). Prefer a real `hh-brief` skill that tells Grok how to run `hh brief` (mirror the tone and frontmatter of an existing skill, anti-slop, no banned words, no exclamation marks). If and only if product docs or Matt's answers say `brief` should be skill-less like `install`/`tools`/`improve`, use `skillDir: ""` and extend the empty-skill allowlist in the test with an equally strict reason in the commit body. Do not drop or rename other commands to make the lists match.
4. Update any derived lists (`SKILL_NAMES`, skill-directory count assertions, install copies) so every existing assertion still holds and stays at least as strict. If the "22 commands plus the guide persona" count changes because you added a skill, update that assertion to the new exact count and name the new skill in the commit body.
5. Run `pnpm --filter @hitchhiker/grok-plugin test` twice and `pnpm -r test` once with 0 failures. Also run the CLI brief unit tests (`packages/cli/test/brief-027.test.ts` and unknown-command) so the CLI side still passes.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not skip, delete, loosen, or rewrite the COMMANDS-vs-CLI assertion (no `test.skip`, no slicing the expected list, no ignoring `brief`).
- Do not change brief desk/engine behavior from BUG-027 except where a skill doc must accurately describe the existing CLI.
- No new dependencies. No change to run-build.ps1, the queue runner, or the CI workflow files.
- Do not restyle anything. Do not start the next prompt.
- Do not touch the owner's test desk (`C:\Users\lucid\hh-desk-test`, port 62828, or 4173).

## Acceptance criteria

- [ ] The root cause is named with evidence from step 2.
- [ ] `COMMANDS matches the hh CLI subcommands` passes on Windows (and by list equality, on Linux and macOS), with every original assertion intact.
- [ ] `brief` is a first-class grok-plugin command (COMMANDS entry plus skill, or documented empty skillDir with allowlist update).
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- Sorted `COMMANDS` cli names equal the subcommands parsed from `packages/cli/src/main.ts`, including `brief`.
- Installing the plugin still copies every skill and the deny hook.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows.

artifacts:

- The COMMANDS (and skill, if required) fix
- Root-cause notes in the commit body

key_links:

- The plugin command table and the CLI switch stay in lockstep whenever a new `hh` subcommand ships.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm --filter @hitchhiker/grok-plugin test
pnpm --filter @hitchhiker/cli test
pnpm -r test
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/216.md` if that directory exists. Name the root cause with evidence, the files changed, the tests run, and anything assumed.

## Commit

```
fix(grok-plugin): add brief to COMMANDS so CI matches the hh CLI
```

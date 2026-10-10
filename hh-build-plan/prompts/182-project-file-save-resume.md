---
id: "182"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Save every project to a portable project file and resume it from any AI"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["181"]
files: ["packages/engine/src/", "packages/engine/test/", "packages/cli/src/", "packages/cli/test/", "packages/app/src/", "packages/app/test/", "packages/app/e2e/", "packages/orchestrator/src/", ".hh-driver/", "README.md"]
review_checkpoint_embedded: false
---

# 182. Save every project to a portable project file and resume it from any AI
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

## Goal

A user on a long build must never lose progress and must never be locked to one AI. Every project saves itself into one portable, human-readable project file on the user's desktop. Later the user resumes from that file alone, with the same AI or a different one (Grok Build or any other coding agent). This is mandatory and top priority for long builds.

## Why this prompt exists

Save and resume exist only in pieces today, and none of them travels. Verified by read-only inspection at queue time (commit 9e1d11b):

- Project state lives in `<projectDir>/.hitchhiker/`. `packages/engine/src/state.ts` reads and writes `.hitchhiker/STATE.md` (`loadState`, `saveState`, `GuideState`: phase, slice, promptId, lastGoodCommit, blockers, nextAction, updatedAt). It accepts the short heading document and the scaffolded GSD template (`packages/engine/templates/gsd/state.md`).
- `packages/engine/src/lock.ts` has `withStateLock` (`.hitchhiker/STATE.md.lock`, JSON `{pid, acquiredAt}`, exclusive create, stale steal after 30s only when the pid is dead, legacy `state.lock` handling) and `replaceViaTemp` (temp file in the same directory, then rename). There is no backup of the previous version and no fsync.
- `.hitchhiker/interview.json` holds answers (`{id, status, value}`, status ANSWERED, SUGGESTED, SKIPPED, SOFT, IMPORTED). It is read in `packages/engine/src/interview.ts`, `guide/live-turn.ts`, `guide/suggest.ts`, `brand/live/schemas.ts`, and `packages/app/src/server/routes.ts`. It has no schema version.
- Other state files already on disk: `BRAND.md`, `SITE-BRIEF.md`, `brand-approval.json`, `brand/brand-kit.json`, `queue.json` (drive queue, `packages/engine/src/queue-file.ts`, re-exported by orchestrator), `gallery-walk.json`, `facts.json`, `config.json` (settings), the STT quote file, `uploads/`, `references/`, `deploy/DEPLOYS.md`.
- A file named `PROJECT.md` is not written or read by any code today. Do not assume it exists.
- CLI (`packages/cli/src/main.ts`, `commands-table.ts`): `hh progress --project <dir>`, `hh pause --project <dir> --message <text>`, `hh resume --project <dir>`. `hh resume` today only prints `resume: <promptId>`. `hh pause` only rewrites Next action. `hh app --project <dir>` (`commands/app.ts`) serves the desk for one project dir, default the current directory. There is no `hh save`, no project file, no list of projects, no Resume screen, and no RESUME.md.
- `packages/orchestrator/src/progress.ts` `advance` records a finished drive prompt in `queue.json` and `STATE.md` inside one `withStateLock`. The drive-queue pause lives in `drive.ts`.
- The build driver (`.hh-driver/run-build.mjs` and `run-build.ps1`) keeps its own `STATE.json` with `last_done`, `last_commit`, `last_push`; the next prompt is `last_done + 1`, and `--start-at` overrides. That file is the driver's, not the app's.

## Read first

- The files listed above, plus `packages/app/src/server/routes.ts` (answer, approval, and settings handlers), `packages/app/src/server/settings.ts`, `packages/app/src/server/drive.ts`, and the desk's first screen under `packages/app/src/`
- `.hh-driver/README.md` and `run-build.mjs` (`resumeFrom`), read only
- `DECISIONS.md` and `context/matt-answers.md`
- `packages/engine/test/lock.test.ts`, `state.test.ts`, `interview-e2e.test.ts`, and `packages/cli/test/progress.test.ts` for the test style
- `packages/app/src/design/` for the screen language

## Files to create or change

- `packages/engine/src/project-file/`: schema (versioned), `save`, `load`, `migrate`, `resume-md`, `resume-prompt`, `locate` (default location and recent-projects index). Export from the engine index.
- `packages/engine/src/lock.ts`: extend only as needed for the project-file lock and the backup rotation. Do not change existing behavior or tests.
- `packages/cli/src/`: `hh save`, and `hh resume <project>` upgraded from print-only to a real restore. Keep `hh resume --project <dir>` working. Add both to the command table and the grok-plugin skill text where one exists (`hh-resume`, add `hh-save`).
- `packages/app/src/server/` and `packages/app/src/`: autosave hooks, Save button, saved indicator, Resume list, Open project file.
- `packages/orchestrator/src/progress.ts` and `.hh-driver/` (read-only contract): the driver restart point comes from the project file, see item 6. Do not edit `run-build.ps1`. If the driver needs a change, write the proposal in the summary and stop short of editing it.
- Tests and e2e as listed under Verification.
- README: one short section on save and resume, only if 181 has landed its README, matching its voice.

## What to build

1. Autosave and explicit save.
   - Autosave runs after every interview answer, every approval (brief, brand, PRD, prompt package, Elevate, Hostinger yes), and every completed build prompt (`advance`). Debounce bursts but never skip the last write. A failed autosave shows a plain notice on the desk and never blocks the user's answer.
   - An explicit Save button on the desk, plus `hh save [--project <dir>] [--to <path>]` and `hh resume <project>`, where `<project>` is a path to a `.hhproject` file or folder, or a name from the Resume list.
2. The project file. One single portable, human-readable, versioned artifact. Pick one format and justify it in the summary: a pretty-printed JSON file `<Project Name>.hhproject`, or a folder `<Project Name>.hhproject/` with `manifest.json` plus plain files. If zipped, use a dependency already in the repo or `node:zlib` only; no new dependency without the registry check in the RULES. It contains:
   - `schemaVersion`, `createdAt`, `savedAt`, `app` name and version, `projectId`, `projectName`.
   - Interview answers with status, and assumptions kept marked as assumptions.
   - The approved brief, brand, PRD, and prompt package, with each approval flag and time.
   - Build queue position: the queue items with status and `last_done` (the highest finished prompt id), the current prompt, and blockers.
   - Git refs: branch, `HEAD` commit, last good commit, and remote url only if already configured. Read with `git` through `node:child_process` without a shell string; absence of git is not an error.
   - Settings from `config.json` and the voice choice. Never secrets: an allow-list of keys, plus a scrubber that drops any key or value matching the repo's secret patterns (see `SECRET_PATTERN` in `packages/orchestrator/src/progress.ts`) and any API key, token, password, cookie, or `.env` content. Uploaded files and references are listed by name and hash; copied into the project folder form only when the user chose a folder.
   - `RESUME.md`, embedded in the file or beside it, in plain language for any AI agent: what the project is, who it is for, what is done, what is next (exact question or build step), how to run it (`pnpm install`, `pnpm exec hh app --project <dir>`, `pnpm exec hh resume <file>`), the rules that apply (the approval gates, anti-slop rules, no secrets, no push without the owner, Windows paths with spaces), and where the full state lives. No jargon the reader must guess.
   - A copy-paste resume prompt (`RESUME-PROMPT.txt`, also shown on the desk with a Copy button): a short text that tells another agent to read `RESUME.md` first, name the file path, say what to do next, and state the rules. It must work for Grok Build and for any other coding agent, with no vendor wording.
3. Default location, cross-platform, never hardcoded. Default `path.join(os.homedir(), "Desktop", `${safeName}.hhproject`)`. Resolve the Desktop folder with `node:os` and `node:path` only; if `~/Desktop` does not exist (or is not writable), fall back to `os.homedir()` and tell the user where it went. Sanitize the name for Windows, macOS, and Linux (reserved names such as CON, trailing dots and spaces, separators, length). Paths with spaces, non-ASCII, and OneDrive-redirected Desktops must work. The user can choose another place; the choice is remembered.
4. Resume from the file alone.
   - `hh resume <file>` and the desk's Open project file rebuild `.hitchhiker/` (or point at the live one when it is newer, see below) and restore the desk to the exact interview question or build step. It verifies git refs and reports a mismatch plainly (for example, the repo is on another branch) without changing the user's tree.
   - If the live project is newer than the file, ask which wins and default to the newer; never overwrite silently.
   - Resuming never skips an approval gate and never marks an unapproved item approved.
5. Crash safety.
   - Atomic write: temp file in the same directory, flush to disk, then rename. Reuse `replaceViaTemp` and extend it to flush.
   - Keep the previous version as `<name>.hhproject.bak` (and one older rotation) before each replace.
   - A corrupted or truncated file: `load` validates, then falls back to `.bak`, then to the live `.hitchhiker/`, and tells the user which source it used. It never deletes the bad file; it moves it to `<name>.corrupt-<timestamp>`.
   - Lock handling for a second window: a project-file lock beside the file with pid and time, reusing the stale-lock rules in `lock.ts`. A second window opens read-only with a plain message, or waits briefly then retries. A dead holder is taken over after the stale window.
   - `schemaVersion` with a migration chain: `migrate(file, from, to)`, one step per version, tested with a fixture of version 0 or 1. A file from a newer app version opens read-only with a clear message and is never rewritten downgraded.
6. Build driver restart. The project file records `last_done` and the queue. The orchestrator offers `restartPointFromProjectFile(file)` returning the next prompt id (`last_done + 1`) and the CLI shows it, so `hh elevate` or the drive can restart from `last_done`. This must agree with `.hh-driver/STATE.json` semantics. A test proves agreement. Do not touch `.hh-driver/STATE.json` or the driver.
7. The desk.
   - A quiet status line on every desk screen: `Saved · <time> · <location>`, with the full path on hover and a Copy path action. A failure reads `Not saved · <reason>`.
   - First screen: a Resume a project list (project name, last saved time, progress such as `question 12 of 40` or `prompt 7 of 20`, location) from the recent-projects index, a stale or missing entry shown as missing with a Remove action (the file is never deleted by Remove), and an Open project file button (a native-free path input plus the platform file dialog only if one already exists in the repo).
   - Copy: no exclamation marks, no banned words, Don't Panic voice. Use the Guide design system; the screen must look finished.
8. No cloud sync, no network calls in this feature.

## Non-goals

- No cloud sync, accounts, or remote storage.
- No weakening of any approval gate (brief approval, prompt approval, Elevate, Hostinger yes). Resume restores gates as they were.
- No secrets, API keys, tokens, or `.env` content in the project file, RESUME.md, the resume prompt, logs, or fixtures.
- Do not edit `run-build.ps1`, `.hh-driver/STATE.json`, or the driver. Do not change the meaning of `.hitchhiker/STATE.md` for existing readers.
- Do not restyle the app. Do not add dependencies without the RULES check.
- Do not start the next prompt.

## Steps

1. Verify first. Re-run the read of the files under "Why this prompt exists". If any of save, resume, project file, RESUME.md, or a Resume list already exists (an earlier prompt may have added one), do not rebuild it: extend it, and record "already fixed: <evidence>" in the summary. If a doc disagrees with this prompt, stop and write the conflict in the summary.
2. Define the schema and the secret allow-list first, with tests.
3. Build save, load, migrate, recovery, and the lock.
4. Wire autosave hooks, then the CLI, then the desk.
5. Write RESUME.md and the resume prompt generators with snapshot tests against fixtures that contain no secrets.
6. Run every verification on Windows, including a path with spaces.

## Acceptance criteria

- [ ] Autosave fires after an answer, an approval, and a completed build prompt. The Save button, `hh save`, and `hh resume <project>` work.
- [ ] One versioned, human-readable project file holds everything listed, with RESUME.md and the copy-paste resume prompt.
- [ ] `hh resume` restores the exact question or build step from the file alone. A second AI can continue from RESUME.md and the resume prompt.
- [ ] Atomic writes, a backup, corrupted-file recovery, a second-window lock, and a schema migration all have passing tests.
- [ ] The desk shows `Saved · time · location`, the Resume list, and Open project file, and the e2e proves them.
- [ ] The restart point from the project file equals the driver's `last_done + 1` rule.
- [ ] No secret appears in any generated file, and a test proves it with a planted key.

## must_haves

truths:

- Every answer, approval, and completed build prompt is saved to the project file without the user pressing anything.
- The project file is the single portable source: it alone is enough to resume, with the same AI or another.
- RESUME.md and the resume prompt name the project, what is done, what is next, how to run it, and the rules, in plain language.
- A killed process, a half-written file, or a corrupted file never loses more than the last unsaved step, and the previous version survives.
- The default location is the user's Desktop through `node:os` and `node:path`, with a fallback and no hardcoded path.
- Secrets never enter the file.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows, and the e2e passes.

artifacts:

- `packages/engine/src/project-file/` with schema, save, load, migrate, locate, RESUME.md and resume-prompt generators
- `hh save` and an upgraded `hh resume <project>`
- Desk saved indicator, Save button, Resume list, Open project file
- Tests and e2e listed under Verification
- Summary naming the chosen format and why

key_links:

- Autosave hooks call the same `saveProjectFile` that `hh save` and the Save button call.
- `restartPointFromProjectFile` agrees with `.hh-driver` `last_done + 1`.
- The Resume list reads the same recent-projects index that `hh resume <name>` reads.
- The command table, the grok-plugin skills, and the README list `save` and `resume` the same way.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not add cloud sync or any network call.
- Do not edit run-build.ps1 or the driver STATE.json.
- Do not start the next prompt.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test resume-list
```

Tests that must exist and pass:

- Save, kill, resume roundtrip: spawn a child that saves mid-write and is killed, then `hh resume` restores the exact question or build step.
- Corrupted file recovery: truncated JSON falls back to `.bak`, then to live state, and the bad file is kept as `.corrupt-<timestamp>`.
- Windows path with spaces, non-ASCII, and a reserved name (the Windows cases run on win32, and the sanitizer is unit-tested on every platform).
- No secrets in the file: a planted `sk-`, `xai-`, bearer token, and `.env` line never appear in the project file, RESUME.md, or the resume prompt.
- Schema migration from an older fixture, and a newer-version file opening read-only.
- Second-window lock, and stale-lock takeover.
- Autosave after an answer, an approval, and a completed build prompt.
- Restart point equals `last_done + 1`.
- E2E for the Resume list: the first screen lists a saved project, Open project file restores the exact question, a missing file shows as missing, and the `Saved · time · location` line appears.

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/182.md` if that directory exists. The summary names the chosen format, what already existed and was extended, the tests run, the Windows path check, and anything assumed or left for the owner.

## Commit

```
feat(app): save every project to a portable project file and resume it from any AI
```
---
id: "184"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Install missing tools from the desk and refresh when done"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["183"]
files: ["packages/engine/src/", "packages/engine/test/", "packages/cli/src/", "packages/cli/test/", "packages/app/src/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 184. Install missing tools from the desk and refresh when done
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
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network.


## Goal

When a tool is missing (Grok CLI, Playwright browsers, whisper, pdftotext), the desk shows an Install button next to it. The user confirms exactly what will run, watches streamed progress, and can cancel. When the install finishes, the desk records the result in saved settings and the project file, re-runs the doctor check, and refreshes the UI so the feature works without a restart.

## Why this prompt exists

Today the desk and `hh doctor` only report what is missing. Verified by read-only inspection at queue time:

- `packages/cli/src/doctor.ts` holds the one probe module. `probePathTools(runner)` checks `grok`, `playwright`, `whisper`, and `pdftotext` through an injected `CommandRunner` (`run(command, args)`, no shell, 10 s timeout). `deskPreflight(runner)` returns `{ grokOk, probes: [{ name, ok, detail }] }`. Missing tools read `grok: not on PATH` or `<tool>: not installed`. `PATH_PROBE_NAMES` and `OPTIONAL_TOOLS` define the four names. `hh doctor` prints the same lines through `formatDoctor`.
- Prompt 165 put that report on the desk first run (`packages/app/src/server/routes.ts`, `server/card.ts` `DeskPreflight`, `packages/app/test/preflight-desk.test.ts`). The report is read-only text. grok missing means no Ready text. Reuse the probe functions; do not fork the probe logic.
- Nothing installs anything. There is no install recipe, no install route, no progress stream, and no record of an install. The user must leave the desk, find the right command for their OS, and restart.
- Prompt 182 adds the portable project file with an allow-listed settings block and a secret scrubber. Prompt 183 is the last card change before this one. Read both as landed; if either did not land, stop and say so in the summary.
- `packages/app/src/server/settings.ts` and `config.json` hold saved settings. xAI speech-to-text is opt-in and must stay opt-in.
- An earlier rule holds: no required `pdftotext`, Homebrew, or apt. Install is an offer the user accepts, never a requirement.

## Read first

- `packages/cli/src/doctor.ts`, `session-probe.ts`, `packages/cli/test/doctor.test.ts`
- `packages/app/src/server/routes.ts`, `server/card.ts`, `server/settings.ts`, `server/drive.ts` (how long jobs stream over SSE), `client/desk.ts`, `packages/app/test/preflight-desk.test.ts`
- `packages/orchestrator/src/preflight.ts` (a different check: the drive preflight. Do not confuse the two)
- `packages/engine/src/project-file/` from 182 (allow-list, scrubber, autosave hook) and the engine `hiddenChildOptions`
- The voice and speech code that uses whisper and the Playwright opener in `packages/qa/`, read only
- `packages/app/src/design/` for button, notice, progress, and dialog styles; the 170 focus and live-region work
- `DECISIONS.md` and `context/matt-answers.md` (authority)

## Files to create or change

- `packages/engine/src/tool-install/` (new): recipe types, per-OS recipe table, plan builder (what will run, size, destination), runner with streaming and cancel, result record. Export from the engine index. If the probe module must be shared, move it through an existing package boundary and re-export from the CLI; do not add a package and do not fork it.
- `packages/cli/src/doctor.ts`: only what is needed to share probes and to print the same install hint in `hh doctor`.
- `packages/app/src/server/`: install routes (plan, run, cancel, status stream), settings record, doctor re-check, project-file hook.
- `packages/app/src/client/desk.ts`, `card.css`, `design/` (only reuse of existing tokens): Install button, confirm dialog, progress, cancel, error with copy and retry.
- Tests and e2e as listed under Verification.

## What to build

1. Recipes per OS. A recipe table keyed by tool and `process.platform` (win32, darwin, linux). Each recipe is data: ordered steps, each an argv array (never a shell string), the package manager it needs, the approximate download size, the install location, whether it needs elevation, and a manual command string for the copy box. A recipe is offered only when its package manager is found on PATH.
   - Windows: winget first, then choco, then scoop, for poppler (pdftotext). whisper and Grok CLI as below. No silent UAC: if a step needs admin, the plan says so and the user is told to run the manual command in an elevated terminal themselves.
   - macOS: brew for poppler.
   - Linux: apt only when `apt-get` is on PATH, shown as the manual command with sudo because the desk never runs sudo; other managers (dnf, pacman, zypper) may be listed as manual-only commands.
   - pdftotext: poppler through the package managers above. A recipe whose manager is absent shows the manual route and an official poppler source link, not a run button.
   - whisper: the whisper.cpp release binary for the OS and the chosen model file, downloaded only from the official `ggml-org/whisper.cpp` GitHub release assets and the official Hugging Face `ggerganov/whisper.cpp` model repository. The plan lists each file, its exact size (from the release or the model list, shown in MB), and its destination under the app data directory from `node:os` and `node:path`. Verify the SHA-256 of every download against a checksum pinned in the recipe table (record where each hash came from). A mismatch deletes the partial file and fails with the real message. Default to the smallest model that works; the user may choose another in the confirm step. If a release has no prebuilt binary for the OS, the recipe falls back to a build or package route shown as manual only.
   - Playwright browsers: `pnpm exec playwright install chromium`, run in the app workspace, size and location shown (the Playwright browsers cache). Check the install location with the Playwright CLI, not a guess.
   - Grok CLI: show the official installer or docs link and the exact official command the docs give, as a copy box and an Open docs link. The desk does not pipe a remote script into a shell. If the vendor documents only a `curl | sh` style installer, the desk shows it as manual text with the docs link and does not run it. After the install the plan tells the user to sign in themselves (`grok` login is a human step); the desk never types credentials, reads tokens, or claims signed in. Re-check shows on PATH and the auth probe result as it does today.
   - Official sources only: every URL in a recipe is on an allow-list of hosts (github.com release assets for named repositories, huggingface.co for the named repository, the package managers' own commands, the Grok and Playwright official docs). A test fails on any other host.
2. Confirm step. Install is never one click. Clicking Install opens a confirm dialog that shows: the tool, each command exactly as it will run (argv joined for display), the download size, the install location, whether admin or sudo is needed, and the source host. Two buttons: Run these steps and Cancel. Nothing runs, no process spawns, and no file downloads until Run these steps is pressed. A step that needs sudo or admin is never run by the desk; the dialog shows it as a manual command instead.
3. Run, progress, cancel. The server runs steps one at a time through an injected runner (`spawn` with `shell: false`, hidden window on Windows via `hiddenChildOptions`), streams stdout, stderr, and download bytes as SSE lines, and shows a determinate bar when size is known and a plain busy state when not. A Cancel button stops the child (kill the process tree on Windows), removes partial downloads, and reports Cancelled. Only one install per tool at a time. The progress region is `aria-live="polite"`, the bar has `role="progressbar"` with values, and focus returns to the tool row when finished.
4. Failure. Show the real error text (exit code, the last lines of stderr, or the checksum mismatch), never a generic message. Show the manual command in a read-only box with a Copy button, a Retry button, and the docs link. Failure uses the existing error style only when the step truly failed. Cancel is not a failure.
5. Record and refresh. On success the server:
   1. Saves the result in saved settings: tool, version if the probe reports one, install path, time, recipe id, and source. No secrets, no environment values, no tokens. Only allow-listed keys.
   2. Adds the same record to the project file from 182 through the same allow-list and scrubber, so a resumed project knows what was installed. A planted secret must not appear.
   3. Re-runs the doctor probe through the shared probe module, with PATH refreshed for the server process (re-read the platform PATH or add the install directory for this process, never edit the user's global PATH silently; if PATH needs a new terminal, say so in plain words only when the re-check still fails).
   4. Pushes the new preflight report to the desk over SSE and updates the row in place, the Ready state (grok only), and any feature that was disabled for the missing tool (voice with whisper, PDF reading with pdftotext, QA with Playwright), with no page reload and no restart. If the re-check still fails after a successful run, show that plainly with the likely cause and the manual command.
6. Safety and approvals. No install route runs without a request that carries the confirm token issued by the plan route for that exact plan (a plan hash and a short expiry), so a stray or replayed call cannot run anything. Install routes accept only the local origin, like the other mutating routes. The install feature never weakens an approval gate (brief approval, prompt approval, Elevate, Hostinger yes). xAI speech-to-text stays opt-in and an install of whisper does not switch it on or off.
7. Accessible UI at 375 and 1440. The Install button sits in the same row as the missing tool, labelled `Install <tool>` (accessible name includes the tool). The dialog is a real `dialog` with a focus trap, Escape cancels, focus returns to the Install button. Touch targets at least 44px at 375, no horizontal scroll, long commands wrap or scroll inside their own box, reduced motion respected, no exclamation marks, no banned words, Don't Panic voice. The cream editorial look stays; reuse existing tokens.
8. `hh doctor` prints one hint line per missing tool pointing at the desk Install button and the manual command for the current OS. No install runs from `hh doctor`.

## Non-goals

- No weakening of any approval gate. No silent sudo, admin, or UAC prompt. No `curl | sh` or any piped remote script from an unverified host. No random or user-typed URLs.
- xAI speech-to-text stays opt-in. Installing whisper does not enable it, and no install sends audio or calls a paid API.
- No new probes beyond the four tools, no new dependency without the RULES check, no restyle.
- No editing of the user's global PATH or shell profile.
- No push, no deploy. Do not edit `run-build.ps1`, the driver, or `.hh-driver/STATE.json`.
- Do not start the next prompt.

## Steps

1. Verify first. Re-read the files under "Why this prompt exists". If an install button, recipe table, or install route already exists, extend it and record "already fixed: <evidence>" per must_have. If 182 or 183 did not land, or a doc disagrees with this prompt, stop and write the conflict in the summary.
2. Define the recipe types, the per-OS table, the host allow-list, and the pinned checksums first, with unit tests that use a fake runner on every platform value.
3. Build the plan builder, the runner with streaming and cancel, and the confirm-token check.
4. Add the server routes, the settings record, the project-file hook, the re-check, and the SSE refresh.
5. Build the desk UI: button, dialog, progress, cancel, failure, retry, and the in-place refresh. Then the `hh doctor` hint lines.
6. Write the e2e with a stubbed installer (no real download, no real package manager) at 375 and 1440, then run every verification.

## Acceptance criteria

- [ ] A missing grok, playwright, whisper, or pdftotext shows an Install button next to it on the desk; a present tool shows none.
- [ ] Install opens a confirm dialog listing exact commands, size, location, admin need, and source. Nothing runs before Run these steps.
- [ ] Recipes exist for Windows, macOS, and Linux, use only listed package managers and official sources, and never run sudo or admin.
- [ ] Progress streams, Cancel stops the install and cleans partial files, and failure shows the real error, a copyable manual command, and Retry.
- [ ] Success saves the result to settings and the project file with no secrets, re-runs the doctor check, and updates the desk without a reload or restart.
- [ ] Grok CLI install gives the official link and sign-in guidance and never signs in for the user.
- [ ] Downloads are checksum-verified; a mismatch fails and removes the file.
- [ ] No test was skipped, deleted, or loosened; no approval gate changed; xAI STT stays opt-in.

## must_haves

truths:

- Every missing tool among grok, playwright, whisper, and pdftotext has an Install button in its row on the desk.
- Nothing runs, spawns, or downloads until the user presses Run these steps in a confirm dialog that shows the exact commands, size, install location, admin need, and source.
- Recipes exist per OS (Windows, macOS, Linux) and use winget, choco, scoop, brew, or apt (manual, with sudo) only when that manager is available, or official download steps.
- whisper installs from the official whisper.cpp release and model sources with the size shown and a pinned SHA-256 check; pdftotext through poppler; Playwright through `pnpm exec playwright install chromium`; Grok CLI through the official docs with sign-in left to the human.
- Progress streams, Cancel works, and a failure shows the real error, a copyable manual command, and a Retry.
- A successful install is saved to settings and the project file (no secrets), the doctor check re-runs, and the desk refreshes in place without a restart.
- No silent sudo or admin, no unverified remote script, no URL outside the allow-list.
- The UI is accessible at 375 and 1440, and xAI STT stays opt-in.

artifacts:

- `packages/engine/src/tool-install/` with recipes, plan builder, runner, and result record
- Install routes, settings and project-file record, and the doctor re-check in `packages/app/src/server/`
- Desk Install button, confirm dialog, progress, cancel, failure, and retry
- Unit tests for recipes per OS with a fake runner, the host allow-list, the checksum check, and the confirm gate
- `packages/app/e2e/install-tools.spec.ts` with a stubbed installer
- Summary naming each recipe, its source, and what is manual only

key_links:

- The doctor probes used by the desk, `hh doctor`, and the post-install re-check are the same functions.
- The install record uses the same allow-list and scrubber as the project file from 182.
- The confirm dialog shows the same argv list the runner executes, from one plan object.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not run sudo, request admin, or pipe a remote script into a shell.
- Do not turn on xAI speech-to-text.
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not edit run-build.ps1, the driver, or STATE.json.
- Do not start the next prompt.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test install-tools
```

Tests that must exist and pass:

- Recipes per OS with a fake runner: win32, darwin, and linux each produce the expected argv list, size, location, and manual command, and a recipe is dropped when its package manager is absent.
- No command runs without confirm: the plan route and a missing, wrong, replayed, or expired confirm token never call the runner; only a valid token does.
- No sudo or admin step is ever executed; it appears only as manual text.
- Host allow-list: every URL in the recipe table is on an allowed host, and a recipe with another host fails the test.
- Checksum: a matching hash passes; a mismatch deletes the file and fails with the real message.
- Cancel kills the child and removes partial files; failure shows the real stderr tail and the manual command; Retry runs a fresh plan.
- Success records the result in settings and the project file, with a planted secret never appearing, then re-runs the probe and returns the new report.
- Grok CLI: the plan contains the docs link and sign-in guidance and no run step that pipes a remote script.
- E2E at 375 and 1440 with a stubbed installer: Install appears next to each missing tool; the dialog shows commands, size, location, and source; nothing happens before Run these steps; progress streams; Cancel works; a failure shows the error, Copy, and Retry; success flips the row to installed and updates the Ready state without a reload; focus, labels, and live region work; no horizontal scroll at 375; no console errors.

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/184.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, each recipe and its source, what is manual only, files changed, tests run, and anything assumed or left for the owner.

## Commit

```
feat(app): install missing tools from the desk and refresh when done
```

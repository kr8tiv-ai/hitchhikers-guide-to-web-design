# Live bug check (Oct 9, 2026): audit the whole repo

Matt demoed `hh app` live on Windows 11 / Chrome on Oct 8-9. Several things broke on stream. This prompt is an audit, not a fix pass. You write a ranked findings report and numbered fix prompts. You change no source code.

## Read first

- `hh-build-plan/CONTEXT-PACKAGE.v2.md` (the spec), `hh-build-plan/ROADMAP.md`, `hh-build-plan/once-over/REPORT.md` and `hh-build-plan/post-159/SUMMARY.md` (what was already found and fixed).
- `hh-build-plan/live-bugcheck/ORDER.md` and every file in `hh-build-plan/live-bugcheck/prompts/` (001-005 are already written; do not duplicate them, but add evidence to the report if you find more about them).
- `packages/engine/src/boundaries.ts` (package import rules).

## Known live bugs (already have prompts 001-005)

1. `HH_CASSETTE=replay` leaked into a real `hh app` run. Every Guide turn failed with `Desk error: cassette miss: <hash>` in the log, and the desk only said "The answer did not save. Try again, or skip." and froze.
2. "It keeps starting new windows" while using the app on Windows.
3. Hold to talk did nothing (fixed in 9010874 with browser SpeechRecognition; needs a real-browser test).
4. Feature: suggest where to find great reference sites under DP-5.1.

## Audit scope

Every package: app (server, routes, client, SSE), engine (ai adapter, cassette, guide/live-turn, interview, state lock, config), cli (`hh app`, `hh doctor`, tools), orchestrator, voice, qa, deploy, grok-plugin, assets, crawler, knowledge, templates. Look for real bugs only:

- The interview flow end to end: `/api/session`, `/api/answer`, `/api/suggest`, `/api/skip`, SSE `/api/events`, what happens when a Grok turn fails, times out, or is slow, retries, double submits, a stuck `pending`, the state lock (`STATE.md.lock`) left behind after a crash or kill, and what the person sees.
- Windows: every `spawn`/`exec`/`execFile`/`fork` (`windowsHide`, `shell`, `.cmd` shims, quoting, `detached`), console windows that can appear, browser opening more than once, path separators, CRLF, `taskkill`, long paths, `EPERM`/`EBUSY` on rename.
- Error handling: errors swallowed or turned into generic text, unhandled rejections that kill the server, missing timeouts on child processes or fetches.
- Security on the local server: CSRF, path traversal on static and upload routes, host header / DNS rebinding on 127.0.0.1.
- Anything that spends money or deploys without an explicit yes.

Verify each finding by reading the code, and where cheap, by running a focused test or a tiny script (with `$env:HH_CASSETTE='replay'` only in that test shell). Never start `hh app` on a fixed port, and never touch the `.hitchhiker/` folder at the repo root (it is Matt's live session; it is untracked and must stay untracked).

## Output

1. `hh-build-plan/live-bugcheck/REPORT.md`: findings ranked by severity (blocker, high, medium, low). For each: id (F-01...), severity, file and line, what breaks, how you confirmed it, and which fix prompt covers it. Skip style nits.
2. One fix prompt per finding or tight group, numbered from `006-` upward in `hh-build-plan/live-bugcheck/prompts/`, ordered by severity (blockers first). Use the same style as 001-005: title, read first, the bug with evidence, the spec and acceptance criteria, tests to add, commands to run (`pnpm exec tsc -b`, the affected packages' tests with `$env:HH_CASSETTE='replay'`), and one conventional commit message. One job, one commit per prompt. At most 12 new prompts; fold the rest into the report as "later".
3. Append the new prompts to the sequence in `hh-build-plan/live-bugcheck/ORDER.md` with one line each on why they sit where they sit.
4. Commit once, docs only:
```
docs(live-bugcheck): ranked findings and fix prompts from the live demo audit
```
Do not push.

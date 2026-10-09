# Live fix 002. "It keeps starting new windows" on Windows

## Read first

- `packages/engine/src/ai/grok-cli.ts` (`launch`, `killTree`, around lines 435-480)
- `packages/app/src/server/open-browser.ts` and every caller of `openBrowser`
- Every other non-test `child_process` user: `packages/cli/src/commands/tools.ts`, `packages/cli/src/doctor.ts`, `packages/engine/src/exports/prd-pdf.ts`, `packages/orchestrator/src/git-flow.ts`, `packages/qa/src/elevate-loop.ts`, `packages/qa/src/lhci-run.ts`, `packages/qa/src/playwright-opener.ts`, `packages/voice/src/whisper.ts`, `packages/templates/**/optimize-media.ts`
- The ACP / session client if one exists (search for `acp`, `--session-id`, `stdio`)

## Bug

While Matt used the desk on Windows 11 (Chrome, `hh app` started from PowerShell), new windows kept appearing. Find every way the app or its children can create a visible window or a new browser tab during one `hh app` session and close each one:

- A child spawned without `windowsHide: true` (console flash per Guide turn, per git call, per taskkill, per doctor probe).
- `cmd.exe /c` wrappers for `.cmd` shims, and `detached: true` on Windows (a detached console child gets its own console window).
- `openBrowser` called more than once per process (on reconnect, on each `/` load, on a restart inside the process, from QA/playwright openers), or a Playwright `headless: false` default.
- Grok CLI children: the arguments we pass to `grok` (e.g. a sandbox or terminal mode that opens a window). Read `grok --help` output if needed; do not run `grok login`.

## Spec

1. Every non-test spawn on Windows has `windowsHide: true` and is never `detached: true` on win32 unless it is the one browser opener.
2. One shared helper (in the lowest package allowed by `packages/engine/src/boundaries.ts`, or a local helper per package if boundaries forbid sharing) builds the spawn options; a test fails if a new `spawn(` in `packages/*/src` lacks it (static scan test is fine).
3. `hh app` opens the browser at most once per process; a `--no-open` flag (or the existing one) skips it; a test injects the opener and asserts one call across several requests and an SSE reconnect.
4. Any Playwright launch outside e2e defaults to headless.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run tests for every package you touched. All exit 0.

## Commit

```
fix(windows): hide every child console and open the desk browser once
```
Do not push.

## Heavy review notes (verify each before changing code)

`hh-build-plan/live-bugcheck/heavy-review-1.md` items 2, 3 and 10:

- `open-browser.ts` spawns `cmd.exe /d /s /c start "" <url>` with `detached: true` on win32. Node's docs: a detached child on Windows gets its own console. Use no `detached` on win32, one verbatim command line (`start "" "<url>"` with `windowsVerbatimArguments: true`), only for `http://127.0.0.1` / `http://localhost` URLs, or `rundll32 url.dll,FileProtocolHandler <url>`. Heavy also claims Node drops the empty `""` title argument; check that against Node's actual quoting before relying on it.
- `grok-cli.ts` `launch` wraps `grok.cmd`/`grok.bat` in `cmd.exe /d /s /c` per Guide call (several per Answer). Prefer resolving `grok.exe` next to the shim and spawning it directly. Note: on Matt's PC `where grok` resolves `C:\Users\lucid\.grok\bin\grok.exe` (an exe), so the shim path is not the only cause there: also check what `grok` itself is asked to do per call (flags, sandbox, terminal/tool modes, MCP servers) and whether any of those can open a console.
- `packages/qa/src/playwright-opener.ts` `withChromium`: set `headless: true` explicitly.

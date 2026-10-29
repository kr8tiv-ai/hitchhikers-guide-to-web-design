# 243s — Desk Run 11: Per-Prompt `.hitchhiker/tmp` Cleanup, `ms-playwright` Confinement Allowance, and Post-Usage Background Dev Server Settlement

## Context

During Run 11 live E2E monitoring on `site-c` (`Paradise Found Run Eleven C`, prompts `033`–`103`), `site-c` progressed from `33 / 121` to `102 / 121` passed and surfaced two issues in `packages/engine/src/guide/site-build.ts` and `packages/engine/src/guide/site-confine.ts`:

1. **`BUG-111` (`S3` — Orphaned background `astro dev` / `vite` server `tool_call_update` output after final `usage` cancels `turnTimer` settlement)**:
   In `build-093.prev.log` (lines 2227–2229), the model finished its final turn and `grok.exe` emitted `{"type":"available_commands",...}` followed by `{"type":"usage",...}`, which armed `turnTimer` in `trackSettlement` (`packages/engine/src/guide/site-build.ts`). Before the 5-second `TURN_TAIL_FLOOR_MS` elapsed, an orphaned background `astro dev` server (`call-05d0208e-...-61`, started 30 turns earlier) wrote a line to stdout, causing `grok.exe` to emit `{"type":"tool_call_update","toolCallId":"call-05d0208e-...-61","status":null,...}` after `"type":"usage"` (with no new `"type":"tool_call"`). In `trackSettlement`, `feed(chunk)` unconditionally called `clearTurnTimer()`, and `hasCompletedTurnTail(buffer, sawAvailableCommands)` returned `false` because the last line of `buffer` was now `"type":"tool_call_update"` rather than `"type":"usage"`. As a result, `turnTimer` was disarmed and the prompt hung until the watchdog fired.

2. **`BUG-112` (`S2` — Unpruned `.hitchhiker/tmp` across 121 prompts contributes to `ENOSPC` and `auditOutsideAccess` flags `ms-playwright` browser binaries on Prompt `103`)**:
   - **Part (a)**: `spawnLiveBuild` (`packages/engine/src/guide/site-build.ts:530`) points child `TMP`, `TEMP`, and `TMPDIR` to `<projectDir>/.hitchhiker/tmp`, but never cleans up `<projectDir>/.hitchhiker/tmp` before or after each prompt. Over 100+ prompts (including Playwright Chromium launches and transient build artifacts), temp files inside `.hitchhiker/tmp` accumulate across the queue run.
   - **Part (b)**: On Prompt `103` (`Capture every page at 1440 and 1920 and fix any visual regressions.`), the build launched Playwright Chromium (`C:\Users\lucid\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe`) via `run_terminal_command`. `auditOutsideAccess` in `packages/engine/src/guide/site-confine.ts` flagged `C:\Users\lucid\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe` in `outsideAccess` because `insideAllowedRoots` does not allow read/execute access to Playwright browser binaries under `ms-playwright`.

## Deliverables

1. **Harden post-turn orphan background dev/preview server settlement in `packages/engine/src/guide/site-build.ts` (`BUG-111`)**:
   - Increase the `buffer` tail window in `trackSettlement` from `32_000` to `128_000` characters so large `available_commands`, `usage` (with cryptographic `signature`), and trailing background `tool_call_update` lines do not push the turn-tail markers out of the buffer.
   - Update `hasCompletedTurnTail(buffer: string, sawAvailableCommands: boolean): boolean`:
     - Split `buffer` into lines (`\r?\n`), ignore any trailing partial line when `buffer` does not end with `\n`, and trim trailing blank lines.
     - Walk backwards past any trailing lines whose parsed JSON `type` is `"tool_call_update"` (orphan background command output).
     - After skipping zero or more trailing `"tool_call_update"` lines, check whether the line immediately preceding them has `"type": "usage"` and the line before that has `"type": "available_commands"` (or `sawAvailableCommands` is `true` when that `"usage"` line is at index `0` of the buffer).
     - Note: if a new turn actually started a tool call (`"type": "tool_call"`), or emitted `"type": "text"` / `"type": "thought"` / `"type": "thinking"`, walking backwards past trailing `"tool_call_update"` lines hits `"tool_call"` (not `"usage"`), so `hasCompletedTurnTail` accurately returns `false` during active tool execution and `true` only when `"tool_call_update"` lines arrive after a final turn's `"usage"` with no new `"tool_call"`.
   - In `trackSettlement`:
     - When `hasCompletedTurnTail(buffer, sawAvailableCommands)` remains `true` on a subsequent chunk (for example, periodic stdout from an orphaned `astro dev` background process), keep the existing `turnTimer` running (do not reset its countdown on every orphan `tool_call_update` chunk) or arm it if not yet armed; only clear `turnTimer` when `hasCompletedTurnTail` becomes `false` or `endReason !== null`.
     - Ensure `handle.stop?.()` (`taskkill /pid <pid> /T /F` on Windows) is called whenever `turnTimer` or `endTimer` settles the run so any orphaned `astro dev` / `vite` / `node` background process tree is terminated immediately.

2. **Automatically prune `<projectDir>/.hitchhiker/tmp` before and after each build prompt in `packages/engine/src/guide/site-build.ts` (`BUG-112a`)**:
   - Add a helper `pruneProjectTmpDir(projectDir: string): void` in `packages/engine/src/guide/site-build.ts` that removes existing children inside `<projectDir>/.hitchhiker/tmp` (e.g. via `rmSync(entryPath, { recursive: true, force: true })` for each entry in `readdirSync(tmpDir)`, ignoring `EBUSY`/`EPERM`/`ENOENT` errors so a locked handle never crashes the runner) and ensures `<projectDir>/.hitchhiker/tmp` exists (`mkdirSync(tmpDir, { recursive: true })`).
   - Call `pruneProjectTmpDir(request.cwd)` at the start of `spawnLiveBuild` AND call `pruneProjectTmpDir(projectDir)` in `spawnPrompt` (before spawning and in `finally` after `awaitSettled` + `handle.stop?.()` complete) so `.hitchhiker/tmp` is cleaned before and after every prompt.

3. **Allow Playwright browser binaries under `ms-playwright` in `packages/engine/src/guide/site-confine.ts` (`BUG-112b`)**:
   - In `insideAllowedRoots(candidate: string, allowedRoots: readonly string[], platform: NodeJS.Platform)` in `packages/engine/src/guide/site-confine.ts`:
     - Allow paths inside a `ms-playwright` browser cache directory (`/[\\/]ms-playwright(?:[\\/]|$)/i.test(trimmed)`) when the operation is not a write (or in `auditOutsideAccess` / `insideAllowedRoots` so invoking or reading Playwright browser binaries such as `C:\Users\lucid\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, `/Users/annas/Library/Caches/ms-playwright/...`, or `/home/user/.cache/ms-playwright/...` is never flagged in `outsideAccess`, while writing to `ms-playwright` is still forbidden if `write: true`).
     - Specifically, check how `auditOutsideAccess` calls `isAllowedPath(candidate, allowedRoots, platform)` vs `hit.write`: either allow `/[\\/]ms-playwright(?:[\\/]|$)/i` in `insideAllowedRoots` (and ensure `shellWrites` does not treat running `chrome.exe` with flags or redirecting output to a project file as writing to `chrome.exe`), or exempt non-write `ms-playwright` paths in `auditOutsideAccess` / `insideAllowedRoots`.

4. **Unit tests**:
   - Add `packages/engine/test/desk-run11-243s.test.ts` covering:
     1. **`BUG-111` orphan `tool_call_update` after `usage`**: When a build prompt emits `available_commands` followed by `usage` and then emits one or more orphan background `tool_call_update` lines (with no `tool_call` after `usage`) and never emits `end`, `ensureSiteBuild` / `trackSettlement` still settles cleanly with code `0` and invokes `handle.stop()`. Also verify that when `usage` IS followed by `tool_call` and `tool_call_update` (active mid-prompt tool execution), `hasCompletedTurnTail` does NOT prematurely settle the turn while the tool is running.
     2. **`BUG-112a` `.hitchhiker/tmp` pruning**: Verify that stale files and directories placed inside `<projectDir>/.hitchhiker/tmp` before a prompt or created inside `<projectDir>/.hitchhiker/tmp` during a prompt are automatically removed when the prompt finishes, while `<projectDir>/.hitchhiker/tmp` itself remains an existing empty directory.
     3. **`BUG-112b` `ms-playwright` confinement allowance**: Verify that `auditOutsideAccess` does NOT flag `run_terminal_command` or `read_file` referencing `C:\Users\lucid\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe` or `/home/user/.cache/ms-playwright/chromium-1248/chrome-linux/chrome`, while still flagging unrelated paths outside the project (e.g. `C:\Users\lucid\Secret\keys.txt`).

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/desk-run11-243s.test.ts`
- `pnpm typecheck`
- `pnpm lint`

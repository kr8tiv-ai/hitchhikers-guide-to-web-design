# 243r — Desk Run 11: Grok Session Log Allowance, Orphan Background Server Cleanup, Framework Cache Snapshot Filter, and Truncated NDJSON Failure Reason Guard

## Context

During Run 11 live E2E monitoring on `site-c` (`Paradise Found Run Eleven C`, prompts `001`–`033`), four bugs surfaced in `packages/engine/src/guide/site-build.ts` and `packages/engine/src/ai/grok-failure.ts`:

1. **`BUG-107` (`S4` — False-positive outside-access warning on Grok CLI's own session terminal logs)**:
   When a build prompt starts a background shell command (`block_until_ms: 0`), Grok CLI writes the command output to its own session folder under `~/.grok/sessions/<encoded-cwd>/<session-id>/terminal/call-*.log` (on Windows `C:\Users\<user>\.grok\sessions\...`, on POSIX `/Users/<user>/.grok/sessions/...` or `/home/<user>/.grok/sessions/...`) and instructs the model to read that log file via `read_file`. `auditOutsideAccess` in `packages/engine/src/guide/site-build.ts` flags that `read_file` as an outside-access read (`Checked one file outside the project: call-*.log. The project stayed inside its folder.`), overwriting `build-run.json` `reason` on `/hh-dashboard`.

2. **`BUG-108` (`S3` — Orphaned background `pnpm dev` / `astro preview` child process prevents `grok.exe` from exiting after its final turn)**:
   When a build prompt runs a background dev or preview server (`pnpm dev` or `pnpm exec astro preview`) with `block_until_ms: 0` to verify a route and finishes its final turn without killing the background shell, `grok.exe` emits `{"type":"available_commands",...}` followed by its final `{"type":"usage",...}` NDJSON line, and then blocks indefinitely waiting for the background server child process to close its handles before emitting `{"type":"end","stopReason":"end_turn"}`. Because `trackSettlement` in `packages/engine/src/guide/site-build.ts` only arms `armGrace()` when `readEndReason(buffer)` sees `"type":"end"`, the finished prompt hangs until the 180s idle watchdog fires.

3. **`BUG-109` (`S3` — `.astro/*` and `dist/*` framework build/typegen files fill `filesWritten` and evict `src/*` files)**:
   `SKIP_DIRS` in `packages/engine/src/guide/site-build.ts` only lists `.git`, `.hitchhiker`, and `node_modules`. When prompts run `pnpm build` / `astro check`, Astro writes 35+ files under `.astro/` and `dist/`. Because `writeRun` merges `filesWritten` across prompts and takes `[...files].sort().slice(0, FILE_CAP)` (`40`), `.astro/*` and `dist/*` sort alphabetically before `src/*` and fill all 40 slots, completely evicting `src/*` files from `filesWritten` on `/hh-dashboard`.

4. **`BUG-110` (`S2` — Mid-line truncated NDJSON and JSON lines with booleans/`null` bypass `isRawJsonLine`, dumping 13 KB of raw JSON into `build-run.json` `reason`)**:
   `tailText` in `packages/engine/src/guide/site-build.ts` slices `stdout` and `rawTail` to the last `8,000` characters, which cuts in the middle of long NDJSON lines (such as a `grep` `tool_call_update` line) inside a JSON string literal. `isRawJsonLine` in `packages/engine/src/ai/grok-failure.ts` only checks `/^"[^"]*"\s*:/` at the start of the line and `!/[A-Za-z]/.test(outside)` after stripping `"..."`. When a line is sliced mid-string, quote polarity is inverted so `replace(/"(?:\\.|[^"\\])*"/g, "")` strips JSON tokens outside strings and leaves string contents in `outside`; additionally, full NDJSON lines containing `true`, `false`, or `null` leave letters in `outside` and return `false`. As a result, `sanitizeFailureReason` dumps thousands of characters of raw NDJSON `grep` output into `build-run.json` `reason`.

## Deliverables

1. **Allow Grok CLI's own `.grok/sessions/` logs in `insideAllowedRoots` (`packages/engine/src/guide/site-build.ts`)**:
   - In `insideAllowedRoots(candidate: string, allowedRoots: readonly string[], platform: NodeJS.Platform)` (or a helper called by it), treat paths under a `.grok/sessions/` directory (`/[\\/]\.grok[\\/]sessions(?:[\\/]|$)/i`) as inside allowed roots so reading Grok CLI's own session terminal logs (`~/.grok/sessions/.../terminal/call-*.log`) is never flagged as an outside-access read or write.

2. **Settle prompts that finish their turn (`available_commands` + `usage`) when a background child keeps `grok` from emitting `end` (`packages/engine/src/guide/site-build.ts`)**:
   - In `trackSettlement(handle: BuildSpawnHandle, graceMs: number)` in `packages/engine/src/guide/site-build.ts`:
     - Keep existing immediate `readEndReason(buffer)` handling when `"type":"end"` is seen.
     - Additionally, detect when `buffer` contains a completed turn tail — specifically an `"available_commands"` NDJSON line followed by a `"usage"` NDJSON line at the end of `buffer` (with no subsequent `"tool_call"`, `"text"`, or `"thinking"` line after that `"usage"` line).
     - When that post-`available_commands` `"usage"` tail is seen and `endReason === null`, arm a turn-completion timer (e.g. `Math.max(graceMs, 5_000)` ms) that gets cleared/reset if any new chunk arrives. If no further output arrives before the timer fires and the process still has not exited, set `endReason = "end_turn"`, call `handle.stop?.()` (which runs `taskkill /pid <pid> /T /F` on Windows to kill any orphaned `pnpm dev` / `astro preview` child tree), and resolve `finish(snapshotResult(0))`.

3. **Exclude framework cache/build directories (`.astro`, `.next`, `.svelte-kit`, `.vercel`, `.output`, `dist`) from `filesWritten` (`packages/engine/src/guide/site-build.ts`)**:
   - Add `".astro"`, `".next"`, `".svelte-kit"`, `".vercel"`, `".output"`, and `"dist"` to `SKIP_DIRS` in `packages/engine/src/guide/site-build.ts`.
   - Also in `isTransientTempFile(relPath: string)` (or `mergeFiles`), filter out relative paths whose first segment is in `SKIP_DIRS` (e.g. `.astro/...` or `dist/...`) so any previously persisted `.astro/*` or `dist/*` entries in `build-run.json` are pruned automatically on the next `writeRun`.

4. **Harden `isRawJsonLine` against mid-line truncated NDJSON fragments and JSON booleans/`null` (`packages/engine/src/ai/grok-failure.ts`)**:
   - In `isRawJsonLine(line: string)` in `packages/engine/src/ai/grok-failure.ts`:
     - Return `true` if `trimmed` starts with `{"` or `[{`.
     - Return `true` if `trimmed` contains a JSON key-value property pattern `/"[A-Za-z0-9_$-]+"\s*:\s*(?:\{|\[|"|-?\d|true|false|null\b)/`.
     - When checking `outside` after stripping quoted strings, strip JSON boolean/null keywords (`\b(?:true|false|null)\b`) before testing `!/[A-Za-z]/.test(outside)`.

5. **Unit tests**:
   - Add a focused test file `packages/engine/test/desk-run11-243r.test.ts` verifying:
     1. `auditOutsideAccess` does not flag `read_file` on `C:\Users\lucid\.grok\sessions\C%3A%5CUsers%5Clucid%5Csite-c\01a1\terminal\call-123.log` or `/Users/annas/.grok/sessions/site/01a1/terminal/call-123.log`, while still flagging unrelated host paths.
     2. `trackSettlement` / `ensureSiteBuild` settles cleanly with code `0` and calls `handle.stop()` when a prompt emits `available_commands` followed by `usage` and then stalls without emitting `end`.
     3. `snapshot` and `writeRun` ignore `.astro/content.d.ts`, `.astro/dev.json`, `.astro/preview.json`, and `dist/index.html` while keeping `src/pages/index.astro`, and prune stale `.astro/*` / `dist/*` entries from `filesWritten`.
     4. `isRawJsonLine` and `sanitizeFailureReason` drop mid-line truncated NDJSON `grep` / `tool_call_update` fragments and NDJSON lines containing `true`/`false`/`null`, returning the clean fallback `"The build exited with code 1."`.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhikers/engine test`
- `pnpm build`
- `pnpm check`

# Slice 243n — Desk Run 11 CI: Boska Spec Assertion and Text-Cache Active-Turn Hit Rate

Fixes the two CI failures on `main` after `243m` (`9c019cb6`):
1. `packages/app/e2e/desk-run8-242d.spec.ts` still asserted `.toContainText("Boska")` at lines 170 and 193 after `243m` updated `packages/engine/src/spec/design-stages.ts` and `packages/engine/test/desk-run8-242d.test.ts` so a named custom font pair in `DP-1.5` (`Cabinet Grotesk` + `General Sans`) is not silently replaced by the `Boska` archetype fallback.
2. `packages/engine/src/text-cache.ts` in `243k` evicted every file whose `mtimeNs` was within the 2-second racy window (`RACY_WINDOW_NS = 2_000_000_000n`), dropping the `readUtf8Cached` hit rate to 0% during active turns and causing `packages/engine/test/summary-249b.test.ts` (`two summaries for one project never overlap`) to exceed its 2000ms timeout on Windows CI (`2,236 ms`).

## Scope Lock

Only touch:
- `hh-build-plan/prompts/243n-desk-run11-ci-boska-and-text-cache.md`
- `packages/app/e2e/desk-run8-242d.spec.ts`
- `packages/engine/src/text-cache.ts`
- `packages/engine/src/atomic-rename.ts`
- `packages/engine/src/path-names.ts`
- `packages/engine/src/guide/live-turn.ts`
- `packages/engine/src/persona.ts`
- `packages/engine/src/project-file/capture.ts`
- `packages/engine/test/text-cache-243d.test.ts`

## Fix 1 — Align `packages/app/e2e/desk-run8-242d.spec.ts` with `243m`

In `packages/app/e2e/desk-run8-242d.spec.ts`:
- Change line 170 from `await expect(picked).toContainText("Boska");` to `await expect(picked).not.toContainText("Boska");`.
- Change line 193 from `await expect(checks).toContainText("Boska");` to `await expect(checks).not.toContainText("Boska");`.

## Fix 2 — Restore active-turn cache hits in `packages/engine/src/text-cache.ts`

1. In `packages/engine/src/text-cache.ts`, export `primeUtf8Cache(filePath: string, text: string): void` and `evictUtf8Cache(filePath: string): void`.
   - Keep the `RACY_WINDOW_NS = 2_000_000_000n` guard for unprimed entries so in-place `writeFileSync` rewrites within the racy window (with or without `utimesSync` restoring `mtime`) always reload from disk.
   - When an entry is primed by an atomic write (`primeUtf8Cache`), record `mtimeNs`, `ctimeNs`, `ino`, `size`, and `primed: true`, and trust the cached text inside the racy window while `mtimeNs`, `ctimeNs`, `ino`, and `size` match `statSync`. If an external in-place write occurs in the same tick and a caller re-reads, verify or update as needed.
2. In `packages/engine/src/atomic-rename.ts`, stage the body written by `writeClosedTemp` and call `primeUtf8Cache(to, body)` in `renameReplacing` when the default filesystem rename completes.
3. In `packages/engine/src/guide/live-turn.ts`, prime `guide-session.json` and `interview.json` after `writeFile`; in `packages/engine/src/persona.ts` and `packages/engine/src/project-file/capture.ts`, read through `readUtf8Cached`; and in `packages/engine/test/summary-249b.test.ts`, await `waitForSummaryIdle(projectDir)` before removing temp folders in subtests 2 and 3.

## Verification

1. `pnpm --filter @hitchhiker/engine test` (`text-cache-243d.test.ts`, `summary-249b.test.ts`, `desk-run8-242d.test.ts`)
2. `pnpm --filter @hitchhiker/app exec playwright test e2e/desk-run8-242d.spec.ts`
3. `pnpm run typecheck && pnpm run lint`

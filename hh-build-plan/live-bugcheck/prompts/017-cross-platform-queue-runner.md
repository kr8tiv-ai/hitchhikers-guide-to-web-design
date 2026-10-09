# Live fix 017. Walk the prompt queue on macOS and Linux too

From `hh-build-plan/live-bugcheck/heavy-review-4-product.md` item 3. Verify first: `.hh-driver/run-build.ps1` is PowerShell/Windows-only and is what walks the prompt queue (a fresh Grok session per prompt, tests, then a push).

## Read first

- `.hh-driver/run-build.ps1` (every safety rule in it: deny list, `--rules`, `--sandbox workspace`, `--max-turns`, stall watchdog, usage-limit stop, one prompt per session, no force push), `C:\Users\lucid\hh-live-bugcheck\run-seq2.ps1` is NOT in the repo; do not reference it
- `packages/orchestrator/src/*` (queue, runner, schedule, git-flow, `STATE.md.lock`), `packages/cli/src/main.ts` (command table from fix 016), `packages/app/src/server/drive.ts` and `client/drive.ts` (Drive desk), `packages/engine/src/ai/grok-cli.ts` (spawn rules, windowsHide)

## Spec

1. A cross-platform `hh drive` (TypeScript, in cli + orchestrator per `boundaries.ts`) that does what `run-build.ps1` does: read the prompt queue, run each prompt in a fresh `grok` session with the same model/effort per prompt, the same deny rules and `--rules` text (move them into one shared source both runners read, e.g. a JSON/TS file under `.hh-driver/` or the orchestrator), the same stall watchdog and usage-limit stop, run the prompt's tests, then commit and push with plain `git push` (never `--force`). Pause/resume through the existing Drive state. It spawns hidden on Windows and works on macOS/Linux (`grok` on PATH).
2. `run-build.ps1` keeps working (it may call `hh drive` or share the rules file; do not delete it).
3. Drive (`/hh-dashboard`) shows the queue from the same source on every OS, so it is not empty off Windows. Approval gates are unchanged: nothing is pushed or deployed without the existing yes.
4. Document it in README (one short section) next to the existing driver notes.

## Tests

- orchestrator/cli with an injected spawn: one session per prompt, the deny rules and rules text reach the argv, a usage-limit line stops the walk, a stall kills only its own child, `git push` never gets `--force`, a declined approval stops before push.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run cli, orchestrator and app tests. All exit 0. Do not run a real queue walk.

## Commit

```
feat(cli): hh drive walks the prompt queue on macOS, Linux and Windows
```
Do not push.

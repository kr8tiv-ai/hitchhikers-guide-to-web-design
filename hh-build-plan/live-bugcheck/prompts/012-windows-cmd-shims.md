# Live fix 012. Windows .cmd shims fail with EINVAL in tools, deploy and doctor

From `hh-build-plan/live-bugcheck/heavy-review-1.md` item 5 (confirmed: `packages/cli/src/commands/tools.ts` spawns `pnpm.cmd` with `shell: false`; `packages/deploy/src/cli-run.ts` passes bare `vercel`/`netlify`/`wrangler` to `spawnImpl`).

## Read first

- `packages/engine/src/ai/grok-cli.ts` (`launch`, `quoteCmdArg`: the existing safe cmd wrapper)
- `packages/cli/src/commands/tools.ts` `defaultRun`, `packages/cli/src/doctor.ts` `spawnCommand` / `probeGrok`, `packages/deploy/src/cli-run.ts` `cliPlan` / `runCli`, the `SpawnLike` type in engine
- `packages/engine/src/boundaries.ts`

## Bug

Since Node's April 2024 security release, `spawn("x.cmd", args, { shell: false })` throws `EINVAL` on Windows, and `spawn("vercel")` does not apply PATHEXT. So on Windows: tool installs fail and look like exit 127; deploy fails after the user already said yes, with only `<cmd> exited N`; doctor's grok probe falls back to `where.exe` and reports version null. Confirm with a tiny Node script on this machine (`node -e` spawning `pnpm.cmd --version` with `shell:false`), headless and hidden.

## Spec

1. One Windows-safe resolver/launcher, shared through the lowest package the boundaries allow (or reuse `grok-cli.ts`'s): resolve a bare command through PATH + PATHEXT; spawn a real `.exe` directly; run a `.cmd`/`.bat` through `cmd.exe /d /s /c` with every argument quoted and `%` escaped; always `windowsHide: true`; never `shell: true`.
2. Use it in tools, deploy `runCli` and doctor probes. Deploy errors name the missing CLI and the next command (for example `npm i -g vercel`), still only after the yes gate (do not move or weaken the gate).
3. Tests with injected spawn and a fake PATH/PATHEXT: a `.cmd` goes through cmd with quoted args; an `.exe` goes direct; a missing CLI gives the named error; `%PATH%` in an argument is not expanded.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the cli, deploy and engine tests. All exit 0. Do not run a real deploy.

## Commit

```
fix(windows): run .cmd CLIs safely in tools, deploy and doctor
```
Do not push.

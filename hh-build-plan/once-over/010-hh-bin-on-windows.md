# 010. The hh bin on Windows

Status: **applied** in the post-159 pass.

## Miss

v2 §19 says `packages/cli` is the `hh` binary. `packages/cli/package.json` declares `"bin": { "hh": "./src/main.ts" }`.

On this Windows machine, root `node_modules/.bin` contains `tsc` and `tsserver` only. There is no `hh` shim. `pnpm -w exec hh doctor` therefore resolved to `hh.exe`, the Windows HTML Help viewer, with command line `hh doctor`. It printed no doctor report and sat silent until it was stopped.

The doctor program itself is fine. `node --experimental-strip-types packages/cli/src/main.ts doctor` exited 0 and classified session-id as `uuid`.

The root package and the cli package are both named `hitchhikers-guide`. The root `package.json` does not depend on the cli package, so the workspace never links the bin.

## Fix

Make `pnpm -w exec hh doctor` run `packages/cli/src/main.ts`, on Windows as well as macOS and Linux.

Keep the user-facing command name `hh`. Do not rename it to dodge `hh.exe`. A shim that pnpm exec finds before System32 is the point.

Do not pass `--session-id`. Do not run `grok login`. Bare `hh doctor` must still refuse to write `.hitchhiker/` unless `--project` is set.

## Proof

A test or a scripted spawn that invokes the same bin path `pnpm exec` would use, with `grok` and the other tools stubbed, and asserts the stdout contains `session-id:` and that the process image is not Windows HTML Help.

Until that passes, the verification line `pnpm -w exec hh doctor` is not evidence of `/hh-doctor` on Windows.

## Applied

The private root was named `hitchhikers-guide`, the same name as the published CLI, so it could not depend on that package and pnpm never linked `hh`. The root is now `hitchhikers-guide-to-web-design` and depends on `hitchhikers-guide` at `workspace:*`. The CLI name and `bin.hh` stay `hitchhikers-guide` and `./src/main.ts`. `pnpm install` links `node_modules/.bin/hh`, which `pnpm exec` finds before `System32\hh.exe`.

The shim runs that package through a symlink. `isDirectRun` now compares real paths, so `hh doctor` actually starts. Bare `hh doctor` still takes no `--session-id`, does not run `grok login`, and does not write `.hitchhiker/` unless `--project` is set.

Files: `package.json`, `pnpm-lock.yaml`, `packages/cli/src/main.ts`, `packages/cli/test/hh-bin.test.ts`.

Tests: `pnpm exec hh doctor runs the workspace bin and not Windows HTML Help`.

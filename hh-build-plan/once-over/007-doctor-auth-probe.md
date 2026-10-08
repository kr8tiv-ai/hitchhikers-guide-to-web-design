# 007. hh doctor does not probe auth

Status: **applied** in the post-159 pass.

## Miss

v2 §18 says `/hh-doctor` probes grok, auth, node, playwright, whisper, git, session-id shape, and the effort flag.

`packages/cli/src/doctor.ts` checks node, git, `grok --version`, `grok --help` (session-id shape and `--effort`), and optional binaries. The word `auth` does not appear. A logged-out `grok` on PATH still reports `grok: <version>` and exit 0.

This pass ran `node --experimental-strip-types packages/cli/src/main.ts doctor --project <temp>`. Exit 0. Output included `session-id: uuid` and `effort: present`. It did not say whether the CLI is signed in. It does not pass a slug as `--session-id`. The runner in `packages/orchestrator/src/runner.ts` refuses a non-UUID when the mode is `uuid`, and it omits `--session-id` in alias mode.

## Fix

Read `grok --help` for a non-interactive status flag. If one exists, record signed-in or signed-out without starting login and without a network prompt. If none exists, say so in the doctor output and do not guess a subcommand. Do not run `grok login`. Do not treat a project slug as a legal session id.

Add a test with a fake runner whose help text has no auth flag, and a second whose status output says signed out.

## Why this pass did not do it

The xAI notes in `context/sources/xai/` document `grok login` and an ACP authenticate call. They do not document a local status flag. Inventing one would invent an API.

## Applied

`hh doctor` reads `grok --help` for a bare auth status flag. The installed help lists login, logout, and `--oauth`, and it has no status flag, so the doctor prints `auth: no non-interactive status flag in grok --help` and does not run a subcommand. When help documents a bare flag such as `--auth-status`, the doctor runs that flag alone and records `signed-in` or `signed-out` from its output. A project directory is not passed as `--session-id`. Exit 1 stays reserved for node older than 22.

Files: `packages/cli/src/session-probe.ts`, `packages/cli/src/doctor.ts`, `packages/cli/test/doctor.test.ts`.

Tests: `doctor says grok --help has no auth status flag and does not run login`, `doctor records signed-out when the status flag output says signed out`.

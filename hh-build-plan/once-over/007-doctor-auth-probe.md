# 007. hh doctor does not probe auth

Status: **proposed**. Not applied. Do not call `grok login`.

## Miss

v2 §18 says `/hh-doctor` probes grok, auth, node, playwright, whisper, git, session-id shape, and the effort flag.

`packages/cli/src/doctor.ts` checks node, git, `grok --version`, `grok --help` (session-id shape and `--effort`), and optional binaries. The word `auth` does not appear. A logged-out `grok` on PATH still reports `grok: <version>` and exit 0.

This pass ran `node --experimental-strip-types packages/cli/src/main.ts doctor --project <temp>`. Exit 0. Output included `session-id: uuid` and `effort: present`. It did not say whether the CLI is signed in. It does not pass a slug as `--session-id`. The runner in `packages/orchestrator/src/runner.ts` refuses a non-UUID when the mode is `uuid`, and it omits `--session-id` in alias mode.

## Fix

Read `grok --help` for a non-interactive status flag. If one exists, record signed-in or signed-out without starting login and without a network prompt. If none exists, say so in the doctor output and do not guess a subcommand. Do not run `grok login`. Do not treat a project slug as a legal session id.

Add a test with a fake runner whose help text has no auth flag, and a second whose status output says signed out.

## Why this pass did not do it

The xAI notes in `context/sources/xai/` document `grok login` and an ACP authenticate call. They do not document a local status flag. Inventing one would invent an API.

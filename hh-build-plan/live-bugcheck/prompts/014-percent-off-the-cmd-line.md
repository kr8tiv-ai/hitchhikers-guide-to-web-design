# Live fix 014. A % in an answer can expand on the grok command line

From `hh-build-plan/live-bugcheck/heavy-review-1.md` item 7. Verify first.

## Read first

- `packages/engine/src/ai/grok-cli.ts` (`planGrokCall`, `quoteCmdArg`, `launch`, `--prompt-file` use)

## Bug

When grok is a `.cmd`/`.bat` shim, the prompt (which contains the person's answers) goes through `cmd.exe /c` as `-p`/`--single`. Inside cmd, `%VAR%` expands even in double quotes, and `!` with delayed expansion. An answer like "50% off, 100% handmade" or `%USERPROFILE%` can change the prompt.

## Spec

1. On win32, whenever the launch goes through cmd, pass the prompt with `--prompt-file` (a temp file removed after the call), never on the command line. Keep the direct `.exe` path unchanged unless the file route is simpler for both.
2. `quoteCmdArg` escapes `%` (as `%%` or `^%` as appropriate for `/c` in a quoted context; verify which one survives with a real `cmd.exe` test on this machine) for any remaining argument.
3. Tests: a prompt with `%PATH%` and `50%` reaches the fake grok byte-for-byte through the cmd path; the temp prompt file is removed afterwards.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the engine tests. All exit 0.

## Commit

```
fix(engine): keep user text off the cmd line when grok is a shim
```
Do not push.

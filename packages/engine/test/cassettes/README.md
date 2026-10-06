# Cassettes

A cassette is a saved `think()` answer. CI replays these files and does not call a live model.

The key is the sha256 of the task, model, effort, schema, input, and image hashes. The file is `test/cassettes/<task>/<key>.json`. It stores the parsed result, the model text, token counts, and duration. It does not store the environment.

Set `HH_CASSETTE` to one of:

- `replay` reads the file. A missing file throws `CassetteMissError` and includes the key. This is the mode to use in CI.
- `record` calls Grok, then writes the file.
- `off` calls Grok and writes nothing. This is the default when the variable is unset.

`think()` never reads credential files and never sets `GROK_HOME`. The login is whatever the installed Grok Build CLI already uses.

## Live smoke

`ai-live.test.ts` is skipped unless `HH_LIVE` is `1`. It asks for a two-field object, `{ greeting: string, ok: boolean }`, and checks that shape.

From the repo root:

```powershell
$env:HH_LIVE = "1"
$env:HH_CASSETTE = "off"
pnpm --filter @hitchhiker/engine exec node --experimental-strip-types --test test/ai-live.test.ts
```

Unset `HH_LIVE` again when you are done. The smoke uses the model and effort in `.hitchhiker/config.json`, or `grok-4.7` and `medium` when that file is absent.

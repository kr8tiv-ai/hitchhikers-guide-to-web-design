# Elevate cassettes

`elevateRound` calls `think()` with task `elevate-plan`, model `grok-4.7`, and effort `xhigh`. The schema is one object with an `upgrades` array of at most eight items. `proposeCopy` calls `think()` with task `copy-refine` at the same effort. That schema is one object with a `rewrites` array.

The cassette key is the sha256 of the task, model, effort, schema, input, and image hashes. Image hashes are the file bytes when the path is a file. A saved file is `<key>.json` under `elevate-plan/` or `copy-refine/`. It stores the parsed result and the model text. It does not store the environment, and it holds no secrets.

CI sets `HH_CASSETTE=replay`. The round test writes one `elevate-plan` cassette in a temp directory and replays it through `think()`. The spawn function throws if the replay path calls a model. One planned pick is kept. The next pick is refused because Lighthouse goes BLOCKER, and that pick is reverted. The copy test does the same for `copy-refine`: one record, one replay, schema on the argv, and a line with an exclamation mark dropped. Do not commit a live token. The cassettes are produced by the tests, not stored here.

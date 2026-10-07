# Brand cassettes

Babel Fish live modules call `think()`. A cassette is a saved answer. The Towel and Tea test writes these files for the fixture, then replays them. CI does not call a live model.

Tasks:

- `brand-why-question` asks one Golden Circle question. The Why Finder does this at least 12 times, one ask at a time.
- `brand-why-compile` returns why, how, and what. `compileWhy` shapes the why.
- `brand-discovery-question` asks about one SOFT or ASSUMED field.
- `brand-discovery-brief` returns the discovery brief and three risks.
- `brand-positioning` returns one archetype, one positioning line, one persona, and three non-customers.
- `brand-story-origin` asks two origin questions when the story is missing.
- `brand-story` returns the 25, 100, and 300 word stories.
- `brand-voice` returns traits, vocabulary, and microcopy. `renderVoice` shapes the file.
- `brand-taglines` returns 30 lines, five in each of the six styles.
- `brand-tagline-rank` cuts those lines to a top 5 with a reason each.
- `brand-item-redraft` rewrites one rejected item.

The key is the sha256 of the task, model, effort, schema, input, and image hashes. The file is `test/cassettes/<task>/<key>.json`. The Towel and Tea replay writes that file in a temp directory during the test, then reads it back through `think()` with `HH_CASSETTE=replay`. The saved answer has no secrets and no credential path.

`HH_CASSETTE=replay` is set by the test. A missing file throws `CassetteMissError`. Replay must not spawn the Grok CLI.

# Author cassettes

`authorPackage` calls `think()` with task `author-site-prompt`, model `grok-4.7`, and effort `xhigh`. The schema is one object with a string field `body`. The body is the markdown after the shared RULES block.

The cassette key is the sha256 of the task, model, effort, schema, input, and image hashes. A saved file is `<key>.json` under this directory. It stores the parsed result and the model text. It does not store the environment, and it holds no secrets.

CI sets `HH_CASSETTE=replay`. The author test writes one cassette in a temp directory and replays it through `think()`. The spawn function throws if the replay path calls a model. Do not commit a live token or a full Towel and Tea cassette set. The package itself is produced by the test, not stored here.

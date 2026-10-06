# Guide cassettes

`turns.json` is a hand-written ordered script for the Towel and Tea interview.
Each task name has its own cursor. `guideThinkFromScript` returns the next `result`
for that task and checks it against the request schema.

`grok` is on PATH on the machine that prepared this file. These turns were not
recorded with `HH_CASSETTE=record` and `HH_LIVE=1`. A live recording would call
the model, and the suite would then depend on that call. The shapes match the
schemas in `packages/engine/src/guide/schemas.ts`.

`tree.yaml` is the eight-question fixture, all in module `towel-check`.
`gallery.json` is a stand-in pack with two Godly rows and two Awwwards rows.
The curated pack under `packages/knowledge/galleries/` has Awwwards rows and no
Godly rows, so a taste Suggest cannot return four cards from that file alone.
Source `other` is never backfilled.

The desk reads this script when `HH_GUIDE_REPLAY=1`. `HH_GUIDE_CASSETTE` overrides
the path. `HH_GALLERY_FILE` overrides the pack.

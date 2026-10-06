# Mood cassettes

`analyzeMood` calls `think()` with task `mood`. A cassette is a saved answer. CI replays it and does not call a live model.

The key is the sha256 of the task, model, effort, schema, input, and image hashes. The file is `<key>.json` in this directory. It stores the parsed result and the model text. It does not store the environment, and it holds no secrets.

The six-image fixture is six 1x1 PNGs. The test writes those fixed bytes, then replays this cassette. The saved answer has one entry per image and exactly 3 directions. One image names Helvetica. The mood validator turns that name into the class `grotesk` and records the guess. Direction palettes are 5 hex colors, and the three palettes differ.

`HH_CASSETTE=replay` is set by the test. Do not point this cassette at a credential file.

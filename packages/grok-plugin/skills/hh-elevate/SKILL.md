---
name: hh-elevate
description: Plan Elevate rounds. The pick is the yes. Nothing is applied when the pick is none.
user-invocable: true
---

Run this when the user wants Elevate to plan improvements.

Usage: hh elevate --project <dir> [--url <url>] [--rounds N] [--pick all|none|1,2]
       hh elevate detail --project <dir> --url <url>
       hh elevate copy --project <dir> [--approve id,id]
       --cassette keeps HH_CASSETTE=replay or record. HH_ALLOW_CASSETTE=1 does the same.

`--pick all|none|1,2` is the yes. Nothing is applied when the pick is `none`. Leave `--rounds` off for one round. `--rounds N` is a whole number from 1 to 99 and repeats that round until a stop rule fires.

The loop stops when nothing was chosen, when every allowed round is used, when both the design score and the jury score barely moved over the last two rounds, or when a person needs to decide. A worse check is undone and the round notes say why. The gate report matches the current commit.

The command stops if the design score, the jury score, or the quality measurements are missing. It does not go look at the live site by itself.

`hh elevate detail` and `hh elevate copy` follow the same yes rule when they write files. The word Elevate here is the command name.

Never push. Never deploy. Never spend without the user's yes. Never create a GitHub repo.

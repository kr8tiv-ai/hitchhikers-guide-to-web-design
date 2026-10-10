---
name: hh-help
description: List the Guide commands and which ones the hh CLI can run today.
user-invocable: true
---

There is no `hh help` subcommand. This skill is the help. Commands with no CLI subcommand yet are not implemented.

The hh CLI can run these today:

- `hh install --project <dir>` copies skills, agents, hooks, and rules into `.grok/`.
- `hh app --project <dir>` opens the local Guide dashboard. Pass `--no-open` or `--port` only when the user asks.
- `hh assets <plan|run|diy|import> --project <dir>` plans, runs, writes prompts, or imports. `hh assets run` spends only with `--yes` after a yes. `hh assets import` needs `--file <path>`.
- `hh tools <search|install> --project <dir>` searches or installs. `hh tools install` needs `--yes`.
- `hh mostly-harmless --project <dir>` runs the gates and the jury. Do not pass `--yes`.
- `hh elevate --project <dir>` plans one Elevate round. Applying a pick needs `--yes`.
- `hh progress --project <dir>` shows phase, slice, prompt, and next action.
- `hh pause --project <dir> --message <text>` saves one next-action line.
- `hh save --project <dir>` writes the portable project file. `--to <path>` chooses the place.
- `hh resume <file>` restores a project from that file. `hh resume --project <dir>` shows the prompt id to continue from and does not rewrite state.
- `hh doctor` or `hh doctor --project <dir>` prints the environment report.
- `hh improve` runs a bounded loop on an improve branch. A human merges. It refuses main and a dirty tree.
- `hh improve supervise` runs the standing loop on main. It pushes a kept commit with `git push origin main` and stops if origin/main does not contain that commit. It refuses a force push.

The other /hh commands are skills only. Say that plainly. Do not invent flags.

Never push. Never deploy. Never spend without the user's yes. Never create a GitHub repo. The one exception is the supervisor command above: a normal `git push origin main` after a keep, then stop if that commit is not on origin/main. Never force-push.

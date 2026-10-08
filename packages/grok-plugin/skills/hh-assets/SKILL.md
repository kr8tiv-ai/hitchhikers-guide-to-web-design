---
name: hh-assets
description: Plan, run, or import Imagine and 3D jobs under the spend cap.
argument-hint: plan, run, diy, or import
user-invocable: true
disable-model-invocation: true
---

Run this only when the user typed the slash command.

Run `hh assets` with one of plan, run, diy, or import, plus `--project <dir>`.

- `hh assets plan --project <dir>` prints a quote and does not spend.
- `hh assets run --project <dir> --yes` spends only after the user says yes. Pass `--yes` only after that yes.
- `hh assets diy --project <dir>` writes prompts and does not call Imagine.
- `hh assets import --project <dir> --file <path>` imports files the user already has.

A batch over the cap stops before any request.

Never push. Never deploy. Never spend without the user's yes. Never create a GitHub repo.

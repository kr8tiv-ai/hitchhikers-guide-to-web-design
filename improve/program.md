---
tag: desk
objective: Improve the Guide desk copy and tokens while the protected score goes up.
targets:
  - packages/app/src/design
  - packages/app/src/server/card.ts
minutes: 10
turns: 40
model: grok-4.7
effort: xhigh
---

# Guide improve program

This file is the human program. `hh improve` owns the loop. An experiment must not edit this file or `improve/protected.json`.

## Objective

Make the Guide desk clearer. Copy, type, and color tokens in the target area may change. Tests, doctor, and the typecheck stay green.

## One editable surface

Edit only the paths in `targets` above. A diff outside that list is a violation. The runner resets it.

## Rules

- One hypothesis per experiment. Keep the diff small. Commit on the improve branch, then stop.
- The score rises when more tests pass, or when anti-slop hits in the target copy fall, and only while doctor and the typecheck stay green. A tie is a discard.
- Do not edit approval gates, the evaluation, DECISIONS.md, context/, .hh-driver/, or hh-build-plan/prompts/.
- Do not push, force-push, deploy, publish, or check out main.
- Do not install packages. Do not read or print secrets.
- Read `improve/results.tsv` before the next idea. Do not repeat a discarded idea.
- Stop when `improve/STOP` exists, or when the runner hits its experiment cap.

## Simplicity

A smaller diff that raises the score beats a large one. If the score does not go up, the runner discards the commit.

## Supervisor goals

`hh improve supervise` runs on main. It spawns the test agents below, scores the protected evaluation, and pushes a kept commit with `git push origin main`. The agent does not push.

The score rises when more tests pass, anti-slop hits in the target copy fall, polish and anti-slop checks pass, or open bugs fall. UX is the polish e2e pass count plus the anti-slop test pass count. Open findings in `docs/bug-scan.md` and `improve/findings/` lower the score. A red test, a bad doctor exit, or a failed typecheck stays below every green score. A tie is a discard.

## Test agents

### desk-explorer

- home: repo
- findings: improve/findings/desk-explorer.tsv

Walk the desk through Playwright with the fixtures under packages/app/e2e. Write one row per bug. Columns are id, status, area, and summary. Status is open or fixed. Edit the target area only when asked to fix.

### cli-explorer

- home: temporary
- findings: improve/findings/cli-explorer.tsv

Exercise the hh CLI with HOME and USERPROFILE pointed at an empty temporary directory. Write one row per bug, using the same columns. Edit the target area only when asked to fix.

---
id: "241l"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241k"]
title: "Close the two 241k gaps: a real caller for the decision log (idea 31), and hh elevate attaches the review project"
---

# 241l. Close the two open gaps from the 241k sweep

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free site that looks stunning on desktop, iOS, Android and tablets, in curated foundry fonts, and is fast. The 241k sweep (hh-build-plan/research/241k-sweep-report.md) found two places where built work never reaches a real run:
1. The decision log for directions (idea 31, `rejectedDirectionNames` and the direction pick record) has no production caller. When the person picks one direction on the desk and turns down the others, nothing records it, so later deals can offer the rejected directions again.
2. `hh elevate` does not pass a `ReviewProject`, so the full review checks in `gateProblems` never run on a real elevate round.

Font licenses are NOT verified. Do not add license checks.

## Do
1. Decision log. Find where the person actually chooses a direction (the interview / design stages flow, `advanceDesignStages`, and the desk UI or API that serves it). Record the real choice there: the picked direction and the ones shown but not picked. Never invent a pick; only a real choice by the person writes the log (241k scored a synthetic pick at 4 for this reason). Make `dealDirections` (or whatever deals the next directions) read `rejectedDirectionNames` and not deal rejected ones again for that project. Test: a choice writes the log; the next deal excludes the rejected names; no choice means no log entry.
2. Review project on elevate. Make `hh elevate` build and pass a `ReviewProject` for the project it elevates, so the round runs the full `gateProblems` set. 241k noted that a project with no built `index.html` or no lab input fails closed. Keep that closed failure (don't fake inputs), but make the refusal clear and actionable in the CLI output: list what is missing and how to produce it. When the inputs exist, the full gates must run. Tests: elevate with a built fixture runs the gates (assert the calls), and elevate on an unbuilt project refuses with that message.
3. Update 241k-sweep-report.md: mark both items closed and say how.
4. Run the full repo checks (tests, lint, typecheck) and leave them passing.

## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found. Don't start or stop the desk server on port 4175. Small, logical commits; finish with the commit below and a clean tree.

## Commit
```
feat(engine): decision log caller and review project on hh elevate (241l)
```

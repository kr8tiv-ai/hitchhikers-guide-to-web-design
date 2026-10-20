---
id: "241k"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241j"]
title: "Final sweep: does the desk deliver its goal? Audit, fix, and add every 7+ improvement"
---

# 241k. Final sweep

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free website that looks stunning on desktop, iOS, Android and tablets, set in curated foundry fonts, and is fast. Everything in 238 through 241j was built toward that. This prompt checks whether it actually works as a whole, fixes what doesn't, and adds what would most help.

Font licenses are NOT verified (Matt's decision, see 241bz). Do not add license checks.

Reason step by step through three questions, in order, and write your reasoning into the report.

## 1. What are we trying to solve?
State the goal in your own words, then turn it into concrete, testable outcomes. For example: a brief goes in and a site comes out that passes the beauty, recipe, AI-cluster, rubric and frame gates; it scores at the juror floor or above; it meets the phone performance budget and Lighthouse per device; it renders correctly at phone, tablet and desktop sizes; it uses curated foundry pairs from 240r-fonts.md; and it does this without manual help or hangs.

## 2. Do we actually accomplish that?
Audit end to end. Read hh-build-plan/research/240r-summary.md, hh-quality-gap-audit-2026-10-19.md and the 241a–241j prompts.
- For each of the 13 audit items and each of the 28 ideas scored 7 or higher, find the code that implements it. Prove it is wired into the real build path (called by the runners or the desk flow, covered by a test that would fail if it were removed), not dead code, a stub, or test-only. Make a table: item, file or function, wired yes/no, evidence.
- Run one realistic brief through the pipeline end to end (offline or stubbed media is fine; no deploys, no paid APIs, nothing published) and record which gates ran and what they found.
- Find bugs, flaky tests (run the full test suite at least 3 times; note anything that fails even once), and hang or stall risks (sessions or child processes that don't exit, missing timeouts).
- Find gaps between the desk's features and its goal: things a user would need to reach an Awwwards-calibre result on every device that the desk does not do, or does badly.

## 3. What should we add to improve the process?
List improvements. Score each 1–10 on absolute usefulness toward the goal in section 1 (not on ease). Be strict: 7+ means it clearly moves results or reliability.
- Fix every bug, flaky test and wiring gap found in section 2. Score fixes too, but fix them all regardless of score.
- Implement every improvement scoring 7 or higher, with tests.
- Do not implement anything below 7.

## Report
Write hh-build-plan/research/241k-sweep-report.md with:
- the section 1 outcomes
- the section 2 wiring table, end-to-end run results, and the bugs, flakes and stalls found, with what you fixed
- every improvement with its score, marked implemented (7+) or deferred (<7), with one line on why

## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found. Don't start or stop the desk server on port 4175. Run the full repo checks (tests, lint, typecheck) and leave them passing. Commit in small, logical commits. Make the final commit with this message and leave the tree clean.

## Commit
```
chore(sweep): final end-to-end audit, wiring fixes, 7+ improvements, sweep report (241k)
```

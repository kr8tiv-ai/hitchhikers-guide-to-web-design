---
id: "214"
kind: fix
phase: deep-thought
slice: Forty-Two
title: "Finish 213 (GSD parity) after it was cut off, and keep main green"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["213"]
files: ["packages/engine/src/context/", "packages/engine/src/guide/", "packages/engine/src/", "packages/app/src/", "packages/cli/src/", "packages/engine/test/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 214. Finish 213 (GSD parity) and keep main green
## RULES

Same RULES block as 213 and 211 (spec first, never weaken/skip/delete/loosen a test, never lower Guide model or effort, never skip the judge, do not touch `C:\Users\lucid\Desktop\paradise-found\`, 127.0.0.1:4175, 4173, 62828, `hh-desk-test`; no edits to `.hh-driver/`, `hh-build-plan/`, CI workflows; do not push; no new deps; work on `main`, do not stash). If a commit hook fails because Git Bash cannot fork (`0xC0000142`), do not bypass hooks; leave the work staged, say so in the summary, and stop.

Sessions are being cut off after about 55 minutes. Commit as soon as each step is green, at least every 20 minutes of work. Never hold more than one feature uncommitted.

## Why this prompt exists

213 (`hh-build-plan/prompts/213-gsd-parity.md`, still the spec) was cancelled after 57 minutes with 65 uncommitted paths; the driver committed them as 1498c93e ("feat(engine): persistent context and GSD parity (212)", the commit title says 212 by mistake, it is 213's work). Nothing was verified and it was not pushed.

## Steps

1. Run `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, `pnpm exec tsc -b --pretty false`, the Playwright suite. Record every failure.
2. Make main green by finishing the product side of whatever 213 half-wrote, not by loosening tests. Commit `fix(engine): finish 213's half-written context work and turn main green`.
3. Audit 213 features 1 to 10 one line each: done and tested / partly done / not started, with file and test.
4. Finish features 1, 2, 3 (context store, one packet for every call, persistence proof) first, then 4, 5, 6, 7, 8, 9 in order. 10 is a stretch. Commit after each.
5. Low on time: stop starting features, keep the tree committed and green, list exactly what is left.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 200 words in the last commit body and `.hitchhiker-dev/summaries/214.md`: step 1 failures and causes, the 213 feature status table (done / left), tests added, verification results.

## Commit

```
feat(engine): finish 213 context and GSD parity (214)
```

---
id: "208"
kind: fix
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Interview: plain-language skill question, no 'rung' in user-facing text"
tier: Heart of Gold
effort: medium
model: grok-4.7-build-fast
always_approve: true
depends_on: ["207"]
files: ["interview/tree.yaml", "packages/engine/test/tree.test.ts", "packages/engine/test/cassettes/guide/tree.yaml", "packages/engine/test/cassettes/guide/turns.json", "packages/app/e2e/live-guide.spec.ts"]
---

# 208. Interview: plain-language skill question, no 'rung' in user-facing text
## RULES

Same RULES block as 206 (TypeScript strict, tests ship with the behavior, no secrets, MIT-compatible only, anti-slop copy, no exclamation marks, cross-platform, Matt's answers and DECISIONS.md win, commit when checks pass, no repo creation, no deploy).

Additional rules for this session only:

- Never weaken, skip, delete, or loosen a test or assertion to get green. A test may change only where it asserts the old wording this prompt replaces, and the new assertion must be at least as strict.
- Do not start before 207 is committed. Work on `main`. Do not stash another session's work.
- Do not edit run-build.ps1, the driver, `STATE.json`, `.hh-driver/`, or `hh-build-plan/`.

## Goal

The skill-level question (DP-0.3, module towel-check) is jargon. The owner saw it as:

"Which web work do you do yourself: visual design only, building pages in a site builder, or writing the code?" with help "The rung sets how much to explain. Technical vocabulary can move you up. Two asks of what a term means move you down."

On 9fed756c `interview/tree.yaml` DP-0.3 reads `ask: "How comfortable are you with web work? Four rungs: new to it, used a site builder, design or build sites, or write code."`, `why: "The rung sets how much to explain. ..."`, `suggest: "Pick the rung that matches the work you do."`. Find every source of either wording (tree, Guide persona or rewording prompts, cassettes, desk copy) and replace it.

After this prompt the card reads:

**How hands-on are you with websites?**

- (a) I design how it looks, but someone else builds it.
- (b) I build pages myself in a site builder like Wix, Squarespace or Webflow.
- (c) I write the code myself (HTML, CSS, JavaScript).
- (d) I'm brand new to all of this.

Help (`why`): "This tells me how much to explain. Pick the closest one, and I'll adjust as we go."

## Changes

1. `interview/tree.yaml` DP-0.3: `ask` is the question plus the four options exactly as above (as choice options if the tree/card supports a choice list for `input: [choice, ...]`; otherwise in the ask text in that order). `why` is the new help text. `suggest`: "Pick the closest one." `skip_default`: "I'm brand new to all of this." Keep `id`, `module`, `depth`, `input`, `levels`, `writes`.
2. Level mapping: (d) brand new maps to the lowest level (beginner / explain, same as the old "new to it"). (b) maps where "used a site builder" mapped, (a) where "design or build sites" mapped, (c) where "write code" mapped. Find the code that classifies the DP-0.3 answer (search engine for the level/`beginner`/`pro` classifier) and update its matchers for the new phrasing. Do not change the up/down adjustment logic (technical vocabulary moves up, two asks of what a term means move down).
3. Remove the word "rung" from all user-facing text: tree asks/why/suggest, Guide persona and pushback copy, cassettes the desk replays (`packages/engine/test/cassettes/guide/turns.json` "A site builder is a real rung."), and desk strings. Internal identifiers and code comments may keep it.
4. Mirror the change in `packages/engine/test/cassettes/guide/tree.yaml`.

## Tests (write or update first)

- `packages/engine/test/tree.test.ts`: replace "DP-0.3 names four comfort rungs" with a test asserting the exact new ask, the four options in order, the exact help text, and that DP-0.3's ask, why, and suggest do not contain "rung".
- New engine test: each option (a)-(d) classifies to its level; "I'm brand new to all of this." gives the lowest level; the skip default gives the lowest level; existing up/down adjustment tests pass unchanged.
- Repo-wide guard test: no user-facing string in `interview/tree.yaml`, the persona prompt, or the replayed cassettes contains `\brung\b` (case-insensitive).
- Update `packages/app/e2e/live-guide.spec.ts` (the "A site builder is a real rung" expectation) and any snapshots or screenshot baselines that show DP-0.3 to the new copy.

## Acceptance criteria

- [ ] DP-0.3 shows "How hands-on are you with websites?", the four options, and the new help text.
- [ ] "Brand new" maps to the lowest level. Up/down adjustment unchanged.
- [ ] No user-facing "rung" anywhere.
- [ ] Tests and snapshots updated, whole suite green, no dependency added.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
git grep -n -i -w "rung" -- interview packages ":!*.test.ts"
```

The last command shows no user-facing hit.

## Report back

At most 150 words in the commit body and `.hitchhiker-dev/summaries/208.md` if it exists: where the old wording lived, the level mapping, tests changed and why.

## Commit

```
fix(interview): ask how hands-on the person is in plain words
```

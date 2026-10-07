# 048 Review — prompts 045, 046, 047

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No new feature.

HEAD reviewed: `548bf46` (`feat(brand): teardown competitors from recorded wishes`).

The 045, 046, and 047 must-have truths hold. Each one below has a test name and a file line. This verdict is those truths, plus the acceptance checks in each prompt. `phase_end` is false, so this checkpoint does not close Babel Fish.

## History

Three build commits, in order, on top of `64b0ccb`. Messages match the prompt commit lines. They are separate commits. History was not rewritten.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `fa4ecab` | `64b0ccb` | `feat(brand): compile the site why and the brand why` | same, prompt 045 |
| 2 | `9881a59` | `fa4ecab` | `feat(brand): draft positioning and three story lengths` | same, prompt 046 |
| 3 | `548bf46` | `9881a59` | `feat(brand): teardown competitors from recorded wishes` | same, prompt 047 |

## 045 Compile a one-sentence why and a longer finder

### Truths

- The site why cannot be blank at the end of this function. `compileWhy` in `packages/engine/src/brand/why.ts` (lines 55–58 and 61–63) throws `WhyError` when the cleaned or truncated DP-2.1 text is empty, before the return. Test `missing DP-2.1 throws WhyError` covers an empty list, whitespace, a newline, a visitor with no site why, and `innovative!`, which strips to empty. Success paths in `a deferred brand why is ASSUMED and contains no banned word` and `a site why of 240 characters is not truncated, and a single long token is cut at 240` require a non-empty `siteWhy`.

- Assumed brand copy is labeled. When DP-1.7 is missing, short, `SUGGESTED`, `SKIPPED`, or `SOFT`, or when a kept value cleans to empty, `status` is `"ASSUMED"` (`why.ts` lines 84–88 and 102–107). Test `a deferred brand why is ASSUMED and contains no banned word` requires `status` `ASSUMED` and the sentence `a night regular comes for a tin of tea because The stall exists so regulars can find the tea.` Test `a short, suggested, or skipped DP-1.7 is not rewritten into an answered why` requires `ASSUMED` for a 7-word answer and for `SUGGESTED`, `SKIPPED`, and `SOFT`. Test `a SKIPPED site why with assumed text is allowed and the brand draft stays ASSUMED` keeps the skipped site text and still requires `ASSUMED`.

- Banned hype words are stripped. The whole-word list is `innovative`, `elevate`, `seamless`, `cutting-edge`, and `passionate` (`why.ts` line 26). `stripBanned` (lines 159–167) removes them and `clean` names each one in `warnings`. Test `a banned word in the offer is removed and named in warnings` runs every word in that list, requires the offer to collapse to `a tin`, and requires a warning that names the word and the field `offer`. Test `innovation may remain and innovative may not` keeps `innovation`, `elevated`, and `elevates`, and rejects `innovative`.

### Also checked

- An `IMPORTED` DP-1.7 of at least 8 words is kept and stays `IMPORTED`. Test `an IMPORTED DP-1.7 of sufficient length is kept and not rewritten`. An `ANSWERED` value of 8 words stays `ANSWERED`. Test `an ANSWERED DP-1.7 of at least 8 words is preserved`. The context paragraph said both statuses become `ANSWERED`. Step 5 and the `WhyDraft` union keep the import. The commit records that. The interface wins.
- A site why longer than 240 characters cuts on a word. Test `a site why longer than 240 characters is truncated on a word` requires `siteTruncated`, length at most 240, and a prefix that still starts the original on a space. A single token with no space cuts at 240. Test `a site why of 240 characters is not truncated, and a single long token is cut at 240`.
- A missing offer uses the site why alone. Test `a missing offer makes the assumed brand why the site why only`. An empty visitor still yields `Comes for ${offer} because ${siteWhy}`. Test `an empty visitor with a present offer still produces a sentence`.
- Exclamation marks are stripped and named. Test `an exclamation mark is stripped and named, and the output has none`. `rejectDirty` throws if a `!` or a banned word survives.
- HTML stays text. Test `HTML in an answer is stored as text and is not interpreted` requires `<p>` and `&amp;` to remain.
- No network call and no Why Finder paste. Test `compileWhy does not call the network or paste the finder prompt` reads `why.ts` and rejects `fetch(`, `node:http`, `node:https`, `grok`, `imagine`, `Start With Why`, `Ask me one question at a time`, and `brand strategist`.
- Ids read are DP-2.1, DP-2.6, DP-2.7, and DP-1.7 (`why.ts` lines 28–31). The last record for an id wins. Test `the last record for an id wins`.

## 046 Draft archetype, positioning, and three story lengths

### Truths

- Stories do not invent biography. `extractFacts` (`packages/engine/src/brand/story.ts` lines 345–358) keeps the practice name, DP-2.6, DP-2.7, a non-skip DP-4.4, a place phrase actually written in DP-9.5, and a non-skip DP-1.9 list. `expandOnly` (lines 295–317) repeats those sentences up to the word cap and, at 200 words or more, inserts `[needs a fact: founding story]`. `removeDisallowedDigitRuns` (lines 485–488) drops a four-digit run that is absent from the facts. Test `expandOnly does not invent a year` requires no `/\b(19|20)\d{2}\b/` on a fact list with no year, at 100 and at 300, and the same on `positioning`, `words25`, `words100`, and `words300`. Test `a year in the facts may be repeated and no other year is added` allows `1998` and rejects every other year. Test `the long story shows a founding hole instead of an anecdote` requires the bracket and the hole `founding story` on the long text, requires the bracket to be absent from the 100-word text, and rejects `founded` and `founder` in `words300`. Test `a dedicated place and a place inside the open notes are kept, and a city is not invented` requires `Edmonton` only when DP-4.4 says it, keeps `Red Deer` from `based in Red Deer`, and leaves `van` out of the story.

- Positioning uses the visitor, the offer, and the site why. `positioningLine` (lines 274–287) returns `For ${visitor}, ${name} is the ${offer} that ${siteWhy}` and throws `StoryError` when the visitor or the offer is empty after cleaning. Test `positioning uses the visitor, the name, the offer, and the site why` requires `For a night regular, Night Stall is the a tin of tea that The stall exists so regulars can find the tea.` and the same string from `buildStory`. Test `positioning throws when the visitor or the offer is empty` covers blank visitor, a visitor of only bangs, and a blank offer, including through `buildStory`.

- The user has not approved the archetype yet. `archetypeStatus` is the literal `"ASSUMED"` (`story.ts` line 241). `pickArchetype` returns `status: "ASSUMED"` on every path (line 266), including a tie and an empty score. Test `care words map to caretaker and the status stays assumed` requires `caretaker` and `ASSUMED` from both `buildStory` and `pickArchetype`, with `tie` false. Test `no keyword is a tie, so the first label is assumed` requires `caretaker`, `ASSUMED`, and the hole `archetype tie`. Test `a tie picks the earlier archetype and records the hole` requires the earlier label, `ASSUMED`, and `archetype tie`.

### Also checked

- `words25` equals `why.brandWhy`. Test `the 25-word field equals the brand why`. `buildStory` assigns that field directly (line 243) and does not pad it. See Notes.
- A tiny fact set stays inside ±15 of 100 and of 300. Test `a tiny fact set still returns three story fields inside the word caps`. `countWords` splits on whitespace. Test `countWords splits on whitespace and drops empty pieces`.
- A name longer than 60 characters is cut only on the positioning line. Test `a long name is truncated in the positioning line only`. A blank name becomes `this practice`. Test `a missing name becomes this practice`.
- Exclamation marks and the banned word `elevate` are stripped from the positioning line and from `words100` and `words300`. `elevated` stays. Test `exclamation marks and a banned word are stripped from the line and the long stories`.
- A sentence containing `testimonial` or `5 stars` is left out of the generated story, and the hole `dropped a proof sentence` is recorded. Test `a proof sentence is dropped and the hole is recorded`. The kept sentences `green wordmark` and `wordmark stays` remain.
- The twelve labels live in `ARCHETYPES` in tie-break order, with keywords beside the list (`story.ts` lines 39–188). Unused labels are not written into the story prose. The care-words test rejects every label string inside positioning, the three lengths, and the holes. The chosen label is the `archetype` field alone.
- `buildStory` is pure and the module has no `fetch(`, `node:http`, `node:https`, or `grok`. Test `buildStory is pure and does not call the network`. The same test rejects the word `any`.
- `buildStory` takes `WhyDraft` from the 045 shape. The teardown purity test calls `compileWhy` and passes that draft into `buildStory`.

## 047 Fold competitor cards into the brand notes

### Truths

- The teardown does not claim a gap the user did not state. `wishLines` (`packages/engine/src/brand/teardown.ts` lines 69–78) keeps a line only when the trimmed line starts with `Wish:` and the body is non-empty. `whiteSpaceBody` (lines 47–49) writes `No white space recorded yet.` when that list is empty. Test `no Wish lines produce the empty sentence and zero white spaces` requires `whiteSpaces` `[]`, that sentence, and the absence of `premium` and `authentic`. Test `a mid-line wish is not a white space` rejects `I wrote Wish: inside a sentence` and `- Wish: bullet form`. Test `two Wish lines produce two white spaces and the third section does not say none` requires the two bodies the user wrote, in order, and rejects `No white space recorded yet.` Test `an empty Wish body is ignored` drops `Wish:` and `Wish:` plus whitespace. Test `five Wish lines produce three plus two parked` and test `a fourth wish is parked when four lines are present` keep three white spaces and park the rest.

- Competitor prose from the crawler is quoted, not re-fetched. `buildTeardown` has no import (`teardown.ts` is a single module). `samenessFrom` (lines 56–67) copies report lines. It prefers a line that contains `A shared title pattern` or `No shared title pattern`, which is what `buildCompetitorReport` writes (`packages/crawler/src/cards.ts` lines 16 and 68). If neither phrase is present, a line that contains `shared` is copied. If that is absent too, the section is `Sameness was not computed.` Test `two Wish lines produce two white spaces and the third section does not say none` requires the Sameness section to equal `A shared title pattern: home remodeling.` and requires the teardown to leave out `https://a.example`, `Search volumes`, and the title `Our shared studio`. Test `a report line that contains shared is quoted when the pattern sentence is absent` requires the title line verbatim. Test `buildTeardown does not modify story output and does not import a network client` reads the source and rejects `from "`, `from '`, `require(`, `fetch(`, `node:http`, `node:https`, `playwright`, `@hitchhiker/crawler`, and `story.ts`. The same test calls `buildTeardown` twice and requires the `buildStory` result to be unchanged.

### Also checked

- Five wishes yield three white spaces and two parked items. A duplicate wish across envy, boredom, and the report is kept once. Test `the same wish in envy, boredom, and the report is kept once`. Order is envy, then boredom, then the report. Test `a Wish line already in the report is a white space and envy comes first`.
- A wish or a quote longer than 240 characters ends with three periods, at length 240. Tests `a 1000 character wish is clipped to 240 with three periods` and `envy and boredom quotes cap at 240 characters`. An exact 240-character wish is not clipped. The source contains no ellipsis character. The network-client test asserts that.
- `<script` is stripped. Other markup stays. Test `markdown is not html escaped and script openers are stripped` requires `Tom & Jerry <em>tea</em>` to remain and `&amp;` to stay absent.
- A wish may contain `premium` when the user wrote it. Test `a wish keeps premium when the user wrote it`.
- Carriage returns split wish lines. Test `carriage returns still split Wish lines`.
- Missing sameness is the sentence `Sameness was not computed.` Test `five Wish lines produce three plus two parked` uses a report with no `shared` line and requires that sentence.
- The module does not call a model. The prohibitions in the prompt put the live call in 061.

## UI at 375 and 1440

No file under `packages/app/` is in `git diff --name-only 64b0ccb..HEAD`. Prompts 045, 046, and 047 did not change a screen. No browser session, and no 375 or 1440 screenshot. There is no rendered surface in this group to compare with `packages/app/src/design/`.

## Live Grok

045, 046, and 047 forbid a model call in these modules. Each prompt says the live call goes through the 011 adapter and is wired in 061, and that this module stays the deterministic shaper. D-003 still requires real Grok calls for brand modules. Prompt 061 is the prompt that does that: it calls `think()` with a schema and then runs the draft through `compileWhy`, `buildStory`, and `buildTeardown`. These three commits do not leave a scripted product path in place of a call they were told to make. The source tests reject `fetch(` and, for the why and story modules, reject `grok`. The skipped engine test `live smoke returns a two-field object` belongs to the 011 adapter and stays skipped because `HH_LIVE` was unset.

## File list

`git diff --stat 64b0ccb..HEAD` is eight files, 1802 insertions:

- `packages/engine/src/brand/why.ts`
- `packages/engine/test/why.test.ts`
- `packages/engine/src/brand/story.ts`
- `packages/engine/test/story.test.ts`
- `packages/engine/src/brand/teardown.ts`
- `packages/engine/test/teardown.test.ts`
- `packages/engine/src/brand/index.ts`
- `packages/engine/src/index.ts`

The first six are the prompt file lists. The barrel and `packages/engine/src/index.ts` (lines 162–175) are the one-line re-exports the prompts require: 045 step 8, 046 step 8, 047 step 9. No new package. No new surface. Nothing to revert.

## Notes

These are not failed truths.

- CONTEXT-PACKAGE.md section 9.2 describes a wider Babel Fish output: a Golden Circle why with HOW, WHAT, belief lines, and a 120-word proof story; a second archetype; three positioning statements; a persona; three non-customers. Prompts 045, 046, and 047 define narrower interfaces and say to do one job. The 046 and 047 commits record that. Prompt 061 is the live pass over these shapers. This checkpoint does not build section 9.2.
- `words25` is the brand why, unchanged. Test `the 25-word field equals the brand why` requires that equality. The 100-word and 300-word fields are held to ±15 words. A long imported DP-1.7 can make `words25` longer than 25±15, because clipping it would break the equality check and would cut a why the user already wrote. The default fixture's brand why is 19 words, inside that band.
- If every extracted sentence is a proof sentence, `expandOnly` has nothing left to repeat, so the long field stays the founding bracket. The shaper does not invent a replacement sentence. The shipped fixture keeps non-proof sentences, and that path hits the word cap.

## Verification

Commands run from the repo root on this review. No fix was applied, so there is no second run.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/048-REVIEW.md` | this file |
| `pnpm --filter @hitchhiker/engine test` | exit 0. 275 pass, 0 fail, 1 skipped (`live smoke returns a two-field object`) |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the test run.

No prompt 049 work. No push, no remote, no deploy.

## Scope

No source edit. No fix commit. The only file this session adds is this review.

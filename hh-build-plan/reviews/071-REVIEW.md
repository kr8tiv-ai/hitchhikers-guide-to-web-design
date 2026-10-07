# 071 Review — prompts 068, 069, 070

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. One fix commit. No new feature. This checkpoint closes the spec spine, the seventeen-section PRD, and KPIS.md. Prompt 072 is not started.

HEAD before this review commit: `8d8da8a` (`fix(review): checkpoint 071 does not treat a hyphenated page id as a negative KPI`).

The must-have truths for 068, 069, and 070 hold. Each one below has a test name and a file line. One 070 defect was false on arrival: a hyphenated page id such as `page-2` was refused as a negative number, so a current and a goal in that sentence never stored, and a page id alone never reached the refusal sentence. That is fixed in `8d8da8a`. `pnpm --filter @hitchhiker/engine test` after the fix: 394 pass, 0 fail, 1 skipped (`live smoke returns a two-field object`, which runs only when `HH_LIVE=1`). Two gaps stay as known issues because closing them would change a locked interface or abandon the ported GSD template.

## History

Three build commits, in order, on top of `b97ead3` (the 067 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `5a1faaa` | `b97ead3` | `feat(spec): scaffold .hitchhiker project files` | same, prompt 068 |
| 2 | `754caa6` | `5a1faaa` | `feat(spec): render the seventeen-section PRD` | same, prompt 069 |
| 3 | `5afc1cc` | `754caa6` | `feat(spec): write KPIS.md without invented baselines` | same, prompt 070 |
| fix | `8d8da8a` | `5afc1cc` | `fix(review): checkpoint 071 does not treat a hyphenated page id as a negative KPI` | this review |

The diff from `b97ead3` through `5afc1cc` is the six files the prompts named. The fix stays inside prompt 070's file list.

## Fix

Prompt 070. `hasNegativeNumber` treated every hyphen before a digit as a minus, including a page id. `renderKpis({ siteType: "local", answerText: "current 10 goal 20 on page-2" })` threw `Negative numbers are refused.` DP-2.4 asks which page carries the outcome, and a hyphenated id is a normal page name. `page-2 carries it` threw as well, so the refusal sentence never appeared.

Correction stays inside 070's files. `hasNegativeNumber` in `packages/engine/src/spec/kpis.ts` (lines 64–70) requires the minus to be free of a preceding letter or digit. `blankHyphenatedWords` (lines 72–77) drops ids such as `page-2` before integers are parsed, so the digit inside the id is not a measurement. `renderKpis` applies that blank at line 187. The existing test `negative numbers throw` still rejects `current -5 goal 10`, `-1,200`, and `about −5`. New test `a hyphenated page id is not a negative number and is not a baseline` (`kpis.test.ts` lines 121–136).

`node --experimental-strip-types --test packages/engine/test/kpis.test.ts` after the fix: 15 pass, 0 fail. The full engine suite is the count above.

The second fix slot is unused.

## 068 Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site

### Truths

- Client spec state lives in `.hitchhiker`. `scaffoldProject` joins `dir` with `.hitchhiker` (`packages/engine/src/spec/scaffold.ts` lines 420–421) and writes the four spine files plus `phases/01-dont-panic` through `phases/06-so-long` inside `withStateLock` (lines 460–475). The return value is those four relative paths (line 477). Test `a fresh directory gets four spine files, six phase dirs, and no PRD` requires the four paths, the six directories, `Deep Thought` in STATE.md, and the absence of `PRD.md`, `config.json`, and `.planning`. A temp scaffold in this review wrote the same four files and the same six directories, and `loadState` on that directory is the known issue below.

- Existing GSD state is not overwritten or deleted. If `.planning` exists and `acknowledgeForeignPlanning` is not true, `scaffoldProject` throws `ScaffoldError` before the lock (lines 423–427) and again inside the lock (lines 461–464). It never writes a path under `.planning`. Test `an existing .planning directory blocks the scaffold and stays put` writes `keep-this-planning` and `also-keep`, expects the throw, and reads both bytes back unchanged, with no `.hitchhiker`. Test `acknowledging .planning writes .hitchhiker and does not touch the foreign tree` reads the marker back and checks the foreign directory still lists only `PROJECT.md`.

- Templates are the ported ones, not a new format. The four calls are `renderTemplate("project" | "requirements" | "roadmap" | "state")` (lines 433–436), which reads `packages/engine/templates/gsd/`. Test `scaffoldProject renders the four spine templates under one state lock` requires those four names, `project_name`, one `withStateLock(`, and `replaceViaTemp`. The fresh-directory test requires the GSD headings (`## What This Is`, the requirements tables, `## Overview`, `## Phases`, `## Phase Details`, `## Progress`, `**Phase Numbering:**`, `**Execution Order:**`) and `gsd_state_version` in STATE.md. The same test requires 37 unchecked boxes and forbids `hh-build-plan`, `Scaffold the MIT monorepo`, and `Port GSD spine`. This review's temp ROADMAP listed the six locked phase names and every slice in v2 §5.2, each as `prompt range TBD`, with no checked box and no Guide build roadmap.

### Also checked

- An existing `.hitchhiker/PROJECT.md` throws and the original bytes stay. REQUIREMENTS.md, ROADMAP.md, STATE.md, and PRD.md are not created beside it. Test `an existing PROJECT.md is left unchanged`.
- Empty `siteWhy`, empty hosting, and a newline in the name throw `ScaffoldError` and leave the directory without `.hitchhiker`. Test `empty siteWhy, empty hosting, and a newline in the name write nothing`.
- The date is UTC `YYYY-MM-DD` from `ProjectInfo.now`. The locked interface omitted `now`. The prompt's edge case requires an injected clock, so the optional field is that clock. Test `the date is the UTC day from the injected clock` uses `2026-01-15T23:30:00.000Z` and forbids `2026-01-16`.
- REQUIREMENTS.md has both table headers and zero data rows. v1 and v2 say `Ids only. None yet.` The temp file had no `AUTH-01`, no `[Requirement 1]`, and no example feature row. Test `a fresh directory gets four spine files, six phase dirs, and no PRD` asserts `tableDataRows` is empty and `AUTH-01` is absent.
- A held `state.lock` throws `LockHeld` and writes no PROJECT.md. Test `a live state lock blocks the write`.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary. That matches the prompt.

### Prompt conflict (known, not fixed)

See known issue 2. `loadState` from prompt 007 does not parse this STATE.md. Rewriting the scaffold into the short heading document would drop the ported template. Rewriting `loadState` is outside this prompt's file list.

## 069 Generate the seventeen-section PRD and the assumptions list

### Truths

- The PRD does not pretend assumptions were decisions. `assumptionList` keeps the latest `SKIPPED` or `SOFT` row and drops `ANSWERED`, `SUGGESTED`, and `IMPORTED` (`packages/engine/src/spec/prd.ts` lines 99–107). The line is `- id: value (SKIPPED|SOFT)` (lines 342–344). `show` prints `is not settled (SOFT|SKIPPED)` and leaves the value in Assumptions (lines 141–142). The header states that `SKIPPED` means the value is the assumed text (lines 10–12 and 336). Test `SOFT and SKIPPED answers are assumptions, and ANSWERED answers are not` requires `DP-5.3` as `(SOFT)`, `DP-6.2` and `DP-8.2` and `DP-9.5` as `(SKIPPED)`, a newline flattened to a space, and the absence of `(ASSUMED)`, `DP-2.1`, `DP-4.1`, the suggested sentence, and the imported sentence. Test `a SOFT DP-5.3 is listed under Assumptions and the vibe is not treated as decided` requires the vibe string only inside section 14, `Vibe is not settled (SOFT)` in section 9, and forbids `vibe was decided`.

- Phone performance is specified here, not invented later by QA. Section 11 (`prd.ts` lines 298–309) states Lighthouse mobile at least 90 in performance, accessibility, best practices, and SEO, on real mobile runs of what a phone actually gets (D-006), plus WCAG 2.2 AA and current-minus-two browsers. LCP, CLS, and the lab-proxy INP sentence match v2 §12. Test `the non-functional section states the real mobile floor of 90` requires `90`, `real mobile`, the four category names, `WCAG 2.2 AA`, and `current-minus-two browsers`.

- Full storefronts are a non-goal by default. Section 15 (`prd.ts` lines 349–354) contains the sentence `A full Shopify store is out unless a later escalation says otherwise.` Test `approval stays pending and a full Shopify store stays out of scope` requires that sentence and `PRD approval: pending`, and forbids `PRD approval: approved`. The same test requires the motion sentence `The toolkit is chosen per effect in MOTION.md and is not a library dump on every page.`

### Also checked

- Seventeen headings, in the v1 §10.2 order, use `## 1. Summary` through `## 17. Approval`. Test `seventeen sections render in order`. Test `a section count other than 17 fails` splits on `/^## /m` and requires 17.
- `renderPrd` calls `missingRequired` and throws `PrdError` before a markdown result (lines 382–383). Test `missing required fields throw` expects `DP-2.6`, `DP-2.2`, `DP-5.3`, `DP-6.2`, `DP-9.2`. Test `a blank required value throws before a PRD is returned` uses a whitespace `DP-9.2`.
- The brand excerpt is the first 120 words, cut on a word boundary, plus `.hitchhiker/BRAND.md` (lines 120–124 and 207–224). Test `brand markdown over 120 words is cut on a word boundary and points at BRAND.md`. Test `renderPrd calls missingRequired and quotes BRAND.md without touching the file system` reads the source and forbids `node:fs`.
- An empty assumption list still prints the SKIPPED definition. Test `an empty assumption list still documents SKIPPED, and the function is pure` also requires the portfolio KPI phrase and forbids `%` and `conversion`.
- Exclamation marks in the name, an answer, or the brand file are dropped. Test `an exclamation mark in an answer or the brand file is not copied`.
- No `$10-20`. The seventeen-section test forbids that price and an exclamation mark.

### Prompt conflict (known, not fixed)

See known issue 1. Sections 1, 4, 6, 9, and 16 are filled from the interview and the brand excerpt. `renderPrd` does not call `think`.

## 070 Write KPIS.md with ranges labeled as assumptions

### Truths

- KPIs without data stay empty of fake precision. `KPI_REFUSAL` is the exact sentence `No baseline was given. Do not invent one.` (`kpis.ts` line 19). An empty or numberless answer prints the site type's KPI phrase and that sentence (lines 198–199). Test `tea shop fixture with empty answer text produces the refusal sentence` uses site type `local`, requires `Calls and direction requests` and the refusal sentence, and forbids `%` and any digit. Test `whitespace and numberless answers do not invent a baseline` does the same for `sales`. Test `10 and 20 are numbers mentioned and are not called current or goal` requires `Numbers mentioned: 10, 20` and forbids the words current and goal. Test `one integer or three integers stay unlabeled` covers `current 10 goal` and `current 10 goal 20 and 30`. The hyphen fix keeps a page id out of that list. Test `a hyphenated page id is not a negative number and is not a baseline`.

- Percents originate in the user's answer. Spans are copied from the answer (`kpis.ts` lines 204–208). A lone percent is `From the user:`. A range is `Assumption. From the user:`. Test `a percent is copied from the user and no other percent appears` requires `percentSnippets(markdown)` to equal `percentSnippets(answerText)` for `2.5%`, and requires `current 10 goal 20` to contain no `%`. Test `a percent range is marked as an assumption and quotes the user` requires `Assumption. From the user: 2% to 4%` and `Assumption. From the user: 2-4%`, and checks the same snippet equality. The source has no invented rate table.

### Also checked

- `renderKpis` reads `SITE_TYPES` (import line 10, lookup lines 50–56 and 180–181). Test `renderKpis reads SITE_TYPES and does not call an analytics API` forbids `fetch(`, an `http` URL, and plausible, umami, and gtag. Test `every site type contributes its own KPI phrase` walks `SITE_TYPES`.
- `current 10 goal 20` stores `Current: 10` and `Goal: 20`. Test `current 10 goal 20 are labeled measurements`. Test `reversed words still pair the nearer integer` covers `goal 20, current 10`. Test `commas between digits are one integer` covers `current 1,200 goal 3,400` as `1200` and `3400`.
- An unknown id throws `KpisError` and lists every known id. Test `unknown site type throws and lists the known ids`.
- The tea-shop fixture in this prompt is an empty answer. The test uses site type `local`, which is the local-business row. The prompt does not name a different id.
- No exclamation mark, and the body stays under 200 words. Test `the markdown stays short and has no exclamation mark`.

## Known issues

1. Prompt 069's context says the narrative of sections 1, 4, 6, 9, and 16 is drafted by Grok through the 011 adapter. The same prompt locks `renderPrd` as a pure function with `{ answers, brandMarkdown, name }` and no adapter argument, and step 9 says the caller writes the file. `prd.ts` lines 5–8 record that split and fill those sections from answers and the 120-word brand excerpt. There is no `think` import, no schema, and no cassette. Wiring a live call would make the function async and add a model argument. That is a new surface. Left as a prompt conflict. The assumptions list, the floor of 90, and the storefront non-goal do not depend on that narrative.

2. A scaffolded `.hitchhiker/STATE.md` is the ported GSD template (`Phase: 3 of 6 (Deep Thought)` at `scaffold.ts` line 382, plus `gsd_state_version`). `loadState` in `packages/engine/src/state.ts` (lines 73–109) expects `## Phase` and the other short headings. This review scaffolded a temp project and `loadState` threw `STATE.md is missing heading: Phase`. The file on disk is the template prompt 068 required. Teaching `loadState` to read it, or emitting the short heading document instead, is outside these prompts. A later command that calls `loadState` on a fresh scaffold will throw until one of those is specified.

## UI at 375 and 1440

No file under `packages/app/` changed from `b97ead3` through this review. These prompts write spec markdown, not a screen. No screenshot, and no visual pass is claimed.

## Live model calls

068 and 070 do not ask for a model call. Their modules do not import `packages/engine/src/ai/`. 069 is known issue 1. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`. This run skipped it.

## Verification

`Test-Path hh-build-plan/reviews/071-REVIEW.md` is true once this file is written.

`pnpm --filter @hitchhiker/engine test` after the fix: exit 0, 394 pass, 0 fail, 1 skipped.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 072 is not started.

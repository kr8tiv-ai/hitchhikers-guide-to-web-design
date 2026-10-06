# 032 Review — prompts 029, 030, 031

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `963db17` (`feat(app): add the question card`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is the prompts' truths. Where a goal sentence disagrees with the same prompt's interface block, the conflict is written under Authority.

## History

Three build commits, in order, on top of `6941175`. Messages match the prompt commit lines. They are separate commits. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `67e43fa` | `feat(knowledge): add the offline gallery shortlist` | same |
| 2 | `358119f` | `feat(app): add the local interview shell` | same |
| 3 | `963db17` | `feat(app): add the question card` | same |

Parents: `67e43fa` is `6941175`, `358119f` is `67e43fa`, `963db17` is `358119f`.

## 029 Ship a curated gallery pack and a polite refresh hook

### Truths

- The curated pack is the default Suggest source. `CURATED_PACK_FILE` in `packages/crawler/src/galleries.ts` (lines 10–17) resolves to `packages/knowledge/galleries/curated.json`. Importing the module does not read the file and does not fetch. `suggestReferences` (lines 215–246) takes `GalleryEntry` values and returns at most two Godly and two Awwwards rows, capped by `limit`, and leaves source `other` out of the round. Test `suggestReferences on the curated pack stays inside the limit` loads that file with `loadCurated(CURATED_PACK_FILE)` and passes the entries in. `DEFAULT_GALLERY_ALLOW` is `[]` (line 20). `refreshGalleries` (lines 301–307) returns `{ status: "skipped", reason: "no fetcher" }` when `fetchImpl` is omitted, and `{ status: "skipped", reason: "allow list empty" }` before calling fetch when the allow list is empty. Tests `refresh without a fetcher skips and does not throw` and `an empty allow list performs zero fetches` require those results, and the second passes a fetch that throws if called. The interview engine's suggest command does not read this pack yet. Prompt 035 is the prompt that wires taste cards to it.

- There is no assumed Godly API. `galleries.ts` has no gallery host and no default fetch URL. Test `galleries.ts does not import playwright or refresh on import` reads `galleries.ts` and `index.ts` and requires both to omit `godly.website` and `awwwards.com`, requires `playwright` and `setInterval` and `globalThis.fetch` to be absent, and requires `refreshGalleries(` to appear once (the function) and never in `index.ts`. Test `a JSON object is not treated as a gallery API, and SOTY 2026 is not cached` sends `{ results: [...] }` and requires the cache `entries` array to stay empty. A top-level JSON array is the only payload stored, and it goes through `assertAward`. `NOTICE` lines 125–129 say the pack is offline, does not fetch Godly or Awwwards, and does not assume a Godly API.

- Site of the Day is not labeled Site of the Year. `packages/knowledge/galleries/curated.json` sets Lando Norris `award` to `SOTY 2025` (line 10) and CoMinVi `award` to `SOTD` with `date` `2026-09-30` (lines 20–21). Test `the offline pack keeps Lando as SOTY 2025 and CoMinVi as SOTD` requires `lando.award === "SOTY 2025"`, `cominvi.award === "SOTD"`, `cominvi.award.includes("SOTY") === false`, and the raw date `2026-09-30`. Every other row must be `award: "none"`. `assertAward` (`galleries.ts` lines 106–112) throws on `SOTY 2026` and on an award string that contains both `SOTD` and `SOTY`. Tests `the loader rejects SOTY 2026` and `the loader accepts SOTY 2025 and rejects a SOTD row that says SOTY` cover both throws, including `soty   2026`.

### Also checked

- `suggestReferences` returns `[]` for `limit` 0 and for a negative limit, returns at most `limit`, and does not mutate the input. A `limit` of 10 still returns 4. Test `suggestReferences respects limit and does not mutate the array` freezes the array and compares it to a clone. Test `suggestReferences skips excluded urls and does not backfill from other` drops two Godly urls and still refuses source `other`. Test `suggestReferences filters industry and style world together` requires both filters when both are set.
- Duplicate urls throw at load. Test `duplicate urls throw at load`. Snake_case `style_world` and `motion_level` load into `styleWorld` and `motionLevel`. Test `snake_case pack fields load into GalleryEntry`.
- `cacheIsFresh` treats a stamp older than `7 * 24 * 60 * 60 * 1000` ms, a future stamp, and an unparseable stamp as stale. Test `cacheIsFresh uses the injected clock and a 7 day max age`. Test `a cache older than 7 days is not used` requires one GET and a rewritten `fetchedAt`. A fresh cache returns `{ status: "ok", reason: "cache fresh" }` and does not call fetch. Test `refresh GETs only the allow-listed URL and writes a cache` requires one GET, method `GET`, `redirect: "manual"`, the crawler user-agent, a 10 second `AbortSignal`, and a cache of `{ fetchedAt, entries }`. A duplicate allow url is fetched once. A 302 is not followed. Test `a redirect off the allow list is not followed`.
- The pack has 12 rows. Step 1 allows the two verified awards plus at most ten cited rows with `award: "none"` and `source: "other"`. The ten extra urls are in `CONTEXT-PACKAGE.md`, `context/research/03-awwwards-anatomy.md`, `context/research/04-motion-taxonomy.md`, or `context/sources/soty.html`. The test comment at the top of `galleries.test.ts` records the short pack. There is no `source: "godly"` row, so a suggest round on this file returns the two Awwwards rows. The function still returns Godly rows when the caller passes them.
- Notes start with `Look at`, are one line, and contain no `!`. The loader rejects anything else.
- Step 8 re-exports `loadCurated`, `suggestReferences`, `refreshGalleries`, and `cacheIsFresh` from `packages/crawler/src/index.ts`. The commit names that file. No scheduler was added.

## 030 Build the local chat shell without a default theme

### Truths

- The desk is local and framework-free. `renderShell()` in `packages/app/src/shell.ts` (lines 1–85) returns an HTML string. The test file imports it and does not open a port. `packages/app/package.json` scripts are `test` (`node --experimental-strip-types --test test/**/*.test.ts`) and `write-html`. Dependencies are the existing `@hitchhiker/engine` workspace link and `gsap` `3.15.0` from prompt 010. Test `the package stays free of react, tailwind, and a direct gsap import` requires every dependency name to fail `/react|tailwind/i` and requires `shell.ts` to omit imports of `react`, `gsap`, `tailwindcss`, and `@hitchhiker/engine`. Stylesheets are `tokens.css`, `type.css`, `components.css`, and `shell.css`. The rendered HTML fails a match on `fonts.googleapis`, `fonts.gstatic`, `use.typekit`, and `cdn.`.

- Anti-slop bans are checked by a test, not by taste alone. `assertShellCss` (`shell.ts` lines 127–144) returns a problem for `bg-indigo-600`, for `rounded-full`, and for a `linear-gradient` whose hex is indigo or violet (hue 230–295, saturation above 0.18). `assertShellHtml` (lines 146–168) returns a problem for `!` outside the doctype, an em dash, `elevate`, `lorem`, `bg-indigo-600`, and `rounded-full`. Test `shell css passes the anti-slop checks` reads `shell.css` from disk and requires an empty problem list, a `clamp(` body size, a `44px` minimum, no raw hex, and a `.hh-skip:focus` rule. Test `assertShellCss flags indigo gradients and pill cliches` requires problems for `#4f46e5`, `#7c3aed`, `bg-indigo-600`, and `rounded-full`, and an empty list for the Desk Lamp pair `#8e2f1a` / `#e6a15c`. Test `assertShellHtml ignores the doctype and flags an exclamation` requires a problem for `Ready!`. Test `rendered html has one of each region and no exclamation in the copy` requires `assertShellHtml(renderShell())` to be empty.

- The shell does not yet pretend a question is loaded. The question region (`shell.ts` lines 34–39) is one article whose title is `No question yet.` and whose next line is `One card will sit here when the interview starts.` Status is `Ready.` The transcript line is `The desk is clear. Nothing has been asked yet.` The map note for phase 01 is `The interview. No question is open.` Test `rendered html has one of each region and no exclamation in the copy` requires that title, `Ready.`, one of each `data-region` (`transcript`, `question`, `status`), a viewport meta, the product title, and `Don't Panic.` with a period, and requires the HTML to contain no `input`, `textarea`, or `select`.

### Also checked

- Regions are data attributes. The skip link is the first focusable control and points at `#transcript`. Test `the skip link is the first focusable control`. `shell.css` hides it with `translateY(-120%)` until `:focus`, and sets `min-height: 44px` on `button` and `.hh-skip`. It adds no raw colour.
- `packages/app/scripts/write-html.ts` writes `renderShell()` to `packages/app/index.html`. Prompt 030 step 6 asks for that script. Test `index.html matches renderShell and keeps the question region` normalizes newlines and requires the file on disk to equal `renderShell()`, and requires `data-region="question"`.
- Header text is `The Hitchhiker's Guide to Web Design`. The dek is `Don't Panic. One question at a time. The work saves on this machine.` The large mark is the 010 wordmark (`hh-wordmark`, `aria-label="Don't Panic"`). See Authority for the size conflict.
- The map is the six phase names from Matt Q35, as static chrome. It is the rail the prompt asks for. It is not three feature cards and not a client marketing page.

## 031 Render one question card with Answer, Suggest, and Skip

### Truths

- The card talks to the interview session instead of inventing a second state machine for answers. `reduceCard` in `packages/app/src/card.ts` (lines 73–134) takes `Pick<InterviewSession, "command" | "next" | "lastPushback">`. `type` updates `draft` and does not call `command`. An empty or whitespace `submit` sets `error` to `Write an answer or skip.` and does not call `command`. A `submit` with text calls `command({ type: "answer", text })`. `suggest` calls `command({ type: "suggest" })`. `skip` calls `command({ type: "skip" })`. After a successful command it awaits `session.next()` and copies `session.lastPushback`. `CardState` holds the visible question, the draft, pushback, error, `done`, and `pending`. It does not store an answer record. Tests `an empty submit sets the error and does not call command` (the session throws if `command` is called), `submit with text calls answer, then next`, `suggest calls suggest and then next`, `skip calls skip and then next`, and `a held answer stays on the question and shows pushback`. Test `a second submit while pending returns the same state` requires the same object back for submit, suggest, and skip, and zero command calls. `bindCard` (lines 209–268) is the DOM binder and calls the same reducer. Test `bindCard sends skip once and refuses an empty answer` uses a fake root, refuses the empty answer, and sends one `{ type: "skip" }` when skip is clicked twice during the flight.

- One question is visible. `renderCard` (lines 159–191) emits one `<h2>` for `question.ask`, the why in one paragraph, and `data-question-id` once. `followUps`, `suggest`, and `skipDefault` are not interpolated. Test `the card shows one question and the three exact actions` requires one `h2`, one `data-question-id`, the ask once, and the absence of `FOLLOW-UP-SHOULD-NOT-RENDER`, `SUGGEST-TEXT-SHOULD-NOT-RENDER`, `SKIP-DEFAULT-SHOULD-NOT-RENDER`, and `NEXT-ASK-SHOULD-NOT-RENDER`. It also requires the absence of a coverage report. After `next()` returns another question, test `submit with text calls answer, then next` requires the new ask and requires the old ask to be gone. Done state (`question === null`) renders `Guide Entry is next.` and `The questions on this desk are finished.`, with no buttons and no `approved`. Test `done renders Guide Entry is next and no buttons`.

- User text cannot break out of the card as HTML. `escapeHtml` (lines 55–62) replaces `&`, `<`, `>`, `"`, and `'`. The ask, why, id, draft, pushback, and error all go through it, including attribute values. Test `an ask and a why that contain markup are escaped` uses an ask `Before <script>alert(1)</script> & after`, a why with `<b>`, a draft `</textarea><script>alert(1)</script>`, and an id `A&B<C">`. It requires the escaped forms and requires the HTML to fail `/<script>/`, `/<b>/`, and `/<\/textarea><script>/`.

### Also checked

- Labels are `Answer`, `Suggest for me`, and `Skip`. Each button is `type="button"` with `data-action` `answer`, `suggest`, or `skip`. Answer is `disabled` while the field is empty, while pushback clears the field, and while `pending` is true. Test `a draft enables Answer, and pushback keeps the field empty`.
- `card.css` sets `min-height: 44px` on the actions, stacks them with `display: block`, and switches to a flex row at `40rem`. Focus is `outline: 2px solid var(--rule)` with `outline-offset: 3px`. `.hh-qcard` sets `--rule: var(--color-focus)` because `tokens.css` names the focus colour `--color-focus`. Test `card css stacks the actions and uses the rule outline` requires those rules and requires the file to omit raw hex, `indigo`, `violet`, `purple`, `magenta`, `rounded-full`, `bg-indigo`, `magnetic`, and `!important`.
- The card does not call a model. Suggest is `session.command({ type: "suggest" })`. Prompt 031 says the live Guide call arrives in 034 and 035.
- Step 9 exports `renderCard` and `reduceCard` from `packages/app/src/index.ts`. Test `the app index exports the card functions` requires the export to be the same function. The commit names `index.ts`. `bindCard` stays on `card.ts`.
- `card.css` is not linked from `index.html`. Prompt 031's file list does not include the shell, and the shell must keep `No question yet.` Mounting the card is prompt 034, which has to link `src/card.css` or the textarea and the narrow stack will not apply. `components.css` already gives `.hh-btn` a 44px minimum and the card chrome.

## File list

`git diff --name-only 6941175..HEAD`:

- `NOTICE` (029 step 6)
- `packages/app/index.html` (030, generated by `write-html.ts`)
- `packages/app/package.json` (030, adds the `write-html` script only)
- `packages/app/scripts/write-html.ts` (030 step 6)
- `packages/app/src/card.css` (031)
- `packages/app/src/card.ts` (031)
- `packages/app/src/index.ts` (031 step 9)
- `packages/app/src/shell.css` (030)
- `packages/app/src/shell.ts` (030)
- `packages/app/test/card.test.ts` (031)
- `packages/app/test/shell.test.ts` (030)
- `packages/crawler/src/galleries.ts` (029)
- `packages/crawler/src/index.ts` (029 step 8)
- `packages/crawler/test/galleries.test.ts` (029)
- `packages/knowledge/galleries/curated.json` (029)

No extra feature. Nothing to revert. The files outside a prompt's frontmatter list are the ones that prompt's steps require. No client site, no new remote, no `@theatre/studio`, no new dependency.

## UI

Prompts 030 and 031 changed files under `packages/app/`. This review opened them in Chromium through Playwright, on a local server bound to `127.0.0.1:4173`, and compared them with `packages/app/src/design/` and the desk comps `desk-375-light.png` and `desk-1440-light.png`.

Shipped `index.html` at 375 (viewport 375, content box 360) and 1440 (content box 1425), day and night:

- No horizontal overflow at either width.
- Day background `rgb(243, 235, 221)` (`#f3ebdd`). Body font Literata. The wordmark is the outlined DON'T PANIC mark, 321 by 44 on the phone, large on the desk. The rust spine and the brass kicker match the 010 tokens.
- At 1440 the interview column is 640px wide and the map rail starts at x 807 with width 280. The grid is `704px 280px`. Empty paper stays to the right of the rail, as the 010 desk does from 1100px.
- Night background `rgb(18, 16, 14)`, text `rgb(244, 237, 227)`, accent `rgb(230, 161, 92)` (`#e6a15c`). The wordmark stays ink. The dark theme is the lamp, and the page has no purple gradient and no indigo utility chrome.
- The question slot reads `No question yet.` Status reads `READY.` The skip link is 44px tall and sits above the viewport until focus (y −53). There is no text field on the shipped page.
- The only console error was a 404 for `/favicon.ico`. The prompt does not ask for a favicon.

Question card, rendered into the question region with `card.css` linked, same server:

- 375: one `h2`, buttons `display: block`, each 268 by 44, stacked. Answer is `rgb(142, 47, 26)` (`#8e2f1a`) with cream text. The field shows the draft. Follow-up text is absent. No overflow.
- 1440: Answer, Suggest for me, and Skip sit on one row, each 188 by 44. The textarea focus colour is `rgb(142, 47, 26)`. The stylesheet sets `2px solid var(--rule)`.
- 375 night: page `rgb(18, 16, 14)`, Answer `rgb(230, 161, 92)` at height 44, buttons stacked.

The card uses `hh-qcard`, `hh-kicker`, `hh-btn`, and the Desk Lamp type. It matches the desk comp's card chrome. Two differences are the prompts: the shipped shell is the empty state, and at 375 the card stacks the three actions as blocks, which prompt 031 requires. The comp flex-wraps Answer beside Suggest. No magnetic control, no lorem, no exclamation mark, no `elevate`.

Screenshots were taken for this review and were not committed. The builder described a 375 and 1440 pass in the 030 and 031 commit bodies and did not commit image files. The file lists do not include screenshots.

## Live Grok

None of these three prompts ask for a model call. `galleries.ts` does not call `think` or `fetch` on import. `shell.ts` does not import the engine. `card.ts` sends Suggest to `session.command` and does not import `packages/engine/src/ai/`. There is no scripted stub standing in for a live call this group was supposed to make. The cassette path from 011 is unused here, which matches the prompts.

## Authority

The 029 goal says refresh returns `unavailable` unless a caller passes a fetcher. The same prompt's interface and context block say `{ status: "skipped" | "ok" }` and `{ status: "skipped", reason: "no fetcher" }`. The implementation follows the interface. This review does not rename `skipped` to `unavailable`.

The 029 context asks for 60 to 120 rows and a `source` of `aura`. Step 1 says an honest short pack beats invented awards, and the interface `GallerySource` is `"awwwards" | "godly" | "other"`. The pack has 12 rows and no `aura` source. This review does not invent rows to fill the range.

The addendum says to ship `knowledge/award-sites/`. Prompt 029's file list is `packages/knowledge/galleries/curated.json`. The implementation follows the prompt.

Matt Q9 and v2 section 8 want 2 Godly and 2 Awwwards on taste questions when those cards exist. The suggest function does that when the entries exist. This pack has no Godly item url in the repo, so the default round is the two Awwwards rows. Inventing Godly item urls would break the prohibition on an assumed Godly API. This review does not add them.

CoMinVi's site url `https://www.cominvi.com.mx/` is the builder's assumption. The addendum cites the Holographik post, not that host. A HEAD request on 2026-10-06 returned 200. The award string in the pack is `SOTD`, and the Awwwards record for that date is Site of the Day, which matches the truth. This review does not change the url.

Prompt 030 asks for a smaller line `Don't Panic.` Matt Q34 and the 010 desk make DON'T PANIC the large mark. The shell keeps the large wordmark and starts the dek with `Don't Panic.` This review does not shrink the mark.

v2 section 6 and the design voice keep `elevate` out of sentences. The shell and the card copy do not use it. `assertShellHtml` fails the build if a later edit adds it.

## Notes for later prompts

These are not failed truths.

- `refreshGalleries` writes the cache and returns a status. The return value does not include the entries. A caller reads the cache file. The prompt's return type is `{ status, reason? }`.
- An allow-listed HTML response is skipped and the cache stores an empty `entries` array for up to 7 days.
- `year` and `date` stay on the JSON row. `GalleryEntry` does not include them. The CoMinVi date is asserted on the raw JSON.
- The ten `other` rows are in the pack and are not offered by `suggestReferences`. The prompt's round is 2 Godly and 2 Awwwards.
- `card.css` is not linked from `index.html`. Prompt 034 has to link it when it mounts `renderCard` inside `data-region="question"`.
- The Guide map copy is static. It still says no question is open after a later prompt mounts a card, until that prompt updates the rail.
- The engine live-smoke test is outside this group's verification. It was not run.

## Verification

Run from the repo root on 2026-10-06.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/032-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/crawler test` | 63 passed, 0 failed. Exit 0. |
| `pnpm --filter @hitchhiker/app test` | 31 passed, 0 failed. Exit 0. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

The crawler count is the 46 tests from prompts 026 and 027 plus the 17 gallery tests. The app count is the design-system tests from 010, plus 7 shell tests and 15 card tests. No test was weakened.

## Scope

No new feature. No fix commit. Prompt 033 was not started. Nothing was pushed, deployed, or published.

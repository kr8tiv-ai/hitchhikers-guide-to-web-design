# 040 Review — prompts 037, 038, 039

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-06. Fresh session. One fix commit. No new feature.

HEAD reviewed before the fix: `afe7b55` (`feat(mood): Pinterest intake and Grok vision mood directions`).

Fix: `dfb89a2` (`fix(review): checkpoint 040 keeps the WebGL ceiling sentence in step with the slider`).

This verdict is the must-have truths below, each with a test name or a file line, plus the verification commands. It is those truths. The gaps under Known issues are not failed must-haves, and they are not a new surface this review will build.

## History

Three build commits, in order, on top of `8c55599`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. The fix commit is after them.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `c44de73` | `feat(gallery): clickable gallery walk to a reasoned shortlist` | same, prompt 037 |
| 2 | `bc3b059` | `feat(motion): live motion family previews and the appetite slider` | same, prompt 038 |
| 3 | `afe7b55` | `feat(mood): Pinterest intake and Grok vision mood directions` | same, prompt 039 |
| fix | `dfb89a2` | `fix(review): checkpoint 040 keeps the WebGL ceiling sentence in step with the slider` | this review |

Parents: `c44de73` is `8c55599`, `bc3b059` is `c44de73`, `afe7b55` is `bc3b059`, `dfb89a2` is `afe7b55`.

## Fix

Prompt 038 asks for a 1 to 10 appetite slider with a live preview of the weight ceiling. `applyLevel` in `packages/app/src/motion-previews/index.ts` updated `data-webgl`, the v2 note, and the KB line. It left the sentence "WebGL in the ceiling" on the level-3 text (`webgl: false`). At level 10 the attribute was `true` and the sentence still said no. The motion screenshot at 1440 showed that sentence under "World" and "JS ceiling 250 KB gzip."

The e2e already required `data-webgl="true"` at level 10. That assertion does not read the sentence.

After the fix, `webglCeilingSentence` in `packages/app/src/motion-previews/slider.ts` (lines 79–84) is the sentence, and `applyLevel` (lines 121–122) writes it into `[data-appetite-webgl]`. Test `weight ceilings at 1, 5, and 10 match the v2 table` requires "no" at 1 and 5, and "yes, one context" at 6 and 10, and requires the initial page (level 3) to render the "no" sentence. The Playwright test `motion previews, the appetite slider, and reduced-motion stills at 375 and 1440` requires the visible sentence at level 1 and at level 10. Re-ran green. The 1440 screenshot after that run shows "WebGL in the ceiling: yes, one context."

## 037 Gallery walk with clickable cards

### Truths

- Taste is captured as reasons attached to real sites. `recordVerdict` in `packages/engine/src/gallery-walk.ts` (lines 196–226) refuses an empty why on love or hate until the nudge has been shown, then stores `{ url, verdict, why }`. `writeReferences` (lines 319–349) writes one markdown file per shortlisted URL with `URL:` and a `## Why` section, plus `references/INDEX.md`. Test `an empty love or hate is nudged once, then a blank is allowed`. Test `writeReferences writes three site files and an index with the thread`. Playwright test `walks a fixture pack to 10 loves and a 4 site shortlist at 375 and 1440` fills ten reasons, writes four site files and `INDEX.md`, and requires each why and `https://example.com/godly/1` in the index. The files contain no markdown image.

- Rounds balance Godly and Awwwards picks. `nextRound` calls `suggestReferences`, which calls `referenceCards` in `packages/engine/src/guide/suggest.ts` (lines 66–98). That picker takes at most two `godly` and two `awwwards` and does not backfill `source: "other"`. Test `nextRound returns two Godly and two Awwwards and does not mutate`. Test `six rounds with no love move to narrowing and ask what was missing` requires 2 and 2 on every round. Test `aura.build is included when the pack lists it` keeps the 2 and 2 and adds the aura.build row. The Playwright test requires two `[data-gallery="godly"]` and two `[data-gallery="awwwards"]`.

- Robots.txt is respected for thumbnails. `crawlThumbnail` in `packages/crawler/src/thumbnails.ts` (lines 115–125) calls `allowed()` and throws `RobotsDenied` before `openPage`. Test `crawlThumbnail respects robots.txt and asks for a 1280 by 800 shot` requires that a `Disallow: /` body never opens a page and never fetches the document, and that an allowed URL is shot at 1280 by 800. Test `a robots denial is a placeholder and is not captured again inside 30 days` requires `ROBOTS_NOTE` and a WebP placeholder, with the crawl called once inside the cache window. The gallery e2e seeds that note and requires it on the first card, and requires zero `img` tags for that placeholder.

### Also checked

- Ten loves, or six rounds with no love, move to narrowing. A shortlist of two is rejected when more loves exist. Fewer than three loves keeps every love. Test names match those cases.
- Cards use the 015 `.hh-site` card (`packages/app/src/design/components.css` lines 274–329). `gallery.css` only adds the active ring, the shot image, and the note. Love, Meh, Hate, and Keep this use `.hh-vote` and `.hh-btn`, which have a 44px minimum. L, M, and H mark the focused card. The site link is `target="_blank"` and `rel="noopener"`.
- `packages/engine/src/index.ts` re-exports the walk. The prompt file list does not name it. Deep imports are forbidden, so the test imports from the package root. The commit names the file. It is not a new feature.
- The desk reads the thumbnail cache and does not fetch. See Known issues.

## 038 Motion family previews and the 1–10 slider

### Truths

- The whole D-001 toolkit is visibly integrated in the app. `families` in `packages/app/src/motion-previews/families.ts` has ten previews: vanilla fade, CSS scroll-driven reveal, Motion spring, Lenis, GSAP SplitText, GSAP ScrollTrigger, anime.js, OGL, Three.js, and `@theatre/core`. Each `toolClause` names that tool in one sentence, with one or two example links. The preview modules import those packages (`gsap/ScrollTrigger`, `gsap/SplitText`, `lenis`, `motion`, `animejs`, `ogl`, `three`, `@theatre/core`). CSS `animation-timeline: view()` is in `motion.css` (lines 203–211), with the keyframe fallback on `.hh-motion__cssline` (line 121). `packages/app/package.json` pins gsap 3.15.0, three 0.186.0, ogl 1.0.11, motion 14.0.0, animejs 4.5.0, @theatre/core 0.7.2, and lenis 1.3.26. NOTICE records each registry name, repository, and license. `@theatre/studio` is absent from package.json, the lockfile, and the theatre preview source. Test `families cover research ids except the banned magnetic control` requires every research/04 id except D2, and requires D2 to be absent. Test `the explainer uses the 053 price card and the page bans magnetic controls` requires one "Magnetic buttons are banned." line and no `data-magnetic`. The Playwright test requires ten `[data-family]` cards and that ban.

- Motion appetite is chosen after seeing examples. `renderMotionPage` (`index.ts` lines 61–71) renders the family grid, then `renderAppetite`, then the film explainer. The headline is "See the motion, then pick a number". `renderDp6Supplement` mounts the families on DP-6.1 and the slider on DP-6.2. `weightCeiling` maps levels 1–4 to 90 KB, 5–7 to 160 KB, and 8–10 to 250 KB, with WebGL from level 6. Those KB bands are the research/06 mobile table, and the note strings are the v2 §8.3 table. Test `weight ceilings at 1, 5, and 10 match the v2 table`. The Playwright test moves the slider from 1 to 10 after the cards are on the page, and, after the fix, requires the visible WebGL sentence to change with it.

- Previews are light on phones. Each preview lazy-imports on first intersection and tears down off-screen (`runWhenVisible` in `slider.ts` lines 291–335). Reduced motion paints a still and does not import a library (lines 295–297). WebGL pixel ratio is capped at 2. `claimWebgl` allows one live context. `holdsPoster` keeps a family above the current level as a poster on a coarse pointer or save-data, until the visitor taps Play. A 375px window with a fine pointer is not treated as a phone. Test `a narrow fine-pointer window is not treated as a phone`. Test `only one WebGL preview can be live`. Test `one ticker listener fans out to every preview`. Test `reduced motion paints a still and does not ask for WebGL`. The Playwright reduced-motion page requires ten `[data-still="true"]` and zero `[data-live="true"]`. At level 10 the 1440 shot shows the shader live and the other WebGL card reading "Another WebGL preview is live."

### Also checked

- `movie-explainer.ts` uses the 2026-09-29 Imagine card: starter $0.60, standard $4.40, and 12 times 10 seconds at 1080p is $30.00. Test `the explainer uses the 053 price card and the page bans magnetic controls`.
- Files outside the prompt list, named in the commit: `routes.ts` (the prompt's step 6 adds `/motion` and the DP-6 mount), `boundaries.ts` (the app allow-list for the pinned libraries), `motion.css`, `theatre-state.json` (the checked-in Theatre state), and `pnpm-lock.yaml`. None of these is a new feature. `@theatre/studio` was not added.
- GSAP's registry license is the standard no-charge license, not MIT. D-001 requires GSAP, and NOTICE already records that. 0BSD appears only as transitive `tslib` under Motion, and NOTICE says so.

## 039 Pinterest, screenshots, and the mood analyzer

### Truths

- Mood input becomes palettes and type classes through Grok vision. `analyzeMood` in `packages/engine/src/mood/analyze.ts` (lines 508–527) sends at most 12 images to `deps.think` with `MOOD_SCHEMA` and task `mood`. `buildMoodRequest` (lines 423–455) attaches the image paths and tells the model to return hex palettes and type classes, not font names. `readMoodModel` rejects a non-hex color and a repeated direction palette, and `classifyType` turns a font name into a class plus a guess note. Test `non-hex colors and repeated palettes are rejected`. Test `a font name becomes a class and the guess is noted` turns Helvetica into `grotesk` and Playfair Display into `high-contrast serif`. Test `a six-image cassette returns 3 distinct hex directions` replays through `think()` in `packages/engine/src/ai/think.ts` with `HH_CASSETTE=replay`, a spawn that throws, schema `MOOD_SCHEMA`, and exactly 3 directions of 5 hex colors. The cassette is hand-written. The live smoke `live smoke returns a two-field object` stayed skipped because `HH_LIVE` was unset.

- Pinterest capture is opt-in and polite. `PINTEREST_CAPTURE_DEFAULT` in `packages/engine/src/config.ts` (line 111) is false. `captureBoard` returns immediately with `CAPTURE_OFF_MESSAGE` unless `integrations.pinterestCapture === true` (`pinterest.ts` lines 318–321). A robots disallow throws `RobotsDenied` before `open` (lines 324–334). Scrolls wait `SCROLL_DELAY_MS` (1500) and stop at `PIN_CAP` (60). Test `pinterest capture defaults off`. Test `capture stays off unless the flag is true`. Test `a disallowed board never opens or sleeps`. Test `scrolls wait 1.5 seconds and stop at 60 pins`.

- No login or cookies are used. `createBoardCrawl` opens with `credentials: "omit"` and deletes the `cookie` header on every request (`pinterest.ts` lines 251–258). A login wall or a redirect to `/login` returns an empty list and `LOGIN_WALL_MESSAGE`. Test `a login wall returns an empty list and asks for exports`. Test `a login redirect is treated as a wall even when the flag is clear`. Test `the capture source never stores a jar or signs in` requires no `document.cookie`, a `delete headers.cookie`, and `credentials: "omit"`.

### Also checked

- Deep asks why for at most 5 images. Express sets every why to `ASSUMED` and drops a why the model invented. Test `deep asks why for at most 5 images`. Test `express records no why and marks the field ASSUMED`.
- Images over 10 MB are shrunk before `think()`. Test `images over 10 MB are downscaled before think`.
- The 039 diff is only the prompt file list: `pinterest.ts`, `pinterest.test.ts`, `config.ts`, `mood/analyze.ts`, `mood/schemas.ts`, `mood.test.ts`, the cassette, and `cassettes/mood/README.md`. No UI file. `captureBoard` uses `allowed` and `USER_AGENT` from the 026 crawler. It does not call `crawl()`, because the prompt's `CrawlLike` is `robots` plus `open`.

## UI at 375 and 1440

Prompts 037 and 038 changed `packages/app/`. Prompt 039 did not.

Looked at the gallery in Chromium at 375 and 1440, and at the motion screenshots the e2e wrote (`packages/app/e2e/screens/motion-375.png` before the fix, `motion-1440.png` after the fix). The motion e2e takes both widths after the sentence assertion.

Both screens use the Guide system: paper surface, ink type, rust accent, the Don't Panic wordmark, the rust spine, and the route nav. Vote buttons and the appetite range meet the 44px target from `components.css`. No indigo-on-gray defaults, no purple gradient, no magnetic control, no lorem, no exclamation mark, and the word elevate is not in the copy. Gallery at 375 is one column. Gallery at 1440 is two columns. Motion at 375 is one column. Motion at 1440 is a two-column preview grid, then the slider, then the film and branching cards. The live `/gallery` round is two Awwwards cards. That is the pack gap below, not a layout failure.

## Known issues

- The common thread is `draftThread` in `gallery-walk.ts` (lines 262–279), a concatenation of the reasons already stored. Prompt 037 says Grok summarizes that thread through prompt 047's think path. Prompt 047 is not in the tree. The textarea is editable before `writeReferences`. This review does not add a new `think()` call for it. The must-have still holds: the reasons are stored on the real site files.

- The curated pack from prompt 029 has two `source: "awwwards"` rows and ten `source: "other"` rows, and no `source: "godly"` row. `referenceCards` will not backfill `other`. On `/gallery` with that pack the round is Lando Norris and CoMinVi, both Awwwards, and the dek still says "Four sites at a time, two from Godly and two from Awwwards." The balance tests and the gallery e2e use a fixture pack that contains both sources. Relabeling the `other` rows as Godly would invent a gallery source that prompt 029 refused. This review does not edit that pack.

- The desk never calls `captureThumbnail`. It reads `HH_GALLERY_CACHE` and serves a cached shot from `/api/gallery/shot`. A missing cache entry is the 015 monogram well, not a fetch. Robots are enforced inside `crawlThumbnail` before a page opens. Wiring the crawler into the app would cross the package boundary (`@hitchhiker/app` may depend on `@hitchhiker/engine` only). This review does not add that edge.

- When the pack lists aura.build for the filter, the round is the balanced four plus that row. The dek still says four. The balance truth still holds on that round.

## Verification

Commands run from the repo root on this review, before the fix unless noted:

- `pnpm --filter @hitchhiker/engine test` — 214 pass, 1 skipped (`live smoke returns a two-field object`, `HH_LIVE` unset).
- `pnpm --filter @hitchhiker/crawler test` — 80 pass.
- `pnpm --filter @hitchhiker/app exec playwright test e2e/gallery-walk.spec.ts` — 1 pass. Not re-run after the fix. The fix does not touch the gallery.
- `pnpm install` — lockfile already up to date.
- `pnpm --filter @hitchhiker/app test` — 59 pass before the fix, and 59 pass after the fix.
- `pnpm --filter @hitchhiker/app exec playwright test e2e/motion-previews.spec.ts` — 1 pass before the fix, and 1 pass after the fix, including the visible ceiling sentence.

No prompt 041 work. No push, no remote, no deploy. The gallery screenshot script lived in the temp directory and is not in the commit.

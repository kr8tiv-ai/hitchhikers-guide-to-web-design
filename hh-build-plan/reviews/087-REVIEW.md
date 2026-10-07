# 087 Review — prompts 084, 085, 086

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. One fix commit, already in history. No second fix. No new feature. This checkpoint closes the SEO, sales, and award-site packs, the licensed 3D sourcing tools, and the three site starters. Prompt 088 is not started.

The must-have truths for 084, 085, and 086 hold. Each one below has a test name or a measured run. Commands that this checkpoint could run exited 0. The known issues are gaps the truths do not fail on: a credits-file shape split, an analytics plan that does not build a provider call, a phone gate with no regression test, and a Hostinger create body that adds a list-filter field.

## History

Three build commits, in order, on top of `73a9a14` (the 083 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `e9ca2a7` | `73a9a14` | `feat(knowledge): add SEO, sales, and award-site packs` | same, prompt 084 |
| 2 | `a3e5bbd` | `e9ca2a7` | `feat(3d): licensed 3D sourcing, optimization, and Tripo/Meshy generation` | same, prompt 085 |
| 3 | `1bad167` | `a3e5bbd` | `feat(templates): three site starters with the full toolkit and real integration recipes` | same, prompt 086 |
| fix | `7d44f46` | `1bad167` | `fix(review): checkpoint 087 waits out a real Tripo or Meshy job` | review fix, checkpoint 087 |

## Fix applied

`generate3d` polled eight times, 20 milliseconds apart, then threw. The create call had already been sent. A live Tripo or Meshy job takes minutes, so a confirmed generation always died as "did not finish." `7d44f46` sets `POLL_INTERVAL_MS` to 2000 and `POLL_BUDGET_MS` to 10 minutes, the same ceiling Imagine uses (`packages/assets/src/three-d/generate.ts` lines 48–50 and 298–302). `GenerationFailedError` still appends "No charge was recorded." Test `generation keeps polling for the Imagine ten-minute budget` locks those two constants. The cap-before-confirm test and the yes-before-fetch test were left as they were. Assets tests after the fix: 122 pass, 1 skipped, 0 fail.

## 084 Write SEO, sales, and award-site packs without fake numbers

### Truths

- SOTD is not mislabeled SOTY. Test `award-sites names the sourced awards and keeps SOTD off SOTY` (`packages/knowledge/test/market-packs.test.ts` lines 76–119). The Lando Norris line includes `SOTY 2025` and excludes `SOTD`. The CoMinVi line includes `SOTD`, `2026-09-30`, and `not Site of the Year`, and excludes `SOTY`. Every line that contains `2026` is that CoMinVi line or the sentence `There is no 2026 Site of the Year yet` plus `SOTY 2026 was not announced as of the addendum date`. The pack must not contain `SOTY 2026 winner`. Each of those three claims is followed by a `Source:` line that cites `RESEARCH-ADDENDUM.md`. The same test requires `Godly has no assumed API`, `Do not crawl`, the path `packages/knowledge/galleries/curated.json`, and no `godly.website` URL.

- The packs refuse fake precision. Test `seo does not invent search volumes` (lines 122–130) fails on `/\d+\s+searches/` and on any `%`, and requires `Search volumes are not estimated` plus the sentence that the pack does not promise an answer-engine citation. Test `sales does not invent persuasion percents` (lines 133–140) fails on `/\d+%/` and on any `%`, and requires `Proof comes only from the user`, `No dark patterns`, and `If a source has no number, this pack has no number`. Test `three market packs parse, lint, and source every number` (line 56) runs `parsePack`, `lintPackClaims`, and `unsourcedNumbers` on seo, sales-psychology, and award-sites.

### Also checked

- The 084 diff is the four files the prompt lists.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 085 3D sourcing: CC0 GLBs and Tripo/Meshy tools

### Truths

- 3D assets are licensed, credited, and optimized. Licence capture is `CC0-1.0` or `CC-BY-4.0` (`packages/assets/src/three-d/credits.ts` lines 19 and 69–72). Tests refuse the rest without a download: `Poly Haven search and download keep CC0 and the include map`, `ambientCG prefers the 1K zip and refuses a non-commercial record`, `Kenney parses the catalog and refuses a pack that is not CC0`, `Quaternius saves a direct file and stops on an itch-only or non-commercial page`, `Sketchfab keeps CC0 and CC-BY, and refuses the rest without a download`. Test `credits append and the options stay in plain words` writes a `CREDITS.json` array and checks `renderCreditsSnippet` for the credits section, the CC0 name, and the CC-BY credit line (lines 468–500). That snippet is the credits page the 085 prompt asked `credits.ts` to render. Test `optimizeGlb writes Draco and Meshopt GLBs and resizes textures` covers both encoders. Test `fixture GLB is a tiny original CC0 triangle` covers the committed fixture.

- Generated 3D needs a cost preview and a yes. `generate3d` quotes, refuses a quote over `cap` before `confirm` and before fetch, then waits for `confirm` (`packages/assets/src/three-d/generate.ts` lines 143–153). A declined confirm throws `GenerationDeclinedError` and does not fetch. Test `generation quotes, refuses the cap, and waits for a yes` (lines 528–604) uses a fetch that throws, asserts `confirms === 0` on both cap refusals, and asserts zero calls when confirm returns false. Test `Tripo and Meshy poll to a GLB only after a yes, and errors record no charge` runs the paid path only after confirm. `explainOptions` returns cards `a` through `f` in plain words, with the phone ceiling on appetite 8 and the Tripo and Meshy prices on card `e` (credits.ts lines 108–154; the same credits test).

- Phones get a budget, not a desktop scene. `PHONE_GLB_BYTES` is 1.5 MB and `PHONE_TRIANGLES` is 150000 (`packages/assets/src/three-d/budget.ts` lines 14–15). `checkBudget` applies that ceiling at appetite 8 and at appetite 10 (lines 53–61). Test `budget follows the motion appetite at levels 6, 8, and 10` (lines 176–209) requires a poster when appetite is 6 and the file has weight, accepts the ceiling at levels 8 and 10, and rejects one byte or one triangle over the ceiling at both 8 and 10. `levelFromMotion` reads the `Appetite: N of 10.` line that `packages/engine/src/spec/motion.ts` writes.

### Also checked

- Injected HTTP covers every source and both generators. Keys are not written into errors by the generation tests.
- Extra files beyond the prompt list: `packages/assets/test/fixtures/three-d/triangle.glb` (step 2 requires a tiny CC0 fixture) and `pnpm-lock.yaml` (the new optimizer dependencies). Both stay.
- `PHONE_TEXTURE_MB` is 32 (budget.ts line 16). The prompt named bytes and triangles. The extra ceiling does not loosen those two.

## 086 Site starter templates, feature recipes, tracking

### Truths

- Generated sites start from tested templates with the full toolkit wired per effect. Test `listTemplates names the three starters`. Test `registerEffect boots only the named loader`. Test `wireLenis uses one ticker callback and updates ScrollTrigger on scroll`. Test `one WebGL canvas id is claimed and a second id throws`. Test `CSS scroll-driven animations refuse a Lenis page`. Test `theatre playback follows the shared ticker and skips reduced motion` requires `@theatre/core` and forbids `@theatre/studio` (also asserted in `shared modules are copied into each starter and the blank page does not import them`, lines 448–450). That copy test requires the blank Astro page, the blank Next page, and `vite-react-world/index.html` to stay off the effect imports. Test `each starter builds and the blank bundle omits unused libraries` built all three starters in this run (149106 ms) and passed. Pins in the built Next and Vite installs: `@theatre/core` 0.7.2, `gsap` 3.15.0, `lenis` 1.3.26, `motion` 14.0.0, `animejs` 4.5.0, `ogl` 1.0.11, `three` 0.186.1, `react` 19.3.0, `next` 16.4.0, `vite` 8.3.3.

- Integrations are real recipes, not mentions. Test `contact, resend, stripe, shopify, and booking dry runs do not send`. Test `newsletter adapters share one interface and the dry run stays local` covers Kit, Mailchimp, MailerLite, Beehiiv, Brevo, Klaviyo, and Hostinger Reach. Hostinger's plan is `POST https://developers.hostinger.com/api/reach/v1/contacts` (`packages/templates/recipes/newsletter/adapters.ts` lines 171–186), which is `createANewContactV1`. Test `blog, portfolio, and video dry runs check shape` includes the Keystatic option (`keystatic-local` at templates.test.ts line 382). The blog README pins `@keystatic/core@0.6.9` and says it is not installed on the blank starter. `keystaticConfig` in `packages/templates/recipes/blog/dry-run.ts` is a plain object. Test `analytics fires KPI events and holds GA4 until consent` (lines 399–416) locks the KPI names and the consent gate. See known issues for what that test does not lock.

- Blank templates already meet the phone gate. D-006 requires Lighthouse on a real mobile test, all four scores at least 90. This session built each starter outside the repo and ran `lighthouse@13.5.0` three times on `http://127.0.0.1/<port>/` with `--form-factor=mobile` and `--screenEmulation.mobile`. The Astro run-1 report has `formFactor: "mobile"`, screen 412×823, device scale 1.75, and a Moto G Power user agent. Next and Vite used the same runner. Scores are performance / accessibility / best-practices / SEO.

| Starter | Run 1 | Run 2 | Run 3 | Median |
| --- | --- | --- | --- | --- |
| astro-default | 100/100/100/100 | 100/100/100/100 | 100/100/100/100 | 100/100/100/100 |
| next-app | 99/100/100/100 | 99/100/100/100 | 91/100/100/100 | 99/100/100/100 |
| vite-react-world | 100/100/100/100 | 100/100/100/100 | 100/100/100/100 | 100/100/100/100 |

Every run is at least 90 in all four categories. The low number is Next performance run 3 at 91. No file in the repo asserts these scores. That missing regression test is a known issue, not a failed measurement.

### Also checked

- `scaffold copies a starter and the chosen recipes without secret values` passed.
- `optimize-media plans image sizes and skips video when ffmpeg is missing` passed.
- `fetch-assets writes a permitted file and refuses a forbidden licence` passed. Its allowed strings are `CC0` and `CC-BY-4.0` (`packages/templates/shared/fetch-assets.ts` line 9).
- Extra files under `packages/templates/shared/` (css-scroll, anime, vanilla, Motion island, effect modules, blank.css, bundle report, credits JSON, favicon, theatre state) are the helpers the prompt steps require and then copy into each starter. They are not a new product surface. They stay.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## Known issues

- CREDITS.json has two shapes. Prompt 085 writes a JSON array of `{name, author, license, link, usedFor, category}` with licence `CC0-1.0` or `CC-BY-4.0`, and `renderCreditsSnippet` turns that array into HTML. The test locks both. Prompt 086's credits page and `fetch-assets` read `{assets:[{file, source, license, author, url?}]}` and accept the licence string `CC0`, which rejects `CC0-1.0`. The 086 page does not read an 085 array. Unifying them would change a shape both prompts' tests lock. Left as a known issue. The 085 key link "CREDITS.json feeds the site credits page" is met by the snippet that prompt asked `credits.ts` to render.

- Analytics. `planTrack` returns `{sent: true}` for a known event (`packages/templates/recipes/analytics/track.ts` lines 18–23). It does not build a `plausible`, `umami.track`, or `gtag('event', ...)` call. The test name says the recipe fires KPI events. The assertions check `isKpiEvent`, `planTrack(...).sent`, and the GA4 script URL. Consent gating is real. A provider event call is not. Research names the event ids and does not name a call API, so this review does not invent one.

- Phone gate has no committed test. The measurement above is the evidence. A future edit can drop a score under 90 without `pnpm --filter @hitchhiker/templates test` failing. A Lighthouse test was not added. It needs Chrome, it is slow, and it is outside the prompt's unit-test file list as a new CI surface.

- Hostinger Reach. The create body is `{email, subscription_status: "subscribed"}` (adapters.ts line 184). The published `ReachV1ContactsStoreRequest` fields are email, name, surname, phone, note, and tag ids. `subscription_status` is a list-contacts filter, not a create field (Hostinger Python SDK docs for that model, and the PHP SDK's `listContactsV1`). Email is present and the URL matches create. The extra field is untested against a live account. The newsletter test does not lock the field. Left in place.

- Shopify Buy Button uses `https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js` (`packages/templates/recipes/shopify/dry-run.ts` line 10). The URL is the vendor's unpinned path. The dry run does not send.

- `shouldUsePoster` is true at viewport width 430 or below (`packages/templates/shared/webgl.ts` lines 32–33). A landscape phone wider than 430, with more than four cores, can take the WebGL path. `checkBudget` still applies the 1.5 MB and 150000-triangle ceiling at every 3D appetite. Not a failed 085 truth.

- `@playwright/test` is not a starter dependency. `qa.spec.ts` is present, and test `qa spec covers console, failed requests, three widths, and reduced motion` asserts the source. Playwright was not executed.

## File list

From `73a9a14` through `7d44f46`:

- 084: `packages/knowledge/packs/seo/SKILL.md`, `packages/knowledge/packs/sales-psychology/SKILL.md`, `packages/knowledge/packs/award-sites/SKILL.md`, `packages/knowledge/test/market-packs.test.ts`
- 085: the ten source, optimize, budget, generate, and credits files the prompt lists, `packages/assets/package.json`, `NOTICE`, plus `packages/assets/test/fixtures/three-d/triangle.glb` and `pnpm-lock.yaml`
- 086: `packages/templates/astro-default/`, `packages/templates/next-app/`, `packages/templates/vite-react-world/`, `packages/templates/shared/`, `packages/templates/recipes/`, `packages/templates/src/index.ts`, `packages/templates/test/templates.test.ts`, `NOTICE`
- Fix: `packages/assets/src/three-d/generate.ts`, `packages/assets/test/three-d.test.ts`

No file under `packages/app/`. No new package category, no library swap.

## UI at 375 and 1440

No file under `packages/app/` changed from `73a9a14` through `7d44f46`. These prompts do not change a Guide app screen. No screenshot of the Guide app, and no visual pass of `packages/app/src/design/` is claimed.

Starter source was read. `blank.css` sets paper `#f3ecdf` and ink `#1b1612`. The blank pages have a title, a description, and a credits link. The source has no indigo utility palette, no purple gradient, no magnetic-button script, and no lorem. Lighthouse's mobile emulation is a score run, not a design-system screenshot at 375 and 1440. `qa.spec.ts` names those widths and was not executed in a browser.

## Live model calls

084, 085, and 086 do not ask for a Guide model call. The diff does not touch `packages/engine/src/ai/`. Tripo and Meshy go through `generate3d` with a quote, a cap, and a confirm. Nothing in these commits is a scripted stub standing where a live 011 call was required.

## Verification

`Test-Path hh-build-plan/reviews/087-REVIEW.md` is true once this file is written.

`pnpm install`: exit 0. Lockfile already up to date. Done in 658 ms.

`pnpm --filter @hitchhiker/knowledge test`: exit 0, 40 pass, 0 fail.

`pnpm --filter @hitchhiker/assets test`: exit 0, 122 pass, 1 skipped (`one low-cost still under a ten cent cap` needs `HH_LIVE=1` and `XAI_API_KEY`), 0 fail.

`pnpm --filter @hitchhiker/templates test`: exit 0, 36 pass, 0 fail.

Lighthouse mobile, three runs each, recorded above. All four categories at least 90 on every run.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 088 is not started.

# 028 Review — prompts 025, 026, 027

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `91593b4` (`feat(crawler): write competitor cards without fake volumes`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is the prompts' truths. It is a general impression of the tree only where a note says so. Where a goal sentence disagrees with the same prompt's interface block, or where v2 asks for a wider surface than the prompt's steps, the conflict is written under Authority.

## History

Three build commits, in order, on top of `f8abe1e`. Messages match the prompt commit lines. They are separate commits. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `10c245b` | `feat(engine): ingest PDF text and PNG dimensions` | same |
| 2 | `78350ea` | `feat(crawler): respect robots.txt and capture two viewports` | same |
| 3 | `91593b4` | `feat(crawler): write competitor cards without fake volumes` | same |

Parents: `10c245b` is `f8abe1e`, `78350ea` is `10c245b`, `91593b4` is `78350ea`.

## 025 Ingest a brand PDF and grade an image file

### Truths

- PDF text extraction does not depend on a system poppler install. `extractPdfText` in `packages/engine/src/ingest.ts` loads `pdfjs-dist/legacy/build/pdf.mjs` and reads the page text items in process (lines 251–276). The file has no `pdftotext` string and no `child_process` import. Test `ingest.ts does not name a text extractor binary or a process spawn module` reads that source and requires both strings to be absent. Test `the committed slogan fixture is extracted` calls `extractPdfText` on `packages/engine/test/fixtures/slogan.pdf` and requires `Slogan: Bring a towel`. This review's engine run extracted that line. `NOTICE` lines 106–113 record `pdfjs-dist` 5.4.530, Apache-2.0, repository `https://github.com/mozilla/pdf.js`. The installed `package.json` license field is `Apache-2.0`, and the installed `LICENSE` file is the Apache License 2.0. The pin in `packages/engine/package.json` is `5.4.530`, and `pnpm-lock.yaml` resolves that exact version.
- Imported fields are marked IMPORTED. `suggestAnswerPatches` (`ingest.ts` lines 367–383) returns `AnswerRecord` values with `status: "IMPORTED"` for a line-start `Slogan:` (`DP-1.3`), `Colors:` (`DP-1.2`), and `Do not use:` (`DP-1.9`). A missing label is omitted. Test `an explicit Slogan label becomes one IMPORTED patch and nothing else` requires exactly `[{ id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" }]`. Test `lowercase and mid-line labels are ignored, and only labelled fields are kept` requires those three IMPORTED records and an empty array for `slogan:` in a paragraph. `importBrandGuide` (`ingest.ts` lines 454–460) sends the text and page-image paths through the caller adapter and marks each kept field IMPORTED, paired with `happy with this?`. Test `importBrandGuide replays a cassette and does not spawn` requires `{ id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" }` and `card: "happy with this?"`.
- Images are measured, not rewritten. `readImageFacts` (`ingest.ts` lines 349–358) reads the file, takes width and height from the PNG IHDR or the JPEG SOF, and returns `bytes`, `width`, `height`, and a warning when the longest side is under 512. The function has no write. Test `a 1x1 PNG warns and the file bytes stay put` writes the 1x1 fixture, requires width 1, height 1, `bytes` equal to the fixture length, warning `Longest side is 1px, under 512.`, and requires the file bytes after the call to equal the bytes before it.

### Also checked

- The 25 MB guard uses `statImpl` and throws `TOO_LARGE` before `readFile` when the reported size is over `25 * 1024 * 1024`. Test `a file over 25 MB is refused before it is parsed` feeds a non-PDF body with an oversized stat and requires `TOO_LARGE`. A size equal to the cap still extracts the slogan.
- `extractPdfText(file, { root })` resolves the path and rejects a file outside the root after `realpath`. Test `a file outside the root is rejected and a file inside is read` requires `OUTSIDE_ROOT`. Test `a missing file throws IngestError NOT_FOUND` requires `NOT_FOUND`. Test `text past the cap keeps the prefix and sets truncated` requires `truncated: true` and a prefix of length `TEXT_CAP` (100,000).
- Label matching is case-sensitive and line-start. The lowercase test covers `slogan:`, a mid-line `Slogan:`, a leading space, an empty `Slogan:`, and a testimonial line that produces no patch.
- JPEG SOF measurement is extra inside the same function. The prompt allowed `UNSUPPORTED` for JPEG. Test `a 512px side does not warn, and JPEG SOF is measured` requires 640 by 480 and a null warning. A GIF throws `UNSUPPORTED`.
- `suggestAnswerPatches` stays. `importBrandGuide` is the additional path from the goal. `DP-1.9` stays on the label path. The live schema's enum is `DP-1.1` through `DP-1.8` (`BRAND_VOICE_IDS`). In `interview/tree.yaml`, those ids write `BRAND.md` or `VOICE.md`. `DP-1.9` writes `ASSETS.md#inventory` and `ASSETS.md#protected`. Test `importBrandGuide drops blank values, duplicates, and ids that are not brand or voice` drops a blank, a duplicate `DP-1.3`, and `DP-9.9`.
- Step 8 exports `extractPdfText`, `readImageFacts`, `suggestAnswerPatches`, and `importBrandGuide` from `packages/engine/src/index.ts` lines 99–102. `packages/engine/src/boundaries.ts` line 19 adds `pdfjs-dist` to `allowExternal`. Test `package.json dependencies match BOUNDARIES` passed. The commit names that file. `slogan.pdf` is the fixture step 2 asks to commit. `pnpm-lock.yaml` is the pin for the install.
- Optional `@napi-rs/canvas` 0.1.100 is MIT (installed `package.json` license field, repository `https://github.com/Brooooooklyn/canvas`). `NOTICE` lines 116–120 record it. `ingest.ts` does not import it.

## 026 Crawl a public page with robots.txt and screenshots

### Truths

- robots.txt is checked before navigation. `crawl` (`packages/crawler/src/crawl.ts` lines 117–126) parses an http(s) URL, fetches `origin + /robots.txt`, and calls `allowed` before `fetchDocument` and before `openPage`. A deny throws `RobotsDenied`. Test `a disallowed /secret path never fetches the document or opens a page` requires `RobotsDenied`, one fetch, that fetch's URL ending at `/robots.txt`, and zero `openPage` calls. Test `a non-200 robots.txt other than 404 throws once and does not open a page` requires one fetch and zero viewports on a 503. Test `a failed robots fetch is not retried` requires one attempt and zero `openPage` calls. Test `a 404 robots.txt allows the page` continues to both viewports. `allowed` is `packages/crawler/src/robots.ts` line 64.
- Desktop and mobile captures both exist. `DESKTOP_VIEWPORT` is 1440 by 900 and `MOBILE_VIEWPORT` is 390 by 844 (`crawl.ts` lines 6–7). On an allow, `crawl` calls `openPage` once per viewport and stores both buffers. Test `an allowed page captures both viewports and sniffs next` requires the viewport list `[DESKTOP_VIEWPORT, MOBILE_VIEWPORT]`, `screenshots.desktop` equal to the fake PNG labelled `1440`, `screenshots.mobile` equal to the fake PNG labelled `390`, and `goto` called twice with the page URL. `stackHint` is `next` because the fixture HTML contains `/_next/static`.
- Godly and Awwwards are not default targets. `crawl(url, deps)` takes the one URL the caller passes. The package has no host list and no default URL. Test `the package does not target galleries or search engines` reads `robots.ts`, `crawl.ts`, and `index.ts` and requires them to omit `godly.website`, `awwwards.com`, `google.com/search`, and `bing.com/search`. A search of `packages/crawler/src` finds those names only in that test.

### Also checked

- `User-Agent` is `HitchhikerGuideBot/0.1` and is sent on the robots fetch and the document fetch. Test `an allowed page captures both viewports and sniffs next` requires that header and `credentials: "omit"`. Test `the crawler user-agent is the one allowed() sees` uses a body that disallows only `HitchhikerGuideBot` and requires `RobotsDenied` with no `openPage`.
- `Disallow: /` denies every path. `Disallow: /admin` denies `/admin` and its children, and allows `/administrator`. An empty `Disallow` allows. `*` applies when no specific block matches. Those are tests in `packages/crawler/test/robots.test.ts`.
- A robots body longer than `500 * 1024` code units denies. Test `parseRobots keeps user-agent groups and stops at 500 KiB` requires `allowed` to return false for a string of that length plus one. Test `a robots file larger than 500 KiB denies before navigation` requires `RobotsDenied` and zero viewports. Test `a declared robots content-length above 500 KiB denies without reading the body` requires the body reader to stay idle.
- `file:`, `javascript:`, and `ftp:` throw `BadUrlError` with zero fetches. Test `non-http URLs are refused before any fetch` covers them. A userinfo URL is refused the same way. A redirect count above 3 throws `RedirectError` before `openPage`.
- `sniffStack` is pure. Test `sniffStack is pure and matches shopify, webflow, next, then unknown` covers `cdn.shopify.com`, `webflow`, `/_next/static`, and an empty page. Shopify wins when all three markers are present. `clip` caps the excerpt at 4,000 characters. The allowed-page test requires `excerpt.length === 4000`.
- `createBrowser` dynamic-imports the specifier `playwright` and is absent from the unit-test call graph. Test `createBrowser is exported and does not load playwright until it is called` requires `import(specifier)` and requires the source to have no static `from "playwright"`. The crawler suite finished in under a second with no browser download. `packages/crawler/package.json` has no dependency on playwright. The prompt says to record and pin playwright only if it is added. It was not added, so `NOTICE` is unchanged for this package.
- `packages/crawler/package.json` test script is `node --experimental-strip-types --test test/**/*.test.ts`. That is the harness step 9 allows when the prompt 001 stub is still in place.

## 027 Turn a crawl into competitor and SEO notes

### Truths

- Competitor notes are derived from crawl fields plus the user's reason. `buildCompetitorReport` (`packages/crawler/src/cards.ts` lines 79–121) takes `CrawlResult` values and prints `finalUrl`, `title`, each h1, and `stackHint`. `Loved for:` is the underscore `_`, because the prompt says only the user knows that line. Test `two identical titles name the shared words` requires the URL headings, `Loved for: _`, and the sameness line. Test `a fourth result throws and one result still renders` requires the final URL, the title, `Stack: webflow`, and `H1: No h1 found`. The user's reason is `referenceCard({ url, note })` (lines 140–142). Test `referenceCard records the user's reason and does not invent one` requires the URL printed as given and `Loved for:` followed by the trimmed note `The quiet grid and the type scale`. The card module does not call `crawl`.
- Search volumes are not generated. The SEO section copies a non-empty `description` and the h1 texts, then ends with the sentence `Search volumes are not estimated.` (`cards.ts` line 119). There is no volume field and no ranking field. Test `seo section quotes the description and does not invent searches` uses the description `Emergency plumbing in Red Deer`, requires that exact phrase and the h1 `Burst pipe repair`, requires the closing sentence, and requires the report to fail `/\d+\s+searches/`. The excerpt `UNIQUE_EXCERPT_MARKER 5000 searches should not leak` is absent from the report. Test `referenceCard records the user's reason and does not invent one` requires the same regex to fail on the reference card.
- At most three competitors enter the report. `MAX_COMPETITORS` is 3 (`cards.ts` line 14). A fourth result throws `At most 3 competitor results can enter the report.` Test `a fourth result throws and one result still renders` requires that throw, and requires a three-result report to omit `https://c.example/4`. Test `three distinct titles have no shared title pattern` requires exactly three `- URL:` lines.

### Also checked

- `sameness` lowercases titles, drops tokens shorter than 4 characters, and matches equal word sets. Test `short words drop so both titles reduce to home remodeling` requires `A shared title pattern: home remodeling.` for `The Home Remodeling Co` and `Our Home Remodeling`. Test `three distinct titles have no shared title pattern` requires `No shared title pattern in this set.` Test `titles in another script use the same lowercase path` requires a shared line for `Ремонт квартир` / `ремонт квартир` and for the same CJK title twice.
- The report heading is `# Competitors`. The identical-title test requires the source to contain no `!` and no em dash. The module's own strings have neither. An empty h1 list renders `No h1 found` and keeps the page (test `an empty h1 list renders No h1 found and keeps the page`). URLs are printed as given (test `urls are printed as given`).
- `referenceCard` documents the threshold as `REFERENCE_NOTE_MIN_LENGTH` of 12. Test `referenceCard rejects a blank, filler, or short note` throws on `""`, whitespace, `nice`, `cool`, `love it`, those phrases in other case, and 11 characters. Twelve `a` characters is kept.
- Test `the card module does not crawl or open the network` reads `cards.ts` and requires it to omit `crawl(`, `fetch(`, `playwright`, `node:http`, and `node:https`. The crawler suite has no live socket. `cards.ts` imports the `CrawlResult` type from `crawl.ts` and does not call `crawl`.
- The three functions are exported from `cards.ts`. Prompt 027's file list is `cards.ts` and `cards.test.ts`. `packages/crawler/src/index.ts` was left unchanged, which keeps the commit inside that list. Tests import `../src/cards.ts`.

## File list

`git diff --name-only f8abe1e..HEAD`:

- `NOTICE` (025)
- `packages/crawler/package.json` (026, test script)
- `packages/crawler/src/cards.ts` (027)
- `packages/crawler/src/crawl.ts` (026)
- `packages/crawler/src/index.ts` (026)
- `packages/crawler/src/robots.ts` (026)
- `packages/crawler/test/cards.test.ts` (027)
- `packages/crawler/test/crawl.test.ts` (026)
- `packages/crawler/test/robots.test.ts` (026)
- `packages/engine/package.json` (025)
- `packages/engine/src/boundaries.ts` (025 harness, named in the commit)
- `packages/engine/src/index.ts` (025 step 8)
- `packages/engine/src/ingest.ts` (025)
- `packages/engine/test/fixtures/slogan.pdf` (025 step 2)
- `packages/engine/test/ingest.test.ts` (025)
- `pnpm-lock.yaml` (025, `pdfjs-dist@5.4.530` and its optional `@napi-rs/canvas@0.1.100`)

No extra feature. Nothing to revert. The files outside a prompt's frontmatter list are the ones that prompt's steps require, or the boundary harness the dependency test forces. No client site, no new remote, no `@theatre/studio`.

## UI

No file under `packages/app/` changed in `f8abe1e..HEAD`. This group has no screen to open. There is no 375 or 1440 capture for these prompts, and no visual pass is claimed.

The new strings are library messages and markdown notes. A scan of `ingest.ts`, `cards.ts`, `crawl.ts`, and `robots.ts` finds no em dash, no `elevate`, and no `lorem`. Exclamation marks in those files are the TypeScript `!` operator. The competitor report test requires the generated fixture to omit `!` and the em dash.

## Live Grok

025's goal adds `importBrandGuide(text, pageImages, adapter)`. The function builds a `ThinkRequest` with task `import-brand-guide`, `BRAND_GUIDE_SCHEMA`, the guide text, and the page-image paths (`ingest.ts` `brandGuideRequest`, lines 411–422). The adapter in test `importBrandGuide replays a cassette and does not spawn` is `think()` from `packages/engine/src/ai/think.ts`, with `HH_CASSETTE=replay`. The cassette key includes the task, model, effort, schema, input, and images. Replay validates the stored result against `req.schema` (`think.ts` lines 277–281) and returns it. The test requires zero spawn calls, the same image paths on the request, and the guide text in the input. The input is required to omit `%PDF`. The PDF bytes stay in `extractPdfText`.

On a live call, `planGrokCall` in `packages/engine/src/ai/grok-cli.ts` (lines 225–234) attaches those image paths as content blocks when the CLI help lists `--prompt-json` or `--prompt-file`. The pre-existing test `images switch to --prompt-json content blocks` covers that attachment. This prompt's cassette does not call the network. The engine live-smoke test stayed skipped unless `HH_LIVE=1`.

026 and 027 do not call a model. `cards.ts` does not call `crawl` or `fetch`.

Nothing in this group left a scripted answer in place of a call the prompt asked to make. `suggestAnswerPatches` remains the label path the goal calls the cheap path.

## Authority

Matt Q11 says offer to elevate a provided asset. v2 section 6 says `happy with this?` and an offer to improve the asset, and says the word `elevate` stays out of sentences. Prompt 025's goal asks for a `happy with this?` card on each imported brand or voice field. The card string is that phrase. This review does not add the word `elevate`.

Matt Q13 says an uploaded brand guide is understood, with every step skippable. Matt Q32 lists PDFs, images, and competitor URLs as inputs. Prompt 025's goal sends extracted text and page images through the 011 adapter. The same prompt's interface block lists only `extractPdfText`, `readImageFacts`, and `suggestAnswerPatches`, and a prohibition says not to send the PDF to an API. The implementation follows the goal: `importBrandGuide` is present, the cassette test goes through `think()`, and the request carries text plus image paths. The PDF file is not the request body. This review does not remove `importBrandGuide`.

v2 section 7 says `pdfjs-dist` is for text and page images. Prompt 025's steps extract text and measure a PNG or JPEG the caller already has. `importBrandGuide` receives `pageImages` as paths. It does not render PDF pages to bitmaps. Rendering would be a new surface. This review does not add it.

v2 section 7's stack sniff names `gsap`, `THREE`, Lenis, `__NEXT_DATA__`, and Webflow. Prompt 026's union is `shopify`, `webflow`, `next`, and `unknown`, and it says not to fingerprint more. `sniffStack` follows the prompt. This review does not add the v2 markers.

v2 section 7 also wants competitor notes to include H1 through H3, schema, word count, and blog presence. v2 section 8.3 module 4 adds three white spaces. Prompt 027's steps are `finalUrl`, `title`, `h1`, `stackHint`, a blank `Loved for`, meta descriptions, h1s, the sameness line, and the sentence that volumes are not estimated. The report follows the prompt. Adding the v2 columns would be a new feature. This review does not add them.

Prompt 026 says internationalized domain names are out of scope and that the URL constructor must accept the input or the code throws `BAD_URL`. Node's `URL` accepts `http://bücher.example/guide` and punycodes the host. Test `an internationalized host the constructor accepts is crawled` locks that. There is no extra IDN parser.

## Notes for later prompts

These are not failed truths.

- `buildCompetitorReport`, `sameness`, and `referenceCard` are exported from `cards.ts` and are absent from `packages/crawler/src/index.ts`. The package `exports` map exposes the barrel only. A later prompt that imports them from `@hitchhiker/crawler` needs a one-line re-export. Prompt 027 forbade editing `index.ts`.
- `createBrowser()` throws until `playwright` resolves. Tests pass `openPage`. The app package already has `@playwright/test` 1.63.0 as a dev dependency from earlier work. The crawler package does not depend on it.
- A redirect is followed up to three hops. `robots.txt` is checked for the requested URL. The landed URL is not checked again.
- `sameness` treats two titles as the same pattern when the kept-word sets are equal. `Best Home Remodeling` stays distinct from `Home Remodeling` because `best` is four letters. An empty kept-word set is skipped, so two titles that are only short words do not form a pattern. The commit records both assumptions. The prompt's example is the equal set `home remodeling`.
- `MAX_INGEST_BYTES` is 25 MiB (`25 * 1024 * 1024`). The commit records that reading of "25 MB".
- `importBrandGuide` requires the caller to pass the adapter. The tested adapter is `think()`. The interview does not call `importBrandGuide` yet.
- The engine live-smoke test stays skipped unless `HH_LIVE=1`.

## Verification

Run from the repo root on 2026-10-06.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/028-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/engine test` | 164 passed, 0 failed, 1 skipped (`live smoke returns a two-field object`). Exit 0. |
| `pnpm --filter @hitchhiker/crawler test` | 46 passed, 0 failed. Exit 0. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

The engine count is the previous 150 passed, plus the 14 ingest tests. The crawler count is the 34 tests from 026 (21 crawl, 13 robots) plus the 12 card tests. Earlier cassette, config, lock, state, template, boundary, workspace, interview, persona, and pushback tests still pass. No test was weakened.

## Scope

No new feature. No fix commit. Prompt 029 was not started. Nothing was pushed, deployed, or published.

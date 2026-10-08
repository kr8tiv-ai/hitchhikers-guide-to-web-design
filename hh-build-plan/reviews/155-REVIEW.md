# 155 Review — prompts 152, 153, 154

Verdict: **PASS**

Reviewed: 2026-10-08. Fresh session. Two fix commits, then this review. No new feature. Prompt 156 is not started.

Each must-have truth below has a test name and a file line. The engine, app, QA, and orchestrator commands exited 0, and both Playwright specs exited 0. This checkpoint does not close So Long and Thanks for All the Fish (`phase_end: false`).

## History

Three build commits sit on `c209357` (review 151), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `1eba6ca` | `c209357` | `feat(app): brand and journey reveals with agency PDF exports` | prompt 152, matches the commit line |
| 2 | `61e3ecd` | `1eba6ca` | `style(app): agency-grade polish pass across every screen` | prompt 153, matches the commit line |
| 3 | `fc474a2` | `61e3ecd` | `feat(qa): scan for secrets and document key storage` | prompt 154, matches the commit line |

HEAD at review start was `fc474a2`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent. No TypeScript `any` in the new sources.

Two fix commits follow, each named for checkpoint 155:

| Order | Commit | Message |
| --- | --- | --- |
| 4 | `7fdb80b` | `fix(review): checkpoint 155 shows Lighthouse scores from gate rows` |
| 5 | `526b8b1` | `fix(review): checkpoint 155 locks the phone gate and the secret-scan import` |

The second fix commit holds two truths because this checkpoint allows two fix commits. The phone-gate change and the secret-scan import are both inside the prompts' file lists.

## File lists

From `c209357` to `fc474a2` the diff is the three prompts, file for file:

- 152: `packages/app/src/reveals/brand-reveal.ts`, `journey-reveal.ts`, `reveals.css`, `packages/app/e2e/reveals.spec.ts`, `packages/engine/src/exports/prd-pdf.ts`, `brand-kit-pdf.ts`, `packages/engine/test/exports.test.ts`
- 153: `packages/app/POLISH.md`, `packages/app/e2e/polish.spec.ts`, and files under `packages/app/src/` (design, routes, drive, gallery, approval, before-jump, desk, theme, polish). No new route and no new package.
- 154: `packages/qa/src/secrets.ts`, `packages/qa/test/secrets.test.ts`, `docs/secrets.md`

Nothing else in those three commits. Nothing was reverted as an extra feature.

The fix commits add no new files. They edit `journey-reveal.ts`, `reveals.spec.ts`, `polish.spec.ts`, `POLISH.md`, `routes.ts`, and `secrets.test.ts`.

## Fixes

### 152. Gate rows were dropping the scores

`runGates` returns one Lighthouse row per route, with a `scores` object. `lighthouseFrom` treated every array as status-only and stored nulls, so a passing live gate rendered "Not recorded". `7fdb80b` reads the worst finite score in each category (`journey-reveal.ts` `rowScores` and `worstScore`, from line 367). A row with no numbers still yields null. Test `a failed gate withholds the badge and a deploy record picks the live URL` (`reveals.spec.ts` line 140) requires the worst of 0.96 and 0.91 to render as `<strong>91</strong>`, with accessibility 98, best practices 95, and SEO 92.

### 153. The phone gate had no test, and one simulated run missed 90

`polish.spec.ts` visited every screen and ran axe. It did not run the phone gate. That truth had no test. `526b8b1` adds `the desk meets the same phone gate as a generated site` (`polish.spec.ts` line 300). It starts the desk and calls `runLhci` from `packages/qa/src/lhci-run.ts` through a file URL, so the app package does not gain a dependency or a relative import. The six routes are `/`, `/brand`, `/approve`, `/gallery`, `/hh-dashboard`, and `/motion`. Each result must be `PASS`, with 3 runs, and all four categories at or above 90.

The first two runs of that test failed on `/motion`. The median performance score was 0.98. One of the three simulated runs scored 85. Observed paint on that page was about 200ms. The gap was Lighthouse's simulated chain treating uncompressed text as a long render-blocking path. `sendBytes` now gzips text, JSON, and script bodies when the client accepts gzip (`routes.ts` `gzipBody`, line 1937). After that change the six-route gate passed, including a second full `polish.spec.ts` run.

### 154. The secret-scan test left the qa package

`secrets.test.ts` imported `packages/orchestrator/src/policy.ts` with a relative specifier. `findEscapes` flags that. Engine test `the repo has no deep imports and no package escapes` failed on it. Adding a package dependency would change `BOUNDARIES`. The test now loads `policy.ts` by `pathToFileURL` and still calls `evaluateCommand` (`secrets.test.ts` line 90 and `loadEvaluateCommand` at line 109). The deny reasons are unchanged: `git push is denied` and `deploy command is denied`.

## 152 Reveals and agency exports

### Truths

- Users get a designed reveal at the end of Babel Fish and at the end of the journey. `renderBrandReveal` (`packages/app/src/reveals/brand-reveal.ts` line 48) paints the desk frame and only approved slots (`visibleSlots`, line 119). `renderJourneyReveal` places the brief, the site frame, the scores, and the badge. Test `brand and journey reveals settle at 375 and 1440` (`packages/app/e2e/reveals.spec.ts` line 27) opens both documents, requires the Babel Fish and journey copy, withholds unapproved logo, tagline, and purpose, and checks reduced motion (`animationName` none, opacity 1) at 375 and 1440.

- Agencies can export client-ready PDFs. `exportPdf` (`packages/engine/src/exports/prd-pdf.ts` line 57) writes `.hitchhiker/exports/PRD.pdf` or `brand-kit.pdf` and adds the agency cover only when `opts.agency` is set (line 75). Test `agency PDFs are written, named, and withhold unapproved sections` (`packages/engine/test/exports.test.ts` line 16) requires a `%PDF-` header, a size above 1000 bytes, Letter versus A4, the brand name, the Harbor Desk cover on the PRD, no cover when agency is omitted, and the absence of an unapproved section and a rejected item.

- Badges are earned by passing gates, not given. The badge markup is `data-badge="earned"` only after lighthouse, axe, the optional console, links, and weight gates pass and the jury is at least 70 (`journey-reveal.ts` lines 21 and 234). A failed gate renders `data-badge="held"` (line 244). Test `a failed gate withholds the badge and a deploy record picks the live URL` (`reveals.spec.ts` line 88) requires no earned badge for a lighthouse blocker, a jury of 69, a console blocker, and an axe blocker. The same test requires the earned badge when those gates pass.

### Key links

The brand reveal reads the 065 model. `BrandRevealModel` extends `BrandKitModel` from `packages/app/src/brand-kit.ts`. An omitted `approved` map shows the empty line "Nothing here is approved yet."

The journey reveal reads gate results and deploy records. Prompt 152 names prompt 142 for gate results. Prompt 142 writes deploy docs. The function reads the 126 gate shape, including the per-route score rows after `7fdb80b`, and the 146 `DEPLOYS.md` line (`readDeployedUrl`, `journey-reveal.ts` line 119). A missing record or a non-https URL renders "This is the local preview. The site is not deployed yet." A completed `https://` row supplies the live URL.

### Also checked

`calmText` strips `!` and the em dash (`brand-reveal.ts` line 111). The reveal spec requires no `!` in the settled pages. Unapproved brand slots stay off the page. Agency mode off leaves the cover out of the PDF. The desk does not serve the reveal documents as routes. Prompt 152's file list does not include `routes.ts`, and `POLISH.md` records that limit.

## 153 Agency-grade polish pass on the Guide app

### Truths

- Every app screen matches the 015 design system. `listAppRoutes` (`packages/app/src/polish.ts` line 11) lists `/`, `/gallery`, `/motion`, `/brand`, `/approve`, `/hh-dashboard`, `/before-jump`, and `/missing`, each with its states. Test `every screen at 375, 768, and 1440 in light and dark` (`polish.spec.ts` line 48) visits those states in both themes, requires Literata and Bricolage Grotesque, the `hh-shell`, the wordmark, a token surface, a solid focus outline, no horizontal overflow, and no banned phrase from its list. Axe runs through `@axe-core/playwright`. Serious, critical, and moderate violations fail the test.

- The app itself meets the same phone gate as generated sites. Test `the desk meets the same phone gate as a generated site` (`polish.spec.ts` line 300) calls `runLhci`. The floor stays 90 in `packages/qa/src/lighthouse-gate.ts`. This session's full `polish.spec.ts` run passed that test after the gzip change.

- No default-looking screen ships. The same screenshot test requires the desk shell, the wordmark, and the token surface on every shot, including empty and error states. `POLISH.md` records the before and after for the route row, the empty spines, and the motion board.

### Key links

Prompt 153 says the critique uses Grok vision through 017. Prompt 017 is the interview tree and has no vision API. `POLISH.md` says the vision pass was a read of the PNGs. This review did not add a `think()` call. That would be a new surface, and the prompt forbids new features. The screens are not a scripted "all good" stub. `POLISH.md` names the route row, the dashed empty boxes, and the narrow motion column, and the `61e3ecd` diff changes those.

Fixes land in the design tokens and components, plus the desk document head and the route markup. `526b8b1` also gzips the responses those screens serve, in `routes.ts`, so the phone gate can pass.

### Also checked

`renderShell()` is unchanged, so `index.html` still matches it (app test `index.html matches renderShell and keeps the question region`). Motion script still loads for the motion page. The label on `/hh-dashboard` in the route row is Drive.

## 154 Scan for secrets, deny-list gaps, and keychain notes

### Truths

- Secrets are scanned as text. `scanText` (`packages/qa/src/secrets.ts` line 32) returns `{ rule, index }` for `xai-` plus at least eight alphanumerics, `Bearer` plus a token of that length, and the private-key banner built from the words BEGIN, PRIVATE, and KEY (lines 17–28). The module does not read the network, the environment, or the keychain. Tests `empty text returns no hits`, `a short prefix does not hit`, `a fake key hits`, `a bearer token hits and a short word does not`, `a private key banner hits`, and `hits stay in source order` (`secrets.test.ts` lines 25–67) cover those shapes. The fake key is assembled in the test so the source does not contain a literal key.

- The documented storage location is outside git. `docs/secrets.md` line 3 names the OS keychain and `.env.local`. The root `.gitignore` line 6 is `.env*`. `git check-ignore -v -- .env.local .env` matches that line for both names. Test `the secrets doc has no hits` (`secrets.test.ts` line 83) requires `.env.local` and `keychain` in the doc and an empty `scanText` result.

### Key link

The test calls `evaluateCommand`. `git push and deploy stay denied` (`secrets.test.ts` line 90) loads `packages/orchestrator/src/policy.ts` and requires deny for `git push`, the single-string `git push`, and `vercel --prod`. The reasons are `git push is denied` (`policy.ts` line 68) and `deploy command is denied` (`policy.ts` line 72).

### Also checked

The scanner does not flag `xai-abc` or a seven-character tail. RSA and EC banners that do not contain the exact three-word banner are outside the prompt's pattern. No real key was committed. No telemetry was added.

## UI

Prompts 152 and 153 change files under `packages/app/`. This review read the captured PNGs at 375 and 1440. Playwright, in the specs above, opened Chromium for those shots and for the phone gate. This session did not drive a second interactive browser.

Reveals, 375 and 1440: warm paper, rust spine, Bricolage wordmark, approved palette and voice, unapproved logo and tagline withheld. The journey page shows the brief, the local-preview sentence, scores 96 / 98 / 95 / 100, jury 70, axe Pass, and the Don't Panic badge. At 1440 the brief sits beside the site frame and the frame shows "Northglass preview". At 375 the same sections stack. The preview plate in the 375 still is quiet. The spec requires the iframe text to be visible before the shot.

Desk, gallery, motion, brand empty, dashboard error, and the missing page, 375 and 1440, light, plus brand empty at 1440 dark: the same paper or night surface, the wordmark, tracked route links, and a left spine on empty and error states. Gallery is one column at 375 and two columns at 1440. Motion states that magnetic buttons are banned. Copy in these shots has no exclamation mark, no lorem, and no purple-to-blue gradient. The dashboard error still prints `/HH-DASHBOARD` as a small location label beside the Drive title. That is a designed label, and the route row itself says Drive.

## Live model calls

This group adds no model call. PDF export prints HTML. The polish critique did not call `think()`. The secret scanner does not call a model. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`.

## Commands

Run from the repo root after `526b8b1`, before this docs commit:

- `pnpm --filter @hitchhiker/engine test` exited 0. 595 tests, 594 pass, 1 skipped (`live smoke returns a two-field object`, `HH_LIVE` unset). `the repo has no deep imports and no package escapes` passed.
- `pnpm --filter @hitchhiker/app exec playwright test e2e/reveals.spec.ts` exited 0. 2 passed.
- `pnpm --filter @hitchhiker/app test` exited 0. 118 tests, 118 pass.
- `pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts` exited 0. 2 passed. The phone-gate test took 3.5 minutes.
- `pnpm --filter @hitchhiker/qa test` exited 0. 209 tests, 209 pass.
- `pnpm --filter @hitchhiker/orchestrator test` exited 0. 237 tests, 237 pass.

An earlier orchestrator run in parallel with QA failed one temp-directory delete with `EPERM` on Windows. The solo run above passed. The test was not changed.

## Notes

- Root `tsc -b` still reports `packages/deploy/src/post-check.ts`. Prompt 152's commit already said so. These prompts do not own that file.
- Prompt 153's "through 017" cross-reference does not match a vision API. Recorded above. Not escalated.
- Prompt 152's "142 gate results" cross-reference does not match the file that stores scores. The reveal reads the 126 rows and the 146 deploy record. Recorded above.

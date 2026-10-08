# 158 Review — prompts 156, 157

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-08. Fresh session. Two fix commits, then this review. No new feature. Prompt 159 is not started.

Each must-have truth below has a test name and a file line. `pnpm --filter @hitchhiker/qa test` exited 0 (225 pass). `pnpm -r test` exited 0. `pnpm exec tsc -b --pretty false` exited 2 on a pre-existing error in `packages/deploy/src/post-check.ts`. That file is outside these prompts. This checkpoint is the phase-end review for So Long and Thanks for All the Fish. Criterion 6 stays FALSE until prompt 159 writes the once-over report.

## History

Two build commits sit on `b564abd` (review 155), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `17e2149` | `b564abd` | `feat(qa): audit dependency licenses` | prompt 156, matches the commit line |
| 2 | `ee60a39` | `17e2149` | `docs: add the release checklist` | prompt 157, matches the commit line |

HEAD at review start was `ee60a39`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent from `package.json` files. No TypeScript `any` in the new sources.

Two fix commits follow, each named for checkpoint 158:

| Order | Commit | Message |
| --- | --- | --- |
| 3 | `66b3398` | `fix(review): checkpoint 158 binds licence exceptions to the installed package names` |
| 4 | `5b28fb6` | `fix(review): checkpoint 158 corrects the NOTICE line in the release checklist` |

## File lists

From `b564abd` to `ee60a39` the diff is the two prompts, file for file:

- 156: `packages/qa/src/licenses.ts`, `packages/qa/test/licenses.test.ts`, `NOTICE`
- 157: `docs/release.md`, `package.json`, `packages/qa/test/release-doc.test.ts`

Nothing else in those two commits. Nothing was reverted as an extra feature. The fix commits stay inside those file lists. `package.json` gained the root script `"test": "pnpm -r test"` and nothing else.

## Fixes

### 156. Licence exceptions were not bound to a package name

`auditDeps` accepted two non-SPDX fields for every package name. The GSAP standard-licence sentence passed for any name. `Apache-2.0 AND LGPL-3.0-or-later` passed for any name, which skipped the rule that an AND fails when a side is not allowed. `66b3398` keeps those two fields, and only for the packages that ship them. `isGsapPackage` requires the name `gsap` (`packages/qa/src/licenses.ts` line 135). `isSharpPlatformPackage` requires a name that starts with `@img/sharp-` (line 140). `licenseIssue` applies the shortcuts only after those name checks (line 111).

Test `LGPL alone fails, and a different AND with LGPL fails` (`packages/qa/test/licenses.test.ts` line 119) now requires `not-sharp` and unscoped `sharp` to fail on `Apache-2.0 AND LGPL-3.0-or-later`, `@img/sharp-linux-x64` to pass that same field, and `not-gsap` to fail the GSAP sentence. Lone `LGPL-3.0-or-later` still fails. NOTICE states that the sharp expression passes only for a package whose name starts with `@img/sharp-`. Test `NOTICE has a Third-party heading and still credits gsd-core` (line 148) requires that sentence.

The installed tree still passes. A replay of the `audit.yml` path, `pnpm licenses list --json` parsed into `{ name, license }` rows and passed to `auditDeps`, returned ok on 331 packages after the fix.

What remains: `@img/sharp-*` with `Apache-2.0 AND LGPL-3.0-or-later` still passes. LGPL is not on the allow list. Dropping sharp would be a library swap, so this session does not do it. See known issues.

### 157. The checklist's NOTICE evidence could not be met

`docs/release.md` said NOTICE does not name GPL or `@theatre/studio`. The Third-party section names both, in sentences that say they are not what this tree ships. A human following that line would stop on a clean tree. `5b28fb6` changes the expected evidence to: NOTICE lists the installed licences, does not list a GPL or AGPL package, and states that `@theatre/studio` is not installed (`docs/release.md` line 33). Test `the release checklist names the audits and the bans` (`packages/qa/test/release-doc.test.ts` line 109) requires that sentence and rejects the old wording.

## 156 Audit licenses and keep GPL and Theatre studio out

### Truths

- The license gate is automated. `auditDeps` (`packages/qa/src/licenses.ts` line 74) returns `{ ok, problems }` for `{ name, license }` rows. Test `the fixture graph allows the installed permissive set and rejects the known traps` (line 85) runs that function on a fixture graph, so the gate does not need a full install of optional native modules. Test `workspace package.json files and the installed tree pass the licence gate` (line 163) reads workspace `package.json` files and the pnpm store when `node_modules` exists, and asserts the fixture only when `node_modules` is absent. `.github/workflows/audit.yml` imports `auditDeps` when `packages/qa/src/licenses.ts` exists and exits 1 unless `result.ok` is true (the licence job, from the `pathToFileURL` import through `process.exit`). This session fed the live `pnpm licenses list --json` output through that same shape. Result: ok, 331 packages, 0 problems.

- Known-bad packages fail by name. `BANNED_NAMES` is `@theatre/studio` and `potrace` (line 33). The name check runs before the licence check and lowercases the name. Test `@theatre/studio fails even when the license field is MIT` (line 37) requires `["@theatre/studio: banned package name"]` when the field is MIT, and requires `@theatre/core` with Apache-2.0 to pass. Test `potrace fails by name` (line 46) requires the same ban for `potrace` with MIT, and both the name ban and `GPL-2.0-only` for `Potrace`.

### Also required by the prompt

- `GPL-3.0-only`, `AGPL-3.0-only`, `GNU General Public License v3.0`, `MIT OR GPL-3.0-only`, and `MIT AND GPL-3.0-only` fail. Test `GPL-3.0-only and AGPL fail` (line 22).
- `MIT OR Apache-2.0` passes, and `noticeNeedsMention` is true for that OR. Test `MIT OR Apache-2.0 passes and is recorded` (line 14). An OR passes only when every side is allowed. That is stricter than `licenceProblem` in `packages/engine/src/tools/legitimacy.ts`, which accepts an OR when one side is allowed (lines 234–238). Prompt 156 requires every side. The two functions stay separate: the engine boundary does not import `@hitchhiker/qa`, and prompt 156's file list does not include the engine gate. CI calls `auditDeps`.
- `MPL-2.0` passes with an empty problems list. `(MIT AND Zlib)` passes. `noticeNeedsMention` is true for MPL and Zlib. `MPL-1.1` fails. Test `MPL-2.0 and Zlib pass and need a NOTICE mention` (line 56).
- A null, empty, or blank licence fails. `UNLICENSED` fails as proprietary. `Unlicense` passes. Test `an empty license and UNLICENSED fail, and Unlicense passes` (line 73).
- NOTICE has a `Third-party` heading and still credits `vendor/gsd-core` as MIT, including the upstream URL and the vendored-source sentence. Test at line 148. The section names packages this audit saw installed. It does not invent packages.

### Key link

`auditDeps` is the licence half that the audit workflow runs. The workflow comment names prompt 156. The engine legitimacy function is the other licence check, for a tool the Guide might install, and it does not call `auditDeps`.

### Allowances beyond the prompt's seven identifiers

The prompt allows MIT, Apache-2.0, BSD, ISC, Unlicense, Zlib, and MPL-2.0. The gate also allows `0BSD` (treated as BSD), `BSD-2-Clause`, `BSD-3-Clause`, `BSD-3-Clause-Clear`, `CC0-1.0`, and `BlueOak-1.0.0`. CC0 and BlueOak are in the allow set for every package name, because `mdn-data` and `sax` are installed and NOTICE already recorded them. A new dependency with either field would pass. Both are permissive. NOTICE names them. They are not GPL or AGPL.

The GSAP registry sentence is not SPDX. D-001 requires GSAP. It passes only for the package named `gsap`, and NOTICE quotes the field.

## 157 Write the release checklist and wire the root test

### Truths

- A release is a checklist, not an automatic publish. `docs/release.md` is a list of commands and the expected evidence. The opening lines say a human runs it before tagging, and that a release is a checklist. `assertReleaseDoc` (`packages/qa/test/release-doc.test.ts` line 35) throws when a sentence tells the reader to `npm publish` as an action, and when `git push` is not on a do-not line. The allowed forms are `Do not npm publish` and a sentence where `npm publish` or `git push` is not a step. Test `assertReleaseDoc allows Do not npm publish and rejects an action` (line 119) appends `Run npm publish after the checks.` and requires a throw. Test `git push must sit on a do-not line` (line 132) appends `Next, git push the tag.` and requires a throw. The loaded file contains `Do not npm publish`, `Do not git push`, and `` `npm publish` and `git push` are not steps. ``

- The last build prompt does not deploy. Prompt 157's commit adds `docs/release.md`, the root `test` script, and the test. It adds no deploy client and no publish step. The page says `Do not deploy` and `This page does not tag a release and it does not create a remote.` `assertReleaseDoc` requires the phrase `Do not deploy`. Hostinger is a check, and the page says `Hostinger does not run without yes` and `This page is not that yes.`

### Key link

The checklist points at the license audit, the secret scan, and the doctor command. `REQUIRED_PHRASES` (line 12) includes `license audit`, `secret scan`, `hh doctor`, `pnpm --filter @hitchhiker/qa test`, `fixture drive`, `phone gate`, `prompt 159`, `D-001`, `no GSAP fallback`, `no Theatre studio`, and `real-mobile Lighthouse scores (all four at 90 or more)`. Test `the release checklist names the audits and the bans` loads `docs/release.md` and calls `assertReleaseDoc`. Test `a missing gate and an exclamation mark fail` (line 145) replaces `hh doctor` and requires a throw. Test `an API key shape fails` (line 154) appends an `xai-` shape and requires a throw. The file has no exclamation mark. `scanText` on the file returns no hits.

The root script exists. Test `the root test script runs pnpm -r test` (line 160) reads the root `package.json` and requires `scripts.test` to be `pnpm -r test`. `pnpm-workspace.yaml` lists `packages/*` only, so `pnpm -r` skips the workspace root and the script does not call itself. Every package under `packages/` already has a `test` script. This session's `pnpm -r test` reported `Scope: 12 of 13 workspace projects` and exited 0.

The once-over is a human step that names prompt 159 and the file `hh-build-plan/prompts/159-once-over.md`. The page does not embed that prompt.

## UI

Prompts 156 and 157 changed no file under `packages/app/`. There is no screen to open at 375 or 1440. This review did not take screenshots and does not claim a visual pass.

## Live model calls

This group adds no model call. `auditDeps` and `assertReleaseDoc` are pure. Neither replaces a live call Matt asked for with a scripted stub. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`.

## Phase gate: So Long and Thanks for All the Fish

Roadmap success criteria. A FALSE row is recorded. Criterion 6 needs no new prompt. Prompt 159 already owns it, and this session does not start it.

1. TRUE. Hostinger, Vercel, Netlify, and Cloudflare deploys run only after a yes, and live post-deploy checks exist. `deployHostinger` throws `Hostinger deploy requires approval` when `approved` is not true (`packages/deploy/src/hostinger.ts` line 74). Test `approved false throws and does not upload` (`packages/deploy/test/hostinger.test.ts` line 122). Vercel, Netlify, and Cloudflare go through `pollLoop`, which throws the host's approval message before upload (`packages/deploy/src/poll.ts` line 57). `deploy` returns `{ declined: true }` when `yes()` is not true, before shape reading, spawn, MCP, the API, and `DEPLOYS.md` (`packages/deploy/src/cli-run.ts` lines 361–362). Test `a declined yes does not spawn, call a host, or write a deploy record` (`packages/deploy/test/real-adapters.test.ts` line 146). Test `Vercel, Netlify, and Wrangler run after yes and capture the URL` (line 379). `postDeployChecks` requests the live URL, judges a mobile Lighthouse run, and checks routes, the form, analytics, Open Graph, HTTPS, and redirects (`packages/deploy/src/post-deploy-live.ts` line 410). Test `live checks pass on a phone run, routes, form, analytics, OG, HTTPS, and redirects` (`packages/deploy/test/post-deploy-live.test.ts` line 65). Test `form and analytics each wait for their own yes` (line 117).

2. TRUE. `DEPLOY.md` and `HANDOFF.md` are generated for the chosen host, and client-ready PRD and brand-kit PDFs exist. `renderDeployDocs` returns both markdown strings (`packages/deploy/src/docs.ts` line 46). Test `a static Hostinger site renders Deploy and Handoff` (`packages/deploy/test/docs.test.ts` line 23) requires the Deploy and Handoff headings, the maintainer, the why, Elevate, the blog, domain renewal, and rollback. `exportPdf` writes `.hitchhiker/exports/PRD.pdf` or `brand-kit.pdf` and adds the agency cover only when `opts.agency` is set (`packages/engine/src/exports/prd-pdf.ts` line 57). Test `agency PDFs are written, named, and withhold unapproved sections` (`packages/engine/test/exports.test.ts` line 16).

3. TRUE. NOTICE lists third-party licences. The Third-party section names MPL-2.0, Zlib, MIT OR Apache-2.0, 0BSD, CC0-1.0, BlueOak-1.0.0, the sharp platform expression, and the GSAP field, each with the installed package names. No row lists a GPL or AGPL package as installed. `@theatre/studio` appears in sentences that say it is not installed, including the Third-party section and the `@theatre/core` entry. The words GPL and AGPL appear in those refusal sentences. The checklist's expected evidence matches that, after `5b28fb6`. Test `NOTICE has a Third-party heading and still credits gsd-core`.

4. TRUE. `npx hitchhikers-guide` and `hh install` work, and every `/hh` command exists as a Grok Build skill. `packages/cli/package.json` names the package `hitchhikers-guide`, sets `private` false, and sets `bin.hh` to `./src/main.ts`. `cliEntryArgs([])` returns `["app"]` (`packages/cli/src/main.ts` line 364), so a bare invocation starts the companion app. Test `install does not call fetch and the package is publishable as hh` (`packages/cli/test/install.test.ts` line 192) requires that name, that bin, and `cliEntryArgs([])`. The same file's install test runs `hh install --project` and requires the copied skill. `SKILL_NAMES` in `packages/grok-plugin/src/commands.ts` (line 28) is the 22 commands from CONTEXT-PACKAGE.v2.md section 18, from `/hh-new` through `/hh-help`. Test `skill directories are the 22 commands plus the guide persona` (`packages/grok-plugin/test/commands.test.ts` line 189) requires those directories on disk.

5. TRUE. The agency-grade polish pass and the phone gate are on the Guide app, and the app bytes are unchanged since review 155. Prompts 156 and 157 did not touch `packages/app/`. Test `the desk meets the same phone gate as a generated site` (`packages/app/e2e/polish.spec.ts` line 300) requires each of `/`, `/brand`, `/approve`, `/gallery`, `/hh-dashboard`, and `/motion` to return PASS with three runs, and performance, accessibility, best practices, and SEO at or above 90. Review 155 ran `pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts` and recorded exit 0, with the phone gate at 3.5 minutes. This session did not re-run Playwright. The evidence for the scores is that test plus that run, on the same app commits (`61e3ecd` and `526b8b1`).

6. FALSE. The once-over report does not exist. A search of the tree finds the requirement in `hh-build-plan/ROADMAP.md` and the human step in `docs/release.md`. There is no once-over report file. Prompt 159 (`hh-build-plan/prompts/159-once-over.md`) is the owner. It has not been run. This review does not start it. The criterion does not need a new prompt.

The phase is not closed. Criteria 1 through 5 are TRUE. Criterion 6 waits on prompt 159.

## Commands

Run from the repo root after the two fix commits:

- `pnpm --filter @hitchhiker/qa test` exited 0. 225 tests, 225 pass, 0 fail, 0 skipped.
- `pnpm -r test` exited 0 in 204 seconds. Scope was 12 of 13 workspace projects. The root package is the one left out, which is what the release page says about `pnpm -r`.
- `pnpm exec tsc -b --pretty false` exited 2. The only diagnostic is `packages/deploy/src/post-check.ts(36,10): error TS2532: Object is possibly 'undefined'.` `noUncheckedIndexedAccess` is on. `titleText` returns `match[1]` after a successful exec, and the index is still typed as possibly undefined. Review 155 recorded this same file. Prompt 152's commit already said root `tsc -b` reports it. These prompts do not own the file, and fixing it is outside their file lists.

The CI licence replay described above was a local node script over `pnpm licenses list --json`. It exited 0 with `ok true`.

## Known issues

- `@img/sharp-*` may declare `Apache-2.0 AND LGPL-3.0-or-later` and pass `auditDeps`. Any other name with that expression fails. A lone LGPL identifier fails. NOTICE names the exception. Removing the package is a library swap and was not done. Full compliance with "AND fails if any side is not allowed" needs that decision in a later prompt.
- `CC0-1.0` and `BlueOak-1.0.0` are allowed for any package name. They are permissive fields already on installed packages, and NOTICE names them. They are outside the prompt's seven-identifier list.
- Root `tsc -b` exits 2 on `packages/deploy/src/post-check.ts` line 36. Pre-existing. Not a regression from prompts 156 or 157.

## Notes

- No conflict with `context/matt-answers.md` or `DECISIONS.md` was found in these two prompts. D-001 still requires GSAP and forbids a GSAP fallback and `@theatre/studio`. The checklist states both bans. The implementation adds no fallback.
- The engine legitimacy gate and `auditDeps` disagree on OR expressions, as recorded under prompt 156. Prompt 156 wins for the dependency audit. Unifying the functions would cross the package boundary. That was not done.

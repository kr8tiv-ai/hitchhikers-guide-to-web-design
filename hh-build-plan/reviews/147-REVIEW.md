# 147 Review — prompts 144, 145, 146

Verdict: **PASS**

Reviewed: 2026-10-08. Fresh session. No fix commits. No new feature. Prompt 148 is not started.

Each must-have truth below has a test name and a file line. `pnpm --filter @hitchhiker/deploy test` exited 0. This checkpoint does not close So Long and Thanks for All the Fish (`phase_end: false`).

## History

Three build commits sit on `81f59c0` (review 143), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. At review start `main` was ahead of `origin/main` by these three commits, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `419272f` | `81f59c0` | `feat(deploy): draft a launch kit that does not post` | prompt 144, matches the commit line |
| 2 | `82ffde8` | `419272f` | `feat(deploy): check the deployed page once` | prompt 145, matches the commit line |
| 3 | `d42ac1e` | `82ffde8` | `feat(deploy): real Hostinger, Vercel, Netlify, and Cloudflare deploys with live checks` | prompt 146, matches the commit line |

HEAD at review start was `d42ac1e`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent. No TypeScript `any` in the six new source files. The word `any` in `cli-run.ts` is ordinary English in a comment.

File lists match the prompts. From `81f59c0` to `d42ac1e` the diff is only:

- 144: `packages/deploy/src/launch-kit.ts`, `packages/deploy/test/launch-kit.test.ts`
- 145: `packages/deploy/src/post-check.ts`, `packages/deploy/test/post-check.test.ts`
- 146: `packages/deploy/src/shape.ts`, `hostinger-mcp.ts`, `hostinger-api.ts`, `cli-run.ts`, `post-deploy-live.ts`, `packages/deploy/test/real-adapters.test.ts`, `post-deploy-live.test.ts`, `packages/deploy/README.md`

Nothing outside those lists. Nothing was reverted.

## 144 Draft a launch kit that does not auto-post

### Truths

- Launch copy stays on disk. `renderLaunchKit` returns markdown and returns before any network call (`packages/deploy/src/launch-kit.ts` lines 20–38). The checklist line is `Do not post this until a human sends it.` (line 18, written at line 74). The module imports no HTTP client and does not call `writeFile`. The prompt's interface is a string return, and its steps allow a file write without requiring one. The draft is the returned markdown. Test `a clean offer returns a draft with the do-not-post line` (`packages/deploy/test/launch-kit.test.ts` line 34) requires the three sections in order, the caption `North Glass` / `hand-cut glass`, and that sentence. Test `a null url says the domain is not set and does not print null` (line 49) requires `The domain is not set.` and no `null`, no markdown link, and no `http`. Test `the module exports renderLaunchKit and does not post` (line 115) requires the export, `"post" in kit` false, `"tweet" in kit` false, no `function post`, no `function tweet`, no `tweet(`, no `fetch(`, no `node:http`, no `node:https`, no `node:fs`, no `writeFile`, and no `x-oauth`.

- The truth gate covers it. The draft is passed to `lintClaims`, which is `lintBrandClaims` from `@hitchhiker/engine` (`launch-kit.ts` line 8 and lines 33–37). That binding is `lintClaims` in `packages/engine/src/brand/truth.ts` line 44, re-exported at `packages/engine/src/index.ts` line 176. A failed lint throws `Launch kit failed the truth gate`. Test `offer 5 stars with empty evidence throws` (launch-kit.test.ts line 67) uses empty evidence and requires the error to mention `stars`. Test `award-winning copy and an unproven percent throw` (line 78) requires `award-winning` and `percent`. Test `a quoted star phrase in evidence can be drafted` (line 83) shows the same gate lets a star phrase through when that phrase is in `evidence.quotes`. The launch kit does not special-case the string `5 stars`.

### Key link

`lintClaims(markdown, input.evidence)` runs on the built note, caption, and checklist before the return (`launch-kit.ts` lines 33–38). The source scan in the no-post test requires both `lintClaims(` and `lintBrandClaims`.

### Also checked

A name of 61 characters throws and a name of 60 is kept (test line 96, `launch-kit.ts` lines 25–27). An exclamation mark in the name, the offer, or the url throws (test line 103). Empty name, empty offer, and a blank url throw (test line 109). A set url is included and the missing-domain sentence is omitted (test line 58). The rendered kit contains no `testimonial` and no `!` (test line 34).

## 145 Check a deployed URL with an injected fetch

### Truths

- Post-deploy checks run only after completed. `postCheck` returns `{ skipped: true, ok: false, reason }` when `state` is not `"completed"`, and that return is before `fetchImpl` (`packages/deploy/src/post-check.ts` lines 55–57). `state` is `DeployResult["state"]` (line 21), and `DeployResult.state` is `"completed" | "queued" | "failed"` (`packages/deploy/src/types.ts` lines 19–20). Test `queued skips the fetch` (`packages/deploy/test/post-check.test.ts` line 17) uses a fetch that throws if called and requires zero calls plus `{ skipped: true, ok: false, reason: "queued" }`. Test `failed skips the fetch` (line 32) requires the same for `failed`.

- They are injectable. `fetchImpl` is a required argument (post-check.ts lines 24 and 59). The module does not call global `fetch`. Test `completed 200 with a title and the site name is ok` (post-check.test.ts line 47) passes a fake fetch, requires the url it received, and requires `{ skipped: false, ok: true, reason: "ok" }` for `http://localhost:9/milliways`. No test binds a port.

### Key link

Queued, failed, and completed are the three `DeployResult` states. The skip branch treats every non-completed state the same way, and the failed test locks the third value.

### Also checked

A 200 whose body lacks the site name returns `ok: false` and `site name missing` (test line 62 and test line 72, post-check.ts lines 66–68). A whitespace title returns `title missing` (test line 84, lines 69–71). Status 404 returns `status 404` (test line 94, lines 63–65). Three redirects still pass (test line 104). Four redirects return `too many redirects` and do not throw (test line 114, lines 60–62, cap at line 12). `file:`, `ftp:`, and a non-URL throw `url must be http or https` before fetch (test line 124, lines 39–48). An empty site name throws (test line 145). The source contains no `console.` (test line 158).

The prompt's context sentence names a return of `{ ok, status, titleFound }`. The same prompt's interface is `{ skipped, ok, reason }`. The implementation follows the interface. Status, the title check, and the site-name check are the `reason` strings above. The commit `82ffde8` records that choice. This review leaves the interface in place.

## 146 Real deploy adapters and post-deploy checks

### Truths

- Deploys use the official tools for each host. `cliPlan` is `vercel deploy --prebuilt`, `netlify deploy --dir <output>`, and `wrangler pages deploy <output>` (`packages/deploy/src/cli-run.ts` lines 74–78). Test `Vercel, Netlify, and Wrangler run after yes and capture the URL` (`packages/deploy/test/real-adapters.test.ts` line 379) requires those three argv lists, one spawn each, and the last https URL from the CLI output. Hostinger's launch plan is `https://mcp.hostinger.com` or `npx -y @hostinger/mcp` (`packages/deploy/src/hostinger-mcp.ts` lines 11–13 and 57–62). Test `the official Hostinger MCP launch plan is hosted OAuth or npx` (real-adapters.test.ts line 494) requires that url, command, and args. `runHostingerMcp` calls `listTools` before `callTool`, and `assertListed` throws if the chosen name is absent (`hostinger-mcp.ts` lines 196–205). Preferred names are called only when the list contains them (lines 86–95). Agency names are filtered out (lines 69–71). Test `Hostinger MCP deploys with a tool that was listed` (real-adapters.test.ts line 165) requires a single call to `hosting_deploy-static-website` with `domain`, `archivePath`, and `removeArchive: false`, and requires the agency overwrite tool to stay uncalled. Test `a renamed static tool is used and a hardcoded missing name is not` (line 198) selects `custom_static_ship` from its description and refuses an agency-only list. Test `MCP falls back to the API when the tool list has no deploy tool` (line 209) requires zero `callTool`s and one POST. The API paths are the documented hosting v1 routes: `POST /api/hosting/v1/accounts/{username}/websites/{domain}/deploy` and `POST .../nodejs/builds` plus a GET of that collection (`packages/deploy/src/hostinger-api.ts` lines 14 and 206–208, 284–307, 325–326). Test `a Node API build is posted once and then polled` (real-adapters.test.ts line 280) requires one POST whose url ends in `/nodejs/builds` and at least two GETs. `deploy()` reaches those tools through `deployHostinger`, `deployVercel`, `deployNetlify`, and `deployCloudflare` (`cli-run.ts` lines 229–231 and 331–337).

- The yes gate holds for every deploy and form test. `deploy` returns `{ declined: true }` when `yes()` is not `true`, and that return is before shape reading, spawn, MCP, the API, and `DEPLOYS.md` (`cli-run.ts` lines 360–362). Test `a declined yes does not spawn, call a host, or write a deploy record` (real-adapters.test.ts line 146) passes a spawn that rejects, an MCP client, and a keychain, and requires `{ declined: true }`, zero keychain reads, zero tool calls, and no `DEPLOYS.md`. The form test calls `yes()` only after a form and an inbox address exist, and a decline returns before `fetchImpl` (`packages/deploy/src/post-deploy-live.ts` lines 339–351). The analytics event does the same (lines 383–390). Test `form and analytics each wait for their own yes` (`packages/deploy/test/post-deploy-live.test.ts` line 117) answers no, then yes, and requires no POST to `/contact` and one POST to the Plausible event url. Test `a category under 90 is a blocker and a 404 stays in the report` (line 99) answers no once and requires both side effects declined and no POST at all. Test `a non-zero CLI exit writes no deploy record` (real-adapters.test.ts line 423) requires the Netlify failure to leave `DEPLOYS.md` absent.

- Post-deploy checks prove the live site works on phones. `postDeployChecks` calls `deps.lhci.runMobile` and judges the four categories at 90 (`post-deploy-live.ts` lines 17 and 163–197 and 415–417). A null run, a thrown runner, and a score under 90 are `BLOCKER`. Ratios at or under 1 are scaled by 100, and `0.9` is 90. The failure sentence matches prompt 122: `Phone performance is ${score}, below the floor of 90.` Deploy's boundary allows only `@hitchhiker/engine` (`packages/engine/src/boundaries.ts` line 52), so this file judges the scores in process instead of importing `evaluateLh`. Test `live checks pass on a phone run, routes, form, analytics, OG, HTTPS, and redirects` (post-deploy-live.test.ts line 65) feeds performance `0.95` and requires `PASS` and score 95. Test `the phone floor matches prompt 122 for ratios and category reports` (line 132) requires category `0.9` to pass, flat `89` to block, a null run to block with `real mobile run`, and disagreeing `best-practices` / `bestPractices` to block. Test `a category under 90 is a blocker and a 404 stays in the report` requires the performance reason and route `/menu` at status 404. Every route is requested and `ok` is status 200 (`post-deploy-live.ts` lines 448–453).

### Key links

`deploy()` calls the 140 and 141 adapters. Hostinger goes through `deployHostinger` after the yes (`cli-run.ts` lines 331–337). Static Vercel, Netlify, and Cloudflare go through `deployVercel`, `deployNetlify`, and `deployCloudflare` with the CLI spawn inside `upload` (lines 214–233). A Node project on Netlify or Cloudflare hits those adapters' `template is not wired` rejection and does not spawn (test line 446). A Node project on Vercel hits the same rejection and then runs `vercel deploy --prebuilt`, which is the command this prompt names for that host (cli-run.ts lines 369–382, test line 446).

`postDeployChecks` calls `postCheck` from prompt 145 on the already fetched homepage (`post-deploy-live.ts` lines 456–465). The phone judgment uses the same floor and the same failure sentence as `phoneFailures` in `packages/qa/src/lighthouse-gate.ts` lines 148–160.

### Also checked

Shape comes from `.hitchhiker/research/STACK-DECISION.md`. Astro and Vite are static `dist`. Next is Node `.next` unless the record says static export (`out`). Astro SSR is Node (`packages/deploy/src/shape.ts` lines 67–95). Test `static stacks upload files and Node stacks need a server` (real-adapters.test.ts line 96) requires those four outcomes and rejects a record that names both static output and a server.

The Hostinger token is read from keychain service `hitchhikers-guide`, account `hostinger` (`hostinger-api.ts` lines 15–16 and 94–101). `host.json` throws if it contains a token, password, secret, or authorization field (lines 71–79 and 147–150). Test `the API token stays in the keychain and a failed response does not echo it` (real-adapters.test.ts line 244) requires the 403 body to be redacted and `DEPLOYS.md` to stay absent. Test `host.json refuses a token field` (line 353) requires the refusal before fetch and before the keychain. A Node MCP deploy calls the write tool once and then the listed status tool (`hostinger-mcp.ts` lines 205–220). Test `a Node MCP deploy polls the listed status tool and does not write twice` (real-adapters.test.ts line 320) requires one `hosting_deploy-js-application` and a later `hosting_list-js-deployments`.

The contact form is posted only to an address already on the page (`data-inbox`, `hh-inbox`, or a mailto). Open Graph title, description, and image become a text preview card (`post-deploy-live.ts` lines 230–239 and 467–476). HTTPS without HSTS fails (test line 187). An `http` URL fails the HTTPS check and does not ask for a yes when no form is present (test line 165). Sitemap `submitted` is the literal `false`, and the instructions name Google Search Console and Bing Webmaster Tools (`post-deploy-live.ts` lines 200–207 and 491). The happy-path test requires no request whose url matches Google or Bing. Test `a route failure does not rewrite the deploy record` (post-deploy-live.test.ts line 205) writes a `DEPLOYS.md`, runs a 404 check, and requires the file bytes to be unchanged.

Live smoke steps for Hostinger, Vercel, Netlify, and Cloudflare are in `packages/deploy/README.md` lines 44–76. Each one says to set `HH_LIVE` to `1` on the user's own account and to unset it after. Injected tests do not read that variable. The yes gate is what stops a deploy.

During this review the Hostinger tool catalog on this machine was read for the six names the adapter prefers. The argument maps in `writeArgs` and `pollArgs` (`hostinger-mcp.ts` lines 153–183) match those schemas: `hosting_deploy-static-website` and `hosting_deploy-js-application` take `domain`, `archivePath`, and `removeArchive`; `hosting_websites_deploy-static-site-archive` takes `username`, `domain`, and `archive_path`; `hosting_nodejs_start-build` takes the Node build fields this file sends; `hosting_list-js-deployments` takes `domain`; `hosting_nodejs_list-builds` takes `username` and `domain`. The static deploy route and the Node build route match the published hosting v1 paths. `McpToolInfo` still has no `inputSchema` field (lines 19–22). A tool chosen only by description, with none of the preferred names present, is called with `{ domain, archivePath }` (`writeArgs` lines 176). The official preferred names are the path the tests run.

## UI

Prompts 144, 145, and 146 change no file under `packages/app/`. The diff from `81f59c0` to `d42ac1e` is `packages/deploy` only. No screen was added or restyled. This review did not open a browser and did not take 375 or 1440 screenshots. No visual pass is claimed.

## Live model calls

This group adds no model call. Nothing under the new deploy files imports `packages/engine/src/ai/` or calls `think`. No prompt here replaced a live model call with a scripted stub. The Lighthouse runner is injected, and a missing or thrown mobile run is a blocker. It is not a stub that returns a passing score.

## Notes

- Prompt 145's context names `{ ok, status, titleFound }` and its interface names `{ skipped, ok, reason }`. The code and the tests follow the interface. Status and the title check are in `reason` on failure, and `ok: true` means all three checks passed.

- Research 11 and `docs.ts` name `wrangler deploy` for Workers static assets. Prompt 146 names `wrangler pages deploy`. `cli-run.ts` follows this prompt. `docs.ts` is outside the file list and was left unchanged. The README records that split (lines 26–28).

- CONTEXT-PACKAGE.v2.md section 13 says Node 20 or 22 LTS, and also says an API token may live in the keychain or `.env.local`. The Hostinger tool schema's `node_version` enum is 18, 20, 22, and 24. This adapter accepts that enum and defaults to 22 (`hostinger-api.ts` lines 18 and 163). The token is read only from the keychain, which is this prompt's prohibition. Matt's answers and DECISIONS.md do not pick a Node line or a token file.

- A static Hostinger deploy sends the `archivePath` from `.hitchhiker/deploy/host.json`. The adapter does not zip `dist/` itself. The official static tool's description says a directory should be archived before the call. The builder recorded the host.json assumption in `d42ac1e`. The must-have that is tested is the official tool call, with the archive path the caller stored.

- `renderLaunchKit`, `postCheck`, and `deploy` are exported from their modules. The prompts' file lists do not include `packages/deploy/src/index.ts`, and no test harness required a barrel line.

## Commands

Run from the repo root on `d42ac1e`, before this docs commit:

- `pnpm --filter @hitchhiker/deploy test` exited 0. 120 tests, 120 pass, 0 fail, 0 skipped. The count is the earlier 75 plus these three prompts: launch kit 10, post-check 12, real adapters 15, post-deploy live 8.

No prompt in this group defers its test runner to a later prompt.

## Scope

No source change in this session. No fix commit. No push, no remote, no deploy. Prompt 148 is not started.

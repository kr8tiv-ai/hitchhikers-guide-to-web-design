# 143 Review — prompts 140, 141, 142

Verdict: **PASS**

Reviewed: 2026-10-08. Fresh session. No fix commits. No new feature. Prompt 144 is not started.

Each must-have truth below has a test name and a file line. The commands that could run exited 0. This checkpoint does not close So Long and Thanks for All the Fish (`phase_end: false`). Live transport and post-deploy checks stay on prompts 145 and 146, which is what prompts 140–142 require.

## History

Three build commits sit on `0b42151` (review 139), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. At review start `main` was ahead of `origin/main` by these three commits, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `32c5c8c` | `0b42151` | `feat(deploy): add an approved Hostinger client` | prompt 140, matches the commit line |
| 2 | `c478ed2` | `32c5c8c` | `feat(deploy): add an approved Vercel client` | prompt 141, matches the commit line |
| 3 | `5b9d12e` | `c478ed2` | `feat(deploy): render DEPLOY.md and HANDOFF.md` | prompt 142, matches the commit line |

HEAD at review start was `5b9d12e`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent. No `any` in `packages/deploy`.

## 140 Deploy to Hostinger only after a yes, then poll

### Truths

- Hostinger writes are approved, sent once, and polled. `deployHostinger` throws `Hostinger deploy requires approval` when `approved` is not `true`, and that check sits before any client call (`packages/deploy/src/hostinger.ts` lines 74–76). One upload runs, then `poll` is called with that id until `completed`, `failed`, or `maxPolls` (lines 90–112). The queued return is `{ state: "queued", uploads }` and the loop does not call upload again (lines 101–112). Test `approved false throws and does not upload` (`packages/deploy/test/hostinger.test.ts` line 122) uses a client that rejects if called. Test `static upload polls queued, queued, completed once` (line 217) requires `state: "completed"`, `uploads: 1`, three polls, and the same id each time. Test `queued until maxPolls returns queued and uploads once` (line 249) feeds a later `completed` and requires the function to stop at three polls with `uploads: 1`. Test `a failed poll returns failed and does not upload again` (line 264) requires `polls` 2 and one node upload. Test `a thrown poll does not upload again` (line 308) requires one static upload.

- Static and Node are different paths. `kind: "static"` calls `uploadStatic`. `kind: "node"` calls `prepareNodeArchive` and then `uploadNode` (hostinger.ts lines 86–94). `prepareNodeArchive` rejects a path that contains `node_modules` and a total over `50 * 1024 * 1024` (lines 33–66). Test `static upload polls queued, queued, completed once` requires `staticUploads` 1 and `nodeUploads` 0. Test `node upload polls queued, queued, completed once` (line 233) requires the opposite counts and id `node-9`. Test `kind node with node_modules throws before upload` (line 183) and test `kind node over 50 MB throws before upload` (line 200) require zero uploads and zero polls. Test `prepareNodeArchive rejects node_modules and a total over 50 MB` (line 78) covers a nested path, a Windows separator, and `NODE_MODULES`.

- The live API is behind an injected client. `HostingerClient` is an argument (`packages/deploy/src/types.ts` lines 30–41). The module comment says the live method list is read from the Hostinger MCP schema at integration time and that this file invents no REST path (hostinger.ts lines 13–16). Test `the module does not read a token, call the network, or name an agency overwrite tool` (hostinger.test.ts line 347) reads `hostinger.ts` and requires the absence of `fetch(`, `readFile`, `process.env`, `node:fs`, `node:http`, and `agency-hosting`, and requires the schema sentence plus Node versions `18, 20, 22, and 24`. NOTICE lines 502–509 say the same: no SDK, injected client, schema at runtime, no token in the repo.

### Key link

`deployHostinger` and `prepareNodeArchive` are exported from `packages/deploy/src/index.ts` lines 5–12. That is the function a later `hh so-long` command can call after a yes. Prompt 140 step 8 asked for that export and for the test script. `packages/deploy/package.json` script `test` is `node --experimental-strip-types --test test/**/*.test.ts`.

### Also checked

`maxPolls` of 0 throws before upload (hostinger.ts lines 77–79, test line 142). An empty file list throws for static and for node (test line 157). An empty upload id throws after one static upload and does not poll (test line 279). A second call is a new attempt and uploads once per call (test line 326). Equal to 50 MB is allowed (test line 69). Sizes are injected. The test creates no 50 MB fixture and opens no socket.

## 141 Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes

### Truths

- The second host does not weaken the approval rule. `pollLoop` throws on `approved !== true` before it looks at kind (`packages/deploy/src/poll.ts` lines 57–59). `deployVercel` uses that loop with `Vercel deploy requires approval` (`packages/deploy/src/vercel.ts` lines 19–36). The file comment states there is no preview exception (vercel.ts lines 3–4). Test `approved false throws, does not upload, and does not claim success` (`packages/deploy/test/vercel.test.ts` line 69) requires that sentence, zero uploads, zero polls, and no `succeeded`. Test `a preview flag does not skip approval` (line 84) passes `preview: true` with `approved: false` and requires the same refusal and zero uploads. Test `unapproved node still requires approval and does not upload` (line 98) requires the approval error, so a node rejection cannot stand in for a yes.

- Unwired shapes are rejected. Kind `node` throws `Vercel template is not wired` before upload (poll.ts lines 60–62, vercel.ts line 21). Test `kind node is rejected before upload` (vercel.test.ts line 108) requires that message and zero uploads. Test `an unknown kind is rejected before upload` (line 118) passes `edge` and requires `Vercel deploy kind must be static`. The same two refusals exist for Netlify (`packages/deploy/test/netlify.test.ts` lines 104 and 114) and Cloudflare (`packages/deploy/test/cloudflare.test.ts` lines 109 and 119).

- Netlify follows the same safety shape as the other clients. `deployNetlify` calls `pollLoop` with `Netlify deploy requires approval` and `Netlify template is not wired` (`packages/deploy/src/netlify.ts` lines 19–36). Test `approved false throws, does not upload, and does not claim success` (netlify.test.ts line 66), test `queued until maxPolls returns queued and uploads once` (line 168), and test `a failed poll returns failed and does not upload again` (line 181) require one upload and no resend. Test `the module does not read a token, call the network, or start the Netlify CLI` (line 256) scans `netlify.ts` and `poll.ts`.

- The fourth host matches the safety contract. `deployCloudflare` calls the same `pollLoop` (`packages/deploy/src/cloudflare.ts` lines 23–39). Test `approved false throws, does not upload, and does not claim success` (cloudflare.test.ts line 71), test `static upload polls queued, queued, completed once` (line 146), and test `queued until maxPolls returns queued and uploads once` (line 173) match the Vercel assertions, including one upload and the same poll id. Test `static hosts do not share an upload count with each other or with Hostinger` (vercel.test.ts line 280) runs all four hosts on separate clients and requires each upload count to stay at 1. `poll.ts` has no module-level `let` or `var`. Hostinger does not import `poll.ts`.

- Scope stays on static upload. Kind `node` throws before `client.upload`. Cloudflare's comment says DNS and worker changes are a different command the Guide does not run (cloudflare.ts lines 8–10). Test `the wrapper does not expose name-server changes and does not start a CLI` (cloudflare.test.ts line 261) requires that sentence, scans `cloudflare.ts` and `poll.ts` for `.dns`, `dns(`, and `wrangler`, and requires the module's export keys to be only `deployCloudflare`. `assertNoTransport` (cloudflare.test.ts lines 47–68) rejects `fetch(`, `spawn(`, `exec(`, `child_process`, token env names, and `approved ||`.

### Key links

`pollLoop` returns `{ state, uploads }` with the same three states as `deployHostinger`, stops on `completed` or `failed`, and returns `queued` at `maxPolls` without a second upload (poll.ts lines 70–84). `deployNetlify` and `deployCloudflare` pass that loop the same input shape as `deployVercel`. Test `a thrown poll does not upload again` on each host requires the upload counter to stay at 1 when `poll` rejects.

### Also checked

`maxPolls` of 0, -1, 1.5, `NaN`, and `Infinity` throw before upload (vercel.test.ts line 133, and the matching Netlify and Cloudflare tests). An empty id, a whitespace id, and a missing id throw after one upload and do not poll (vercel.test.ts line 198). An unexpected poll state throws and does not upload again (vercel.test.ts line 251). No CLI is spawned. No token is read inside the library. No site id or account id is stored. The Vercel source scan also rejects `VERCEL_TOKEN` and `prj_` (vercel.test.ts line 329).

## 142 Generate DEPLOY.md and HANDOFF.md

### Truths

- Deploy docs state the approval rule. Both strings include `Nothing deploys without an explicit yes.` (`packages/deploy/src/docs.ts` line 22, used at lines 81 and 102). Test `the approval sentence is present` (`packages/deploy/test/docs.test.ts` line 51) requires that sentence in `deployMd` and in `handoffMd`. Test `a static Hostinger site renders Deploy and Handoff` (line 23) requires the headings `# Deploy` and `# Handoff`, `Maintainer: Ada`, `Hosting: Hostinger`, a rollback line, and no `!`.

- They match the adapter capabilities. Hostinger static names `deployHostinger` and the built-file upload, and the 50 MB / `node_modules` lines are absent (docs.test.ts line 23, docs.ts lines 111–112). Hostinger node includes both limits and the archive sentence (docs.ts lines 32–37 and 107–109). Test `hostinger node mentions 50 MB and node_modules` (docs.test.ts line 57) requires those phrases in both files and a combined word count under 500. Vercel, Netlify, and Cloudflare node throw `Vercel template is not wired`, `Netlify template is not wired`, and `Cloudflare template is not wired` (docs.ts lines 26–30 and 49–51). Those are the same strings as the adapters (vercel.ts line 21, netlify.ts line 21, cloudflare.ts line 25). Test `vercel node throws` (docs.test.ts line 85) requires the exact Vercel string. Test `netlify and cloudflare node throw` (line 96) requires the other two. Static docs for those three hosts name `deployVercel` / `` `vercel deploy` ``, `deployNetlify` / `` `netlify deploy` ``, and `deployCloudflare` / `` `wrangler deploy` ``, and they omit the Node archive limits (test line 67). `undecided` throws `deploy host undecided` (docs.ts lines 212–214, test line 133).

### Key link

Host and kind go through `readHost` and `readKind` before render (docs.ts lines 47–51 and 208–222). The guide function names are `deployHostinger`, `deployVercel`, `deployNetlify`, and `deployCloudflare` (lines 122–136). Handoff names the maintainer, the hosting answer, and a rollback that repeats the host's kind (lines 87–104 and 139–148). Section 13's handoff topics are present: edit, Elevate as the product name, `/hh-elevate`, a blog line, and domain renewal (lines 95–99). The static Hostinger test requires those lines.

### Also checked

A maintainer that contains `xai-` throws, and the error does not echo the fixture token (test line 101, docs.ts lines 194–199). `Bearer ` and `sk-` in `siteWhy` throw (test line 114). Empty maintainer and empty `siteWhy` throw (test line 119). A newline in `siteWhy` becomes one line (test line 126, docs.ts lines 183–191). The renderer returns strings. Test `the module returns strings and does not write a project` (line 146) scans `docs.ts` for `node:fs`, `writeFile`, `https://`, and `http://`. The static Hostinger render also requires those URL schemes to be absent from both documents. An exclamation mark in an input is rejected (test line 142), and `renderDeployDocs` throws if either document contains `!` or the pair exceeds 500 words (docs.ts lines 62–68).

## UI

Prompts 140, 141, and 142 change no file under `packages/app/`. The diff from `0b42151` to `5b9d12e` is `NOTICE` plus `packages/deploy`. No screen was added or restyled. This review did not open a browser and did not take 375 or 1440 screenshots. No visual pass is claimed.

## Live model calls

This group adds no model call. Nothing under `packages/deploy` imports `packages/engine/src/ai/` or calls `think`. No prompt here replaced a live call with a scripted stub. D-003's real deploy transport is prompt 146. Prompts 140 and 141 forbid calling Hostinger, spawning the Vercel CLI, spawning the Netlify CLI, and running wrangler in the test. The injected client is the contract those prompts set.

## Notes

- CONTEXT-PACKAGE.v2.md section 13 names Node 20 or 22 LTS. Prompt 140 and the research addendum list 18, 20, 22, and 24. The adapter comment (hostinger.ts lines 8–11) and the handoff text (docs.ts lines 13–14 and 32–36) state the four versions and mark 20 and 22 as the LTS pair. The builder recorded that conflict in `32c5c8c`. Matt's answers and DECISIONS.md do not pick a Node line. This review leaves the comment as the prompt required.

- `packages/deploy/src/index.ts` re-exports Hostinger only. `deployVercel`, `deployNetlify`, `deployCloudflare`, and `renderDeployDocs` are exported from their own modules. Prompts 141 and 142 forbid edits outside their file lists, and no test harness required a barrel line. Callers today import the module files, which is what the tests do.

- Files outside a prompt list, and why they stay: `packages/deploy/package.json` and `packages/deploy/src/index.ts` on 140, because step 8 asks for the test script and the export. `packages/deploy/src/poll.ts` on 141, because step 9 allows a shared poll loop and the commit names it. Prompt 142 touches only `docs.ts` and `docs.test.ts`. None of these is a new feature. Nothing was reverted.

- Phase success criterion 1 in `hh-build-plan/ROADMAP.md` (live post-deploy checks on all four hosts) is still ahead of this group. Prompt 145 checks a URL with an injected fetch. Prompt 146 wires the real adapters. That is a later prompt, so it is a note here.

## Commands

Run from the repo root on `5b9d12e`, before this docs commit:

- `pnpm --filter @hitchhiker/deploy test` exited 0. 75 tests, 75 pass, 0 fail, 0 skipped. The count is the five files together: Hostinger 16, Vercel 16, Netlify 15, Cloudflare 15, docs 13. Several titles repeat across host files. Each file calls its own function.

No prompt in this group defers its test runner to a later prompt.

## Scope

No source change in this session. No fix commit. No push, no remote, no deploy. Prompt 144 is not started.

# 016 Review — prompts 013, 014, 015

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `1b716f1` (`feat(interview): add tree modules 2 through 5`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is not a general impression of the tree.

## History

Three build commits, in order, on top of `5e35451`. Messages match the prompt commit lines. They are not squashed. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `ead3a17` | `feat(orchestrator): add a scripted ACP client` | same |
| 2 | `712cd47` | `feat(interview): add tree modules 0 and 1` | same |
| 3 | `1b716f1` | `feat(interview): add tree modules 2 through 5` | same |

## 013 Speak to grok agent over stdio ACP

### Truths

- ACP is testable without the grok binary. `createAcpClient` in `packages/orchestrator/src/acp.ts` takes an injected `AcpIo` (`write` and `read`). The tests build that pair in memory (`scripted` in `packages/orchestrator/test/acp.test.ts`) and never call `spawn`, `fork`, or `exec`. Test `the client source does not start a process` reads `acp.ts` and requires the source to contain neither `child_process` nor `spawn`, `fork`, `exec`, `console.`, or `process.stdout`. The suite is 13 tests, all in-process.
- The call order matches the documented handshake. `hh-build-plan/RESEARCH-ADDENDUM.md` and `context/sources/xai/cli_headless-scripting.md` (the page `cli_reference.md` points at for `grok agent stdio`) give the order `initialize`, `authenticate`, `session/new`, `session/prompt`. Test `the four methods write in handshake order` requires that method list, ids 1 through 4, and the params from the scripting example: `protocolVersion: 1` with the example `clientCapabilities`, `authenticate` as `{ methodId, _meta: { headless: true } }`, `session/new` as `{ cwd, mcpServers: [] }`, and `session/prompt` as `{ sessionId, prompt: [{ type: "text", text }] }`. Test `skipping initialize throws` requires `authenticate`, `newSession`, and `prompt` to throw before any write. Test `session/prompt before session/new throws` covers the prompt's out-of-order rule. Test `a configured API key selects the method id and stays out of the JSON` requires `methodId: "xai.api_key"` and requires the planted key string to be absent from the line. The header comment in `acp.ts` names `context/sources/xai/cli_headless-scripting.md`.

### Also checked

- Test `prompt rejects an empty string` requires no fourth write. Test `two prompts in a row are allowed after a session exists` allows a second `session/prompt` on the same `sessionId`. Test `a response that is not JSON throws` and test `a response id that does not match throws` cover the two edge cases. Test `a JSON-RPC error does not advance the handshake` requires the phase to stay idle.
- `expectSilent` in the order test wraps the prompt call and requires zero `console` calls, so the prompt text is not logged.
- The only file outside the prompt list is `packages/orchestrator/package.json`. The previous script was `node -e "process.exit(0)"`, which would have made `pnpm --filter @hitchhiker/orchestrator test` exit 0 without running a test. The new script is `node --experimental-strip-types --test test/**/*.test.ts`. That is the harness the verification command needs. It is not a new feature.
- `createAcpClient` is exported from `acp.ts`. Prompt 035 names that file. The package barrel was not on the 013 file list, and this prompt did not require it.

## 014 Write interview tree modules 0 and 1

### Truths

- Questions are data in `interview/tree.yaml`. Test `modules towel-check and ford-field-notes list every module 0 and 1 id once` calls `loadTree` on `interview/tree.yaml` (resolved with `fileURLToPath` from the test file up to the repo root) and requires the ids `DP-0.1`, `DP-0.2`, `DP-0.2a`, `DP-0.3`, `DP-0.4`, `DP-0.5`, `DP-0.6`, `DP-0.7`, then `DP-1.1` through `DP-1.9`, each once. There is no `DP-1.7b`. The questions are mappings under `questions:`, not prose inside a prompt string.
- The loader rejects a broken question instead of skipping it. `questionsFromYaml` in `packages/engine/src/tree.ts` throws `TreeError` on a duplicate id before the function returns. `requireString` and `requireStringList` throw on a missing or empty required field. Tests: `duplicate ids throw TreeError`, `a question missing writes throws and does not return earlier rows` (a valid `DP-T.1` followed by a `DP-T.2` with no `writes`), `empty writes throws`, `empty skip_default throws`, `an unknown depth token throws`, `an unknown input token throws`, `a missing ask throws`.
- Express is a subset, not a different tree file. `questionsForDepth` filters the array `loadTree` already returned and keeps file order. Test `depth is a filter and express drops DP-0.5 without dropping the id` requires Express to omit `DP-0.5`, Standard and Deep to include it, the skip default to be `No X connection.`, and every other Module 0 and 1 id to stay `[express, standard, deep]`. `interview/` contains only `tree.yaml`.

### Also checked

- Test `DP-0.7 offers Deep, then Standard, then Express, and skips to Deep` requires that order in the ask, skip default `Deep`, and a why that says every mode keeps every id and Express writes ASSUMED defaults for what it does not ask.
- Test `DP-1.5 suggest names the six font pairings` requires Bebas Neue + Barlow, Space Grotesk + Inter, DM Serif Display + DM Sans, Fraunces + Work Sans, Archivo Black + Archivo, and Clash Display + Satoshi.
- Test `DP-1.2 why treats color psychology as mixed research` requires the mixed-research caveat and rejects a claim that one named color "means" an emotion.
- Test `asks and follow-ups contain no exclamation mark or em dash` walks the loaded tree. Test `Miro follow-ups for logo, type, and voice are present` requires the three prompt strings for DP-1.1, DP-1.5, and DP-1.6. Test `DP-1.7 is the brand why, with the Why Finder as follow-ups, not a second id` requires the origin-story ask, `Do you understand your why?`, `Let's find it with the Golden Circle`, a `BRAND.md` write, and no `SITE-BRIEF.md` write on that row.
- `loadTree`, `questionsForDepth`, `TreeError`, and the `Question` type are exported from `packages/engine/src/index.ts`. The tree tests import them from that barrel. `packages/engine/src/index.ts` is the step 8 export. It was not a new surface.

## 015 Append interview modules 2 through 5

### Truths

- One tree file holds modules 0 through 5. Test `modules 2 through 5 list every id once from the same tree file` loads the same `interview/tree.yaml` path as the module 0 test. It requires `the-question` (`DP-2.1` through `DP-2.8`), `tools` (`DP-3.1` through `DP-3.9`), `vogon-neighbors` (`DP-4.1` through `DP-4.5`), and `point-of-view-gun` (`DP-5.1` through `DP-5.6`), each once, and requires `towel-check` and `ford-field-notes` to still be in that file, with `DP-0.1` first. There is no second tree file and no `DP-3.2a`.
- Commerce beyond a payment link is an escalation, not a default build. Test `DP-3.2 escalates a full store and skips to contact or content` requires skip default `No store. Contact or content only.`, `pushback_if` entries `shopify store` and `full store`, and suggest text for Stripe Payment Links, a Shopify Buy Button, and a full store that escalates. The why at `interview/tree.yaml` (`DP-3.2`) says a payment link or a buy button can ship, and that a full store, including a Shopify store with its own catalog and checkout, is not the default build.
- KPI numbers are not baked into the question data. `SITE_TYPES` in `packages/engine/src/site-types.ts` is fourteen worded KPI phrases and pack ids. Test `SITE_TYPES matches the named list and carries no percent or digit` requires length 14, the named id list, no `%`, no digit in `kpi` or `pack`, and no `volume`, `percent`, or `conversion rate` in a KPI phrase. The same-file test requires no `%` in the ask or why of modules 2 through 5. Test `DP-2.4 labels ranges as assumptions` requires the why to contain `Ranges are assumptions` and to contain no digit. Test `DP-4.3 forbids invented volumes` requires the sentence `Do not invent search volumes.`

### Also checked

- Test `DP-2.3 ask names every SITE_TYPES id and points suggest at that list` requires `input: [choice, text]`, the fourteen ids in order inside the ask, suggest text `The engine will offer these types`, and the why to name `sales-psychology`, `seo`, and `ux-conversion`.
- Test `DP-2.1 writes SITE-BRIEF.md` and the DP-2.4 test require `KPIS.md`. Test `DP-4.1 records COMPETITORS.md` requires that write target and does not add crawler code. `packages/crawler` is still the earlier stub.
- Test `DP-4.5 does not promise answer-engine citations` requires the why to say `does not promise citations`.
- Test `DP-5.1 asks for three to five, and the ten-site walk stays on DP-5.2` requires `three to five` on DP-5.1 and keeps `ten` off that ask. The ten-site sentence lives on DP-5.2 as the gallery instruction.
- DP-5.4 follow-ups are the eight Visual Interview topics from `context/sources/prompts.txt` (mood words, references, type contrast, color temperature, motion personality, texture, imagery, signature moment). The last follow-up is the signature moment. Topic 4 in the source also says "light or dark"; that choice is DP-5.5 (`moody`, `airy`, or `paper`). Topic 7 in the source also says "real people or no people"; the follow-up asks what never shows up and does not repeat the people clause. The id, the ending, and the eight-topic shape are present. Those two shortenings are notes, not a failed truth.
- `SITE_TYPES` and `SiteTypeHint` are exported from the engine barrel. Prompt step 2 required `packages/engine/src/site-types.ts` and that export. The files list named the yaml and the test; the steps and the artifacts named the module. It is in scope.
- The module 0 and 1 tests still run inside `pnpm --filter @hitchhiker/engine test`. The append did not change `tree.ts`.

## File list

`git diff --name-only 5e35451..HEAD`:

- `packages/orchestrator/src/acp.ts`
- `packages/orchestrator/test/acp.test.ts`
- `packages/orchestrator/package.json` (test script only, see 013)
- `interview/tree.yaml`
- `packages/engine/src/tree.ts`
- `packages/engine/test/tree.test.ts`
- `packages/engine/src/index.ts` (barrel exports required by 014 step 8 and 015 step 2)
- `packages/engine/src/site-types.ts`
- `packages/engine/test/tree-modules-2-5.test.ts`

No extra feature. Nothing to revert. No client site, no new remote, no `@theatre/studio`, no second tree file, no crawler, no new package.

## UI

No file under `packages/app/` changed in `5e35451..HEAD`. This group has no screen to open. There is no 375 or 1440 capture for these prompts, and no visual pass is claimed.

A scan of `interview/tree.yaml` finds no exclamation mark, no em dash, and none of the Guide voice bans (`elevate`, `seamless`, `unlock`, `delve`, `lorem`, and the rest of the list in `packages/app/src/design/voice.md`).

## Live Grok

013, 014, and 015 do not call a model. 013 is the stdio handshake over injected streams. The prompt forbids spawning grok in the test, and the test enforces that. 035 is the prompt that sits this client on the 011 adapter. 014 and 015 are question data. D-003's live interview call belongs to the later ask loop. Nothing here left a scripted answer in place of `think`. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`, which is the 011 rule. This run skipped it.

`authenticate` sends a method id. The planted key in the ACP test stays out of the JSON. `acp.ts` reads `process.env.XAI_API_KEY` only to choose between `xai.api_key` and `cached_token`, matching the scripting example.

## Authority

No conflict with `context/matt-answers.md` or `DECISIONS.md` that these commits got wrong.

D-004 says Express and Standard drop no questions. They defer them and flag the assumption. `DP-0.5` stays in `interview/tree.yaml` with skip default `No X connection.` and depth `[standard, deep]`. That is the filter prompt 014 requires, and it matches v2: Express still has the id and writes the ASSUMED default. The question was not deleted and there is no second Express file.

Prompt 015 step 2 says "thirteen" types. The same prompt's named list, and the v1 table, have fourteen: sales, funnel, calls, reservations, sign-ups, portfolio, content, local, event, personal, nonprofit, recruiting, investor, app. `SITE_TYPES` has those fourteen. The test locks the list, not the miscount.

v1's personal-brand row names a pack called Voice. Section 17 has no pack id `voice`. The row uses `copywriting`, which is the voice-application pack. Portfolio uses `motion` (v1 also names typography; the prompt's field is one pack id). The commit body records both choices.

v2 says each site type names events as well as a KPI and a pack. Prompt 015's `SiteTypeHint` is `{ id, kpi, pack }`. The implementation follows that interface. Event names can land with `KPIS.md` in a later prompt. They are not a failed truth of this slice.

Matt Q11 says to offer to elevate an existing logo. Prompt 014 sets the follow-up to `Want suggestions or an improved version?`, and the Guide voice bans `elevate` as a promise. The tree uses the prompt's sentence.

## Notes for later prompts

These are not failed truths.

- `acp.ts` reads one response line per call. The scripting example also receives assistant text as `session/update` notifications. The file comment says a later prompt must re-read that schema before a live stdio process is wired. Prompt 013 required the one-line client.
- `initialize` copies `clientCapabilities` (`fs` read and write, `terminal: true`) from the scripting example. This client does not serve those callbacks. The comment says so.
- The yaml header still says modules 2 through 9 arrive in the next prompts. Prompt 015 said to keep that header. Modules 6 through 9 are still ahead. The sentence is stale for modules 2 through 5.
- `DP-5.4` topic 4 leaves light versus dark to `DP-5.5`. Topic 7 does not repeat "real people or no people."
- `SITE_TYPES` has no `events` field. See Authority.
- The engine live-smoke test stays skipped unless `HH_LIVE=1`.

## Verification

Run from the repo root on 2026-10-06. Each exited 0.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/016-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/orchestrator test` | 13 passed, 0 failed. |
| `pnpm --filter @hitchhiker/engine test` | 97 passed, 0 failed, 1 skipped (`live smoke returns a two-field object`). |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

The engine count is the previous 68 passing tests plus 20 tree tests and 9 module 2–5 tests. Earlier cassette, config, lock, state, template, boundary, and workspace tests still pass. No test was weakened to get there.

## Scope

No new feature. No fix commit. Prompt 017 was not started. Nothing was pushed, deployed, or published.

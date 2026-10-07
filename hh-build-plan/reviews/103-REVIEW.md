# 103 Review — prompts 100, 101, 102

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 104 is not started.

The must-have truths for 100, 101, and 102 hold. Each one below has a test name and a file line. `pnpm --filter @hitchhiker/orchestrator test` exited 0: 153 pass, 0 fail. `pnpm --filter @hitchhiker/engine test` exited 1. The only failure is `package.json dependencies match BOUNDARIES`, a pre-existing mismatch from prompt 085. It is not in these three commits. Prompt 100's own file passed on its own: `node --experimental-strip-types --test packages/engine/test/tools.test.ts` exited 0, 17 pass. The CLI filter in the prompt matches no package and exits 0 without a suite. The package prompt 001 named is `hitchhikers-guide`. `pnpm --filter hitchhikers-guide test` exited 0: 37 pass, 0 fail.

## History

Three build commits, in order, on top of `df61224` (the 099 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `8cfd283` | `df61224` | `feat(tools): discover and safely install tools and MCP servers on a yes` | same, prompt 100 |
| 2 | `ba2262f` | `8cfd283` | `feat(orchestrator): route and bump effort` | same, prompt 101 |
| 3 | `ed79c2e` | `ba2262f` | `feat(orchestrator): add drive preflight` | same, prompt 102 |

HEAD at review start was `ed79c2ed23922124eea72e7d6b84b7aab0ee845f`.

File lists:

- 100 named `packages/engine/src/tools/discover.ts`, `legitimacy.ts`, `install.ts`, `packages/engine/test/tools.test.ts`, and `packages/cli/src/commands/tools.ts`. The commit also adds `packages/cli/src/main.ts` (the `tools` dispatch at line 160) and `packages/cli/test/tools.test.ts`. Those two are the command wiring and its tests. They are not a new feature. They were left in place.
- 101: `packages/orchestrator/src/effort.ts`, `packages/orchestrator/test/effort.test.ts`, `packages/orchestrator/src/worktrees.ts`, `packages/orchestrator/test/worktrees.test.ts`. Nothing else.
- 102: `packages/orchestrator/src/preflight.ts`, `packages/orchestrator/test/preflight.test.ts`. Nothing else.

No file under `packages/app/` changed between `df61224` and HEAD. No 375 or 1440 screenshot. This group has no UI.

## 100 Discover and install tools, APIs, and MCP servers

### Truths

- Tool discovery uses real registries. `MCP_REGISTRY_ORIGIN` is `https://registry.modelcontextprotocol.io`, `NPM_REGISTRY_ORIGIN` is `https://registry.npmjs.org`, and `NPM_DOWNLOADS_ORIGIN` is `https://api.npmjs.org` (`packages/engine/src/tools/discover.ts` lines 16–18). `discoverTools` requests `/v0/servers` and `/-/v1/search` through the injected fetch (lines 97–108). Test `discoverTools queries the real registries and ranks with think()` (`packages/engine/test/tools.test.ts` line 101) records the requested URLs and requires both registry prefixes. Fetch is injected, which is what the prompt's interface requires. The CLI default is global `fetch` (`packages/cli/src/commands/tools.ts` line 260).

- Every install passes the legitimacy gate and a yes. `installTool` calls `checkLegitimacy` inside `blockReasons` and returns `blocked` before `confirm` when the gate fails (`packages/engine/src/tools/install.ts` lines 73–82 and 169–171). A false confirm returns `declined` and does not call `run` (lines 81–82). Test `a declined confirm runs nothing` (tools.test.ts line 461) requires outcome `declined`, one confirm, an empty run list, and no NOTICE or `.grok/config.toml`. Test `GPL and a failed pnpm add do not write NOTICE` (line 511) requires a GPL option to return `blocked` with zero confirms and zero runs. Test `install without a yes runs nothing` (`packages/cli/test/tools.test.ts` line 125) requires the CLI, with no `--yes`, to run nothing.

- Installs are recorded in NOTICE or CREDITS. After a passing `pnpm add`, or after an MCP config write, `appendNotice` writes `NOTICE` (`install.ts` lines 102 and 296–308). Test `a yes installs an npm package and records it in NOTICE` (tools.test.ts line 486) requires the `pnpm add` argv and a NOTICE entry with the name, `License field: MPL-2.0`, the file-level copyleft line, and the repository URL. Test `an MCP install writes project config without secrets and records NOTICE` (line 548) requires the server name in NOTICE. CREDITS is the other allowed file. This path uses NOTICE.

### Key links

- `installTool` applies the 097 deny policy through `denyInstallPolicy`, because the engine cannot import the orchestrator (`install.ts` lines 110–134, called from `plannedDenial` at 177–189). Test `denyInstallPolicy uses the 097 deny reasons` (tools.test.ts line 637) requires the 097 reason strings in both sources and checks `git push`, `vercel deploy`, `rm -rf /`, a missing legitimacy record, an empty repo, AGPL, a mismatched name, and an allowed `pnpm add`. The copy does not call `evaluateCommand`. It misses two shapes that 097 denies: `hostinger` together with `deploy`, and `git` with a flag between it and `push` (`git -C <path> push`). The npm install argv this module builds is only `pnpm add`. Those two shapes are a drift, not a failed truth.

- `discoverTools` ranks with `think()` from 011. `discover.ts` line 9 imports `think` from `../ai/think.ts`. `rank` passes `RANK_SCHEMA` (lines 39–60 and 155–166). The schema requires `options` items of `name`, `kind`, `why`, `licence`, `costNote`, and `maintenance`, with `kind` limited to `mcp`, `npm`, and `api`, and at most 5 items. The same test asserts those required keys and `maxItems` 5. A model name that was not in the registry list is dropped (`left-pad` in that test). The CLI default is the engine `think` export (`tools.ts` lines 13 and 261). Tests inject `think`, which is the prompt's interface. There is no cassette fixture for the rank task. The product path is not a scripted stub.

### Also checked

- A GPL hit that the model ranks first stays in the list, blocked, with the registry licence `GPL-3.0` rather than the model's `MIT` (the discover test, lines 229–233). Both registries down throw `RegistryUnreachableError` and do not call `think` (test line 293). One registry down still returns the other and sets `registryNote` (test line 314).
- Licence allow-list, repository match, 18-month publish, the weekly-download floor, an unexplained install script, and an insertion typo-squat each have a test (tools.test.ts lines 362–459). The download floor is applied when `kind` is `npm`. An MCP option with 0 downloads passes (test line 421). The typo-squat check is a one-character insert or delete against `POPULAR_NAMES`, not a substitution. The file says a substitution collides with real packages such as `reach` and `react` (`legitimacy.ts` lines 15–19 and 276–278).
- MCP config is project `.grok/config.toml` with `[mcp_servers.<key>]`, `command` or `url`, and `env` values of `${NAME}`. That matches the Grok project scope in the settings docs. Secrets are env names. A raw token in argv is blocked before confirm (test line 589). The ask text names the environment or the OS keychain.
- `kind: "api"` has no pnpm add and no MCP block. A yes still appends NOTICE and returns `installed`. The prompt specifies install behavior for npm and MCP. An API records the choice and does not configure a client.
- No `any` in the three engine modules or the CLI command. User-facing strings checked by the tests contain no exclamation mark.

## 101 Route effort, bump it once on retry, and gate the worktrees flag

### Truths

- Retries escalate effort once per step and then stop escalating. `bumpEffort` maps medium to high uncapped, high to xhigh uncapped, and xhigh to xhigh capped (`packages/orchestrator/src/effort.ts` lines 46–51). Test `bump from medium is high uncapped, from high is xhigh uncapped, from xhigh is xhigh capped` (`packages/orchestrator/test/effort.test.ts` line 62). Test `five bumps from medium end at xhigh capped` (line 68) requires the third through fifth results to stay xhigh capped. Test `three failures do not produce a fourth effort name` (line 89) starts at Towel, bumps three times, and requires the name set to be only medium, high, and xhigh. Forty-Two starts at xhigh and each of three bumps stays xhigh capped (same test, lines 104–111). `ultra` and `max` throw (test line 115).

- The flag values are ones the CLI knows. The runner accepts only `medium`, `high`, and `xhigh` and puts that string after `--effort` (`packages/orchestrator/src/runner.ts` lines 109–111 and 198–199). The addendum records grok-4.7 efforts as low, medium, high, and xhigh, and says not to invent a fifth. This module emits three of those four. `low` throws. Test `Forty-Two produces xhigh in argv via buildArgv` (effort.test.ts line 121) requires `--effort` to be `xhigh` and requires `ultra` and `max` to be absent. The comment in `effort.ts` lines 4–7 names the CLI flag from `context/sources/xai/cli_reference.md`.

- Parallel checkouts are opt-in. `defaultConfig().worktrees` is false (`packages/engine/src/config.ts` line 372). Test `defaultConfig worktrees is false and resolveWorkdir returns the project dir` (`packages/orchestrator/test/worktrees.test.ts` line 11) passes that boolean into `resolveWorkdir` and requires the project directory and a null command. `resolveWorkdir` returns a sibling path only when `worktrees` is true (`packages/orchestrator/src/worktrees.ts` lines 31–38). Prompt 101 did not change `config.ts`.

- The unit test does not create a worktree. `resolveWorkdir` does not import `child_process` and does not call git. Test `worktrees true returns a git worktree add command and does not run it` (worktrees.test.ts line 24) builds the argv `git worktree add <dir> -b hh/wt-<promptId>`, requires `evaluateCommand` to allow it, and requires `existsSync` to be false for both the project directory and the sibling. The sibling is `path.join(dirname(projectDir), .hh-wt-${promptId})`, outside the project.

### Also checked

- The tier table is exact: Towel and Cup of Tea are medium, Gargle Blaster and Heart of Gold are high, Forty-Two is xhigh (effort.test.ts line 40). `Cup of tea`, a double space, and `Towel ` throw (test line 48). null throws (test line 57). v2 section 5.3 allows Heart of Gold to start at high or xhigh. The prompt says high, and a failed attempt is what reaches xhigh. The implementation follows the prompt.
- `effortForTier` is not imported by `runner.ts`. The file list for 101 does not include the runner. Step 8 asks for a test that feeds Forty-Two through `buildArgv`, which is what `runPrompt` uses for `--effort`. That test is the key link `effortForTier feeds runPrompt's effort field`.
- `resolveWorkdir` takes the boolean the prompt's interface names. The test reads it from `defaultConfig()`, which is the GuideConfig default. A prompt id containing `/` or `\` throws (test line 69). An empty id throws (test line 48). The function does not create `projectDir` (test line 81).
- No model call. The 011 adapter is not involved.

## 102 Run preflight checks before the queue starts

### Truths

- The queue does not start unapproved. `preflight` pushes `Drive is not approved.` when `approved` is not `true`, and `ok` is false when any reason is present (`packages/orchestrator/src/preflight.ts` lines 74 and 86–90). Test `missing approval fails preflight and still returns the branch name` (`packages/orchestrator/test/preflight.test.ts` line 20) requires `ok` false, the reason above, and `backup` equal to `backupBranchName("2026-10-07")`, which is `hh/backup-2026-10-07`. The backup string is the branch name. The result does not say the branch is ready (`noBang` rejects `/ready/i` on reasons, warnings, and the backup). Test `the module does not spawn git, push, listen, or delete baselines` (line 423) requires the source to omit `runner.ts`, `prepareRepo(`, `commitPrompt(`, `spawn(`, `fetch(`, and `listen(`. `preflight` does not start the queue.

- Preflight is testable without a dev server. `serverProbe` is optional. When it is omitted and `serverRequired` is not true, the warning is `dev server not checked` and `ok` can still be true (preflight.ts lines 118–122). Test `omitted server probe warns and can still be ok` (preflight.test.ts line 95) passes no probe and no project root. Test `a false server probe fails only when the probe is provided` (line 121) requires `dev server down` only for a probe that returns false. The same source scan rejects `listen(`. No test binds a port.

### Also checked

- `backup` is `backupBranchName(date)` (preflight.ts line 70). The leap-day test (preflight.test.ts line 202) requires `hh/backup-2024-02-29`. An invalid date throws `GitFlowError` before mkdir (test line 214).
- Porcelain `## main` is ok when approved (test line 148). Empty porcelain is ok (test line 164). A tracked or untracked path fails with `Working tree is not clean.` (test line 190). `.env`, `.env.local`, a pem, `credentials.json`, and `.hitchhiker/config.json` fail as secrets (tests lines 35 and 63). `notenv` is not a secret (test line 83). Ignored non-secrets (`!! notes.txt`) stay clean. `!! .env` still fails as a secret.
- `serverRequired: true` with no probe fails with `Dev server is required.` and does not add the warning (test line 108). A probe that returns true still passes (test line 358). That is the prompt's "unless the prompt package says a server is required."
- With `projectRoot`, mkdir receives `baselines` under that root and is not asked to delete (test line 232). A second call leaves `baselines/kept.txt` in place (test line 266). The interface block omitted `projectRoot`, `mkdir`, and `serverRequired`. The goal asks for a baselines directory and for a required server to fail closed, so those fields are optional. v2 section 11.1 lists a dev server as part of preflight. The prompt says a missing server is a warning unless required. The implementation follows the prompt.
- Reasons and warnings checked by `noBang` contain no exclamation mark.
- No model call. The 011 adapter is not involved.

## Live model calls

100 is the only prompt in this group that calls the model. The rank call goes through the 011 `think` type with `RANK_SCHEMA`. The CLI default is that function. Tests inject it so the suite does not spawn grok. No cassette file was added for the rank task. 101 and 102 do not call the model.

## UI

No prompt in this group changed `packages/app/`. No screen was opened. No 375 or 1440 comparison. No visual pass is claimed.

## Known issues

- `pnpm --filter @hitchhiker/engine test` exits 1. `package.json dependencies match BOUNDARIES` (`packages/engine/test/boundaries.test.ts` line 95) fails on `@hitchhiker/assets`. `packages/assets/package.json` depends on `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`, and `meshoptimizer`. `packages/engine/src/boundaries.ts` lines 34–36 allow only `@hitchhiker/engine` plus `@resvg/resvg-js`, `@visioncortex/vtracer`, `opentype.js`, `pdf-lib`, and `svgo`. Commit `a3e5bbd` (prompt 085) added the glTF dependencies and did not update the allow list. Prompts 100, 101, and 102 do not touch those files. Fixing the allow list is outside their file lists, so this review does not change it. The tools tests inside that suite passed. The narrow rerun of `packages/engine/test/tools.test.ts` exited 0.

- `pnpm --filter @hitchhiker/cli test` matches no project and exits 0. The CLI package name is `hitchhikers-guide`, locked by prompt 001. The suite was run under that name and passed. Renaming the package would undo 001. This is the same note as reviews 012, 036, 064, and 095.

## Verdict

PASS_WITH_KNOWN_ISSUES. Every truth for 100, 101, and 102 has a test and a file line. Orchestrator exited 0. The engine package script exited 1 on a boundary mismatch these prompts did not introduce. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 104 is not started.

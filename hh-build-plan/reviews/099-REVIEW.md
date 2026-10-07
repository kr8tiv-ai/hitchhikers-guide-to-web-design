# 099 Review — prompts 096, 097, 098

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 100 is not started.

The must-have truths for 096, 097, and 098 hold. Each one below has a test name and a file line. `pnpm --filter @hitchhiker/orchestrator test` exited 0: 117 pass, 0 fail, 0 skipped. Git was on PATH, so the temp-repo checks ran.

## History

Three build commits, in order, on top of `19c8c65` (the 095 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `c49b8d9` | `19c8c65` | `feat(orchestrator): add the headless prompt runner` | same, prompt 096 |
| 2 | `b359f65` | `c49b8d9` | `feat(orchestrator): deny push, deploy, and unmarked packages` | same, prompt 097 |
| 3 | `2c651b8` | `b359f65` | `feat(orchestrator): back up the branch and commit per prompt` | same, prompt 098 |

HEAD at review start was `2c651b86532e053914b49d7abc01bcd7012dce20`.

Each commit touches only the files named in that prompt:

- 096: `packages/orchestrator/src/runner.ts`, `packages/orchestrator/test/runner.test.ts`
- 097: `packages/orchestrator/src/policy.ts`, `packages/orchestrator/test/policy.test.ts`
- 098: `packages/orchestrator/src/git-flow.ts`, `packages/orchestrator/test/git-flow.test.ts`

No file under `packages/app/` changed. No 375 or 1440 screenshot. This group has no UI.

## 096 Launch one site prompt as a fresh headless session

### Truths

- Each call is a fresh session id when ids are used. `buildArgv` appends `--session-id` only in uuid mode, and only with the caller-supplied id (`packages/orchestrator/src/runner.ts` lines 203–208). The module does not mint an id. Test `two uuid runs keep the caller ids and those ids differ` (`packages/orchestrator/test/runner.test.ts` line 152) builds two `randomUUID()` values, requires them to differ, and requires the two spawn argv lists to carry those ids in order. Test `the runner does not spawn a process or mint a session id` (line 320) requires the source to omit `randomUUID` and `child_process`. Test `alias mode does not pass --session-id` (line 91) passes an alias and requires the flag, `-s`, and the alias text to be absent. Test `argv carries the headless flags and the assembled prompt` (line 62) requires the absence of `--resume`, `--continue`, `-r`, and `-c`.

- The real grok binary is not required for the test. `runPrompt` takes a `spawnImpl` and calls that function (`runner.ts` lines 245–254). Every behavioral test passes a function. The source scan at line 320 requires no `child_process` import. This session's suite passed without a grok binary.

- Unapproved drives do not spawn. `assertRunnable` throws when `approved !== true`, before argv is returned and before spawn (`runner.ts` lines 147–149). The message is `Missing drive approval. A missing file is not a yes.`, the same sentence `assertDriveAllowed` uses (`packages/engine/src/spec/approve-drive.ts` line 109). Test `an unapproved drive does not spawn` (runner.test.ts line 129) runs `approved: false` and the string `"true"`, requires `RunConfigError` matching `/not a yes/`, and requires the spawn flag to stay false.

### Also checked

- The argv carries `--no-auto-update`, `-p` with the assembled prompt text, `-m`, `--cwd`, `--output-format` `streaming-json`, `--effort`, and `--max-turns`. The same flags test requires `--always-approve` to be absent. The source scan requires that flag string to be absent too. A prompt longer than `osArgvLimit()` switches to `--prompt-file` and writes that path before spawn (test `a prompt over the OS argv limit uses --prompt-file and records the path`, line 234).
- Unknown session mode throws `Run hh doctor` before spawn (test line 117). A missing or non-uuid session id throws (tests lines 98 and 109). `maxTurns` outside 1–80 and effort `low` throw (tests lines 195 and 205). A non-zero exit throws `RunFailed` with the path and stderr trimmed to 2,000 characters, and the error omits the prompt text (test line 168).
- `promptText` is the assembled string the caller passes (RULES, the prompt, then `@file` references in the test fixture). `readImpl` only reports whether `promptPath` exists. The module does not read the Guide repo.
- v2 §11.1 shows `--sandbox` and `--session-id` on every run, and allows `--always-approve` inside that sandbox. Prompt 096 forbids `--always-approve`, leaves sandbox flags for a later prompt, and passes `--session-id` only for a caller-supplied uuid. The implementation follows 096. Matt Q39 requires a fresh session per prompt. Distinct caller ids and the absent resume flags are that contract. DECISIONS.md does not require the omitted flags.
- No live `think()` call belongs in this prompt. The product path is the grok CLI argv. The tests inject spawn. Nothing here is a scripted stub standing in for the 011 adapter.

## 097 Deny push, deploy, and unapproved destructive actions

### Truths

- The orchestrator can deny a command without relying on hooks. `evaluateCommand` returns allow or deny from argv tokens and does not execute a process (`packages/orchestrator/src/policy.ts` lines 21–44). The module comment states that Grok hooks fail open and that this function is the second gate (lines 3–8). Test `policy source is the second gate and does not run commands` (`packages/orchestrator/test/policy.test.ts` line 535) requires those two phrases and requires no `child_process` import. Test `git push is denied` (line 38) and the rest of the table call `evaluateCommand` directly. `commitPrompt` calls `evaluateCommand` on every argv before the runner (`packages/orchestrator/src/git-flow.ts` lines 163–167 and 84–85). Test `git-flow gates commands and does not set an identity` (git-flow.test.ts line 204) requires that call in the source.

- Legitimacy metadata is required for new packages. `matchPackage` denies a named add or install when `packageMeta` is missing, when the name or license is blank (`legitimacy record missing`), when `repo` is blank (`package repo is empty`), or when the license is GPL or AGPL (`package license is denied`) (`policy.ts` lines 534–546). Test `npm install of a named package without meta is denied` (policy.test.ts line 303). Test `pnpm add without meta is denied` (line 315). Test `an empty repo url denies the install` (line 346). Test `GPL-3.0 is denied` (line 360). Test `AGPL-3.0 is denied` (line 378). Test `MIT with metadata is allowed` (line 425) requires name, license, and repo. Test `pnpm test allows without meta` (line 479). A name that does not match the record is denied (line 418).

### Also checked

- Token matching, not a substring scan. Test `a commit message that contains the word push is allowed` (line 128) allows `git commit -m "do not push"`. Test `a commit message that says git push is still a commit` (line 140) allows that message. `git push`, `git push --force`, `git -C path push`, `git remote add`, and `gh repo create` are denied (lines 38–101).
- Deploy denies: `npx wrangler deploy`, `vercel`, `vercel --prod`, `netlify deploy`, and `hostinger` together with `deploy` (lines 158–222). `wrangler dev` and `netlify dev` are allowed.
- Deletes of `/`, `C:\`, `c:/`, `D:\`, and the project root are denied. Windows path case and trailing slashes still match the project root (line 266). Empty argv is denied (line 25). Reasons do not echo a fixture secret (the table asserts `s3cret-value` is absent from every reason).
- v2 §11 and the addendum deny deletes outside the repo and any delete of `.hitchhiker/`, and they allow a deploy only for `/hh-so-long` after a yes. Prompt 097's input has no approval field, so deploy stays denied. The prompt's delete list is `/`, `C:\`, and the project root, and its cases allow a nested delete and a file delete inside the project. This review leaves that list as the prompt wrote it. Widening it would be a new rule.
- No model call. The 011 adapter is not involved.

## 098 Back up the branch and commit one prompt at a time

### Truths

- One prompt is one commit. `commitPrompt` builds one `git commit -m` argv and runs it once after the checks (`git-flow.ts` lines 82–100). Test `commitPrompt commits one safe change and never pushes` (git-flow.test.ts line 235) records the runner argv and requires the subcommand list to be exactly `add`, then `commit`, and requires `git log -1` to be that message.

- Secrets are not staged by this helper. After `git add -A`, secret names are removed with `git reset` before `assertNoSecrets` and before commit (`git-flow.ts` lines 87–100). `isSecretPath` matches a `.env` segment, `.env.*`, `*.pem`, `credentials.json`, and `.hitchhiker/config.json` (lines 128–161). Test `secret paths are unstaged and block a commit when they are the only change` (git-flow.test.ts line 258) requires the runner log to be `add`, then `reset`, requires no `commit` argv, requires HEAD to stay on the seed, and requires the cached diff to be empty. Test `a mixed tree commits the safe file and leaves secrets unstaged` (line 277) requires `page.txt` in the commit and requires `.env`, `.env.local`, `keys/dev.pem`, `credentials.json`, and `.hitchhiker/config.json` to be absent from `ls-files` and from the index. Test `assertNoSecrets blocks env, pem, credentials, and guide config` (line 139) covers those names without git, and allows `notenv`. The safe-change test commits a file named `notenv`.

- Nothing is pushed. The module builds no push argv. The recording runner throws if an argv element is `push` (git-flow.test.ts line 89). The one-commit test and both secret tests require every recorded argv to omit `push`, and require `git remote` to be empty. Test `prepareRepo creates a backup ref and does not move it` (line 217) requires the same empty remote. Test `git-flow gates commands and does not set an identity` (line 204) requires the source to omit `git push`, `--global`, and `user.email`.

### Also checked

- `backupBranchName("2026-10-07")` is `hh/backup-2026-10-07` (test line 110). Invalid dates, including `2026-02-29` and `2026-02-31`, throw (test line 117). `prepareRepo` creates that ref at the current HEAD and a second call leaves the ref there (test line 217).
- An empty message and a message with a newline throw before the runner is called (test line 166). A runner failure propagates (test line 180).
- The temp repo sets `user.email`, `user.name`, `commit.gpgsign`, and `core.hooksPath` with `git config` inside the repo (git-flow.test.ts lines 69–75). The helper does not set an identity.
- Path checks use `node:path`. `evaluateCommand` runs on the add, reset, diff, and commit argv, so a denied command throws before the runner.
- No model call. The 011 adapter is not involved.

## Live model calls

096, 097, and 098 do not call the model. 096 launches the grok CLI through an injected spawn. The 011 adapter is the structured `think()` path, and these prompts do not use it. No cassette was required. No product path returns a canned model body.

## UI

No prompt in this group changed `packages/app/`. No screen was opened. No 375 or 1440 comparison. No visual pass is claimed.

## Known issues

None for these truths. The orchestrator suite exited 0.

## Verdict

PASS. Every truth has a test and a file line. The verification command exited 0. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 100 is not started.

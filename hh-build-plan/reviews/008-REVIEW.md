# 008 Review — prompts 005, 006, 007

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `2f9e782` (`feat(engine): lock STATE.md and the home project index`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification command. It is not a general impression of the tree.

## History

Three build commits, in order, on top of `c5cf605`. Messages match the prompt commit lines. They are not squashed. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `f672771` | `ci: lint, typecheck, tests on three OSes, e2e, audit, and secret scan` | same |
| 2 | `2974aa1` | `feat(engine): validate .hitchhiker config.json` | same |
| 3 | `2f9e782` | `feat(engine): lock STATE.md and the home project index` | same |

## 005 CI workflows

### Truths

- CI runs on Windows, macOS, and Linux. `.github/workflows/ci.yml` job `unit` sets `runs-on: ${{ matrix.os }}` with `os: [ubuntu-latest, windows-latest, macos-latest]`. Test `unit workflow covers three operating systems and replays cassettes` requires those three names, `pnpm -r test` and `pnpm -r run --if-present eval` with `HH_CASSETTE=replay`, `pnpm exec tsc -b`, lint if present, frozen install with a missing-lockfile fallback, and `core.longpaths true` on the Windows leg. `e2e.yml` stays on `ubuntu-latest`. That matches the prompt: the unit matrix is the three operating systems, and Playwright is Ubuntu only.
- CI needs no secrets. Test `unit workflow covers three operating systems and replays cassettes`, and the same check in the e2e and audit tests, requires `raw.includes("secrets.")` to be false, job and step text to contain no deploy or publish step, and `permissions` to be exactly `contents: read`. `audit.yml` passes `GITHUB_TOKEN: ${{ github.token }}`. That is the automatic job token. The secret-scan test also requires the file to omit `GITLEAKS_LICENSE`. `docs/ci.md` says the workflows need no repository secrets.
- Actions are pinned by SHA. Test `assertPinnedUses` (called by all three workflow tests) requires every `uses:` value to match `owner/repo@` plus 40 hex characters, in the parsed document and in the raw file. Checked against the published tags on 2026-10-06: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` is v7.0.1, `pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413` is v6.1.0, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` is v7.0.0, and `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` is v3.0.0. Each workflow comment names that version.

### Also checked

- `audit.yml` calls the licence audit that prompt 156 completes. The licence step imports `auditDeps` from `packages/qa/src/licenses.ts` when that file exists. Until then it runs `pnpm licenses list --json` and exits 1 when a licence matches `AGPL` or a `GPL` token. Test `audit workflow calls the prompt 156 licence audit and scans with pinned gitleaks` requires those strings. On this tree, `pnpm licenses list --json` is an object keyed by SPDX id (`MIT`, `Apache-2.0`) whose entries have `name` and `license`. That is the shape the step reads. The current list is `@types/node` and `undici-types` (MIT) and `typescript` (Apache-2.0).
- `docs/ci.md` gives the Windows PowerShell equivalents for ci, e2e, and audit. It does not tell anyone to install `act`.
- No deploy job and no publish job.

## 006 Validate .hitchhiker config.json

### Truths

- Config cannot silently enable a GSAP fallback or a worktree fleet. Test `unknown keys throw instead of being stripped` requires `ConfigError` on `gsapFallback`, `motionFallback`, and `replaceGsap`, with `error.field` equal to that key. Test `empty object becomes defaults` requires `worktrees === false`. `defaultConfig()` in `packages/engine/src/config.ts` sets `worktrees: false`. An explicit `worktrees: true` is the boolean the prompt defines. v2 says worktrees stay behind a config flag. Omission does not turn the flag on, and an unknown fallback key is rejected rather than dropped.
- The phone performance floor defaults to 90. `defaultConfig().gates.phonePerfMin` is 90. Test `empty object becomes defaults` asserts it. The template `packages/engine/templates/gsd/config.json` sets the same 90, and test `the gsd template parses through parseConfig` deep-equals `defaultConfig()`. D-006's four Lighthouse scores default to 90 (`a11yMin`, `bestPracticesMin`, `seoMin` as well). Prompt 006 step 4 still allows those integers from 0 to 100. The default is 90.
- Missing config.json is defaults, not a crash, and does not write a file. `loadConfig` returns `defaultConfig()` when `path.join(dir, ".hitchhiker", "config.json")` is absent and does not call a write. Test `missing config.json is defaults and does not create a directory` loads twice and requires `.hitchhiker` to stay absent.

### Also checked

- Test `effort low throws and names the field` requires `ConfigError.field === "effort"` and the allowed list `medium, high, xhigh`.
- Test `imagineBudgetUsd rejects negatives and amounts above the ceiling` requires field `imagineBudgetUsd` for `-1` and for `1000.01`. `0` and `1000` pass. The ceiling constant is `IMAGINE_BUDGET_USD_MAX`.
- Test `tokenBudget rejects values above 200000` requires field `tokenBudget` for `200001`. `readIntInRange` also rejects a negative token budget (minimum 0).
- Test `deployTarget aws names the allowed list` requires field `deployTarget` and the names hostinger, vercel, netlify, cloudflare, and undecided.
- Test `null does not fall through to the default` and test `numeric gates passed as strings throw` cover the edge cases in the prompt.
- Test `GuideConfig has no secret fields` rejects key names matching api, key, bearer, email, secret, password, or budgets. `GuideConfig` is exported from `packages/engine/src/index.ts`. Test `serialized defaultConfig round-trips` imports `defaultConfig` and `parseConfig` from that barrel.
- Test `parseConfig does not read the environment` sets `XAI_API_KEY` and requires the parsed object to stay equal to the defaults, without that value in the JSON.
- No zod. The parser is hand-written in `packages/engine/src/config.ts`.
- `packages/engine/test/templates.test.ts` changed with the template. Prompt 006's file list does not name it. The old assertion expected `model: null` and an empty `budgets` object. The prompt required the template keys to match `GuideConfig`, so that assertion had to move. The host-wording tests in the same file are unchanged. This is not a new feature.

## 007 Lock STATE.md writes with a stale-pid takeover

### Truths

- Writers use exclusive create and same-directory rename. `packages/engine/src/lock.ts` `createLock` opens the lock with flag `wx`. `replaceViaTemp` writes `${basename}.tmp-${pid}` in `path.dirname(targetPath)` and `rename`s it onto the target. `saveState` calls `withStateLock`, then `replaceViaTemp` for `.hitchhiker/STATE.md`. `upsertHomeProject` uses the same `acquire` helper and `replaceViaTemp` for `index.json`. Test `a live lock blocks a second acquire` and test `two acquires at once: the second sees LockHeld` require a second `wx` create to throw `LockHeld`. Test `STATE.md round-trips a colon and a quote` requires `STATE.md.tmp-<pid>` to be gone after the write, the lock to be gone, and the loaded state to deep-equal, including `resume: say "towel"`.
- A lock is released when the writer throws. Test `withStateLock releases the lock when the writer throws` throws from a sync function and from an async function, and requires `.hitchhiker/state.lock` to be absent afterward. `withStateLock` calls `release` in `finally`, and `release` unlinks only when the recorded pid still matches. Test `release deletes the lock only when the pid still matches` covers that guard. `upsertHomeProject` uses the same `try` / `finally` around `acquire`.
- The home index dedupes by project path. Test `the home index dedupes by project path` upserts the same path twice and a second path once, then requires two rows, with the first path updated in place (`name: "Second"`). `upsertHomeProject` finds the row with `row.path === entry.path`. Test `the home index path is os.homedir() plus .hitchhiker/index.json` requires `path.join(os.homedir(), ".hitchhiker", "index.json")`. The tests pass a temp `homeDir` so they do not write the real home directory. The default argument is `os.homedir()`.

### Also checked

- A dead pid older than 30 seconds is taken over once. Test `a dead lock older than 30s is taken over once` freezes the clock: age equal to `STALE_LOCK_MS` (30_000) throws `LockHeld` for pid `2147483646`, and one millisecond past that replaces the lock with `process.pid`. `classify` uses `age > STALE_LOCK_MS`. Test `a dead lock older than 30 seconds is taken over by saveState` uses a timestamp two minutes in the past and goes through `saveState`. Test `a young dead lock is not stolen` keeps the fake pid. No test sleeps 30 seconds.
- On this Windows machine, `process.kill(2147483646, 0)` throws `ESRCH`. `isPidAlive` treats `ESRCH` as dead and any other code, including `EPERM`, as alive. That is the rule in the prompt.
- Test `a live lock blocks saveState` holds `state.lock` with `process.pid` and requires `LockHeld` plus a still-missing `STATE.md`.
- Test `a missing project path throws before the home lock` requires the error before `.hitchhiker` exists under the home dir. The function comment says callers mkdir the project first.
- `STATE.md` is under `.hitchhiker/`. The round-trip test requires the file to omit `.planning/`. No `ln`, `lockfile`, or `child_process` call in `lock.ts`, `state.ts`, or `home-index.ts`.
- `LockHeld`, `loadState`, `saveState`, `homeIndexPath`, and `upsertHomeProject` are exported from `packages/engine/src/index.ts`. The tests import them from that barrel. Step 9 of the prompt requires the export. `index.ts` is outside the file list and is named in the commit body.

## File list

`git diff --name-only c5cf605..HEAD`:

- Prompt 005, exact list: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/audit.yml`, `docs/ci.md`, `packages/engine/test/ci-workflows.test.ts`.
- Prompt 006 list, plus `packages/engine/src/index.ts` (step 8) and `packages/engine/test/templates.test.ts` (the template assertion, above).
- Prompt 007 list, plus `packages/engine/src/index.ts` (step 9).

No extra feature. Nothing to revert. No motion library, no client site, no new remote.

## UI

No UI changed. These three commits do not touch `packages/app/`. There is no screen, no stylesheet, and no `packages/app/src/design/`. Screenshots at 375 and 1440 were not taken. This is not a visual pass.

## Live Grok

Prompts 005, 006, and 007 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter does not exist yet, and these prompts do not need it.

## Authority

No conflict with `context/matt-answers.md` or `DECISIONS.md` that these commits got wrong. D-006's Lighthouse floor of 90 is the config default. v2 section 10.1 names the lock `STATE.md.lock`. Prompt 007 and this review name `.hitchhiker/state.lock`. Matt and `DECISIONS.md` are silent on the filename, so the prompt's name is the one that shipped. The implementation comment and the 007 commit body record that.

## Notes for later prompts

These are not failed truths.

- A lock file that is not valid JSON is classified as held and is never taken over. A crash between the exclusive create and the JSON write can leave an empty file. The prompt's takeover rule needs a readable `pid` and `acquiredAt`.
- The interim GPL check matches `AGPL` and a `GPL` token (`GPL-3.0` matches; `LGPL-3.0` and the long name `GNU General Public License` do not). Prompt 156's `auditDeps` replaces that check. The workflow already calls it when `packages/qa/src/licenses.ts` exists.
- `docs/ci.md` records that `gitleaks-action` asks for a licence key when the owner is a GitHub organization. The workflow leaves `GITLEAKS_LICENSE` unset on purpose.
- `packages/engine/templates/gsd/config.json` still starts with the attribution HTML comment from prompt 002. `parseConfig` receives the object after the test slices at `{`. `loadConfig` runs `JSON.parse` on the whole project file, so a project copy must be JSON only.
- `upsertHomeProject` takes an optional `homeDir`, and `acquire` takes an optional clock. Both default to the production values (`os.homedir()` and `Date.now`). The prompt's step 7 requires the clock so the suite does not sleep.

## Verification

Run from the repo root on 2026-10-06. Both exited 0.

| Command | Result |
| --- | --- |
| `pnpm --filter @hitchhiker/engine test` | 45 passed, 0 failed. |
| `pnpm exec tsc -b --pretty false` | Exit 0. No diagnostics. |

`Test-Path hh-build-plan/reviews/008-REVIEW.md` is true after this file is written.

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

On this machine, `process.kill(2147483646, 0)` throws `code=ESRCH`, which is what the stale-pid takeover depends on.

## Scope

No new feature. Prompt 009 was not started. Nothing was pushed, deployed, or published.

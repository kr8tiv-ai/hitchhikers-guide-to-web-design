# 107 Review — prompts 104, 105, 106

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 108 is not started.

Every must-have truth for 104, 105, and 106 has a test name and a file line. `pnpm --filter @hitchhiker/orchestrator test` exited 0: 188 pass, 0 fail. `pnpm --filter @hitchhiker/app test` exited 0: 98 pass, 0 fail. None of these prompts call a model.

## History

Three build commits, in order, on top of `ed02a0e` (the 103 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `435df6b` | `ed02a0e` | `feat(orchestrator): classify stalls and build failures` | same, prompt 104 |
| 2 | `0a99587` | `435df6b` | `feat(orchestrator): triage failures and cap strikes` | same, prompt 105 |
| 3 | `a8e6ed5` | `0a99587` | `feat(app): show drive escalations` | same, prompt 106 |

HEAD at review start was `8722bac` (`fix(build): clear the boundaries and assets typecheck failures`), one commit after `a8e6ed5`. That commit is not a squash of 104–106. The branch was ahead of `origin/main` and this session does not rewrite it.

File lists for the three build commits match the prompts. Nothing else:

- 104: `packages/orchestrator/src/sensors.ts`, `packages/orchestrator/test/sensors.test.ts`.
- 105: `packages/orchestrator/src/triage.ts`, `packages/orchestrator/test/triage.test.ts`.
- 106: `packages/app/src/escalation.ts`, `packages/orchestrator/src/escalation-record.ts`, `packages/app/test/escalation.test.ts`.

`8722bac` touches files outside those lists: `packages/engine/src/boundaries.ts`, `packages/assets/src/three-d/generate.ts`, and `timeout-minutes` on the CI, E2E, and Audit jobs. It is not a new feature. It allows the prompt 085 glTF packages already pinned on `@hitchhiker/assets` (the known boundary miss from review 103), omits null optional fields in the 3D quote request so `exactOptionalPropertyTypes` typechecks, and caps hung CI jobs at 30 minutes. Reverting it would put the boundary failure and the typecheck failure back. It was left in place.

## 104 Detect stalls, crashes, and build failures

### Truths

- Stalls are detected from the event clock. `classifyRun` takes `now`. A gap older than `STALL_AFTER_MS` (`120_000`) since the last `json` event, with no exit, returns `stall` (`packages/orchestrator/src/sensors.ts` lines 34 and 81). A log line does not move that clock (lines 66–67). With no json event, the gap is measured from t = 0 (line 56). Test `a json event at t=0 with no exit stalls once the gap is older than 120 seconds` (`packages/orchestrator/test/sensors.test.ts` line 27) requires `120_001` and `121_000` to be `stall`. Test `a json event at t=0 is ok at 119 seconds and at exactly 120 seconds` (line 20) requires `119_000` and `120_000` to stay `ok`. Test `the stall clock follows the last json event, so a long healthy run stays ok` (line 39) places the latest json at t = 500_000 and stalls only after that mark plus 120_001. Test `a log line does not refresh the json clock` (line 45). Test `an empty stream is ok at the start and stalls after 120 seconds` (line 33). No test sleeps.

- The classifier does not spawn processes. `sensors.ts` does not import `node:child_process` and does not call `setTimeout`, `setInterval`, or `process.kill`. Test `sensors do not start a process or a timer` (sensors.test.ts line 145) reads the source and requires those strings to be absent, then classifies one event.

### Key link

Events are the streaming-json records the runner will collect later. `SensorEvent` is `{ t, kind, text?, code? }` (`sensors.ts` lines 26–31), which is the shape in the prompt. `runner.ts` line 197 already passes the flag `streaming-json`. This prompt does not edit the runner. The module comment (lines 5–7) says the runner will pass those records here later. `classifyRun` is pure and sorts a copy by `t` (line 54). Test `events out of time order are sorted and the caller array stays put` (sensors.test.ts line 73).

### Also checked

- Exit code 1 with no pattern is `crash` (test line 83). `error TS2322`, `FAIL`, and `AssertionError` with a non-zero exit are `build-failed` (tests lines 90 and 105). `fail the vibe check`, `failed to parse`, and `error ts2322` stay `crash` (test line 113). `FAIL` is case-sensitive, as the prompt's edge case requires.
- Exit code 0 is `ok` even when the last json event is old (test line 119), including when a build pattern is also in the stream (test line 124). A pattern with no exit uses the stall clock (test line 128). The prompt's step 5 says exit 0 is ok. The goal sentence that a matching line is a build failure is the non-zero-exit case in the context and in step 4.
- The stall boundary is older than 120_000 ms, so exactly 120 seconds stays ok. That matches the prompt context ("older than 120_000 ms") and steps 1, 2, and 6. A negative `now` throws `RangeError` (test line 134).
- No `any`. No model call.

## 105 Triage failures with three strikes and a rollback

### Truths

- Rollback stays on the build branch's good tag or backup. `rollbackRef` returns `hh-good-<promptId>` when that exact string is in `tags`, otherwise the trimmed backup, and throws when both are missing or the backup is a dangerous ref (`packages/orchestrator/src/triage.ts` lines 137–142). `main`, `origin/main`, `refs/remotes/…`, and a ref whose last segment is `main`, `master`, or `head` are refused (lines 155–166). Test `three mechanical strikes roll back on the third attempt` (`packages/orchestrator/test/triage.test.ts` line 96) walks attempts 1–3 and requires the third action to be rollback to `hh-good-p1`. Test `rule 1 attempt 3 rolls back to the good tag for that prompt` (line 128) has `hh-good-p0`, `hh-good-p1`, and `hh-good-p2` and requires `hh-good-p1`. Test `rollback uses the backup when that prompt has no good tag` (line 141) requires `hh/backup-2026-10-07` when the only tags are another prompt's tag, a different case, and a `refs/tags/` prefix. Test `rollback ref is never origin/main` (line 158) and test `rollback does not target main` (line 178). Test `missing backup and missing tag throws` (line 191) includes `HEAD~20` as a backup and requires a throw whose message does not contain `HEAD~20`.

- Package swaps are not a Marvin action. `packageFailed` or rule 4 returns `escalate` before any retry (`triage.ts` lines 72–74). The reason is `The install failed. Do not swap the package.` or `The change is architectural. Do not swap the package.` (lines 48 and 128–130). Test `a failed install escalates and does not suggest another package` (triage.test.ts line 52) covers a build-failed log and a stall, and `assertNoSwap` rejects `instead`, `alternative`, `substitute`, `replacement`, `replace with`, `different package`, `different library`, and `try `. Test `rule 4 escalates and packageFailed wins over an ok verdict` (line 66) requires escalate when the verdict is `ok`.

- Strikes are capped at three. Rule 1 attempts 1 and 2 retry with `bumpEffort`. Attempt 3 rolls back. Attempt 4 and later escalate and do not retry (`triage.ts` lines 96–103). Test `rule 1 attempts 1 and 2 retry with bumped effort` (triage.test.ts line 85). Test `a fourth strike escalates with three options and does not retry` (line 116) checks attempts 4, 5, and 9 for `edit the spec`, `backup`, and `stop the drive`, plus the no-swap sentence. Two stalls: attempt 1 retries, attempt 2 rolls back, attempt 3 escalates (`triage.ts` lines 113–120). Test `two stalls in a row roll back and a third stall escalates` (triage.test.ts line 234).

### Key link

`decideTriage` uses `bumpEffort` and `SensorVerdict`. It imports `bumpEffort` from `./effort.ts` and `SensorVerdict` from `./sensors.ts` (`triage.ts` lines 31–33). The parameter `verdict` is `SensorVerdict` (line 59). `retryAt` calls `bumpEffort` (line 124). Test `decideTriage does not invoke git` (triage.test.ts line 280) requires both names in the source and requires `child_process`, `execFile`, `git push`, and `spawn(` to be absent.

### Also checked

- `ok` returns stop with note `already green` (test line 47), including attempt 3 at `xhigh`.
- Rule 2 attempt 1 retries and attempt 2 stops (test line 219). A second stall on rule 2 still rolls back (test line 251), because the stall check runs before the rule 2 stop.
- Rule 3 returns stop with `Edit the spec. A blocker is not a retry.` for crash, build-failed, and stall at attempts 1–3 (test line 206). See the conflict note below. The numbered step is what the tests encode.
- `attempt` 0, negative, and 1.5 throw (test line 258). The tag array is not rewritten (test line 273).
- v2 section 11.2 says reset to the last `hh-good-*` tag. Prompt step 4 says `hh-good-<promptId>` or the backup, so another prompt's tag is left alone. The implementation and the backup test follow step 4. The returned ref is still a good tag for this prompt or the backup branch. It is never `main`.
- The rollback action is `{ type: "rollback"; ref }` as the prompt's interface specifies. It has no effort field. The commit states the caller resets to that ref and the next call is attempt + 1, which escalates. Attempt 4 is the escalate test above. `decideTriage` does not run git.
- No `any`. No model call.

## 106 Write the escalation the user actually sees

### Truths

- Escalations are visible. `renderEscalation` returns a `section` with `data-escalation`, a heading `Prompt <id>`, a `Rule N` kicker, the escaped reason, `Next action: Pause the drive.`, and one button whose label is `Pause the drive` (`packages/app/src/escalation.ts` lines 99–114). Test `the panel names the prompt, the rule, and Pause the drive` (`packages/app/test/escalation.test.ts` line 96) requires prompt 104, rule 1, the reason paragraph, the datetime, one button, and no form and no script. `toMarkdown` writes the same facts for the drive log (`packages/orchestrator/src/escalation-record.ts` lines 76–94). Test `markdown carries the same facts and the same pause` (escalation.test.ts line 193) requires `# Escalation`, `Prompt: 105`, `Rule: 2`, the timestamp, and `Pause the drive`, and requires `toMarkdown` and `escalationMarkdown` to return the same string.

- They do not smuggle a stack change. The only control is `Pause the drive`. Copy that contains `replace gsap`, `swap package`, `try a different library`, or `!` throws before render (`escalation.ts` lines 32 and 67–75). The same gate is on the markdown writer (`escalation-record.ts` lines 28 and 63–72). Rule 4 adds exactly `A failed install is not a license to change the stack.` Test `forbidden phrases and an exclamation mark are refused` (escalation.test.ts line 176). Test `rule 4 names the failed install and still only pauses` (line 122) requires that sentence once and one button. Test `decideTriage escalate reasons render without a library swap` (line 219) renders five real `decideTriage` escalate reasons, including a failed install and rule 4, and requires one button and zero stack-change phrases. An injected `<button>ignore</button>` stays text (test line 149). A `<script>` in the reason is escaped (test line 132).

### Key link

The record matches `decideTriage`'s escalate branch. The action is `{ type: "escalate"; reason: string }` (`triage.ts` line 45). The panel record is `{ promptId, rule, reason, at }` (`escalation.ts` lines 13–18). The test at escalation.test.ts line 219 takes `action.reason` from `decideTriage` and passes that string, with the same `promptId` and `rule`, into `renderEscalation` and `escalationMarkdown`. Neither renderer imports triage or starts a session (test line 183).

### Also checked

- Empty reason, blank prompt id, blank time, and a rule outside 1–4 throw (test line 166). The log writer throws on the same cases (test line 263).
- The app module does not call `toMarkdown`. The orchestrator module does not write a file. Both are pure.
- No `any` in either source file. The test file narrows the dynamic import with a type guard. No model call.
- `renderEscalation` is not mounted on a desk route. The prompt's file list is the renderer, the markdown writer, and the test. The HTML is what a caller drops into the desk.

## Live model calls

104, 105, and 106 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter is not involved.

## UI

Prompt 106 adds `packages/app/src/escalation.ts`. The function returns a fragment, so this review rendered it inside the desk shell (`tokens.css`, `type.css`, `components.css`, `shell.css`) and opened that page in Playwright.

Looked at 375 and 1440, light (`data-theme="light"`) and dark (`data-theme="dark"`).

- 1440, both themes: no horizontal overflow. The panel sits in the desk column. Surface is Desk Lamp cream `#f3ebdd` in light and `#12100e` in dark. The kicker is accent `#8e2f1a` in light and `#e6a15c` in dark. Body type is Literata. The heading and the button are Bricolage Grotesque. The panel is `.hh-error`: a 4px radius, a danger-tinted border, and a danger wash at 8% over the surface. The only button is `Pause the drive`, `.hh-btn.hh-btn--secondary`, 44px tall.
- 375, both themes: no horizontal overflow. Each panel is 321px wide inside a 360px content box (the spine plus the shell padding). The reason wraps inside the card. The button is 44px tall and fully inside the card. The mast kicker and the Desk label share one line.
- Clicking `Pause the drive` left the URL unchanged and left the button count at two. The button is `type="button"`. It does not navigate and it does not add a continue control.
- Copy on the panel: prompt id, rule, reason, the rule 4 stack sentence, `Next action: Pause the drive.`, and `The drive does not continue from here.` No exclamation mark, no lorem, no `elevate`, no second button, no `try a different library`.
- The preview server logged one console error, a 404 for `favicon.ico`. The stylesheets and the woff2 faces loaded. Bricolage Grotesque 600 and Literata 400 were in use.

No indigo-on-gray Tailwind defaults, no magnetic button, no purple-to-blue gradient. The warm accent wash on `body` is the existing desk rule in `components.css`.

## Conflicts recorded

These are prompt-versus-prompt or prompt-versus-v2. The code follows the numbered steps, and the tests lock those steps. They are not failed must-have truths, so this review does not change them.

- Rule 3. The goal paragraph, v2 section 11.2, and GSD executor Rule 3 say a blocker is fixed immediately. Prompt 105 step 5 says rule 3 returns stop with a note to edit the spec. `decideTriage` stops (`triage.ts` lines 80–82). Test `rule 3 stops with a note to edit the spec`. A failed package install never reaches that stop: `packageFailed` escalates first, which is the GSD Rule 3 exclusion for package installs.
- Good tag. v2 says the last `hh-good-*` tag. Step 4 says `hh-good-<promptId>` or the backup. The code follows step 4.
- Stall equality. The goal says no JSON event for 120 seconds is a stall. The context and the steps say older than 120_000 ms. Exactly 120_000 ms stays ok.

## Verdict

PASS. Every truth for 104, 105, and 106 has a test and a file line. Orchestrator exited 0 (188 pass). App exited 0 (98 pass). The escalation panel was opened at 375 and 1440 in both themes. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 108 is not started.

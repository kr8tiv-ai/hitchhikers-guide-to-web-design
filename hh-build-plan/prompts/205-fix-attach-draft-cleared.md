---
id: "205"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix attach and draft-persist so a failed upload or page change keeps the typed draft"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["204"]
files: ["packages/app/e2e/attach.spec.ts", "packages/app/e2e/draft-persist.spec.ts", "packages/app/src/"]
review_checkpoint_embedded: false
---

# 205. Fix attach and draft-persist so a failed upload or page change keeps the typed draft
## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

Additional rules for this session only:

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.

## Goal

Main went red in the E2E workflow after prompt 203 (draft persist). Two attach-related Playwright tests fail: typed draft text is cleared after a failed upload or after attaching a file and changing pages, and a failed upload sometimes reports the wrong filename. Find the real cause and fix it so both tests pass every time without weakening any assertion.

## Why this prompt exists

Red main hides later regressions. Prompt 203 was meant to keep drafts across pages; instead attach flows now lose the draft. Users who attach a logo while typing directions must not lose that text when an upload fails or when they glance at Brand and come back.

## Known failures

1. 2026-10-12, E2E run 38242879121 on a7266a50 (prompt 203, "keep the typed answer draft"):
   `e2e/attach.spec.ts:15` "drop, attach, paste, and a failed upload keep the draft" failed at line 138:
   ```
   Error: expect(locator).toContainText(expected) failed
   Locator: locator('.hh-attach__error')
   Expected substring: "again.png did not save. Try again."
   Received string:    "pasted-image-1791804555965.png did not save. Try again."
   ```
   The same commit's `draft-persist.spec.ts` "an attached file stays..." passed. Gallery commit c97b40b5 before 203 had E2E green.

2. 2026-10-12, E2E run 38243651989 on 93fea73e (docs-only queue of prompt 204):
   - `attach.spec.ts:15` failed at line 139: `#hh-card-draft` Expected `"A wordmark in two colors, and the mark should stay as drawn."` Received `""` (after the failed-upload step).
   - `draft-persist.spec.ts:243` "an attached file stays, and clearing the draft leaves the file" failed at line 262: `#hh-card-draft` Expected `"Keep this sentence."` Received `""` after navigating away and back with an attached file.

Leading suspect, to confirm or reject by evidence: prompt 203's draft restore path re-fills or remounts `#hh-card-draft` from storage after attach/upload events and overwrites the live textarea with an empty or stale value, or a failed `/api/attach` response triggers a full question-card re-render that drops the in-memory draft while leaving the attach error. The wrong filename on a7266a50 may be a race where a paste upload fails after the intentional again.png failure and replaces the error line. If it is a product bug that clears typed text when attach state changes, fix the product; a real user can type, attach, and hit a network blip the same way.

## Read first

- `packages/app/e2e/attach.spec.ts` (especially the failed-upload and draft assertions around lines 138-141)
- `packages/app/e2e/draft-persist.spec.ts` (the attached-file case around lines 243-265)
- Draft persist and attach UI/state in `packages/app/src/` (search for `hh-card-draft`, `hh-attach`, draft save/restore, attach error handling)
- Prompt 203 summary under `.hitchhiker-dev/summaries/` if present
- `.hh-driver/FLAKES.md` if present
- `gh run view 38243651989 --log-failed` and `gh run view 38242879121 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. Run `pnpm --filter @hitchhiker/app exec playwright test e2e/attach.spec.ts e2e/draft-persist.spec.ts` locally and confirm the failures (or prove a later commit already fixed them with the run id, then change nothing else and finish).
2. Trace the product path: when an attach fails, and when the user navigates away and back with an attachment, what writes `#hh-card-draft` and what writes `.hh-attach__error`. Record whether storage restore, a remount, or an attach handler clears the live value.
3. Fix the root cause so (a) a failed upload keeps the typed draft and the already-attached files, (b) the error names the file that failed, and (c) navigating away and back with an attachment restores the typed draft and the attachment name. Prefer fixing product state over loosening the test.
4. Run attach.spec and draft-persist.spec at least 20 times in a row with 0 failures, then the whole E2E suite twice. Run `pnpm -r test` once before you finish.
5. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not skip, delete, loosen, or retry-hide the failing assertions (no `test.skip`, no `test.fixme`, no longer timeouts to hide the clear).
- Do not remove draft persistence. Do not restyle. No new dependencies.
- No change to run-build.ps1, the queue runner, or the CI workflow files.
- Do not start the next prompt. Do not reopen brand-assets / social-card work (that is prompt 204).

## Acceptance criteria

- [ ] The root cause is named with evidence from step 2.
- [ ] `attach.spec.ts` "drop, attach, paste, and a failed upload keep the draft" passes repeatedly with every original assertion intact.
- [ ] `draft-persist.spec.ts` "an attached file stays, and clearing the draft leaves the file" passes repeatedly.
- [ ] No test was skipped, deleted, or loosened.

## must_haves

truths:

- A failed attach leaves the typed draft and prior successful attachments in place, and the error names the file that failed.
- Navigating away and back with an attachment restores both the typed draft and the attachment name.
- Clearing the draft by the user leaves the attachment; Answer still requires whatever the product already required.
- `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, and the E2E suite pass locally on Windows.

artifacts:

- The fix in `packages/app/src/` (and only a justified, stricter test change if needed)
- Root-cause notes in the commit body

key_links:

- Draft restore and attach error handlers agree on when the textarea value may change.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.

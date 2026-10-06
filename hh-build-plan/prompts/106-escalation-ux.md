---
id: "106"
kind: build
phase: improbability-drive
slice: Marvin
title: "Write the escalation the user actually sees"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["105", "033"]
files: ["packages/app/src/escalation.ts", "packages/orchestrator/src/escalation-record.ts", "packages/app/test/escalation.test.ts"]
requirements: ["HH-MARVIN-03"]
review_checkpoint_embedded: true
---

# 106. Write the escalation the user actually sees

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

## Goal

When triage escalates, persist a record and render a desk panel that names the prompt id, the rule, and the next action. The user can pause. The panel does not offer a one-click `try a different library` for a failed package.

## Why this prompt exists

An escalation that only hits a log file will be missed. An escalation that offers a clever workaround will undo the rule.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.2
- packages/orchestrator/src/triage.ts
- packages/app/src/map.ts

## Files to create or change

- packages/app/src/escalation.ts
- packages/orchestrator/src/escalation-record.ts
- packages/app/test/escalation.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

EscalationRecord is `{ promptId, rule, reason, at }`. renderEscalation(record) returns HTML with data-escalation and a button `Pause the drive`. No button that says swap, replace GSAP, or ignore. The orchestrator writer is a pure function toMarkdown(record) the app does not need to call. Tests cover the forbidden phrases.

## Interfaces and data shapes

```ts
export interface EscalationRecord { promptId: string; rule: 1 | 2 | 3 | 4; reason: string; at: string; }
export function renderEscalation(record: EscalationRecord): string;
export function escalationMarkdown(record: EscalationRecord): string;
```

## Steps

1. Render the prompt id in a heading and the reason in a paragraph. Escape both.

2. Include the Pause button label exactly.

3. The test fails if the HTML contains `replace GSAP` or `swap package` or `!`.

4. Rule 4 adds the sentence `A failed install is not a license to change the stack.`

5. toMarkdown includes the same facts for `.hitchhiker/logs`.

6. Do not start a session.

7. Export both renderers from their packages.

8. Invalid rule throws.

## Edge cases

- A reason containing `<script>` is escaped.
- Empty reason throws.

## Acceptance criteria

- [ ] The panel names the prompt and the pause action.
- [ ] It does not offer a library swap.
- [ ] Rule 4 copy is specific.

## must_haves

truths:

- Escalations are visible.
- They do not smuggle a stack change.

artifacts:

- packages/app/src/escalation.ts

key_links:

- The record matches decideTriage's escalate branch.

prohibitions:

- Do not offer to replace GSAP.
- Do not auto-continue after an escalation.
- Do not use an exclamation mark.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/106.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): show drive escalations
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `107-review-104-106.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `104` Detect stalls, crashes, and build failures (Marvin, Heart of Gold, high)
- `105` Triage failures with three strikes and a rollback (Marvin, Forty-Two, xhigh)
- `106` Write the escalation the user actually sees (Marvin, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

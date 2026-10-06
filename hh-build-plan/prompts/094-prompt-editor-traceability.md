---
id: "094"
kind: build
phase: deep-thought
slice: Approval Gate
title: "Edit a site prompt without losing its must_haves"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["090", "093"]
files: ["packages/engine/src/spec/edit-prompt.ts", "packages/engine/test/edit-prompt.test.ts"]
requirements: ["HH-SPEC-09"]
review_checkpoint_embedded: true
---

# 094. Edit a site prompt without losing its must_haves

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

Let a pro replace the goal text of one site prompt. The editor refuses to save if RULES were removed, if must_haves became empty, or if a second motion library was added to a prompt that already names one. Saving invalidates drive approval by deleting the approval file's approved flag. This is the last Deep Thought build.

## Why this prompt exists

Pros are allowed to edit prompts. They are not allowed to edit out the gates. An edit after approval must not keep a stale yes.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.5
- hh-build-plan/ROADMAP.md Deep Thought success criteria
- packages/engine/src/spec/site-prompts.ts
- packages/engine/src/spec/approve-drive.ts

## Files to create or change

- packages/engine/src/spec/edit-prompt.ts
- packages/engine/test/edit-prompt.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

editSitePrompt(list, id, patch) returns a new list and `{ approvalStillValid: false }` always when the goal changes. patch is `{ goal?: string }`. Reject a goal that does not contain the file name already in the prompt, so the prompt stays concrete. Reject a goal that contains a second library name from the MotionLib set if one is already in the original goal. RULES field is not editable. Empty mustHaves throws. The test builds a small list with generateSitePrompts or with a hand-built SitePrompt if generating 50 is slow. Hand-built is fine if the object matches the type. Then edit it and assert approvalStillValid is false. Also assert a library conflict throws.

## Interfaces and data shapes

```ts
export function editSitePrompt(
  prompts: SitePrompt[],
  id: string,
  patch: { goal: string },
): { prompts: SitePrompt[]; approvalStillValid: false };
```

## Steps

1. Implement the editor as a pure function. Do not write files. The caller deletes approval.

2. Unknown id throws.

3. Goal under 80 characters throws.

4. If the original goal contains `gsap` and the patch also contains `anime.js` or `lenis` as an added word, throw. A precise check: libraries mentioned in the patch that were not in the original, and original already had one, throw.

5. RULES string on the object is unchanged. Test referential equality.

6. approvalStillValid is the constant false. The type encodes it.

7. mustHaves length is unchanged by a goal edit.

8. Add a phase-end test that generateSitePrompts still returns between 50 and 150 for a tiny site, so the success criterion stays covered.

9. Do not start the orchestrator.

## Edge cases

- Editing to the same goal still returns approvalStillValid false. Any save invalidates. Document that.
- Patch goal with an exclamation mark throws.
- Two prompts with the same id throw at edit time.

## Acceptance criteria

- [ ] Edits cannot strip RULES or must_haves.
- [ ] A second motion library is rejected.
- [ ] Approval is marked invalid.
- [ ] The generator's count bounds still hold.

## must_haves

truths:

- Prompt edits stay inside the schema.
- A stale drive approval cannot survive an edit.
- Deep Thought ends at an approval gate, not at a running queue.

artifacts:

- packages/engine/src/spec/edit-prompt.ts

key_links:

- editSitePrompt returns a flag the approval file writer must honor.

prohibitions:

- Do not auto-start the drive.
- Do not allow a second library onto one prompt.
- Do not drop must_haves.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/094.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): edit site prompts without dropping gates
```

## REVIEW CHECKPOINT

This build closes a review group and the Deep Thought phase. After this commit, the driver runs the fresh-session reviewer prompt `095-review-092-094.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `092` Golden prompt library and Grok-authored site prompts (Infinite Monkeys, Forty-Two, xhigh)
- `093` Require a yes before Improbability Drive (Approval Gate, Heart of Gold, high)
- `094` Edit a site prompt without losing its must_haves (Approval Gate, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

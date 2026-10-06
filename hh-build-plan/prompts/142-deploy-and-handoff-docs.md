---
id: "142"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Share and Enjoy
title: "Generate DEPLOY.md and HANDOFF.md"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["140", "072"]
files: ["packages/deploy/src/docs.ts", "packages/deploy/test/docs.test.ts"]
requirements: ["HH-SHIP-05"]
review_checkpoint_embedded: true
---

# 142. Generate DEPLOY.md and HANDOFF.md

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

Render DEPLOY.md and HANDOFF.md for the chosen host. DEPLOY names the command, the approval requirement, and whether the site is static or Node. HANDOFF names who maintains it, the hosting answer, and how to roll back. Neither file contains a secret or a live URL the user did not pass in.

## Why this prompt exists

A deploy that only the agent understands is a trap the week the agent is gone. These two files are the human trail.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 13
- packages/deploy/src/hostinger.ts
- packages/engine/src/spec/stack.ts

## Files to create or change

- packages/deploy/src/docs.ts
- packages/deploy/test/docs.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderDeployDocs({ host, kind, maintainer, siteWhy }) returns `{ deployMd, handoffMd }`. host is one of the config enum values. undecided throws. kind node on a non-hostinger host throws if that adapter rejected node. Maintainer empty throws. Include the sentence `Nothing deploys without an explicit yes.` Include Node size and node_modules exclusion only when host is hostinger and kind is node. No exclamation marks. No API keys. If siteWhy contains a newline, flatten it.

## Interfaces and data shapes

```ts
export function renderDeployDocs(input: {
  host: "hostinger" | "vercel" | "netlify" | "cloudflare";
  kind: "static" | "node";
  maintainer: string;
  siteWhy: string;
}): { deployMd: string; handoffMd: string };
```

## Steps

1. Render both markdown strings with headings Deploy and Handoff.

2. Test hostinger node mentions 50 MB and node_modules.

3. Test vercel node throws.

4. Test the yes sentence is present.

5. Test a fixture secret `xai-` in the maintainer throws. Reject that prefix.

6. Do not write the files to a sample client. Return strings.

7. Export the function.

8. Keep the copy under 500 words.

## Edge cases

- Empty siteWhy throws.
- Host `undecided` is not in the type. A runtime string check still throws for unexpected values.

## Acceptance criteria

- [ ] Both documents render for a static Hostinger site.
- [ ] Node guidance appears only where the adapter supports it.
- [ ] Secrets in inputs are rejected.

## must_haves

truths:

- Deploy docs state the approval rule.
- They match the adapter capabilities.

artifacts:

- packages/deploy/src/docs.ts

key_links:

- Host and kind match the deploy functions.

prohibitions:

- Do not embed tokens.
- Do not claim a host can do a shape it cannot.
- Do not use an exclamation mark.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/142.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): render DEPLOY.md and HANDOFF.md
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `143-review-140-142.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `140` Deploy to Hostinger only after a yes, then poll (Milliways at the End, Forty-Two, xhigh)
- `141` Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes (Milliways at the End, Gargle Blaster, high)
- `142` Generate DEPLOY.md and HANDOFF.md (Share and Enjoy, Cup of Tea, medium)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

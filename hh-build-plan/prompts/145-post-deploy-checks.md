---
id: "145"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Share and Enjoy
title: "Check a deployed URL with an injected fetch"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["140", "138"]
files: ["packages/deploy/src/post-check.ts", "packages/deploy/test/post-check.test.ts"]
requirements: ["HH-SHIP-07"]
review_checkpoint_embedded: false
---

# 145. Check a deployed URL with an injected fetch

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

After a deploy reports completed, fetch the final URL once and record status, whether the title is non-empty, and whether the body contains the site name. A queued deploy does not fetch. Tests inject fetch. Redirects stop at three.

## Why this prompt exists

Queued-then-polled can still come back with the wrong document. One cheap check catches a blank host page.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 13
- packages/qa/src/report.ts

## Files to create or change

- packages/deploy/src/post-check.ts
- packages/deploy/test/post-check.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

postCheck({ state, url, siteName, fetchImpl }) returns skipped when state is not completed. When completed, it fetches and returns `{ ok, status, titleFound }`. ok requires HTTP 200, a title, and the site name in the body. Do not follow more than three redirects. file: URLs throw. localhost is allowed so a test server could exist, but the unit test uses a fake fetch and does not bind a port.

## Interfaces and data shapes

```ts
export function postCheck(input: {
  state: "completed" | "queued" | "failed";
  url: string;
  siteName: string;
  fetchImpl: (url: string) => Promise<{ status: number; body: string; redirects: number }>;
}): Promise<{ skipped: boolean; ok: boolean; reason: string }>;
```

## Steps

1. Queued returns skipped true and does not call fetch. The stub throws if called.

2. Completed 200 with the name in the body returns ok.

3. 200 without the name returns ok false.

4. redirects greater than 3 returns ok false and does not throw a generic error.

5. Reject non-http(s) URLs.

6. Do not log the body. Reasons are short.

7. Export postCheck.

8. No real network.

## Edge cases

- Empty siteName throws.
- status 404 returns ok false.

## Acceptance criteria

- [ ] Queued skips the fetch.
- [ ] A blank 200 fails the name check.
- [ ] Redirect caps are enforced.

## must_haves

truths:

- Post-deploy checks run only after completed.
- They are injectable.

artifacts:

- packages/deploy/src/post-check.ts

key_links:

- state values match DeployResult.

prohibitions:

- Do not fetch on a queued deploy.
- Do not hit the live internet in tests.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/145.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): check the deployed page once
```

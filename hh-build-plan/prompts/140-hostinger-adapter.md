---
id: "140"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Milliways at the End
title: "Deploy to Hostinger only after a yes, then poll"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["138", "097"]
files: ["packages/deploy/src/hostinger.ts", "packages/deploy/src/types.ts", "packages/deploy/test/hostinger.test.ts", "NOTICE"]
requirements: ["HH-SHIP-01"]
review_checkpoint_embedded: false
---

# 140. Deploy to Hostinger only after a yes, then poll

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

Wrap Hostinger static and Node deploys behind an approval flag. Static uploads prebuilt files. Node uploads an archive that excludes node_modules and is at most 50 MB, then builds on the host. A successful response is queued, not finished. The client polls a status function and never resends the same write. Tests inject the client. Do not call Hostinger.

## Why this prompt exists

Hostinger is the recommended host. A client that treats queued as done, or that deploys without a yes, will either double-post or ship the wrong site.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 13
- hh-build-plan/RESEARCH-ADDENDUM.md Hostinger section
- packages/orchestrator/src/policy.ts

## Files to create or change

- packages/deploy/src/hostinger.ts
- packages/deploy/src/types.ts
- packages/deploy/test/hostinger.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

DeployClient is injected: uploadStatic, uploadNode, poll. prepareNodeArchive(files) throws if any path contains node_modules or if total bytes exceed 50 * 1024 * 1024. The byte count is injected via file sizes so the test does not create a 50 MB fixture. deploy({ approved, kind, client }) throws if approved is not true. kind static calls uploadStatic once. kind node calls uploadNode once. Then poll until the stub says completed or failed. If the stub says queued forever, stop after the caller-supplied maxPolls and return `{ state: 'queued' }` without calling upload again. The test counts uploads. Agency overwrite tools are not called. If a method name is not on the injected client, do not invent a REST path. Comment that the live method list must be read from the Hostinger MCP schema at integration time. Node versions in the handoff note are 18, 20, 22, and 24, as a comment, not a guess of a new version.

## Interfaces and data shapes

```ts
export interface DeployResult { state: "completed" | "queued" | "failed"; uploads: number; }
export function prepareNodeArchive(files: Array<{ path: string; bytes: number }>): { bytes: number };
export function deployHostinger(input: {
  approved: boolean;
  kind: "static" | "node";
  files: Array<{ path: string; bytes: number }>;
  maxPolls: number;
  client: {
    uploadStatic: () => Promise<{ id: string }>;
    uploadNode: () => Promise<{ id: string }>;
    poll: (id: string) => Promise<"queued" | "completed" | "failed">;
  };
}): Promise<DeployResult>;
```

## Steps

1. prepareNodeArchive rejects a node_modules path and a total over 50 MB.

2. approved false throws and the upload stubs are not called.

3. A poll sequence queued, queued, completed results in one upload and state completed.

4. A poll sequence of all queued until maxPolls returns state queued and upload count 1.

5. failed poll returns failed and does not upload again.

6. Do not read a token from disk. The client is injected so the key stays outside.

7. NOTICE gains a line that Hostinger is an optional integration and the schema is read at runtime.

8. Export the functions and add the deploy test script.

9. No network in the test.

## Edge cases

- maxPolls 0 throws.
- Empty file list throws.
- kind node with a node_modules file throws before upload.

## Acceptance criteria

- [ ] No deploy without approval.
- [ ] Queued does not cause a second upload.
- [ ] Node archives cannot contain node_modules or exceed 50 MB.

## must_haves

truths:

- Hostinger writes are approved, sent once, and polled.
- Static and Node are different paths.
- The live API is behind an injected client.

artifacts:

- packages/deploy/src/hostinger.ts

key_links:

- deployHostinger is what hh so-long will call after a yes.

prohibitions:

- Do not call the live Hostinger API.
- Do not resend a queued upload.
- Do not include node_modules.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/140.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): add an approved Hostinger client
```

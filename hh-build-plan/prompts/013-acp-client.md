---
id: "013"
kind: build
phase: dont-panic
slice: Eddie
title: "Speak to grok agent over stdio ACP"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["011"]
files: ["packages/orchestrator/src/acp.ts", "packages/orchestrator/test/acp.test.ts"]
requirements: ["HH-DRIVE-11"]
review_checkpoint_embedded: false
---

# 013. Speak to grok agent over stdio ACP

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

Implement a minimal ACP client that writes JSON-RPC lines to an injected stdin and reads lines from an injected stdout. The sequence is initialize, authenticate, session/new, session/prompt. Tests use in-memory streams. Do not spawn grok in unit tests. 035 uses this client for warm chat sessions on top of the 011 adapter.

## Why this prompt exists

The companion app needs a structured session, not only a one-shot `-p` string. The protocol order is the part that is easy to get wrong.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/xai/cli_reference.md grok agent stdio section
- hh-build-plan/RESEARCH-ADDENDUM.md ACP notes

## Files to create or change

- packages/orchestrator/src/acp.ts
- packages/orchestrator/test/acp.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

createAcpClient(io) returns a client. io has write(line) and read() => Promise<line>. Methods must be called in order. Calling session/prompt before session/new throws. The JSON shapes follow what the local doc says. If the doc is thin, use method names `initialize`, `authenticate`, `session/new`, and `session/prompt` and a params object, and comment that a later prompt must re-read the schema before a live call. Do not invent capabilities you did not see. The test asserts the order of method names.

## Interfaces and data shapes

```ts
export interface AcpIo { write(line: string): void; read(): Promise<string>; }
export function createAcpClient(io: AcpIo): {
  initialize(): Promise<void>;
  authenticate(): Promise<void>;
  newSession(): Promise<void>;
  prompt(text: string): Promise<void>;
};
```

## Steps

1. Each method writes one JSON line and waits for one response line. A response without an id match throws.

2. Track the step. Out-of-order calls throw.

3. The test feeds canned responses and records writes.

4. prompt rejects an empty string.

5. Do not log the prompt text to console.

6. No child_process in acp.ts. The test can read the source.

7. Export createAcpClient.

8. Comment the doc path you followed.

## Edge cases

- A response that is not JSON throws.
- Two prompts in a row are allowed after a session exists.

## Acceptance criteria

- [ ] The four methods write in the required order.
- [ ] Skipping initialize throws.
- [ ] No process is spawned.

## must_haves

truths:

- ACP is testable without the grok binary.
- The call order matches the documented handshake.

artifacts:

- packages/orchestrator/src/acp.ts

key_links:

- The client is what a later app wiring can point at a real stdio process.

prohibitions:

- Do not spawn grok in the test.
- Do not invent extra RPC methods.
- Do not put an API key in the JSON.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/013.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): add a scripted ACP client
```

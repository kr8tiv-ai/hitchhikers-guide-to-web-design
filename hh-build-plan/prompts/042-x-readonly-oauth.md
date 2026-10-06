---
id: "042"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Scaffold read-only X OAuth without posting"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["009"]
files: ["packages/engine/src/x-oauth.ts", "packages/engine/test/x-oauth.test.ts"]
requirements: ["HH-X-01"]
review_checkpoint_embedded: false
---

# 042. Scaffold read-only X OAuth without posting

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

Prepare PKCE values and a read-only scope list for an optional X connection. Do not exchange a code, do not post, and do not add a write scope. The test checks that tweet.write never appears.

## Why this prompt exists

DP-0.5 offers optional read-only X. Building the poster now would violate the v2 decision that posting waits, and it would need prices we did not re-fetch.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 16 and 21 (X posting is later, prices not re-fetched)
- packages/engine/src/config.ts

## Files to create or change

- packages/engine/src/x-oauth.ts
- packages/engine/test/x-oauth.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

createPkce() returns `{ verifier, challenge, method: 'S256' }`. Verifier is 64 chars from crypto.randomBytes, base64url. Challenge is sha256 of the verifier, base64url. Scopes constant is `['tweet.read', 'users.read']` and nothing else. buildAuthorizeUrl({ clientId, redirectUri, state, challenge }) returns a URL whose query contains those scopes and code_challenge_method S256. No client secret in the URL. No token endpoint function is exported. If a caller asks to post, there is no function to call. Store nothing. Do not read X API prices. State is a random string the caller keeps. The test snapshots the scope list.

## Interfaces and data shapes

```ts
export interface PkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

export function createPkce(): PkcePair;
export const X_SCOPES: readonly string[];
export function buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }): URL;
```

## Steps

1. Implement createPkce with node:crypto. The test checks challenge equals sha256 of verifier and that method is S256.

2. X_SCOPES is exactly the two read scopes. The test fails if any scope contains `write` or `offline`.

3. buildAuthorizeUrl uses https://twitter.com/i/oauth2/authorize or the current x.com authorize host. Pick one and freeze it in the test. If you are not sure the host is still valid, put the host in a constant X_AUTHORIZE_HOST defaulting to `https://x.com` and path `/i/oauth2/authorize`, and comment that a later milestone must re-check the docs. Do not call it.

4. Reject a redirectUri that is not http://127.0.0.1 or http://localhost, so this scaffold cannot be pointed at a third-party site by mistake.

5. Reject an empty clientId.

6. Do not add a token, refresh, or tweet function. Grep the file in the test for `tweet.write` and `statuses/update`. Both must be absent.

7. Export the functions from the engine index.

8. Do not store the verifier in STATE.md.

9. No network in the test.

## Edge cases

- Verifier length is at least 43 characters after encoding, per PKCE. Assert length >= 43.
- State must be at least 16 characters or buildAuthorizeUrl throws.
- Scopes are space-joined in the query, not comma-joined.

## Acceptance criteria

- [ ] Challenge matches the verifier.
- [ ] Scopes are read-only.
- [ ] Non-loopback redirects throw.
- [ ] No post endpoint exists in the module.

## must_haves

truths:

- X in this milestone is read-only scaffolding.
- PKCE S256 is used.
- Posting is not implemented.

artifacts:

- packages/engine/src/x-oauth.ts

key_links:

- buildAuthorizeUrl includes X_SCOPES.
- DP-0.5 can later open this URL. It does not do so in this prompt.

prohibitions:

- Do not request write scopes.
- Do not call the X API.
- Do not print or snapshot a real client secret.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/042.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): scaffold read-only X PKCE
```

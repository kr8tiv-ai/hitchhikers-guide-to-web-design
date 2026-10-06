---
id: "141"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Milliways at the End
title: "Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["140"]
files: ["packages/deploy/src/vercel.ts", "packages/deploy/test/vercel.test.ts", "packages/deploy/src/netlify.ts", "packages/deploy/test/netlify.test.ts", "packages/deploy/src/cloudflare.ts", "packages/deploy/test/cloudflare.test.ts"]
requirements: ["HH-SHIP-02", "HH-SHIP-03", "HH-SHIP-04"]
review_checkpoint_embedded: false
---

# 141. Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes

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

Add the same approval and single-submit behavior for Vercel. The unit test injects a client. Do not install the Vercel CLI and do not invent a token header beyond what the injected client hides.

Merged scope (formerly a separate prompt, "Add a Netlify deploy client that requires yes"): Add a Netlify client with the same approval, one upload, and poll-until-done-or-give-up behavior. Inject the client. Do not require the Netlify CLI in the test.

Merged scope (formerly a separate prompt, "Add a Cloudflare deploy client that requires yes"): Add a Cloudflare client for a static upload with approval and single submit. Do not wrap every Wrangler command. Do not run wrangler in the test. If kind is node, reject it until a later template says otherwise.

## Why this prompt exists

Hostinger is the default recommendation, not the only target. The safety rules have to be identical or the second adapter becomes the careless one.

Netlify is one of the four named targets. Leaving it as a TODO in the command will tempt a later session to shell out without the gate.

Wrangler is powerful enough to change DNS. This adapter only uploads a static site and only after yes.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 13
- packages/deploy/src/hostinger.ts

## Files to create or change

- packages/deploy/src/vercel.ts
- packages/deploy/test/vercel.test.ts
- packages/deploy/src/netlify.ts
- packages/deploy/test/netlify.test.ts
- packages/deploy/src/cloudflare.ts
- packages/deploy/test/cloudflare.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

deployVercel({ approved, client, maxPolls }) mirrors the Hostinger flow with upload and poll. There is no Node-versus-static branch unless you pass kind through. Support static only in this prompt and reject kind node with a message that the Vercel template is not wired. That is honest. Production deploys require approved true. Preview deploys also require approved true. There is no preview exception.

Merged scope, "Add a Netlify deploy client that requires yes": Match the Vercel function shape so a caller can treat them alike. Static only. Unapproved throws. Poll queued does not re-upload. No token logging. A test proves the upload count.

Merged scope, "Add a Cloudflare deploy client that requires yes": deployCloudflare uses an injected upload and poll. Unapproved throws. A method named `dns` does not exist on the wrapper. The test reads the source and fails if the string `dns` appears as a called method. You may mention in a comment that DNS is out of scope. Keep that comment from looking like a call. Prefer the word `records` in the comment so the test's ban on `dns` can be a source scan. The test scans for `.dns`. That allows the word in prose if you need it. Simpler: the test only checks behavior, and a comment says name-server changes are out of scope.

## Interfaces and data shapes

```ts
export function deployVercel(input: {
  approved: boolean;
  kind: "static" | "node";
  maxPolls: number;
  client: { upload: () => Promise<{ id: string }>; poll: (id: string) => Promise<"queued" | "completed" | "failed"> };
}): Promise<{ state: "completed" | "queued" | "failed"; uploads: number }>;
```

```ts
export function deployNetlify(input: {
  approved: boolean;
  kind: "static" | "node";
  maxPolls: number;
  client: { upload: () => Promise<{ id: string }>; poll: (id: string) => Promise<"queued" | "completed" | "failed"> };
}): Promise<{ state: "completed" | "queued" | "failed"; uploads: number }>;
```

```ts
export function deployCloudflare(input: {
  approved: boolean;
  kind: "static" | "node";
  maxPolls: number;
  client: { upload: () => Promise<{ id: string }>; poll: (id: string) => Promise<"queued" | "completed" | "failed"> };
}): Promise<{ state: "completed" | "queued" | "failed"; uploads: number }>;
```

## Steps

1. Reject node kind before upload.

2. Reject unapproved static before upload.

3. Poll until completed and assert one upload.

4. All-queued stops at maxPolls with one upload.

5. Do not read VERCEL_TOKEN inside the library. The client closes over it in the app later.

6. No CLI spawn.

7. Export the function.

8. Share no mutable global with the Hostinger module.

9. Implement deployNetlify with the same control flow as Vercel. You may factor a shared pollLoop if both call it. If you do, put it in packages/deploy/src/poll.ts and add that file to the summary.

10. Tests cover unapproved, completed, and queued-until-cap.

11. Node kind throws.

12. The error for unapproved does not say the deploy succeeded.

13. No network.

14. Export the function.

15. Do not store site ids in the repo.

16. Keep Hostinger tests passing.

17. Implement the same state machine as the other static clients.

18. Test approval, single upload, and queued cap.

19. Reject node.

20. Do not spawn wrangler.

21. Export the function.

22. No account id in the repo.

23. Leave a comment that DNS and worker changes are a different command the Guide does not run.

24. Keep the other deploy tests green.

## Edge cases

- A failed poll does not retry the upload.
- maxPolls must be positive.
- poll throwing once rejects the promise and does not upload again. The test can use an upload counter.
- Empty id from upload throws.
- Failed status returns failed.
- A second call with the same client is the caller's choice. This function itself uploads once per call.

## Acceptance criteria

- [ ] Vercel deploys require yes.
- [ ] Node kind is rejected rather than guessed.
- [ ] Queued writes are not resent.
- [ ] Approval is required.
- [ ] One upload per attempt.
- [ ] Node is not pretended.
- [ ] Cloudflare static deploys require yes.
- [ ] The wrapper does not expose DNS changes.
- [ ] Queued does not resend.

## must_haves

truths:

- The second host does not weaken the approval rule.
- Unwired shapes are rejected.
- Netlify follows the same safety shape as the other clients.
- The fourth host matches the safety contract.
- Scope stays on static upload.

artifacts:

- packages/deploy/src/vercel.ts
- packages/deploy/src/netlify.ts
- packages/deploy/src/cloudflare.ts

key_links:

- The poll loop matches deployHostinger's contract.
- Behavior matches deployVercel.
- Same poll contract as the other adapters.

prohibitions:

- Do not spawn vercel.
- Do not deploy without approval.
- Do not invent a Node build path.
- Do not spawn the Netlify CLI in tests.
- Do not resend uploads.
- Do not skip the approval check.
- Do not run wrangler in tests.
- Do not change DNS.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/141.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): add an approved Vercel client
```

---
id: "034"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Serve the companion app locally"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["030", "031", "033", "007", "018"]
files: ["packages/app/src/server/server.ts", "packages/app/src/server/routes.ts", "packages/app/src/server/sse.ts", "packages/app/src/server/uploads.ts", "packages/app/src/server/csrf.ts", "packages/app/src/server/open-browser.ts", "packages/app/src/client/desk.ts", "packages/app/test/server.test.ts", "packages/app/test/uploads.test.ts", "packages/app/e2e/answer-one.spec.ts", "packages/app/playwright.config.ts", "packages/cli/src/commands/app.ts", "packages/cli/src/main.ts", "packages/app/package.json"]
requirements: ["HH-APP-05"]
review_checkpoint_embedded: false
---

# 034. Serve the companion app locally

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

`hh app` (and later `npx hitchhikers-guide`) starts a local server bound to 127.0.0.1 on a random free port, opens the browser, and serves the shell (030), the question card (031), and the Guide map (033), plus route slots for the brand kit, approvals, and the dashboard that later prompts fill. JSON and Server-Sent Events endpoints drive the interview session, uploads (25 MB cap, type allow-list), and push-to-talk audio. Every mutating request carries a CSRF token. No remote binding, ever. A Playwright end-to-end test answers one question in a real browser at 375 and 1440.

## Why this prompt exists

Until now the desk is HTML strings in tests. The user needs a real, local app to talk to, and every later UI (gallery walk, motion previews, brand kit, dashboard) mounts here. Binding only to loopback with a CSRF token keeps a local tool from becoming a network service.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 4, 5, and 19
- packages/app/src/shell.ts, packages/app/src/card.ts, packages/app/src/map.ts
- packages/engine/src/interview.ts and packages/engine/src/state-lock.ts (or the files 007 and 018 created)
- packages/app/src/design/README.md (015)
- packages/cli/src/main.ts
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/app/src/server/server.ts
- packages/app/src/server/routes.ts
- packages/app/src/server/sse.ts
- packages/app/src/server/uploads.ts
- packages/app/src/server/csrf.ts
- packages/app/src/server/open-browser.ts
- packages/app/src/client/desk.ts
- packages/app/test/server.test.ts
- packages/app/test/uploads.test.ts
- packages/app/e2e/answer-one.spec.ts
- packages/app/playwright.config.ts
- packages/cli/src/commands/app.ts
- packages/cli/src/main.ts
- packages/app/package.json

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Use node:http only (no Express) so the dependency list stays small. server.ts exports startServer({ projectDir, port?: 0, open?: boolean }) which listens on 127.0.0.1 and refuses any other host value with an error. routes.ts maps: GET / (desk), GET /brand, GET /approve, GET /hh-dashboard (each renders a designed placeholder panel using 015 components until its owning prompt lands), GET /api/session (current question, progress, map), POST /api/answer, POST /api/suggest, POST /api/skip, POST /api/upload (multipart, 25 MB cap, allow-list: png, jpg, jpeg, webp, gif, svg, pdf, txt, md, docx, wav, webm, m4a), POST /api/audio (push-to-talk blob to the voice package), GET /api/events (SSE stream of session updates). The interview calls go through the engine's interview module (018); the live Guide (047) later swaps the turn handler behind the same endpoint. csrf.ts issues a random token per server start, embedded in the HTML as a meta tag, required as the x-hh-csrf header on every POST; missing or wrong token is 403. Host header must be 127.0.0.1:<port> or localhost:<port> (DNS-rebinding guard). Uploads are written under <project>/.hitchhiker/uploads/ with sanitized names; SVG uploads are stored but never served inline as HTML. open-browser.ts uses start on Windows, open on macOS, xdg-open on Linux via an injected spawn. The client (client/desk.ts) is a small module that fetches /api/session, renders the card, posts answers with the token, and listens to SSE. hh app is a new command in packages/cli.

## Interfaces and data shapes

```ts
export interface ServerHandle { url: string; port: number; close(): Promise<void> }
export function startServer(opts: { projectDir: string; port?: number; open?: boolean; host?: "127.0.0.1"; turnHandler?: TurnHandler }): Promise<ServerHandle>;
export type TurnHandler = (input: { kind: "answer" | "suggest" | "skip"; questionId: string; text?: string }) => Promise<{ next: unknown; events: unknown[] }>;
export function checkHost(hostHeader: string | undefined, port: number): boolean;
export function acceptUpload(meta: { filename: string; mime: string; bytes: number }): { ok: true; safeName: string } | { ok: false; reason: string };
```

## Steps

1. Implement startServer with node:http bound to 127.0.0.1 and port 0 by default. A test asserts the address is 127.0.0.1 and that host: '0.0.0.0' throws.

2. Implement checkHost and the CSRF middleware. Tests: POST without token is 403, wrong Host header is 421 or 403, GET of / embeds the token meta tag.

3. Implement the routes. /api/session returns the current question from the real tree in a temp project. Answer, suggest, and skip call the TurnHandler, which defaults to the 018 engine.

4. Implement SSE with a heartbeat every 15 s and clean close on client disconnect. A test reads two events from a fake session.

5. Implement acceptUpload and the multipart handler with the 25 MB cap and allow-list. Tests: a 26 MB body is rejected before buffering it all, an .exe is rejected, a name like ../../x.png is sanitized.

6. Add the hh app command: starts the server for the current project (or --project), prints the URL, opens the browser unless --no-open.

7. Write client/desk.ts using 015 components and wire it into the desk HTML.

8. Add @playwright/test e2e: start the server on a temp project, open the desk at 375 and 1440, answer DP-0.1, and assert the next question appears and STATE.md advanced. Save both screenshots under packages/app/e2e/screens/ (gitignored) and look at them.

## Edge cases

- Port already in use when a fixed port is requested: fail with a clear message; port 0 never collides.
- Browser open fails on a headless machine: print the URL and continue.
- Two tabs: both receive SSE updates; the state lock (007) serializes writes.
- Windows path handling for uploads uses node:path.

## Acceptance criteria

- [ ] The server binds only to 127.0.0.1 and refuses other hosts.
- [ ] POSTs without the CSRF token are rejected.
- [ ] Uploads over 25 MB or outside the allow-list are rejected.
- [ ] The Playwright e2e answers one question in a real browser at 375 and 1440.

## must_haves

truths:

- The companion app is a real local web app, not only HTML strings.
- It is never reachable from the network.
- Every later screen has a route slot to mount into.

artifacts:

- packages/app/src/server/server.ts
- packages/app/src/server/routes.ts
- packages/cli/src/commands/app.ts
- packages/app/e2e/answer-one.spec.ts

key_links:

- routes.ts calls the 018 interview engine through the TurnHandler seam that 047 replaces.
- hh app in packages/cli starts startServer.

prohibitions:

- Do not bind to 0.0.0.0 or a public interface.
- Do not add Express, React, or a CSS framework.
- Do not serve uploaded SVG or HTML inline.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/app exec playwright install chromium
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/034.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): serve the companion app on localhost with CSRF and SSE
```

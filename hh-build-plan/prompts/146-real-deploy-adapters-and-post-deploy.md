---
id: "146"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Milliways at the End
title: "Real deploy adapters and post-deploy checks"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["140", "141", "142", "145", "011"]
files: ["packages/deploy/src/hostinger-mcp.ts", "packages/deploy/src/hostinger-api.ts", "packages/deploy/src/cli-run.ts", "packages/deploy/src/shape.ts", "packages/deploy/src/post-deploy-live.ts", "packages/deploy/test/real-adapters.test.ts", "packages/deploy/test/post-deploy-live.test.ts", "packages/deploy/README.md"]
requirements: ["HH-DEPLOY-07"]
review_checkpoint_embedded: true
---

# 146. Real deploy adapters and post-deploy checks

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

Make deploys real. Hostinger via the official MCP server (hosted OAuth or `npx -y @hostinger/mcp`, with its tool schema read at runtime) or an API token stored in the OS keychain; static versus Node shape chosen from STACK-DECISION; Vercel, Netlify, and Wrangler via their official CLIs. Everything stays behind the yes gate. Post-deploy checks: live Lighthouse mobile, 200 responses on every route, a form test to the user's own inbox, an analytics test event, the OG preview, HTTPS, and redirects. Sitemap submission is instructions only (Q22).

## Why this prompt exists

Matt's users want their site live on their own host (Q22). The earlier adapters were contracts with injected clients; this prompt connects them to the real tools, safely.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/matt-answers.md Q22
- context/research/11-integrations.md (Hostinger MCP, Vercel, Netlify, Cloudflare)
- packages/deploy/src/ (140, 141, 142, 145)
- packages/knowledge/packs/deploy-*/ (081)
- packages/engine/src/ai/think.ts (017)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/deploy/src/hostinger-mcp.ts
- packages/deploy/src/hostinger-api.ts
- packages/deploy/src/cli-run.ts
- packages/deploy/src/shape.ts
- packages/deploy/src/post-deploy-live.ts
- packages/deploy/test/real-adapters.test.ts
- packages/deploy/test/post-deploy-live.test.ts
- packages/deploy/README.md

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

shape.ts reads STACK-DECISION.md: static output (Astro static, Vite) uploads files; Node output (Next server, Astro SSR) needs a Node app on Hostinger or the host's serverless runtime. hostinger-mcp.ts starts or connects to the official Hostinger MCP server, lists its tools at runtime, and maps the deploy steps to the tools it actually offers (never hardcode tool names without checking the list); hostinger-api.ts is the fallback using an API token from the keychain. cli-run.ts runs `vercel deploy --prebuilt`, `netlify deploy --dir`, or `wrangler pages deploy` with an injected spawn, after the yes gate, capturing the deploy URL. Every adapter writes the deploy record to .hitchhiker/deploy/DEPLOYS.md. post-deploy-live.ts: runs LHCI mobile against the live URL (all four at 90), requests every route expecting 200, submits the contact form with a test message to the user's own address (only with a yes), fires a test analytics event and asks the user to confirm it arrived, fetches OG tags and renders a preview card, checks HTTPS and HSTS, and checks configured redirects. Sitemap: writes instructions for Google Search Console and Bing Webmaster Tools; never submits on the user's behalf.

## Interfaces and data shapes

```ts
export function deploy(target: "hostinger" | "vercel" | "netlify" | "cloudflare", projectDir: string, deps: { yes: () => Promise<boolean>; spawnImpl: SpawnLike; mcp?: McpClient; keychain: Keychain }): Promise<{ url: string; record: string } | { declined: true }>;
export function postDeployChecks(url: string, routes: string[], deps: { fetchImpl: typeof fetch; lhci: LhciRunner; yes: () => Promise<boolean> }): Promise<PostDeployReport>;
```

## Steps

1. Write shape.ts with tests for static and Node stacks.

2. Write hostinger-mcp.ts with runtime tool discovery and an injected MCP client test; write the API fallback.

3. Write cli-run.ts for Vercel, Netlify, and Wrangler with injected spawn tests, including the yes gate refusing to run.

4. Write post-deploy-live.ts with injected tests for every check.

5. Document an opt-in live smoke per host in packages/deploy/README.md (HH_LIVE=1, the user's own account).

## Edge cases

- The user declines the yes: nothing runs and nothing is recorded as deployed.
- MCP tool list lacks a needed tool: fall back to the API path or explain the manual step.
- A route returns 404 after deploy: report it with the route and keep the deploy record.

## Acceptance criteria

- [ ] Injected tests pass for every adapter and check.
- [ ] Nothing deploys without a yes.
- [ ] Live smoke steps are documented per host.

## must_haves

truths:

- Deploys use the official tools for each host.
- The yes gate holds for every deploy and form test.
- Post-deploy checks prove the live site works on phones.

artifacts:

- packages/deploy/src/hostinger-mcp.ts
- packages/deploy/src/cli-run.ts
- packages/deploy/src/post-deploy-live.ts

key_links:

- deploy() uses the adapter contracts from 140 and 141.
- postDeployChecks extends 145 and judges Lighthouse with 122.

prohibitions:

- Do not deploy, submit forms, or fire events without a yes.
- Do not store host tokens outside the keychain.
- Do not submit sitemaps on the user's behalf.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/146.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): real Hostinger, Vercel, Netlify, and Cloudflare deploys with live checks
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `147-review-144-146.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `144` Draft a launch kit that does not auto-post (Share and Enjoy, Gargle Blaster, high)
- `145` Check a deployed URL with an injected fetch (Share and Enjoy, Cup of Tea, medium)
- `146` Real deploy adapters and post-deploy checks (Milliways at the End, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.

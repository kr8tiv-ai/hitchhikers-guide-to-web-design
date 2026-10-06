---
id: "100"
kind: build
phase: improbability-drive
slice: Somebody Else's Problem Field
title: "Discover and install tools, APIs, and MCP servers"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["011", "097"]
files: ["packages/engine/src/tools/discover.ts", "packages/engine/src/tools/legitimacy.ts", "packages/engine/src/tools/install.ts", "packages/engine/test/tools.test.ts", "packages/cli/src/commands/tools.ts"]
requirements: ["HH-TOOLS-01"]
review_checkpoint_embedded: false
---

# 100. Discover and install tools, APIs, and MCP servers

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

For special features the user asks for (DP-3.7, Miro B2 "suggest features"), search the official MCP Registry and npm, present options with licence, cost, and maintenance signals, run the safety check and the package-legitimacy gate, and install only on the user's yes, recording the choice in NOTICE or CREDITS (Q23).

## Why this prompt exists

Users ask for things the templates do not cover (a booking widget, a CRM sync). The Guide should find real, maintained tools and install them safely instead of inventing code or packages.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/research/11-integrations.md
- context/matt-answers.md Q23
- packages/orchestrator/src/policy.ts (097)
- packages/engine/src/ai/think.ts (017)
- context/sources/xai/features_permissions.md
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/tools/discover.ts
- packages/engine/src/tools/legitimacy.ts
- packages/engine/src/tools/install.ts
- packages/engine/test/tools.test.ts
- packages/cli/src/commands/tools.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

discover.ts queries the MCP Registry (https://registry.modelcontextprotocol.io, the v0 servers API) and the npm registry search API with an injected fetch, then asks think() to rank up to 5 options against the feature request with schema { options: [{ name, kind: "mcp" | "npm" | "api", why, licence, costNote, maintenance }] }. legitimacy.ts checks each option: exact name match, licence in the allow-list (MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level), repository URL present and matching the package, last publish within 18 months, weekly downloads above a floor, no install scripts unless explained, and not a typo-squat of a popular name (edit distance check). install.ts runs only after confirm(option) returns true: for npm, pnpm add in the site project; for MCP servers, write the project-level Grok MCP config entry (read features docs for the format) with the policy from 097 applied; then append NOTICE or CREDITS. hh tools search|install exposes it.

## Interfaces and data shapes

```ts
export function discoverTools(feature: string, deps: { fetchImpl: typeof fetch; think: typeof think }): Promise<ToolOption[]>;
export function checkLegitimacy(opt: ToolOption, meta: RegistryMeta): { ok: boolean; reasons: string[] };
export function installTool(opt: ToolOption, projectDir: string, deps: { confirm: (o: ToolOption) => Promise<boolean>; run: (cmd: string, args: string[]) => Promise<number> }): Promise<"installed" | "declined" | "blocked">;
```

## Steps

1. Write discover.ts with injected registry responses.

2. Write legitimacy.ts with one test per rule, including a typo-squat case.

3. Write install.ts with confirm and the 097 policy; test that a declined confirm runs nothing.

4. Add the CLI command.

5. Test that NOTICE or CREDITS gains an entry after an install.

## Edge cases

- Registry unreachable: say so and offer manual options.
- A GPL option ranks first: it is shown as blocked with the reason.
- MCP server needs a secret: the Guide asks the user to set it in env or keychain, never in a file.

## Acceptance criteria

- [ ] Injected registry tests pass.
- [ ] Nothing installs without a yes.
- [ ] Blocked options show reasons.

## must_haves

truths:

- Tool discovery uses real registries.
- Every install passes the legitimacy gate and a yes.
- Installs are recorded in NOTICE or CREDITS.

artifacts:

- packages/engine/src/tools/discover.ts
- packages/engine/src/tools/legitimacy.ts
- packages/engine/src/tools/install.ts

key_links:

- installTool applies the 097 deny policy.
- discoverTools ranks with think() from 017.

prohibitions:

- Do not install anything without a yes.
- Do not install GPL or AGPL packages.
- Do not write secrets into config files.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/cli test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/100.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(tools): discover and safely install tools and MCP servers on a yes
```

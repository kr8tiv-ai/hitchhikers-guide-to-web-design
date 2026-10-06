# Roadmap: The Hitchhiker's Guide to Web Design

## Overview

This roadmap is the build of the Guide app. It is not a client's website. Six phases, in the locked names. Each plan row is a prompt file in `prompts/`. Checkpoints are plans too: Zaphod, fresh session, no new features, every three builds within a phase and at each phase end (xhigh). The last plan is an xhigh once-over.

Plan v3 (2026-10-06): Matt approved the steward review. All PATCHES fixes are applied, 22 new prompts (live Grok, design system, gallery walk, motion previews, real integrations, real gates, real deploys) are merged in, and the plan is re-indexed. Decisions D-002 to D-008 are in DECISIONS.md.

Spec: `CONTEXT-PACKAGE.v2.md` (and v1 `CONTEXT-PACKAGE.md` for full detail). Authority: `context/matt-answers.md` and `DECISIONS.md`. Critique: `CRITIQUE.md`. Sources: `RESEARCH-ADDENDUM.md`, `context/research/03`–`12`, Matt's guides in `context/sources/`. Backbone: `vendor/gsd-core` templates, ported, not imported at runtime.

## Phases

- [ ] **Phase 1: Don't Panic** — Repo, CI, design system, Grok adapter, state, live interview, local app, gallery walk, motion previews
- [ ] **Phase 2: Babel Fish** — Live brand modules, Imagine jobs, logo export set, upscaling, brand-kit reveal
- [ ] **Phase 3: Deep Thought** — PRD, motion spec, templates and integrations, 3D sourcing, prompt skeleton, Grok-authored prompts, approval
- [ ] **Phase 4: Improbability Drive** — Headless runner, deny policy, tools discovery, Marvin, Zaphod, dashboard
- [ ] **Phase 5: Mostly Harmless** — Real gates, live drive and vision review, jury, Elevate, before-we-jump, evals
- [ ] **Phase 6: So Long and Thanks for All the Fish** — Real deploys, plugin commands, docs, package, polish, licence audit, once-over

## Phase Details

### Phase: Don't Panic

**Goal**: A new project writes `.hitchhiker/` from the ported GSD templates, the companion app runs locally, and the live Guide interviews the user one question at a time.

**Depends on**: Nothing (first phase)

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. A new project writes `.hitchhiker/` from the ported GSD templates and locks STATE.md during writes.
2. `/hh-doctor` reports grok, node, git, the CLI flags this grok build supports, and which session-id shape the CLI accepted, without throwing on a missing optional tool.
3. The Guide design system exists in packages/app/src/design/ and every screen uses it; nothing looks default.
4. All AI calls go through one Grok adapter with schemas and cassettes; the interview runs live on Grok with pushback held twice, grounded Suggest, mirroring, and an approved Site Brief.
5. Deep is the default interview mode; Standard and Express drop no ids (ASSUMED defaults are re-asked later).
6. tree.yaml contains every DP id from v2 section 8, with a depth tag.
7. `hh app` serves the desk on 127.0.0.1 with CSRF; the gallery walk, motion previews, and mood analyzer work in a real browser at 375 and 1440.
8. CI runs on Windows, macOS, and Linux without secrets.

**Plans**: 44

Plans:

- [ ] 001: Scaffold the MIT monorepo and NOTICE (build, Towel, medium)
- [ ] 002: Port GSD spine templates into the engine (build, Cup of Tea, medium)
- [ ] 003: Lock package boundaries and project references (build, Cup of Tea, medium)
- [ ] 004: Review 001–003 (checkpoint, Heart of Gold, high)
- [ ] 005: CI workflows (build, Cup of Tea, medium)
- [ ] 006: Validate .hitchhiker config.json (build, Cup of Tea, medium)
- [ ] 007: Lock STATE.md writes with a stale-pid takeover (build, Gargle Blaster, high)
- [ ] 008: Review 005–007 (checkpoint, Heart of Gold, high)
- [ ] 009: Add the hh binary and /hh-doctor probes (build, Gargle Blaster, high)
- [ ] 010: Design the Guide's own brand and design system (build, Forty-Two, xhigh)
- [ ] 011: Grok adapter for structured AI calls (build, Forty-Two, xhigh)
- [ ] 012: Review 009–011 (checkpoint, Heart of Gold, high)
- [ ] 013: Speak to grok agent over stdio ACP (build, Heart of Gold, xhigh)
- [ ] 014: Write interview tree modules 0 and 1 (build, Gargle Blaster, high)
- [ ] 015: Append interview modules 2 through 5 (build, Gargle Blaster, high)
- [ ] 016: Review 013–015 (checkpoint, Heart of Gold, high)
- [ ] 017: Finish the tree, Guide Entry, and required fields (build, Gargle Blaster, high)
- [ ] 018: Run the interview one question at a time (build, Heart of Gold, xhigh)
- [ ] 019: Push back on soft answers and write coverage (build, Gargle Blaster, high)
- [ ] 020: Review 017–019 (checkpoint, Heart of Gold, high)
- [ ] 021: Write the Guide persona system prompt (build, Forty-Two, xhigh)
- [ ] 022: Wrap whisper.cpp for local push-to-talk (build, Heart of Gold, high)
- [ ] 023: Add an opt-in xAI speech-to-text adapter (build, Gargle Blaster, high)
- [ ] 024: Review 021–023 (checkpoint, Heart of Gold, high)
- [ ] 025: Ingest a brand PDF and grade an image file (build, Gargle Blaster, high)
- [ ] 026: Crawl a public page with robots.txt and screenshots (build, Heart of Gold, high)
- [ ] 027: Turn a crawl into competitor and SEO notes (build, Gargle Blaster, high)
- [ ] 028: Review 025–027 (checkpoint, Heart of Gold, high)
- [ ] 029: Ship a curated gallery pack and a polite refresh hook (build, Gargle Blaster, high)
- [ ] 030: Build the local chat shell without a default theme (build, Gargle Blaster, high)
- [ ] 031: Render one question card with Answer, Suggest, and Skip (build, Heart of Gold, xhigh)
- [ ] 032: Review 029–031 (checkpoint, Heart of Gold, high)
- [ ] 033: Show phase progress and resume from the home index (build, Gargle Blaster, high)
- [ ] 034: Serve the companion app locally (build, Heart of Gold, high)
- [ ] 035: Run the Guide live: persona, pushback, grounded Suggest, brief loop (build, Forty-Two, xhigh)
- [ ] 036: Review 033–035 (checkpoint, Heart of Gold, high)
- [ ] 037: Gallery walk with clickable cards (build, Heart of Gold, high)
- [ ] 038: Motion family previews and the 1–10 slider (build, Heart of Gold, high)
- [ ] 039: Pinterest, screenshots, and the mood analyzer (build, Gargle Blaster, high)
- [ ] 040: Review 037–039 (checkpoint, Heart of Gold, high)
- [ ] 041: Wire push-to-talk to the local transcriber (build, Heart of Gold, high)
- [ ] 042: Scaffold read-only X OAuth without posting (build, Gargle Blaster, high)
- [ ] 043: Prove the interview saves and resumes end to end (build, Heart of Gold, xhigh)
- [ ] 044: Review 041–043 and close Don't Panic (checkpoint, Heart of Gold, xhigh)

### Phase: Babel Fish

**Goal**: A finished brand run, authored live by Grok and validated by the compilers, writes BRAND.md under 1,500 words and a VOICE.md with per-item approvals.

**Depends on**: the previous phase

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. Grok runs the Why Finder, positioning, story, voice kit, and 30 taglines cut to 5; every output passes lintClaims and the word caps.
2. The logo path produces an SVG wordmark from a real font, a symbol trace, a model-cleaned master, and the full export set.
3. Imagine jobs run for real on the user's key, stop at the dollar cap, and can run in DIY mode with zero API calls.
4. Image upscaling is on, with weights downloaded at first use and never committed.
5. Real people in uploads are not replaced without a recorded yes.
6. The brand-kit page is a designed reveal the user can approve per item, with HTML and PDF exports.

**Plans**: 23

Plans:

- [ ] 045: Compile a one-sentence why and a longer finder (build, Gargle Blaster, high)
- [ ] 046: Draft archetype, positioning, and three story lengths (build, Gargle Blaster, high)
- [ ] 047: Fold competitor cards into the brand notes (build, Gargle Blaster, high)
- [ ] 048: Review 045–047 (checkpoint, Heart of Gold, high)
- [ ] 049: Build palettes, type pairs, and contrast tokens (build, Gargle Blaster, high)
- [ ] 050: Write imagery rules and Imagine prompt stubs (build, Cup of Tea, medium)
- [ ] 051: Compile VOICE.md and cut thirty taglines to five (build, Gargle Blaster, high)
- [ ] 052: Review 049–051 (checkpoint, Heart of Gold, high)
- [ ] 053: Price Imagine jobs and stop at the cap (build, Forty-Two, high)
- [ ] 054: List ten logo directions and render four flats (build, Heart of Gold, high)
- [ ] 055: Set the wordmark in a real font and trace the symbol (build, Forty-Two, xhigh)
- [ ] 056: Review 053–055 (checkpoint, Heart of Gold, high)
- [ ] 057: Grade uploads and upscale with Real-ESRGAN, weights fetched on first use (build, Heart of Gold, high)
- [ ] 058: Block invented testimonials, awards, and metrics (build, Gargle Blaster, high)
- [ ] 059: Compile BRAND.md under 1,500 words (build, Forty-Two, xhigh)
- [ ] 060: Review 057–059 (checkpoint, Heart of Gold, high)
- [ ] 061: Model-authored brand modules with validators (build, Forty-Two, xhigh)
- [ ] 062: Imagine asset jobs end to end (build, Heart of Gold, xhigh)
- [ ] 063: Logo clean-up and export set (build, Heart of Gold, high)
- [ ] 064: Review 061–063 (checkpoint, Heart of Gold, high)
- [ ] 065: Render the brand kit as an approval page with optional social frames (build, Heart of Gold, high)
- [ ] 066: Approve each brand section before it leaves draft (build, Gargle Blaster, high)
- [ ] 067: Review 065–066 and close Babel Fish (checkpoint, Heart of Gold, xhigh)

### Phase: Deep Thought

**Goal**: STACK-DECISION.md, MOTION.md, PRD.md, and CONTEXT.md exist, and Grok has authored a validated site prompt package grouped into the six phases.

**Depends on**: the previous phase

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. STACK-DECISION.md records pick, why, alternatives, and what would change the decision, and the user can override it.
2. MOTION.md assigns one library per effect and states the per-page scroll owner, the ticker, and the WebGL context rule.
3. The skeleton generator emits 50 to 150 entries from real work units (never padded) with a final xhigh once-over, and Grok-authored bodies pass the validator.
4. Site starter templates build with the full D-001 toolkit wired per effect, and blank templates score Lighthouse mobile 90 or more in all four categories.
5. Knowledge packs exist for the full motion toolkit, integrations, and 3D sourcing.
6. The approval screen requires three yeses (PRD, CONTEXT, prompt package) before Improbability Drive.

**Plans**: 28

Plans:

- [ ] 068: Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site (build, Gargle Blaster, high)
- [ ] 069: Generate the seventeen-section PRD and the assumptions list (build, Heart of Gold, high)
- [ ] 070: Write KPIS.md with ranges labeled as assumptions (build, Cup of Tea, medium)
- [ ] 071: Review 068–070 (checkpoint, Heart of Gold, high)
- [ ] 072: Write the stack decision record (build, Gargle Blaster, high)
- [ ] 073: Assign one library per effect in MOTION.md (build, Forty-Two, xhigh)
- [ ] 074: Encode the ticker, scroll, and WebGL coexistence rules (build, Heart of Gold, xhigh)
- [ ] 075: Review 072–074 (checkpoint, Heart of Gold, high)
- [ ] 076: Define the knowledge pack format (build, Cup of Tea, medium)
- [ ] 077: Add golden site prompts from Matt's method, with credit (build, Gargle Blaster, high)
- [ ] 078: Write the anti-slop, brand, and copy packs (build, Gargle Blaster, high)
- [ ] 079: Review 076–078 (checkpoint, Heart of Gold, high)
- [ ] 080: Write motion recipes for the full toolkit (build, Forty-Two, xhigh)
- [ ] 081: Write stack usage notes for Astro, Next, and Vite (build, Gargle Blaster, high)
- [ ] 082: Write typography, color, UX, and accessibility packs (build, Gargle Blaster, high)
- [ ] 083: Review 080–082 (checkpoint, Heart of Gold, high)
- [ ] 084: Write SEO, sales, and award-site packs without fake numbers (build, Gargle Blaster, high)
- [ ] 085: 3D sourcing: CC0 GLBs and Tripo/Meshy tools (build, Heart of Gold, high)
- [ ] 086: Site starter templates, feature recipes, tracking (build, Forty-Two, xhigh)
- [ ] 087: Review 084–086 (checkpoint, Heart of Gold, high)
- [ ] 088: Plan sections and name the hero Infinite Improbability (build, Gargle Blaster, high)
- [ ] 089: Assemble CONTEXT.md with anchors under the token budget (build, Heart of Gold, high)
- [ ] 090: Generate the site prompt skeleton (50 to 150) and the package validator (build, Forty-Two, xhigh)
- [ ] 091: Review 088–090 (checkpoint, Heart of Gold, high)
- [ ] 092: Golden prompt library and Grok-authored site prompts (build, Forty-Two, xhigh)
- [ ] 093: Require a yes before Improbability Drive (build, Heart of Gold, high)
- [ ] 094: Edit a site prompt without losing its must_haves (build, Heart of Gold, high)
- [ ] 095: Review 092–094 and close Deep Thought (checkpoint, Heart of Gold, xhigh)

### Phase: Improbability Drive

**Goal**: Each site prompt runs as a fresh headless Grok session with an effort flag and a turn cap, watched by Marvin and judged by Zaphod.

**Depends on**: the previous phase

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. Each site prompt can be launched as a fresh headless session with model, effort, and a turn cap.
2. Marvin fixes a Rule 1 failure in a new session and refuses to swap a package that failed to install.
3. Zaphod writes a PASS, PASS_WITH_KNOWN_ISSUES, FIX, or ESCALATE review with 375 and 1440 notes when UI changed.
4. Protected paths and the deny list are checked by the orchestrator, not only by hooks; new tools install only on a yes.
5. The Drive dashboard reads queue state from disk, shows live progress and cost, and can pause.

**Plans**: 26

Plans:

- [ ] 096: Launch one site prompt as a fresh headless session (build, Forty-Two, xhigh)
- [ ] 097: Deny push, deploy, and unapproved destructive actions (build, Heart of Gold, xhigh)
- [ ] 098: Back up the branch and commit one prompt at a time (build, Heart of Gold, high)
- [ ] 099: Review 096–098 (checkpoint, Heart of Gold, high)
- [ ] 100: Discover and install tools, APIs, and MCP servers (build, Heart of Gold, high)
- [ ] 101: Route effort, bump it once on retry, and gate the worktrees flag (build, Gargle Blaster, high)
- [ ] 102: Run preflight checks before the queue starts (build, Gargle Blaster, high)
- [ ] 103: Review 100–102 (checkpoint, Heart of Gold, high)
- [ ] 104: Detect stalls, crashes, and build failures (build, Heart of Gold, high)
- [ ] 105: Triage failures with three strikes and a rollback (build, Forty-Two, xhigh)
- [ ] 106: Write the escalation the user actually sees (build, Gargle Blaster, high)
- [ ] 107: Review 104–106 (checkpoint, Heart of Gold, high)
- [ ] 108: Capture reviewer screenshots at four widths with same-environment baselines (build, Heart of Gold, high)
- [ ] 109: Check a prompt's truths against evidence (build, Heart of Gold, high)
- [ ] 110: Score the six pillars plus motion and brand (build, Heart of Gold, high)
- [ ] 111: Review 108–110 (checkpoint, Heart of Gold, high)
- [ ] 112: Lint generated copy for slop and allow Elevate only as a product name (build, Gargle Blaster, high)
- [ ] 113: Write PASS, FIX, or ESCALATE after at most two fix rounds (build, Heart of Gold, high)
- [ ] 114: Read the drive queue from disk and schedule its reviews (build, Gargle Blaster, high)
- [ ] 115: Review 112–114 (checkpoint, Heart of Gold, high)
- [ ] 116: Render the local drive dashboard (build, Heart of Gold, xhigh)
- [ ] 117: Update STATE.md as each prompt finishes (build, Gargle Blaster, high)
- [ ] 118: Show counts in subscription mode and measured tokens in API mode (build, Heart of Gold, high)
- [ ] 119: Review 116–118 (checkpoint, Heart of Gold, high)
- [ ] 120: Run the drive loop against a fixture spawn (build, Forty-Two, xhigh)
- [ ] 121: Review 120 and close Improbability Drive (checkpoint, Heart of Gold, xhigh)

### Phase: Mostly Harmless

**Goal**: Real gates run on every generated site: Lighthouse on real mobile runs at 90 in all four categories, axe, keyboard, reduced motion, zero console errors.

**Depends on**: the previous phase

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. Lighthouse mobile (real mobile runs, median of 3) is 90 or more in all four categories on every route, or the gate is a BLOCKER.
2. axe serious/critical, console errors and failed requests (zero), links, weight, and the anti-slop lint are wired into one command.
3. Zaphod reviews with Grok vision; Elevate proposes at most eight upgrades and refuses to keep a change that regresses a gate.
4. Before-we-jump runs at the start of every phase and writes answers back to the owning files.
5. The Towel & Tea fixture replays from cassettes, and an opt-in live dogfood builds a small site end to end.

**Plans**: 18

Plans:

- [ ] 122: Gate Lighthouse on real mobile runs: all four scores at 90 (build, Heart of Gold, xhigh)
- [ ] 123: Check axe, keyboard, reduced motion, and contrast (build, Heart of Gold, high)
- [ ] 124: Check titles, crawlable text, links, and weight budgets (build, Gargle Blaster, high)
- [ ] 125: Review 122–124 (checkpoint, Heart of Gold, high)
- [ ] 126: Live drive, vision review, real gates, console gate, live dogfood (build, Forty-Two, xhigh)
- [ ] 127: Score the four-part jury (build, Gargle Blaster, high)
- [ ] 128: Plan at most eight Elevate upgrades (build, Gargle Blaster, high)
- [ ] 129: Review 126–128 (checkpoint, Heart of Gold, high)
- [ ] 130: Apply an Elevate item only if the gates still pass (build, Heart of Gold, xhigh)
- [ ] 131: Elevate loop live, detail pass, copy refinement (build, Heart of Gold, xhigh)
- [ ] 132: Generate the last questions before launch (build, Gargle Blaster, high)
- [ ] 133: Review 130–132 (checkpoint, Heart of Gold, high)
- [ ] 134: Before-we-jump at every phase start (build, Gargle Blaster, high)
- [ ] 135: Freeze the Towel and Tea eval fixture (build, Gargle Blaster, high)
- [ ] 136: Replay Towel and Tea through brief and brand compilers (build, Heart of Gold, high)
- [ ] 137: Review 134–136 (checkpoint, Heart of Gold, high)
- [ ] 138: Add hh mostly-harmless and hh elevate commands with the QA report (build, Gargle Blaster, high)
- [ ] 139: Review 138 and close Mostly Harmless (checkpoint, Heart of Gold, xhigh)

### Phase: So Long and Thanks for All the Fish

**Goal**: Deploys are real and gated by a yes, the plugin and package are installable, the app is polished, and the once-over finds no hidden MISSING rows.

**Depends on**: the previous phase

**Requirements**: see CONTEXT-PACKAGE.v2.md sections for this phase, context/matt-answers.md, and DECISIONS.md

**Success Criteria** (what must be TRUE):

1. Hostinger (MCP or API), Vercel, Netlify, and Cloudflare deploys run only after a yes, with live post-deploy checks.
2. DEPLOY.md and HANDOFF.md are generated for the chosen host, plus client-ready PRD and brand-kit PDFs.
3. NOTICE lists third-party licences and does not include GPL or `@theatre/studio`.
4. `npx hitchhikers-guide` and `hh install` work, and every /hh command exists as a Grok Build skill.
5. Every app screen passes the agency-grade polish pass; the app itself scores Lighthouse mobile 90 or more.
6. The once-over report exists and does not hide MISSING rows.

**Plans**: 20

Plans:

- [ ] 140: Deploy to Hostinger only after a yes, then poll (build, Forty-Two, xhigh)
- [ ] 141: Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes (build, Gargle Blaster, high)
- [ ] 142: Generate DEPLOY.md and HANDOFF.md (build, Cup of Tea, medium)
- [ ] 143: Review 140–142 (checkpoint, Heart of Gold, high)
- [ ] 144: Draft a launch kit that does not auto-post (build, Gargle Blaster, high)
- [ ] 145: Check a deployed URL with an injected fetch (build, Cup of Tea, medium)
- [ ] 146: Real deploy adapters and post-deploy checks (build, Forty-Two, xhigh)
- [ ] 147: Review 144–146 (checkpoint, Heart of Gold, high)
- [ ] 148: Package the CLI so npx and hh install work (build, Heart of Gold, high)
- [ ] 149: Grok Build plugin command set (build, Heart of Gold, high)
- [ ] 150: Write the README in the Guide's voice (build, Gargle Blaster, high)
- [ ] 151: Review 148–150 (checkpoint, Heart of Gold, high)
- [ ] 152: Reveals and agency exports (build, Heart of Gold, high)
- [ ] 153: Agency-grade polish pass on the Guide app (build, Forty-Two, xhigh)
- [ ] 154: Scan for secrets, deny-list gaps, and keychain notes (build, Heart of Gold, high)
- [ ] 155: Review 152–154 (checkpoint, Heart of Gold, high)
- [ ] 156: Audit licenses and keep GPL and Theatre studio out (build, Heart of Gold, high)
- [ ] 157: Write the release checklist and wire the root test (build, Heart of Gold, high)
- [ ] 158: Review 156–157 and close So Long and Thanks for All the Fish (checkpoint, Heart of Gold, xhigh)
- [ ] 159: Once-over: the Guide against the v2 spec (once-over, Forty-Two, xhigh)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| Don't Panic | 0/44 | Not started | - |
| Babel Fish | 0/23 | Not started | - |
| Deep Thought | 0/28 | Not started | - |
| Improbability Drive | 0/26 | Not started | - |
| Mostly Harmless | 0/18 | Not started | - |
| So Long and Thanks for All the Fish | 0/20 | Not started | - |

## Notes

- Integer phases only. No inserted decimal phase in this plan.
- Checkpoints are plans. They are review sessions. The build driver pushes to origin main after each checkpoint.
- Live-model tests are opt-in (`HH_LIVE=1`). CI replays recorded cassettes and never needs a live SuperGrok account.

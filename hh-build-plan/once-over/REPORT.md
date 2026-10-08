# Once-over: the Guide against the v2 spec

Prompt 159. This pass looked for drift. It did not ship a new phase.

The product is not done. Two requirements have no code. Seven more are partial and stay as fix prompts. One local typecheck miss was fixed and proved with a test.

Status words: **PRESENT** (the sentence has code and a path), **PARTIAL** (code exists and does not meet the sentence), **MISSING** (no code for the sentence). Every row has a path. Each MISSING row links to its v2 section.

`hh-build-plan-review/` is not in the repo. Coverage came from `hh-build-plan/CRITIQUE.md` and `hh-build-plan/reviews/`.

## What landed

| Fix | Status | Proof |
|---|---|---|
| [001-post-check-title.md](001-post-check-title.md) | Applied | `packages/deploy/src/post-check.ts` `titleText` treats a missing capture as `""`. Test `a multiline title is collapsed and still counts` in `packages/deploy/test/post-check.test.ts`. |
| [002](002-research-mit-fallback.md) through [009](009-stt-rate-on-a-settings-screen.md) | Proposed | Listed below. Not improvised in this commit. |

## Conflicts recorded, not rewritten

- D-001 and [v2 §15](../CONTEXT-PACKAGE.v2.md) withdraw the GSAP MIT fallback and the "avoid Theatre" note. `context/research/00-SUMMARY.md`, `context/research/06-library-stack.md`, and `CONTEXT-PACKAGE.md` (v1) still contain that language. Product code does not implement a switch. See fix 002.
- [v2 §4](../CONTEXT-PACKAGE.v2.md) names the lock `STATE.md.lock`. `packages/engine/src/lock.ts` exports `STATE_LOCK_NAME = "state.lock"`. Matt and `DECISIONS.md` are silent on the filename. Behavior (exclusive create, stale pid) is present. The name was not changed. See fix 008.
- `CRITIQUE.md` §9 (Q-A through Q-G) is already answered or defaulted. Those items are not new misses. Q-B is the Towel & Tea fixture. Q-E keeps X posting out of v1. Q-F keeps `@theatre/studio` out.

## v2 §4 Surfaces

| Requirement | Status | Path |
|---|---|---|
| Three surfaces, one engine, state under `.hitchhiker/` | PRESENT | `packages/engine/src/home-index.ts`, `packages/grok-plugin/skills/`, `packages/app/src/server/routes.ts` |
| Plugin skills live in the plugin package and `hh install` copies them into a project | PRESENT | `packages/grok-plugin/skills/`, `packages/cli/src/install.ts` |
| Companion desk: chat, hold-to-talk, uploads, suggest, Guide map | PRESENT | `packages/app/src/server/routes.ts` route `/`. Shots below. |
| Companion talks to Grok through ACP (`grok agent stdio`) | PRESENT | `packages/orchestrator/src/acp.ts`, `packages/engine/src/guide/live-turn.ts` |
| Dashboard is its own route and is named `/hh-dashboard` in the UI | PRESENT | `packages/app/src/drive-markup.ts` |
| Voice is push-to-talk. The Guide replies in text. No TTS | PRESENT | `packages/voice/`, `packages/grok-plugin/skills/hh-settings/SKILL.md` |
| Default speech engine is whisper.cpp, local, models named in the spec | PRESENT | `packages/voice/src/whisper.ts` |
| Optional xAI STT quotes $0.10/hr REST and $0.20/hr streaming | PRESENT | `packages/voice/src/xai-stt.ts` `quoteStt` |
| A settings screen shows that rate before xAI speech-to-text can be turned on | **MISSING** | No settings route. `packages/app/src/server/routes.ts` routes are `/`, `/brand`, `/approve`, `/hh-dashboard`, `/gallery`, `/motion`. [v2 §4](../CONTEXT-PACKAGE.v2.md). Fix [009](009-stt-rate-on-a-settings-screen.md). |
| `STATE.md` is the spine that interview open can read | PARTIAL | `saveState` / `loadState` in `packages/engine/src/state.ts` want short headings. `scaffoldProject` in `packages/engine/src/spec/scaffold.ts` writes the GSD template. `openInterview` in `packages/engine/src/interview.ts` calls `loadState` and throws on a fresh scaffold. Fix [003](003-scaffold-state-vs-loadstate.md). |
| Lock is an exclusive create and goes stale after a dead pid | PRESENT | `packages/engine/src/lock.ts` |
| Lock file is named `STATE.md.lock` | PARTIAL | Constant is `state.lock` in `packages/engine/src/lock.ts`. [v2 §4](../CONTEXT-PACKAGE.v2.md). Fix [008](008-state-lock-filename.md). |
| Progress stays visible and a phase ends with a reveal | PRESENT | Guide map on `/`. `packages/app/src/reveals/brand-reveal.ts` |
| Item-by-item brand approval is reachable on the live desk | PARTIAL | `renderBrand` in `packages/app/src/server/routes.ts` prints the empty plate and does not call `renderBrandKit`. `applyStatus` in `packages/engine/src/brand/approve.ts` writes a status only when every section is true. `bindApproveDeck` in `packages/app/src/brand/approve-cards.ts` calls a callback and does not write a file. Fix [006](006-brand-approval-on-the-desk.md). |

## v2 §8.4 Required minimum

| Requirement | Status | Path |
|---|---|---|
| Why the site exists, one visitor, one action, vibe and anti-vibe, motion level, hosting | PRESENT | `REQUIRED_IDS` in `packages/engine/src/required.ts`: DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2 |
| A skip stores an ASSUMED value and the brief can highlight it | PRESENT | `skip_default` on those ids in `interview/tree.yaml`. DP-6.2 default is polished, not a spectacle. DP-9.2 default is `no idea`. |
| Express does not drop DP-0.5 or DP-7.2 | PRESENT | `seedExpressAssumptions` in `packages/engine/src/guide/live-turn.ts` stores them SKIPPED with an `ASSUMED:` prefix. Depth tags on those two ids are `[standard, deep]`. |
| The brand why may wait for Babel Fish. The site why may not be blank | PRESENT | DP-1.7 `why` in `interview/tree.yaml` defers the long finder. DP-2.1 is in `REQUIRED_IDS`. |

## v2 §11 Improbability Drive

| Requirement | Status | Path |
|---|---|---|
| Queue runs in roadmap order, one fresh session, one commit, STATE updated | PRESENT | `packages/orchestrator/src/runner.ts`, `packages/orchestrator/src/live-runner.ts` |
| Doctor records UUID vs alias. A slug is not passed as `--session-id` in uuid mode | PRESENT | `packages/cli/src/session-probe.ts`, `assertSession` in `packages/orchestrator/src/runner.ts` |
| Parallelism stays off. Worktrees stay behind a flag | PRESENT | `packages/orchestrator/src/runner.ts` |
| An unapproved drive does not spawn. `--always-approve` is not the doctor's argv | PRESENT | `approved !== true` throws in `packages/orchestrator/src/runner.ts` before argv is built. `packages/cli/src/doctor.ts` does not pass that flag. |
| Marvin: stall, turn budget, non-zero exit, build, console. Rules 1–3, package legitimacy, three strikes, backoff | PRESENT | `packages/orchestrator/src/` Marvin modules and their tests. Voice copy has no exclamation marks. |
| Zaphod: every third prompt and phase end, screenshots, goal-backward, six pillars, anti-slop, PASS / FIX / ESCALATE | PRESENT | `packages/qa/` and the Zaphod reviewer. Checkpoints in `hh-build-plan/reviews/` are separate files. |
| Dashboard shows queue, stream, screenshots, verdicts, spend, pause | PRESENT | `packages/app/src/drive-markup.ts`. Empty states are designed. Pause is disabled when the queue is empty (`packages/app/test/dashboard.test.ts`). |
| One xhigh pass reads the spec and writes a fix list | PRESENT | This report and `hh-build-plan/once-over/`. |

## v2 §12 Mostly Harmless

| Requirement | Status | Path |
|---|---|---|
| Lighthouse mobile, all four scores ≥ 90. This pass did not relax the gate and did not run a live LHCI | PRESENT | `packages/qa/` LHCI gate and tests. D-006. |
| Desktop 3D is not a Lighthouse free pass. A missing phone fallback is a blocker | PRESENT | Motion contract and the phone gate in `packages/qa/` |
| LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms labeled lab-proxy | PRESENT | `packages/qa/` |
| Console: 0 errors and 0 failed requests at the four widths | PRESENT | `packages/qa/` |
| axe: 0 serious or critical, keyboard menu, reduced motion, contrast | PRESENT | `packages/qa/` |
| SEO: unique title, meta, OG, one H1, alt, sitemap, robots, canonical, JSON-LD | PRESENT | `packages/qa/` and `packages/deploy/src/post-check.ts` |
| The CI typecheck that guards that post-check can run | PRESENT | Fixed this pass. `.github/workflows/ci.yml` runs `pnpm exec tsc -b`. Review 158 had recorded TS2532 on `match[1]`. |
| Visual diffs against the last PASS in this environment | PRESENT | `packages/qa/` |
| Links and weight. Hero video cap. Credits file and page match | PARTIAL on credits | Weight and link checks live in `packages/qa/`. Two CREDITS.json shapes disagree: assets use `CC0-1.0`, the template fetcher accepts `CC0` and rejects `CC0-1.0` (review 087). [v2 §12](../CONTEXT-PACKAGE.v2.md) "File and page match". Fix [004](004-credits-json-shapes.md). |
| Brand ≥ 8/10 on each dimension, plus the user's approval | PRESENT as a gate | `packages/qa/` jury and brand score. The live desk wiring is the §4 partial above. |
| Jury weights 40/30/20/10. Elevate is repeatable and a regressed gate does not merge. The word stays banned in site copy | PRESENT | `packages/qa/`, `packages/cli/src/commands/elevate.ts`, anti-slop lint |

## v2 §14 Anti-slop

| Requirement | Status | Path |
|---|---|---|
| Never list: purple-blue gradients, three-card default, lorem, indigo Tailwind, invented proof | PRESENT | `packages/knowledge/packs/` anti-slop pack, `packages/app/src/shell.ts` lint, `packages/app/src/design/tokens.css` |
| Also-never list, including magnetic buttons, grey body text, Inter as the only voice | PRESENT | Same lint and tokens. Body text is warm brown `#564a40`. Type is Bricolage Grotesque and Literata. |
| Banned words, with Elevate and `/hh-elevate` exempt only as chrome | PRESENT | `packages/app/src/shell.ts` |
| Nutrimatic lint treats a hit as a FIX | PRESENT | `packages/qa/` |
| The Guide's own screens at 375 and 1440 are agency-grade Don't Panic, so Q34 is not a missing row | PRESENT | Shots in [shots/](shots/). Notes in the UI section. |

## v2 §15 Toolkit

| Requirement | Status | Path |
|---|---|---|
| GSAP is the default engine, with ScrollTrigger and SplitText | PRESENT | `packages/knowledge/packs/motion/recipes.md` heading "GSAP and Lenis on gsap.ticker". `packages/engine/src/spec/motion.ts` |
| Lenis, Three, OGL or WebGL2, Motion, anime.js, `@theatre/core`, CSS scroll-driven, and vanilla are reachable from the pack or the templates | PRESENT | Headings in `packages/knowledge/packs/motion/recipes.md`: GSAP SplitText, CSS scroll-driven, Motion in a React island, anime.js stagger, OGL shader, Three.js lazy hero, Theatre core on the ticker, Vanilla IntersectionObserver fade, Reduced motion |
| `@theatre/core` is pinned. `@theatre/studio` is not imported | PRESENT | No import of `@theatre/studio` in product source. Pin recorded in `hh-build-plan/RESEARCH-ADDENDUM.md` and D-001. |
| No MIT-fallback switch in product code. `renderMotionMd` throws on `gsap fallback` and on `@theatre/studio` | PRESENT | `packages/engine/src/spec/motion.ts` |
| Research and v1 still tell a reader to keep a MIT fallback and to avoid Theatre | PARTIAL | `context/research/00-SUMMARY.md`, `context/research/06-library-stack.md`, `CONTEXT-PACKAGE.md` near the GSAP licence paragraphs. [v2 §15](../CONTEXT-PACKAGE.v2.md) and [v2 §21](../CONTEXT-PACKAGE.v2.md). Fix [002](002-research-mit-fallback.md). This pass did not add a fallback project. |
| Generated pages import only the chosen effects | PRESENT | `packages/templates/astro-default/src/pages/index.astro` imports none of the toolkit. Effect modules are per-effect. |
| One scroll owner. Lenis+ScrollTrigger or CSS `animation-timeline`, not both | PRESENT | `packages/templates/` `motion-contract.ts` refuses both. `packages/engine/src/spec/motion.ts` coexistence list. |
| One ticker (`gsap.ticker`), one WebGL context, one timeline owner per element | PRESENT | `packages/engine/src/spec/motion.ts` and `packages/templates/` `shared/motion.ts` (`wireLenis`, `registerEffect`) |
| `prefers-reduced-motion` and a calm phone path at level 6 and above | PRESENT | Same motion spec lines: Lenis off, no scrub, no autoplay, content visible. "Effects at level 6 and above keep a calm phone path." |
| Touch targets ≥ 44 px, fluid type, phone widths | PRESENT | Measured on the live desk. See UI. |
| No page in the starter imports every library | PRESENT | `packages/templates/astro-default/` |

## v2 §18 Commands

| Requirement | Status | Path |
|---|---|---|
| The 22 commands exist as skills with `user-invocable: true` | PRESENT | `packages/grok-plugin/skills/hh-new` through `hh-help`, plus `guide-persona` |
| Deploy and other side effects set `disable-model-invocation: true` | PRESENT | `packages/grok-plugin/skills/hh-so-long/SKILL.md` and the matching side-effect skills |
| `/hh-doctor` probes session-id shape and does not treat a slug as a legal `--session-id` | PRESENT | `packages/cli/src/doctor.ts`, `packages/cli/src/session-probe.ts`. This machine classified `uuid`. |
| `/hh-doctor` probes auth | **MISSING** | `doctor()` checks node, git, `grok --version`, `grok --help`, and optional playwright / whisper / pdftotext. The word `auth` does not appear. Exit 1 only when node is older than 22. [v2 §18](../CONTEXT-PACKAGE.v2.md). Fix [007](007-doctor-auth-probe.md). This pass did not run `grok login`. |
| Fourteen skills have no matching `hh` subcommand and point at `/hh-help` | Note, not a §18 miss | Review 151. §18 names skills. The short CLI help string in `packages/cli/src/main.ts` is `hh doctor [--project <dir>]`. Other subcommands live under `packages/cli/src/commands/`. |

## v2 §19 Repo shape

| Requirement | Status | Path |
|---|---|---|
| Packages: engine, orchestrator, grok-plugin, app, cli, voice, crawler, assets, qa, deploy, knowledge, templates | PRESENT | `packages/` |
| `interview/tree.yaml` with DP-0.1 through DP-9.5 and depth tags on primary questions | PRESENT | `interview/tree.yaml`. Follow-ups are nested `{id, ask}` and ride the parent depth. |
| `evals/towel-and-tea/` fictional fixture. Aura Homes is not required | PRESENT | `evals/towel-and-tea/` |
| MIT license, NOTICE, secrets in the keychain or `.env.local` | PRESENT | `LICENSE`, `NOTICE`, `packages/qa/src/secrets.ts` |
| `.planning/` is not the Guide state directory | PRESENT | `scaffoldProject` throws if a template mentions `.planning`. Home index is `os.homedir()` plus `.hitchhiker/index.json` (`packages/engine/src/home-index.ts`). |
| Licence audit accepts the seven permissive identifiers, plus the named sharp exception | PARTIAL | `auditDeps` in `packages/qa/src/licenses.ts` allows `Apache-2.0 AND LGPL-3.0-or-later` only when the name starts with `@img/sharp-`. A lone LGPL fails. NOTICE names the exception. The audit in this pass returned ok. [v2 §19](../CONTEXT-PACKAGE.v2.md). Fix [005](005-sharp-lgpl-and.md). Sharp was not removed. |
| `packages/cli` is the `hh` binary and `pnpm -w exec hh doctor` runs it | PARTIAL | `packages/cli/package.json` declares `"bin": { "hh": "./src/main.ts" }`. Root `node_modules/.bin` has `tsc` and `tsserver` only. On this Windows machine `pnpm -w exec hh doctor` resolved to `hh.exe` (HTML Help) and printed nothing. The program itself runs: `node --experimental-strip-types packages/cli/src/main.ts doctor` exited 0. [v2 §19](../CONTEXT-PACKAGE.v2.md). Fix [010](010-hh-bin-on-windows.md). The command name was not renamed. |

## Matt Q1–Q40

| Q | Answer in force | Status | Path |
|---|---|---|---|
| Q1 | All three audiences, in-depth interview | PRESENT | `interview/tree.yaml` depth tags, `packages/app` default depth deep |
| Q2 | Command set plus a simple app. User speaks, Guide replies in text (Q8 and Q31 win over an early TTS reading) | PRESENT | `packages/grok-plugin/skills/`, `packages/app/`, `packages/voice/` |
| Q3 | Runs on the user's Grok login. API key is the other door. Imagine billing vs SuperGrok stays the unverified risk in v2 §21 item 1 | PRESENT | `packages/orchestrator/src/acp.ts`. No billing invention in this pass. |
| Q4 | Free and open source | PRESENT | `LICENSE` MIT |
| Q5 | Product name is The Hitchhiker's Guide to Web Design. The Oct 5 answer file still shows the shortlist | PRESENT | App chrome, package metadata, this plan. The shortlist line was not reopened. |
| Q6 | Ask experience. Simple in, technical out | PRESENT | DP-0.2, DP-0.3, DP-0.4 |
| Q7 | Save and resume, show progress | PARTIAL | Home index and the Guide map are present. Fresh scaffold vs `loadState` is fix 003. |
| Q8 | Funny, artsy, pushes back. Text replies. No TTS | PRESENT | `packages/grok-plugin/skills/guide-persona/SKILL.md` |
| Q9 | Suggest for me. Real example sites for taste | PRESENT | Desk button. DP-5.2 guided walk. |
| Q10 | User approves PRD, context, and prompts | PRESENT | Phase gates in the engine spec writers |
| Q11 | Skip with assets. Always ask "happy with this?" | PARTIAL | Interview skip and suggest exist. Live `/brand` does not persist Approve. Fix 006. |
| Q12 | Logo via Imagine, SVG, full mini brand kit unless they brought one | PRESENT | `packages/assets/`, Babel Fish skills |
| Q13 | Build a Brand, every step skippable, upload a guide | PRESENT | `interview/tree.yaml` module 1, `hh-import` |
| Q14 | Upscale weak images. Weights not committed | PRESENT | D-007, assets pipeline |
| Q15 | Voice guide, approve or reject, later refinement | PRESENT | `VOICE.md` writers, Elevate |
| Q16 | Many site types, KPIs, sales-psychology pack | PRESENT | DP-2.3 through DP-2.5, `packages/knowledge/packs/` |
| Q17 | Motion 1–10, families described, examples | PRESENT | DP-6.1, DP-6.2, motion pack |
| Q18 | Highest phone standard, plus SEO and an offered blog | PRESENT | §12 phone gate, DP-4.3, DP-8.3 |
| Q19 | CC0 GLBs, plus Tripo and Meshy with a cost preview | PRESENT | `packages/assets/src/three-d/` |
| Q20 | Imagine on the user's account, comfort spend, DIY prompts | PRESENT | DP-7.1, `hh-assets` |
| Q21 | Grok picks the stack, explains, user can override | PRESENT | Deep Thought stack record |
| Q22 | Hostinger first, then Vercel, Netlify, Cloudflare, plus instructions | PRESENT | `packages/deploy/` |
| Q23 | Contact, newsletter, Stripe, booking, blog, analytics, and discovery for specials | PRESENT | Knowledge packs and the feature questions DP-3.1 through DP-3.9 |
| Q24 | X is optional and read-only in v1 | PRESENT | DP-0.6. Posting stays out (Q-E). |
| Q25 | Local through Grok Build. Model selectable. High effort for the build | PRESENT | Orchestrator runner, `hh-settings` skill |
| Q26 | Six named phases, long interview, follow-ups between phases | PRESENT | `hh-build-plan/ROADMAP.md`, `interview/tree.yaml` |
| Q27/28 | Reviewer auto-fixes with desktop and mobile shots. Watchdog fixes immediately | PRESENT | Zaphod and Marvin. Default recorded in `context/matt-answers.md`. |
| Q29 | GSD-shaped spec files plus BRAND, VOICE, MOTION, PRD, and a dashboard | PRESENT | Engine spec writers, `/hh-dashboard` |
| Q30 | Gates, then a repeatable Elevate loop | PRESENT | `packages/qa/`, `hh-elevate` |
| Q31 | Push-to-talk the whole way. Most cost-effective wins. Local default | PRESENT | `packages/voice/`. The missing screen is the §4 row, not a second voice engine. |
| Q32 | PDFs, screenshots, URLs, images, boards, competitors | PRESENT | `packages/crawler/`, interview inputs |
| Q33 | Progress, then a reveal | PRESENT | Guide map and `packages/app/src/reveals/` |
| Q34 | Don't Panic energy. Not AntiHero. Not about Matt | PRESENT | Tokens, shell, and the four shots. Not a generic screen. |
| Q35 | The six phase names | PRESENT | Guide map labels match `hh-build-plan/CONTEXT-PACKAGE.v2.md` §5.1 |
| Q36 | Independent tool. Pull useful AntiHero material with credit | PRESENT | D-005, `context/sources/` |
| Q37 | Knowledge packs listed by Matt | PRESENT | `packages/knowledge/packs/` |
| Q38 | Miro screenshots are the interview skeleton | PRESENT | Miro table below. `context/miro/` |
| Q39 | Steward context, critique, prompts, fresh sessions, this once-over | PRESENT | `hh-build-plan/prompts/`, `hh-build-plan/reviews/`, this report |
| Q40 | 50–150 site prompts, six phases, effort per prompt | PRESENT | Deep Thought prompt generator |

## Miro boxes

Source: `context/miro/*.png` and `CONTEXT-PACKAGE.md` §8.1. Board spelling stays on the board. The tree asks the same questions in Guide copy.

| Board box | Status | Path |
|---|---|---|
| 1.1 Logo, happy, suggestions | PRESENT | DP-1.1, DP-1.1a, DP-1.1b |
| 1.2 Color preferences | PRESENT | DP-1.2 |
| 1.3 Slogans | PRESENT | DP-1.3, DP-1.3a |
| 1.4 Mood images, why, emotion | PRESENT | DP-1.4 |
| 1.5 Font, screenshots or examples | PRESENT | DP-1.5, DP-1.5a |
| 1.5 Brand voice, person or animal, 5 to 10 brands | PRESENT | DP-1.6, DP-1.6a |
| 1.6 The why, Golden Circle | PRESENT | DP-1.7, DP-1.7a, DP-1.7-finder |
| 1.7 Kindred brands and unrelated loves | PRESENT | DP-1.8 |
| 2 Why this website / hope / KPIs / help figuring it out | PRESENT | DP-2.1, DP-2.2, DP-2.4 |
| 2 Email intake | PRESENT | DP-3.1 |
| 2 Sell products, and help choosing tools | PRESENT | DP-3.2 |
| 2 Other features, including unusual tooling | PRESENT | DP-3.7 |
| 2 Video, media, portfolios | PRESENT | DP-3.6 |
| 2 Competitors, input their sites | PRESENT | DP-4.1 |
| 3 Prompt 01 topics 1–10 (goal, visitor, offer, pages, vibe, references, existing assets, protected, motion 1–10, limits) | PRESENT | DP-2.1, DP-2.2, DP-2.6, DP-2.7, DP-2.8, DP-5.1, DP-1.9, DP-6.2, DP-9.1 through DP-9.5 |
| 3 Sites you like, or a guided walk of aura.build, Godly, Awwwards | PRESENT | DP-5.1, DP-5.2 |

## Hunt list from the prompt

| Hunt | Result |
|---|---|
| MIT-fallback switch in product code | Absent. Research text remains. Fix 002. |
| Comment that deletes the Theatre integration | Absent. Theatre core stays in the motion spec and the recipes. |
| Import of `@theatre/studio` | Absent. |
| Two scroll owners on one page | The contract refuses the pair. No starter page imports both. |
| Secret in the tree | `scanText` from `packages/qa/src/secrets.ts` matched fixture strings in tests, prompt 154, and review 115. No live key. Those fixtures were left in place. gitleaks is the CI linux job in `.github/workflows/audit.yml` and was not run on this Windows machine. |
| GPL or AGPL dependency | `auditDeps` returned `ok: true`, 331 packages, `problems: []`. The sharp rows pass only through the name-bound LGPL exception. Fix 005. |
| UI that fails the anti-slop rulebook | The desk does not. See shots. |
| Gate that cannot run | `tsc -b` could not, before fix 001. It can now. |
| Deploy path that fires without a yes | Absent. `deploy()` in `packages/deploy/src/cli-run.ts` returns `{ declined: true }` unless `yes()` is exactly `true`, before spawn, MCP, API, or `DEPLOYS.md`. Host adapters throw when `approved !== true`. |

## UI

The companion was opened on `http://127.0.0.1:4721/` against a temp project. Port 4173 was already taken by another process and was left alone. The server started for this pass was stopped after the shots.

| Shot | What it shows |
|---|---|
| [shots/desk-1440.png](shots/desk-1440.png) | Cream editorial desk, rust rule, DON'T PANIC, DP-0.1, six-phase map. |
| [shots/desk-375.png](shots/desk-375.png) | Answer "This site is for me." saved. Advanced to DP-0.2. Buttons stack. Calm line: "The Guide is quiet for a moment. The question below is the one from the tree. Your place on this machine is saved." That line is the designed live fallback. Console on the 1440 submit was 0 errors and 0 warnings. `scrollWidth` equalled `clientWidth` at 375. |
| [shots/drive-1440.png](shots/drive-1440.png) | Title Drive. Kicker `/hh-dashboard`. "Not xAI's agent dashboard." Empty queue, Marvin, Zaphod, Lighthouse, cost. Approve, Elevate, and Deploy say they open the approval gate and do not open a model session. |
| [shots/drive-375.png](shots/drive-375.png) | Same desk. Deploy wraps to its own row. No horizontal overflow. Pause, Approve, Elevate, Deploy, and Night desk measured 44 px tall. |
| [shots/brand-375.png](shots/brand-375.png) | Designed empty plate: "The kit is not printed yet." Approve buttons are not on this plate. That is fix 006, not an unstyled screen. |

Q34 is PRESENT.

## Verification

Commands from the prompt, this session:

| Command | Exit | Evidence |
|---|---|---|
| `Test-Path hh-build-plan/once-over/REPORT.md` | True (shell exit 0) | This file. |
| `pnpm -w test` | 0 | Confirmation run this session, 104.74 s. Root script `"test": "pnpm -r test"` is wired. Scope 12 of 13 workspace projects. `packages/qa` 225 pass, 0 fail, `duration_ms` 86195.7967. |
| `pnpm -w exec hh doctor` | Did not finish. Stopped. | Resolved to Windows `hh.exe` with command line `hh doctor`. No doctor lines. See the §19 row and fix 010. |
| `node --experimental-strip-types packages/cli/src/main.ts doctor` | 0 | The doctor program, no `--project`, so nothing was written under the repo `.hitchhiker/`. Output below. |

Doctor output from the node entry, exit 0:

```
node: 24.13.1 ok
git: ok
grok: grok 1.0.46 (2765805b9442) [stable]
session-id: uuid
effort: present
whisper: not installed
pdftotext: not installed
```

Playwright was found, so it is absent from the warning list. Whisper missing is a warning. The binary is not bundled. That is not a code miss.

Earlier in the same once-over, before this report file existed:

- `pnpm -w test` exit 0, about 223 s, same 225/225 qa result.
- `pnpm --filter @hitchhiker/deploy test` exit 0, 121 pass, including the new title test.
- `pnpm exec tsc -b --pretty false` exit 0.
- `auditDeps` over `pnpm licenses list --json` exit 0: `{"ok":true,"count":331,"problems":[]}`.
- The same doctor entry with `--project` pointed at a temp directory also exited 0 and wrote session mode only there.

## Fix prompts

1. [001-post-check-title.md](001-post-check-title.md) — applied.
2. [002-research-mit-fallback.md](002-research-mit-fallback.md) — strike the withdrawn fallback sentences. Do not add a code switch.
3. [003-scaffold-state-vs-loadstate.md](003-scaffold-state-vs-loadstate.md) — one STATE.md shape so `openInterview` survives a fresh scaffold.
4. [004-credits-json-shapes.md](004-credits-json-shapes.md) — one parser, both writers, `CC0` and `CC0-1.0`.
5. [005-sharp-lgpl-and.md](005-sharp-lgpl-and.md) — keep the name-bound exception documented, or replace sharp later. Do not widen it here.
6. [006-brand-approval-on-the-desk.md](006-brand-approval-on-the-desk.md) — when a kit file exists, `/brand` renders it and a decision calls `applyStatus`.
7. [007-doctor-auth-probe.md](007-doctor-auth-probe.md) — read `grok --help` for a non-interactive status. Do not run `grok login`.
8. [008-state-lock-filename.md](008-state-lock-filename.md) — one name, in code and in v2 together.
9. [009-stt-rate-on-a-settings-screen.md](009-stt-rate-on-a-settings-screen.md) — show `quoteStt` before xAI STT can be selected. Do not add a route inside this once-over.
10. [010-hh-bin-on-windows.md](010-hh-bin-on-windows.md) — make `pnpm -w exec hh doctor` run the Guide. Do not rename the command. Do not leave it bound to Windows HTML Help.

## Still open on purpose

- v2 §21 item 1, Imagine API versus SuperGrok, stays unverified.
- Trademark is flag-only (v2 §21 item 15).
- `renderPrd` does not call the 011 adapter (review 071). That is a known prompt conflict, not a new surface.
- The before-jump desk default stays a fixed "no contradiction" unless the caller passes `think` (review 137). D-003 does not require a live call on that plate.

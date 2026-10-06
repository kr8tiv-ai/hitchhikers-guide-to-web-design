# Critique of the Master Context Package (v1)

> Written by Grok 4.7 (extra-high) on 2026-10-06, before any app code. This file argues. It does not override Matt Haynes. Locked decisions stay locked. Where this critique disagrees with one, it says so and the spec still follows Matt. Improvements below are applied in `CONTEXT-PACKAGE.v2.md` and marked `[changed]` or `[added]`.
>
> Authority used: `DECISIONS.md` (D-001) beats v1 where they conflict. Matt's 40 answers beat research. Research beats vibes. Anything not verified on 2026-10-06 is labeled unverified in `RESEARCH-ADDENDUM.md`.

## 0. Verdict

v1 is a real product spec, not a mood board. The six phases, the GSD file spine, the fresh-session loop, the brand-as-constitution rule, and the anti-slop rulebook are the right bones. The gap is not "more features." The gap is contradictions the build would trip over, a motion chapter that D-001 has already replaced, and a v1 surface so wide that a naive prompt order would build the logo pipeline before the state file exists.

The plan in this folder keeps the whole product. It sequences it as a walking skeleton: state and interview first, brand second, spec generator third, orchestrator fourth, gates fifth, deploy last. It does not cut the companion app, the dashboard, voice, or Hostinger.

## 1. What is already strong

- **North star is operational.** "Simple questions in, very technical websites out" shows up as a coverage map, Suggest/Skip, and ASSUMED defaults, not as a slogan only.
- **GSD is the right backbone.** Fresh context, file state, `must_haves`, goal-backward verify, deviation rules 1–4, and the package-legitimacy gate are copied from `vendor/gsd-core`, not reinvented. v1 correctly refuses a runtime dependency on gsd-core, which does not list Grok as a host (`context/research/01-opengsd-deep-dive.md`).
- **The Miro boards survived transcription.** Boards 1–3 match the screenshots in `context/miro/`. Prompt 01's ten topics are distributed instead of being asked twice as a second interview. Good.
- **Anti-slop is enforceable.** Banned words, banned layouts, and a static-plus-vision lint are specified. Magnetic buttons are banned by name.
- **Reviewer and watchdog are specified as behavior, not as job titles.** Screenshots at four widths, two fix rounds, three strikes, rollback to `hh-good-*`, Rule 4 escalation.
- **Ownership story is the actual wedge.** Competitors in `context/research/12-competitors.md` go prompt-to-page and keep the hosting. This product keeps the repo.

## 2. Locked decision D-001, applied here

`DECISIONS.md` (2026-10-05) replaces v1 §15.3, §15.4, §21 item 1, and the "MIT fallback" language in `context/research/00-SUMMARY.md` and `06-library-stack.md`.

What changes:

- The app ships and wires **all** of: GSAP (core plus ScrollTrigger, SplitText, and the other plugins that ship in the free package), Three.js, raw WebGL / custom GLSL (OGL or plain WebGL2), Motion (motion.dev, formerly Framer Motion), anime.js, Theatre.js, Lenis, native CSS scroll-driven animations, and vanilla JS.
- The motion picker and the orchestrator choose the tool **per effect**. Generated sites import only the effects they use, so phone budgets still hold.
- GSAP is the base motion engine. There is **no** fallback project.
- Theatre.js is in. v1's "avoid Theatre.js by default" line is withdrawn. Maintenance status and a pin are recorded in the addendum: `@theatre/core@0.7.2` (Apache-2.0, last npm publish 19 May 2024). `@theatre/studio` is AGPL-3.0 and is **not** bundled. That is a licence-compatibility rule for an MIT app and not a reason to drop Theatre.

I do not argue against D-001. Shipping the whole toolkit is what makes the picker honest. A picker that "chooses" among libraries the template cannot import is a menu, not a toolkit.

The part v1 never specified, and that D-001 forces, is **how the libraries coexist**. Without that, the first generated site will run two scroll systems and two WebGL contexts and miss Lighthouse for reasons nobody can see in the spec. Those rules are `[added]` in v2 §15.6 and in the motion knowledge pack prompts:

1. **One scroll owner per scroller.** Lenis drives ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)` on `gsap.ticker`). Native CSS `animation-timeline: scroll()` / `view()` follows the scrollport's real scroll position (MDN). Lenis replaces that scroll. Do not put both on the same scroller. CSS scroll-driven effects get a native-scroll page. Lenis pages use GSAP for scroll-linked motion.
2. **One render loop.** Three.js, Theatre.js (`@theatre/core`), and raw WebGL share `gsap.ticker`. No second `requestAnimationFrame` loop.
3. **One WebGL context per page.** If a Three scene is alive, shader work is a `ShaderMaterial` (or a raw program on that context). OGL or a standalone WebGL2 canvas is for pages that do not already have Three. Two live contexts is a standing performance bug.
4. **One timeline owner per element.** GSAP, Motion, and anime.js do not animate the same property of the same node.
5. **Reduced motion and a calm phone path** exist for every heavy effect, regardless of which library plays it.
6. **Per-effect imports** in generated sites. The app's templates and packs contain every library. The site's graph does not.

## 3. Contradictions

| # | Conflict | Resolution in v2 |
|---|---|---|
| C1 | v1 §12 and Matt Q30: Lighthouse mobile ≥ 90 in every category, including performance. `research/06` mobile table: level 8–10 performance ≥ 70 on the 3D page. | **Answered by Matt (D-006):** Lighthouse is measured on real mobile tests of what a phone actually gets, and all four scores are ≥ 90 on every route. The desktop 3D route has an FPS floor and a weight budget. It is not allowed to be the only route a phone user gets. A site that is beautiful on a desk and a slideshow of jank on a phone fails. |
| C2 | v1 §15.3 levels gate which libraries exist. D-001 says all libraries ship and the picker chooses per effect. | `[changed]` Appetite still caps **weight** (a level-2 brochure does not get a physics world). It does not delete libraries from the toolkit. The picker may use CSS scroll-driven reveals at level 2, or a tiny vanilla JS fade, or GSAP. It may not spend the level-10 budget at level 2. |
| C3 | v1 §11 names sessions `hh-<site>-<NNN>` and passes that to `-s`. `context/sources/xai/cli_reference.md` types `--session-id` as `<UUID>`. `cli_headless-scripting.md` says "a named headless session." | `[changed]` The orchestrator keeps a human alias in `STATE.md` and stores the id the CLI actually returns. `/hh-doctor` probes one named id and one UUID on first run and records which form this CLI build accepts. Prompts must not hard-fail on the alias. |
| C4 | Slice name **Heart of Gold** is both a Babel Fish brand slice and an Improbability Drive hero slice. | `[changed]` Brand keeps Heart of Gold. The build-phase hero slice for generated sites is **Infinite Improbability**. App-build prompts use the names in `ROADMAP.md`. |
| C5 | v1 §9.4 says trace with vtracer and "avoid potrace (GPL)." `research/06` pins `vtracer@1.0.8` ISC. The current VisionCortex project is MIT (repo `LICENSE`, copyright 2024 TSANG) and the Node package is `@visioncortex/vtracer` (MIT OR Apache-2.0), at `1.0.0-alpha.4` as of this research pass. | `[changed]` Logo pipeline uses `@visioncortex/vtracer` (wasm, no native addon) and re-reads the license field at install. Potrace stays out. Alpha status is a pin risk, recorded, not a reason to skip vectorization. |
| C6 | Comfort-spend examples in v1 Module 7 price `video-1.5` at a flat $0.08/s. The xAI price card fetched 2026-10-06 (page dated 2026-09-29) prices `grok-imagine-video-1.5` at $0.08/s at 480p, $0.14/s at 720p, and $0.25/s at 1080p. A "cinematic" tier that assumed 1080p at $0.08/s under-quotes by about 3×. | `[changed]` Every estimate names model, resolution, and seconds. The cap is on dollars, not on clip count. |
| C7 | v1 says the interviewer never says "elevate" (banned word) and the product feature is named Elevate. | `[added]` The linter exempts the product name, the command `/hh-elevate`, and headings in the app chrome. It does not exempt the word inside generated site copy. |
| C8 | `research/01` suggests `.site/` as the state dir. v1 standardizes `.hitchhiker/`. | Keep `.hitchhiker/`. One name. The research note is historical. |
| C9 | v1 §20 illustrates API cost at $10–20 for 100 site prompts. That arithmetic uses short-context rates and a 75% cache-hit assumption. It is not a quote. | `[changed]` Labeled as an illustration only. The app shows prompt counts and time on subscription mode, and a measured estimate on API-key mode after the eval harness has real token counts. No UI may present $10–20 as a price. |

## 4. What is missing

- **Coexistence rules** for the motion toolkit (see §2). This is the biggest hole once D-001 is applied.
- **A required-field minimum.** "Everything is skippable" plus "the Site Brief must contain goal, visitor, offer, vibe, references, motion, limits" can both be true only if Skip writes an ASSUMED value and the approval screen shows it in a different color. v1 implies this. v2 states the minimum set that cannot be blank: one sentence why-the-site-exists, one visitor, one action, vibe plus anti-vibe, motion level, hosting answer or "no idea."
- **Interview depth modes.** v1 mentions a condensed agency mode and then specifies one enormous tree for everyone. A beginner who needs terms explained and a developer who already has a brand guide should not walk the same number of turns. See §6.
- **Windows.** The steward's machine is Windows. v1's ingestion examples are `pdftotext` and a Unix-shaped whisper build. The app must run on Windows, macOS, and Linux: `node:path`, no hardcoded `/`, whisper.cpp binaries per OS, PDF via `pdfjs-dist` (Apache-2.0) so Poppler is not required.
- **A lock around `STATE.md`.** Two surfaces (CLI and the local app) will write it. GSD already treats state writes as lockfile-protected. Copy that.
- **A dogfood brand that exists.** Aura Homes and "Cozy Lake Cabin" are not in this repo. Evals cannot wait on them. Ship a fictional fixture, **Towel & Tea**, a small tea company, with a frozen interview transcript and expected Site Brief fields. Ask Matt for the real packages later.
- **Agency workspace index.** v1 promises multiple client projects and never names the directory. Add `~/ .hitchhiker/index.json` (path via `os.homedir()`) pointing at project folders. Each project still owns its `.hitchhiker/`.
- **First-look fast path.** `research/12` is honest: Durable and v0 show something in seconds. Our north star is a long meeting. We still owe a visible artifact early: after mood images or Suggest, Babel Fish can render a one-screen direction board (palette, type, one headline) before the full brand brain. It is a preview, not a site, and it is marked provisional.
- **Theatre in the generated-site runtime without the studio.** Authoring a cinematic timeline needs a state file (`theatre-state.json`) checked in. The studio is a design-time optional the user may install themselves. The build prompts for sites read the state file and play it with `@theatre/core` on `gsap.ticker`.
- **`@theatre/r3f` vs Three r186.** Theatre's own release notes for 0.7.0 require `three >= 0.155` and `@react-three/fiber >= 8.13.6`. Our planning pin is Three 0.186 and R3F 9. "Greater than or equal" is not a test. The stack prompt must smoke-test the bridge and, if it breaks, animate Three objects from `@theatre/core` values directly. Do not pretend the bridge is fine.
- **Pinterest.** No reliable public API (v1 already says this). Live scrolling a board is brittle and may conflict with Pinterest's terms, which this pass did not retrieve. Default path: user exports or screenshots. A Playwright capture is best-effort, off by default, rate-limited.
- **Godly has no documented public API** found this pass. Filtered pages such as `https://godly.website/websites/webgl` render server-side titles (verified by fetch on 2026-10-06) but that is not a license to crawl the catalog. Ship a curated offline shortlist. Live refresh is optional, cached, and slow.
- **Hostinger has two deploy shapes now.** Static output (Astro `dist/`) deploys as pre-built files. Node apps upload an archive without `node_modules` and build on Hostinger (50 MB cap stated in the Connector docs). The adapter must pick the shape from the stack decision, not assume one MCP call.
- **Secrets.** One audited client, OS keychain or `.env.local`, never the repo. Say it in the engine, not only in the repo principles.
- **Persona guardrail.** "A bit autistic" is a locked tone note from Matt. The safe implementation is precision, pattern-noticing, and lists. The Guide never uses autism as a joke, never diagnoses the user, and never performs a stereotype. Put that in the persona prompt as a hard rule.

## 5. What is over-engineered (and what we will not cut)

The following are real, and they are why the prompt order matters. None of them are deleted, because Matt asked for them.

- Companion app **and** CLI **and** dashboard **and** a full Grok plugin.
- whisper.cpp **and** xAI STT.
- Imagine API **and** DIY mode **and** Tripo/Meshy **and** four deploy targets.
- Thirteen knowledge packs.
- Real-ESRGAN local upscale.

The over-build failure mode is a prompt that "creates the app" in one step. The cure is one job per prompt and a dependency order that leaves a runnable `/hh-doctor` and a save/resume interview before any pixel of the brand reveal.

Deferred on purpose, already marked v2 in v1, kept deferred:

- X posting.
- Cloud runner.
- Parallel worktree builds (flag only, default off).
- Shopify as a full store (escalate as Rule 4).
- Keystatic/Sanity as the default CMS (content collections first).

Not deferred: the motion toolkit. D-001 says the libraries ship in v1 of the app.

## 6. Interview length by user level

The full tree (modules 0–9, plus an optional 12-question Why Finder, plus a 10-site gallery walk) is a two-hour meeting if every branch is walked aloud. That matches the north star for a beginner who wants to be walked through it. It is too long as the only gear.

| Mode | Who | What changes | What does not change |
|---|---|---|---|
| **Express** | Developer, or anyone who asks for speed after module 0 | Terse prompts. No glossary unless they ask. Gallery walk is 4 sites, not 10, unless they say they are stuck. Why Finder deferred to Babel Fish. Trivial yes/no features batched only here, and only the ones in module 3. | One question at a time for anything that is taste, motion, or positioning. Pushback still fires on "modern" and "everyone." Skip still writes ASSUMED. |
| **Standard** | Shorter walk on request. | The tree as written. Glossary on first use. Suggest offers 2 Godly + 2 Awwwards when taste is empty. | Approval of the Site Brief. |
| **Deep** | **Default and recommended** (Matt asked for a long interview). | Why Finder runs inside Don't Panic. Mood images get the per-image "why" up to 5. Gallery walk continues until 3–5 loved sites have a reason each. | Still skippable per question. |

Agency import: a brand guide, a brief, or a prior site fills fields and the Guide asks "happy with this?" per filled field, then only the gaps. That path was in v1. v2 adds the rule that imported fields are `IMPORTED`, not `ASSUMED`, until the user rejects one.

Rough turn budgets the engine should show up front, as ranges, not promises: Express 25–40 questions, Standard 50–80, Deep 80–120. The Guide map is the relief valve. Time-on-screen is not a gate.

## 7. Does the phase / slice / tier model hold?

**Yes.** Phase → Slice → Prompt matches how the work actually layers, and it maps cleanly onto GSD's phase → plan → task if a later tool wants to parse it. GSD's milestone sits above the six phases: one site is one milestone.

What holds:

- Exit gates are observable (approved brief, approved brand, approved prompt list, no BLOCKER, gates green, live URL healthy).
- Tiers map to effort without pretending effort is a personality. Towel/Cup of Tea → `medium`. Gargle Blaster → `high`. Heart of Gold → `high` or `xhigh`. Forty-Two → `xhigh`.
- "Before we jump" at phase start is the right place for contradictions. It must be generated from files, capped at 3–8 questions, and skippable. It is not a second full interview.

What was weak, now fixed in the roadmap:

- Duplicate slice names (C4).
- Improbability Drive slices in v1 are **site** slices (hero, sections, 3D). The **app** build needs its own slice names (Eddie, Marvin, Zaphod, Vogon Constructor Fleet). Both catalogs exist. They must not share ids.
- A reviewer every 3 prompts is a fresh session, not a paragraph at the bottom of the third prompt only. v2 keeps the in-prompt `REVIEW CHECKPOINT` block (so a builder who reaches 003 knows a review is due) **and** a separate checkpoint prompt the steward runs in a fresh session. Auto-fix policy: the reviewer may write and run at most 2 fix prompts; it may not start the next feature.

Tiers are for **routing**, not for skipping tests. A Towel prompt still has a test.

## 8. Risks Matt has not been shown, or that v1 underweights

1. **Two WebGL contexts and two scroll owners** will burn the performance gate even when every individual effect is "correct." Coexistence rules are the mitigation. This is a build risk, not a license risk.
2. **Theatre.js is stale and split-licensed.** Core is safe to ship (Apache-2.0). Studio is AGPL and stays out. The public GitHub README says 1.0 work moved to a private repo "temporarily." Pin `0.7.2`. Do not track `@latest`.
3. **Real-ESRGAN upscaling is on (Matt, D-007).** Weights are downloaded at first use, checksum-verified, and not committed to the repo.
4. **Hooks fail open.** Confirmed in `context/sources/xai/features_hooks.md`: exit 0 allows, exit 2 denies, everything else proceeds. A PreToolUse guard is not a sandbox. The orchestrator re-checks git status, protected paths, and the deny list after every prompt.
5. **`--always-approve` plus a network** is a supply-chain footgun. Pair it with `--sandbox` and deny rules for `git push`, deploy commands, and package installs that fail the legitimacy gate.
6. **Imagine and STT bill an API account.** Official pricing is a different page from Grok Build. A 2026-09-25 third-party pricing guide states that SuperGrok does not replace metered API billing. This pass did not open the SuperGrok checkout page itself, so the plan designs for both: API key with a cap, and DIY prompts. DIY is the path that spends the user's Grok app allowance instead of console credits.
7. **Video price cliffs.** 1080p `video-1.5` at $0.25/s is $2.50 for 10 seconds before retries. The comfort-spend UI must show that before the batch, not after.
8. **Trademark.** The name is locked. Phase names are short references. Do not ship book quotes, chapter text, or lookalike cover art. A name check before a public launch is a flag, not a rename.
9. **Matt's guides are AntiHero's.** The app is independent. Matt answered Q-A: his prompts may be used word for word with credit, and his guide PDFs stay in the repo (D-005).
10. **Crawling award galleries** can look like the product is redistributing their catalogs. Store links, short "what to steal (thinking)" notes, and screenshots the user asked for. Prefer the shipped shortlist.
11. **Visual baselines are environment-locked.** Playwright's own docs say screenshots must be compared in the environment that produced them. The gate compares against baselines from this machine's last PASS, not against a committed macOS baseline on a Windows CI run, unless the CI job pins the browser build.
12. **Session-id shape** (C3) can stall the orchestrator on day one if the prompt assumes a slug and the CLI wants a UUID.
13. **Alpha vtracer.** The wasm package works without a native build, which is what we want on Windows, and it is still alpha. Pin the version. Golden-test one known PNG→SVG so a bad upgrade fails CI.
14. **Content fabrication.** The anti-slop rules ban invented testimonials. The same rule must bind the Guide when it "suggests" proof. Suggest may draft structure. It may not invent a customer.



## 9. Open questions for Matt

These do not block the plan. Defaults are what the prompts will build.

| # | Question | Default if unanswered |
|---|---|---|
| Q-A | May the repo include any of your AntiHero prompts verbatim? | **Answered by Matt (2026-10-06, D-005):** yes. His AntiHero prompts may be used word for word, with credit in README, NOTICE, and the file itself. His guide PDFs stay in the repo. |
| Q-B | Can you drop the Aura Homes prompt package, and the URL for "Cozy Lake Cabin"? | Evals use the fictional Towel & Tea fixture until you do. |
| Q-C | Repo name | **Answered:** `github.com/kr8tiv-ai/hitchhikers-guide-to-web-design`, public, MIT. Fix every mention. |
| Q-D | Comfort with the locked title as an affectionate homage, given the books are trademark-sensitive? | Name stays. No book text, no cover pastiche. Flag only, per v1 §21. |
| Q-E | Keep X posting in v2? | Yes. v1 is read-only, and only if the user connects an app. |
| Q-F | Ship `@theatre/studio` (AGPL) anywhere? | No. `@theatre/core@0.7.2` only. |
| Q-G | Are the revised Imagine comfort tiers in v2 (resolution-explicit) acceptable? | Yes. Resolution-explicit tiers from the 2026-09-29 card, full model ids, dollar cap, per-batch confirm. |

## 10. Improvement list (applied in v2)

Each item has an id. v2 headings that implement one cite the id.

| ID | Change |
|---|---|
| IMP-01 | Replace §15.3–15.4 and §21.1 with the D-001 toolkit, picker, and coexistence rules. Delete MIT-fallback work. |
| IMP-02 | Record Theatre pin, AGPL studio exclusion, and the Three r186 bridge test. |
| IMP-03 | Split the Lighthouse gate: phone path ≥ 90 performance; desktop 3D has its own FPS and weight budget. |
| IMP-04 | Add Express / Standard / Deep interview modes and a required-field minimum. |
| IMP-05 | Add Windows/macOS/Linux as a requirement. PDF via pdfjs. Paths via Node. |
| IMP-06 | Add a state-file lock and a home-directory project index. |
| IMP-07 | Rename the build-phase hero slice to Infinite Improbability. |
| IMP-08 | Add the Towel & Tea eval fixture. Do not block on Aura Homes. |
| IMP-09 | Correct the logo tracer pin to `@visioncortex/vtracer`. Keep potrace out. |
| IMP-10 | Recompute Imagine estimates with the 2026-09-29 price card. Name resolution. |
| IMP-11 | Session alias + CLI-returned id. Doctor probes both. |
| IMP-12 | Pinterest capture off by default. Godly/Awwwards live fetch optional, curated pack is the default. |
| IMP-13 | Hostinger adapter chooses static output vs Node build from the stack record. |
| IMP-14 | Persona guardrail for the neurodivergent tone note. |
| IMP-15 | Linter exemption for the Elevate product name only. |
| IMP-16 | First-look direction board as a provisional Babel Fish preview. |
| IMP-17 | Cost figure in §20 demoted to an illustration. |
| IMP-18 | Real-ESRGAN upscaling on; weights downloaded at first use, not vendored (D-007). |
| IMP-19 | Walking-skeleton prompt order. One job per prompt. Reviewer is a fresh session every 3 build prompts, plus a final xhigh once-over. |
| IMP-20 | Knowledge packs and stack-usage skills gain recipes for Motion, anime.js, Theatre core, OGL/WebGL2, CSS scroll-driven animations, and vanilla JS, beside GSAP and Three. |
| IMP-21 | Fast path does not skip approval of the Site Brief, the brand kit, or the prompt list. |

## 11. What this critique refuses to do

- It does not rename the product, the phases, or the effort model.
- It does not turn the tool into a hosted site builder.
- It does not plan a GSAP replacement.
- It does not start the app, a repo, a deploy, or a push.

## 12. Matt's decisions on the steward review (2026-10-06, 6 AM America/Costa_Rica)

Recorded in DECISIONS.md as D-002 to D-008. They override anything above.

- D-002: apply every fix in the steward review (PATCHES §A to §F) and the 22 new prompts; repo is `kr8tiv-ai/hitchhikers-guide-to-web-design` everywhere.
- D-003: real Grok calls in the interview, brand modules, reviewer, and Elevate; an agency-grade Don't Panic design system for the app; real integrations.
- D-004: Express, Standard, and Deep modes; Deep is the default and recommended; shorter modes drop no questions (they defer or Suggest them). Pushback holds twice on vague answers.
- D-005: Matt's AntiHero prompts may be used word for word with credit. His guide PDFs stay in the repo.
- D-006: Lighthouse is measured on real mobile tests; all four scores at least 90.
- D-007: image upscaling stays on (Real-ESRGAN or similar); weights are downloaded at first use, not committed.
- D-008: locked motion toolkit: GSAP (base), Three.js, raw WebGL/GLSL, Motion, anime.js, Theatre.js (core only), Lenis, CSS scroll-driven animations, vanilla JS, chosen per effect.

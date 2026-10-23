# Hitchhiker's Guide to Web Design: full code review

- Repo: github.com/kr8tiv-ai/hitchhikers-guide-to-web-design, `main` @ `d529dde5` (2026-10-23 13:34 Costa Rica time, "249h: bump next-app starter…"), 562 commits.
- Method: I made an anonymous public clone on the review box and ran everything there. Matt's PC was not touched. Nothing was committed or pushed.
- Toolchain: Node 22.23.4 and pnpm 10.32.1, with `HH_CASSETTE=replay` as in CI.
- Working tree after install: `packages/cli/src/main.ts` shows mode 100644 → 100755. `pnpm install` makes that change through the bin chmod. It is not an edit.

## 0. Bottom line

**Does it work end to end? The desk half works. The site half could not be shown working.**
- **Desk half: yes.** Interview → brief → approval → plan → design stages → build queue is real code and runs.
- **Site half: not proven.** Turning that queue into a site depends 100% on the external `grok` CLI running model `grok-4.7-build-fast`.
  - The box has no `grok` on PATH.
  - The repo has **no test that runs a real build**.
  - The orchestrator "golden path" fakes both the model and the HTML.
- **Where it broke in my real walk:** queue item 001 "Guide Entry" failed with `grok is not on PATH. Run hh doctor.` The project folder then held only `DESIGN.md`, `src/data/brand.ts` and `src/scripts/motion.ts`. No site was generated.

## 1. What I ran

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ok |
| Typecheck | `pnpm exec tsc -b` | **EXIT 0** |
| Lint | `pnpm lint` (= `pnpm -r run --if-present lint`) | EXIT 0, but a **no-op**: no package has a `lint` script, and `eslint.config.js` holds a single `no-restricted-imports` rule |
| Tests | `HH_CASSETTE=replay pnpm -r --no-bail test` | **2906 tests: 2900 pass, 0 fail, 6 skip** |
| Build | `packages/cli: node build.mjs` | EXIT 0 → `dist/main.js` (1,353,550 bytes). `--help` lists 17 commands |
| Pack smoke | `pack-243.test.ts` (the CI pack job) | 1/1 pass |
| `hh doctor` | on the box | `grok` not on PATH. The Playwright lines contradict each other: "playwright: not installed" next to "Chromium and WebKit are installed" |
| Real engine walk | own harness, real engine code, model offline | see §2 |

Tests per package:

| Package | Pass / total | Skipped |
|---|---|---|
| engine | 1016/1018 | 2 |
| qa | 447 | – |
| app | 426 | – |
| orchestrator | 270 | – |
| cli | 164/166 | 2 (git / Windows-only) |
| deploy | 164 | – |
| assets | 130/131 | 1 (live Imagine) |
| crawler | 80 | – |
| knowledge | 77 | – |
| voice | 59 | – |
| templates | 57 | – |
| grok-plugin | 8/9 | 1 |

## 2. End-to-end pipeline trace

### Real walk, step by step

I drove the real engine through a harness kept outside the repo (`/tmp/hh-e2e/walk.ts`, `build.ts`), using the towel sample.

1. **Interview.** 60 questions answered.
   - Desk routes: `app/src/server/routes.ts:1050` (`/api/answer|suggest|skip`) and `:1493`.
   - Turn logic: `engine/src/guide/live-turn.ts:131 runTurn`.
   - **Real.** Model turns go through `engine/src/ai/think.ts:311` → `grok-cli.ts:584 spawnGrok`.
2. **Brief draft.**
   - `routes.ts:2117` → `engine/src/guide/brief-desk.ts:219 draftSiteBrief` → `brief-loop.ts:165 briefLoop` → `:215 draftOrFallback`.
   - **Real.** When the model fails, it falls back to the deterministic `brief-loop.ts:546 deterministicBrief`.
   - Walk result: status `pending`, `fallback: true`, `BRIEF_DRAFT_ERROR` (the model was offline).
3. **Approve brief.**
   - `routes.ts:2129` → `brief-desk.ts:399 approveSiteBrief`.
   - With `confirmFallback` the status became `approved`. The approval view rendered 12,562 chars in 22 sections.
4. **Approve plan.**
   - `brief-desk.ts:389 approveSitePlan` → `site-build.ts:585 draftBriefPlan` / `:632 prepareSiteBuild` → `spec/brief-plan.ts:481 generateBriefPlan`.
   - **Real.** It wrote **46 prompt files** to `.hitchhiker/prompts/`.
   - Prompt 001 is slice "Guide Entry". Each prompt has a `## Design language` block that really includes design-library entries (e.g. Interlude, "Dark luxury grade", GSAP accessibility).
   - `sections/library.html` was written. No `library-error.txt`.
   - **Stack is hard-coded:** `generateBriefPlan(briefMarkdown, "astro", answers)` at `site-build.ts:594` and `:646`.
5. **Design stages.**
   - Sitemap, wireframe, style guide, direction and prebuild ran through `spec/design-stages.ts`.
   - `designReadyForBuild(projectDir, brief)` (`design-stages.ts:123`) returned ok.
6. **Start build.**
   - `brief-desk.ts:379 startSiteBuild` → `:260 startBuild` → `prepareSiteBuild` → `void ensureSiteBuild` (`site-build.ts:759`).
   - It wrote `queue.json` with 46 items.
7. **Build runner.**
   - Installed at `app/src/server/server.ts:229` and `cli/src/commands/context.ts:69` → `site-build.ts:419 installLiveBuildRunner`.
   - That spawns `grok --prompt-file … -m grok-4.7-build-fast --effort xhigh --output-format streaming-json` (`buildSpawnArgs` at `:400`, `BUILD_MODEL` at `:65`).
   - **This is the step that generates the site. All of it is delegated to Grok.** In the walk, item 001 failed with "grok is not on PATH".
8. **QA / Elevate / deploy.** `packages/qa` is large (16,389 src lines) and well tested, but it needs a built site, which I could not produce. Deploy: see §3.

### Failure points on this path

- **F1. Grok is a single point of failure.** Every model call and every build prompt shells out to `grok`.
  - If it is missing, stage 7 fails on item 001.
  - No fallback.
  - No real build test.
- **F2. The repo's "e2e" is a mock.** `packages/orchestrator/src/golden-path.ts`:
  - Its header says "It does not spawn Grok".
  - `fixtureThink` sets every brief field to one constant line.
  - `cassetteBuild` writes a hard-coded `<h1>Mostly Towels</h1>` into `dist/index.html`.
  - It writes fake PNG screenshots and uses `passingRunners()` for the gates.
  - **The 270 orchestrator tests therefore prove the wiring, not that a site gets built.**
- **F3. Silent no-op build.** `ensureSiteBuild` (`site-build.ts:759`) returns `Promise.resolve()` when no runner is installed. `startBuild` also calls it as `void ensureSiteBuild(...)`. A build can "start" and do nothing, with no error.
- **F4. Windows spawn risk.** `installLiveBuildRunner`'s `spawnLive` (`site-build.ts:436`) calls `spawn(command, args)` directly.
  - The model path, `grok-cli.ts:534-549`, wraps `grok.cmd` in `cmd.exe /d /s /c` with per-argument quoting. The build path does not.
  - `cli/src/improve/pnpm-command.ts:23` documents this exact EINVAL failure on win32.
  - If Grok is installed as a `.cmd` shim, the build may fail on Windows. **Not reproduced: inferred from the code.**
- **F5. Stack always Astro.**
  - Prompts say "Create the site … from the chosen stack template" (seen in generated `002.md`, line 219). But `STACK-DECISION.md` is never written at runtime; only the fixture `golden-path.ts:241` writes it.
  - The plan is always generated for `"astro"`, and the prompt never names the starter's path.
  - `deploy` `recommendHost` reads `STACK-DECISION.md`.
  - The Next and Vite starters (`packages/templates/next-app`, `vite-react-world`) ship in the bundle (`cli/build.mjs:35-37`). Only QA (`qa/src/playwright-opener.ts:203`) reads a template, and only `astro-default`.
- **F6. Design-library selection errors are swallowed.** `attachDesignSelection` (`site-build.ts:1893-1960`) ends in `catch { return library; }`. A broken library silently yields an un-art-directed build.

### Desk run 10 crash (step 13 "Guide Entry", `TypeError … reading 'split'`)

**Status: unverified. I found no evidence that it was fixed.**
- No commit message mentions it. The `249a`–`249h` commits are run-10 follow-ups (e.g. `follow-repeat-249d.test.ts` "Desk run 10"), but none names a `split` fix.
- Per the brief, I did not read the run log on Matt's PC.

Candidate sites:
- `packages/engine/src/spec/plan-critique.ts:154`: `brief.split(/\n+/)` with **no guard**.
  - I reproduced exactly this TypeError by calling `designReadyForBuild(dir)` without the brief argument.
  - Current callers (`design-stage-desk.ts:168-187`, `brief-desk.ts:350`) pass a string, so the current code path should not hit it. A future or alternate caller would.
- `packages/app/src/server/brief-page.ts:128`: `source.questionId.split(",")`. Safe today, because `questionId` always comes from `brief-desk.ts:158` `sourceIds.join(", ")`.
- In my real walk, step "Guide Entry" (prompt 001) did **not** throw a split error. It reached the Grok spawn and failed only on the missing binary.

**Recommendation:** add guards plus a regression test, and re-run desk run 11 with real Grok to close this.

## 3. Promised features vs reality

All counts below were counted from files or loaded through the runtime loaders.

| Feature | Claim | Reality (counted) | Read by runtime? |
|---|---|---|---|
| "~2,000-site" design library | 239b plan: "about 2,000 entries … built automatically" | **18 entries** (`knowledge/design-library/entries/*.json`; `index.json` says 18; the runtime loader returns 18). `candidates.json`: 11. `ingest-state.json`: **0 items**. `docs/design-library.md:5` honestly says "18 of about 2,000. Pipeline run count: 0." Also 14 technique notes, 2 section HTML files, 1 snippet. | **Yes.** It appears in the prompt `## Design language` |
| Ingest pipeline | Grok-driven, automatic | Code exists: `knowledge/scripts/ingest-design-library.ts` (40 lines) + `src/ingest-pipeline.ts`. Manual `pnpm --filter @hitchhiker/knowledge run library:ingest`. **Never run** (0 runs). It does not import `@hitchhiker/crawler`, although the plan says to reuse it. | Manual only |
| Reference gallery | Curated references | `galleries/curated.json`: **128 entries** (the runtime `loadGallery` returns 128) | Yes (`guide/suggest.ts:44`, `brand/directions.ts:583`, `live-turn.ts:651`) |
| Golden templates | Templates for sections | 42 `.md` in `knowledge/golden/` | Yes (Design language block) |
| Knowledge packs | Skill packs | 25 pack dirs. Only **12** carry a `checked:` front-matter; 13 do not (a11y, anti-slop, award-sites, brand-frameworks, color, copywriting, example, sales-psychology, seo, stack-next, stack-vite-react, typography, ux-conversion). | Partly. Fresh-pack notes use the checked ones |
| Language pack | Visual language | 11 entries (loader returns 11) | Yes (`spec/language-pack.ts`) |
| Skills | Motion/3D skills | 6 (5 + 1 case study; loader returns 6) | Yes (`spec/skills.ts`) |
| Component/section templates | Templates package | `astro-default`, `next-app`, `vite-react-world`, 10 recipes, `shared/` (19 entries). 177 files in total. | `section-render.ts` (site-build.ts:727) and `templates/shared` (qa review-runners.ts:115) are used. **Starters are not copied by the build**; Grok is told to scaffold. Only Astro is ever planned. |
| Crawler | README:168 "competitors (crawled for you)" | `packages/crawler` is 2,210 src lines with 80 tests. **No runtime import.** The only importer is `knowledge/scripts/validate-gallery.ts:8` (a dev script). | **No** |
| Voice | README:243-246 (browser / whisper / xAI STT) | `packages/voice` is 1,082 lines with 59 tests. **Not imported by the app.** `app/src/client/voice-engine.ts:2` is a "desk copy". An earlier review (`heavy-review-1.md:48`) notes `app/src/ptt.ts` is not called by the desk. | Duplicate copy only |
| Deploy | README:195 "Deploys to Hostinger, Vercel, Netlify or Cloudflare" | `packages/deploy` is 3,544 lines with 164 tests. `cli/src/main.ts:490` passes only `deps.soLong`, so no host clients are wired. `deploy/src/dispatch.ts:137` returns "X is not connected yet. Nothing was sent." `hostinger-api.ts` and `hostinger-mcp.ts` exist but are unwired. `vercel.ts` says it "does not start that program, does not read a token". **Only `--host preview` works.** README:1135 admits that clients stay out "until a client is connected on purpose". | Preview only |
| Assets | Image generation etc. | 7,715 lines with 131 tests (1 live test skipped) | Yes (`cli/commands/assets.ts:396`, `app section-stills-hook.ts:38`) |
| Model | Grok | Every model call goes to the external `grok` CLI | Required; absent on the box |

**Where "2,000" appears:** only in plan and prompt docs (`hh-build-plan/prompts/239b-…md:54-72,155`) and honestly in `docs/design-library.md:5`. The README does not claim 2,000. **The gap is 1,982 entries**, and the pipeline has been run 0 times.

## 4. Code quality

Counts are for `packages/*/src`, excluding tests.

### Types
- `any`: 2. `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`: 0.
- `as unknown as`: **79**. These are worth auditing, since they are type escapes.
- `tsc -b` is clean.

### Error handling
- **576 bare `catch {`** blocks (no binding). Many are deliberate "fall back" paths, but several hide real failures.
- Examples: `attachDesignSelection` (`site-build.ts` ~1893-1960) and the `loadLanguagePack` read (`language-pack.ts:46-50`, which returns `[]`).
- A missing knowledge folder silently degrades the output instead of erroring.

### Stubs and dead code
- `engine/src/guide/validators.ts:5,68`: `TODO(058)` "replace this stub with lintClaims". A real `lintClaims` exists in `engine/src/brand/truth.ts:44`, but the stub was never swapped. That leaves two divergent claim linters.
- Whole packages with no runtime caller: `crawler` (2,210 lines) and `voice` (1,082 lines). The desk uses a copy of voice instead.
- `hostinger-api.ts` and `hostinger-mcp.ts` are unwired.

### File size
- `app/src/server/routes.ts` is 5,484 lines.
- `app/src/client/desk.ts` is 5,510 lines.
- These are hard to review and the most likely regression hotspots.

### Security
- **No `shell: true`, no `eval` or `new Function`, no `exec()` of shell strings.**
- 97 `spawn`/`spawnSync` sites, all argv-based.
- On Windows, `cmd.exe /d /s /c` lines are built with `quoteCmdArg`:
  - `pnpm-command.ts:11-16` refuses metacharacters.
  - `so-long.ts:376-386` uses the same quoting.
  - `grok-cli.ts:540-547` also quotes.
- The desk binds to 127.0.0.1 only and checks the Host header (`app/src/server/server.ts:24,73,83`).
- `.gitleaks.toml` is present, and an `audit.yml` workflow runs gitleaks.
- A regex scan found no real keys. The only hits are fixtures in `engine/test/tools.test.ts:610` and in `vendor/gsd-*` tests.
- The prompt goes to Grok through a file, not argv.

### Tests
- The suite is large and green.
- Weak spot: the orchestrator golden path is fixture-only (F2), and no test, even one gated behind a flag, exercises a real Grok build.

### Flaky areas
- `packages/cli/test/supervise.test.ts` (923 lines) uses real `git`, a retry loop and wall-clock assertions (around lines 750-759).
- `cli/src/improve/pushcheck.ts:17-21`: the `gitTextIsFileLock` regex matches `permission denied`. An SSH `Permission denied (publickey)` is therefore treated as a Windows file lock and retried 10 times with backoff before failing.
- Skips: git-flow tests skip without git; `improve.test.ts` has Windows-only EINVAL tests.

### Tooling
- Lint is a no-op (§1). The CI "Lint" job always passes.
- `hh doctor` contradicts itself about Playwright.
- `pnpm install` flips the mode of `cli/src/main.ts`, leaving a dirty tree.

## 5. Prioritized bug and gap list

Each title is ready to queue as a fix prompt.

### P1
1. **"Add a real flagged Grok e2e: towel brief → built dist/ → QA, with the result committed"**
   - Evidence: golden-path.ts fakes `<h1>Mostly Towels</h1>`. My real walk stopped at prompt 001 because grok was absent.
   - Fix: add a `bench/e2e-live` runner (manual flag, like `bench/visual`) that builds and records `dist/` and the gate scores.
2. **"Write STACK-DECISION.md at plan approval and pass the chosen stack into generateBriefPlan"**
   - Evidence: `site-build.ts:594,646` hard-code `"astro"`. Only `golden-path.ts:241` writes the file.
   - Fix: decide the stack from the brief's Hosting and Features answers, persist it, and name the starter path in the scaffold prompt.
3. **"Fail loudly when no build runner is installed (ensureSiteBuild no-op)"**
   - Evidence: `site-build.ts:759` returns `Promise.resolve()`, and `startBuild` calls it with `void`.
   - Fix: return or throw a desk-visible error, and add a pre-flight `grok` check before `buildStarted: true`.
4. **"Wire deploy host clients into hh so-long or remove the multi-host claim from README"**
   - Evidence: `cli/src/main.ts:490`, `deploy/src/dispatch.ts:137`, README:195.
   - Fix: inject the Hostinger API client behind explicit consent, or reword the README to "preview + manual DEPLOY.md".
5. **"Run the design-library ingest and report real progress toward 2,000"**
   - Evidence: 18 entries, 0 pipeline runs, 11 candidates waiting.
   - Fix: run `library:ingest` on Matt's machine in batches and commit the entries and `index.json`. Also reuse the crawler's robots and policy checks, which the plan requires but the script does not import.

### P2
6. **"Use the cmd.exe /d /s /c launcher for grok in the build runner on Windows"**
   - Evidence: `site-build.ts:436` uses a bare `spawn`, while `grok-cli.ts:534-549` has the wrapper.
   - Fix: share `launch()` between the two paths.
7. **"Guard plan-critique against a missing brief and add a run-10 regression test"**
   - Evidence: `plan-critique.ts:154` `brief.split` is unguarded; the TypeError is reproducible with a missing argument. Run 10 is still unverified.
   - Fix: `typeof brief === "string"` guard plus a test. Also guard `brief-page.ts:128`.
8. **"Surface design-library selection errors instead of swallowing them"**
   - Evidence: `site-build.ts:1893-1960` `catch { return library; }`.
   - Fix: write `library-error.txt` as `writeLibrarySections` (:721) already does.
9. **"Make lint real: add eslint scripts and typescript-eslint rules (no-floating-promises, no-explicit-any)"**
   - Evidence: no package has a `lint` script, so the CI Lint job is a no-op.
10. **"Use @hitchhiker/crawler for the competitor URLs in the interview, or drop 'crawled for you'"**
    - Evidence: README:168. No runtime import of the crawler.
11. **"Collapse the voice desk copy onto @hitchhiker/voice (or delete the package)"**
    - Evidence: `app/src/client/voice-engine.ts:2` is a duplicate; the package is unused.
12. **"Replace the validators.ts lintClaims stub with brand/truth.ts lintClaims (TODO 058)"**
13. **"Add checked: front-matter to the 13 unverified knowledge packs"**

### P3
14. **"pushcheck: stop treating SSH 'Permission denied (publickey)' as a file lock"**
    - Evidence: `pushcheck.ts:17-21`.
15. **"De-flake supervise.test.ts: inject the clock and fake git"**
    - Evidence: lines ~750-759 use timing assertions.
16. **"hh doctor: reconcile the playwright 'not installed' line with the browsers-installed line"**
17. **"Commit cli/src/main.ts as 100755 so install leaves a clean tree"**
18. **"Split routes.ts and client/desk.ts (~5.5k lines each) by route group"**
19. **"Audit the 79 `as unknown as` casts and the bare catch blocks in the build path"**

## 6. Not verified / limits

- **No real Grok run.** The binary is not on the box, and I used no credentials. Everything after "queue written" is code-read only.
- **Desk run 10 log not read.** It is on Matt's PC, which I was told not to touch, since the clone succeeded.
- **Windows-specific behaviour (F4, the pushcheck lock retry) is inferred from code**, not run.
- **QA gates, Elevate, assets image generation and the deploy preview were exercised only through their unit tests.**

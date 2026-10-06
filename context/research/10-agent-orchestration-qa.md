# 10 · Agent orchestration, reviewer, watchdog and QA on Grok Build

Research date: 2026-10-05. Primary sources: the Grok Build docs (saved as markdown in `/workspace/context-engine/sources/xai/`), the xAI model docs, the vendored gsd-core (`/workspace/context-engine/vendor/gsd-core/agents/`), plus Playwright, Lighthouse CI and web.dev. Unless a section says "recommendation", everything below comes straight from those docs.

## 1. What Grok Build gives us to orchestrate with

| Capability | Facts (docs) | Use in our app |
|---|---|---|
| **Headless runs** ([headless-scripting](https://docs.x.ai/build/cli/headless-scripting)) | `grok -p "<prompt>"`, `-m` model, `-s/--session-id` (create or resume a named session), `-r`, `-c`, `--cwd`, `--output-format plain\|json\|streaming-json` (streaming = newline-delimited JSON events), `--always-approve`, `--no-alt-screen`; sessions stored in `~/.grok/sessions`; use `--no-auto-update` in automation | **One fresh session per build prompt.** The orchestrator parses streaming JSON for progress and lag detection |
| **CLI flags** ([reference](https://docs.x.ai/build/cli/reference)) | `--effort <LEVEL>` (reasoning effort), `--max-turns <N>`, `--rules <TEXT>` (appended to system prompt), `--sandbox <PROFILE>`, `-w/--worktree`, `--ref`, `--no-plan`, `--no-subagents`, `--no-memory`, `--disable-web-search` | Per-prompt effort routing; a turn cap as the lag guard; RULES injected via `--rules` or AGENTS.md. Grok 4.7 supports reasoning efforts `low`, `medium`, `high`, `xhigh` (default `high`) per [docs.x.ai/docs/models/grok-4.7](https://docs.x.ai/docs/models/grok-4.7) |
| **ACP** (same page) | `grok agent stdio` is JSON-RPC over stdio: `initialize` → `authenticate` → `session/new` → `session/prompt`; text arrives as `session/update` chunks | The desktop app or dashboard drives Grok Build programmatically with live streaming |
| **Hooks** ([hooks](https://docs.x.ai/build/features/hooks)) | Events include SessionStart/End, UserPromptSubmit, PreToolUse, PostToolUse, **PostToolUseFailure**, **Stop/StopFailure** ("ends with an API error"), SubagentStart/Stop, Pre/PostCompact, Notification. `{"decision":"deny"}` or exit 2 blocks; **everything else fails open**. Project hooks need `/hooks-trust` or `--trust` | Watchdog sensors; protected-file guard on PreToolUse; error log on PostToolUseFailure |
| **Subagents** ([subagents](https://docs.x.ai/build/features/subagents)) | "Independent child sessions with their own context. They return a summary to the parent"; built-in general-purpose / explore / plan; custom agents in `.grok/agents/` | Reviewer and researcher as subagents; the builder stays thin |
| **Rules** ([project-rules](https://docs.x.ai/build/features/project-rules)) | AGENTS.md / CLAUDE.md plus `.grok/rules/*.md` are loaded in full | Keep them short; long knowledge goes in skills |
| **Skills** ([skills](https://docs.x.ai/build/features/skills-plugins-marketplaces)) | `.grok/skills/<name>/SKILL.md`; frontmatter `when-to-use`, **`paths` ("Hidden until a matching file is touched")**; Claude Code assets are read | Knowledge packs (GSAP, Lenis, R3F, SEO, anti-slop) load only when relevant, which saves tokens |
| **Background / loops / monitors** ([background-tasks](https://docs.x.ai/build/features/background-tasks)) | `/loop 5m …` (interval minimum 60s; loops expire after 7 days; ≤50 active); monitors turn each printed line of a script into a notification ("keep monitor scripts selective") | Dev-server log monitor (Vite/Astro errors) inside interactive sessions |
| **Plan mode, permissions, worktrees** | `/plan` approval screen; allow/deny rules; session worktrees | Optional "spike" worktrees for risky 3D/transition experiments |

## 2. The execution loop (recommendation, built from GSD + Matt's watcher)

```
for each prompt P[n] in ROADMAP order:
  ctx  = RULES + P[n] + @files listed in P[n].read_first   (no chained history)
  run  grok -p ctx -m <model> --effort <tier(P[n])> -s hh-<site>-<n>
            --output-format streaming-json --max-turns <cap> --no-auto-update
  watchdog observes the stream, hooks and the dev-server log
  on exit: commit check (one prompt = one commit), git show --stat HEAD
  if n % 3 == 0 or P[n].checkpoint: REVIEW(n-2..n)
finish: Mostly Harmless gates → Elevate loop → So Long… (deploy)
```

**Effort routing.** Each prompt carries `effort: medium | high | xhigh`. Setup, copy placement and simple sections get medium. Motion systems, scroll video, transitions and 3D get high. PRD/spec writing, cross-site refactors, the final pass and Elevate get xhigh. This mirrors Matt's guidance ("Grok 4.7 Fast is great for quick jobs… switch back to the bigger model for 3D, transitions and anything with 'refactor' in it", *Websites on Autopilot*, step 06).

**Fresh context per prompt.** GSD's core idea is thin orchestrators plus fresh-context executors, with state carried in files. Anthropic gives the same advice in [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (compaction, structured note-taking, sub-agent architectures), and [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) recommends the simplest workflow that works (prompt chaining, orchestrator-workers, evaluator-optimizer). Our loop is prompt chaining with an evaluator-optimizer every 3 steps.

## 3. Reviewer agent (every 3 prompts, plus phase ends)

The reviewer combines four checks:
1. **Goal-backward verification** (`agents/gsd-verifier.md`): check the prompts' `must_haves` (truths, artifacts, key_links) and prohibitions against the repo, and don't let "tasks done" bias it toward PASS.
2. **Matt's Watcher contract** (Prompt 08): Was each TASK's definition of done met? Were protected files touched? Were RULES broken? What should be checked on localhost? It returns an exact fix prompt and the next prompt number.
3. **Visual audit**: Playwright screenshots at **375 / 768 / 1440 / 1920** (Matt's Prompt 21), desktop + mobile, scored with GSD's 6 pillars (`agents/gsd-ui-auditor.md`: Copywriting, Visuals, Color, Typography, Spacing, Experience Design, each 1–4) plus a 7th **Motion** pillar and a **Brand** score (Matt's Brand Director prompt 18: message, voice, color, type, imagery, layout 1–10). Grok 4.7's modalities are "text, image → text" ([model page](https://docs.x.ai/docs/models/grok-4.7)), so screenshots go straight to the reviewer.
4. **Anti-slop lint**: grep for banned words, em dashes, lorem ipsum, purple gradients, default Tailwind palettes and "magnetic button" code (see CONTEXT-PACKAGE anti-slop rulebook).

**Output: `reviews/NNN-REVIEW.md`** with a verdict of PASS / FIX / ESCALATE. On FIX, it writes 1–3 self-contained fix prompts that are run immediately (auto-fix default per Matt Q27/28), then re-reviews. After a maximum of 2 fix rounds, the issue is logged as a known issue and work continues, unless it's a BLOCKER.

## 4. Watchdog (errors and lag)

**Sensors:**
- the streaming-json event gap (no events for N seconds means lag)
- the turn count against `--max-turns`
- the non-zero exit or `StopFailure` hook (API error)
- `PostToolUseFailure` events
- the dev-server stderr (monitor)
- `npm run build` / `astro check` / `tsc` exit codes
- Playwright console errors and 404s

**Triage**, borrowed from GSD's executor deviation rules (`agents/gsd-executor.md`):

| Class | Example | Action |
|---|---|---|
| Rule 1–3 (bug, missing critical piece, blocker) | TypeScript error, missing import, broken route | **Fix immediately** in a fresh medium/high session with the error log + the diff |
| Package install failure | Hallucinated or misspelled package | **Never auto-substitute.** Check the registry (GSD's Package Legitimacy Gate); escalate if unknown |
| Rule 4 (architectural) | Swap framework, add a backend | **Escalate** to the user |
| Lag / loop | Same error 3×, no progress | `git reset` to the last good commit, retry once at a higher effort, then escalate (gsd-loop's **3 strikes → `gsd:escalated`**) |
| API errors / limits | StopFailure, rate limits | Exponential backoff; pause the queue; notify |

**Rollback.** Matt keeps a backup branch before building, and has "one prompt = one commit". The watchdog tags the last commit that passed review as `hh-good-NNN`.

## 5. Quality gates (Mostly Harmless)

- **Lighthouse CI**: `lhci autorun` with assertions in eslint style, for example `"categories:performance": ["error", {"minScore": 0.9}]` ([LHCI configuration](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md); `numberOfRuns` defaults to 3). Gates: mobile Performance ≥ 0.9, Accessibility ≥ 0.9, Best Practices ≥ 0.9, SEO ≥ 0.9 (Matt Q30: "Lighthouse mobile 90+").
- **Core Web Vitals targets** ([web.dev/articles/vitals](https://web.dev/articles/vitals)): LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at the 75th percentile. Lab runs approximate field data; INP needs interaction scripts.
- **Visual regression**: Playwright `toHaveScreenshot()` with `maxDiffPixels` (pixelmatch). The docs warn that rendering varies by OS, hardware and headless mode: "run tests in the same environment where the baseline screenshots were generated" ([test-snapshots](https://playwright.dev/docs/test-snapshots)). Baselines are captured after each PASS review so later prompts can't silently break earlier sections (the "55 prompts, splash byte-identical" protection extended to visuals).
- **Accessibility**: `@axe-core/playwright` scan with zero serious/critical issues; keyboard nav of the menu; a `prefers-reduced-motion` run.
- **Console**: zero errors or failed requests across the four viewports.
- **SEO**: title/meta/OG, sitemap, robots, Schema.org JSON-LD, one `h1`, alt text.
- **Brand sign-off**: reviewer Brand score ≥ 8/10 on every dimension, plus the user's approval.

## 6. Token efficiency

- **Prices** ([docs.x.ai/docs/models](https://docs.x.ai/docs/models), checked 2026-10-05):

  | Model | Input | Cached | Output | Context | Notes |
  |---|---|---|---|---|---|
  | **grok-4.7** | $2.00/M | $0.50/M | $6.00/M | 500k | Above 200k prompt tokens, every token in the request is billed at the doubled rate |
  | grok-build-0.1 | $1/M | $0.20/M | $2/M | 256k | |
  | grok-4.3 | $1.25/M | | | 1M | |

  Users on SuperGrok run Grok Build under their own plan (Matt Q3).
- **Rules:**
  - Keep each prompt's context under 200k tokens; target ≤ 60k.
  - Keep a stable prefix (RULES + AGENTS.md first) so caching applies.
  - Use `@file` references instead of pasted history.
  - Write a SUMMARY.md per prompt (≤ 150 words) to feed the reviewer.
  - Load skills by `paths`.
  - Keep `STATE.md` as the single resume point (GSD).
  - Run GSD's context monitor thresholds (≤35% warning, ≤25% critical) as a hook.

## 7. Imagine pipeline (for asset jobs)

- **Images and video** ([image guide](https://docs.x.ai/docs/guides/image-generation), [video guide](https://docs.x.ai/docs/guides/video-generation)):
  - Images: `POST /v1/images/generations` with `n` 1–10, aspect ratios from 1:1 to 21:9, 1k/2k resolution. URLs are temporary, so download immediately.
  - Video: `POST /v1/videos/generations` is async. Poll `GET /v1/videos/{request_id}`. Duration 1–15s; 480p/720p, plus 1080p on video-1.5.
  - Prices: image $0.02–0.05; video $0.02–0.08/s.
- **Logo**: Imagine produces raster concepts, and Matt warns "Image models are great at concepts and still bad at letters". Pipeline: concept → pick → wordmark set in the real font → vector via vtracer (MIT), or have Grok hand-write the SVG → SVGO.
- **Budget guard**: estimate cost before each batch against the user's stated comfort spend (Matt Q20); offer DIY prompts as the free alternative.

## 8. Risks
- Hooks fail open, so they can't be the only safety layer. The orchestrator must check exit codes and git state itself.
- `--always-approve` with web access is powerful. Pair it with a `--sandbox` profile and a deny list (`git push --force`, `rm -rf`, deploy commands, outside-cwd writes).
- gsd-core doesn't list Grok as a runtime (see 01). Our app should ship its own `.grok/` command set, borrowing GSD's file formats, not depend on gsd-core installation.

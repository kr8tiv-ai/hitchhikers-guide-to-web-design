# 01 · OpenGSD deep dive (what to copy, what to adapt)

Research date: 2026-10-05. Sources: the open-gsd GitHub org (via the GitHub API) and shallow clones in `/workspace/context-engine/vendor/` (`gsd-core` @ `13d3723`, committed 2026-10-05 02:26 CR time; `gsd-pi`, `gsd-path`, `gsd-spec-build-loop`). Everything below comes from those repos' own docs unless I've marked it as my recommendation.

## 1. The org at a glance

The open-gsd org ([github.com/open-gsd](https://github.com/open-gsd)) has 14 public repos. These are the ones that matter for us (star counts from the GitHub API today):

| Repo | Stars | What it is |
|---|---|---|
| [gsd-core](https://github.com/open-gsd/gsd-core) | ~10.2k | "Git. Ship. Done": the meta-prompting / context-engineering / spec-driven framework. MIT. `npx @opengsd/gsd-core@latest` |
| [gsd-pi](https://github.com/open-gsd/gsd-pi) | ~1.3k | Local-first terminal coding agent built on the same ideas (milestones, slices, tasks, worktree-aware git) |
| [gsd-path](https://github.com/open-gsd/gsd-path) | 23 | Disk-backed pipeline, idea → shipped (inspect, define, research, decide, roadmap, plan, build, ship) with state in `.project/`. **Lists Grok as a supported host** (`--grok` installs to `~/.grok/skills`, delegates through Grok's `spawn_subagent`) |
| [gsd-spec-build-loop](https://github.com/open-gsd/gsd-spec-build-loop) | 22 | "gsd-loop": four agent-neutral playbooks (discover / spec / build / review) driven by GitHub issue labels. **Names Grok Build explicitly** (`/gsd-loop-discover`, `/gsd-loop-spec`, `/gsd-loop-build`, `/gsd-loop-review`, `/gsd-loop-schedule`) |
| [gsd-browser](https://github.com/open-gsd/gsd-browser) | 50 | Rust CDP browser CLI plus MCP server for agents: screenshots, visual diffing, assertions, recording |
| [agent-inbox](https://github.com/open-gsd/agent-inbox) | 9 | Disposable email inbox MCP, built for testing auth and email flows |
| gsd-graph, gsd-cloud-daemon, gsd-cursor, marketplace-gsd-dev, docs, presets/config | small | Supporting tools |

**Grok compatibility.** gsd-core's own runtime list (Claude Code, OpenCode, Antigravity CLI, Kimi, Kilo, Codex, Copilot, Cursor, Windsurf and others) doesn't mention Grok. The Grok Build docs, though, say Grok "automatically reads Claude Code marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files" ([docs.x.ai/build/features/skills-plugins-marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces)). So a Claude-Code-style local install of gsd-core will *probably* load in Grok Build. **I haven't tested that.** gsd-path and gsd-loop do ship native Grok adapters.

## 2. Core architecture (gsd-core)

From `docs/ARCHITECTURE.md`, gsd-core has five layers:

1. **Commands** (`commands/gsd/*.md`, 72 files): prompt files exposed as slash commands or skills.
2. **Workflows** (`gsd-core/workflows/*.md`, 109 files): thin orchestration logic that loads context, spawns agents, collects results and updates state.
3. **Agents** (`agents/*.md`, 35 roles, most with a `.compact.md` twin for small context windows): fresh-context specialists.
4. **CLI tools** (`gsd-tools.cjs`): deterministic helpers for state reads and writes, model resolution, config and gates.
5. **File system** (`.planning/`): every piece of state, kept as human-readable Markdown and JSON.

The five design principles, quoted from the docs:
- **Fresh context per agent.** Every spawned agent starts with a clean window ("up to 200K tokens"), which avoids *context rot*.
- **Thin orchestrators.** Workflows never do heavy lifting. They load, spawn, collect, route and update state.
- **File-based state.** `.planning/` survives `/clear` and crashes, and it can be committed to git.
- **Absent = enabled.** A feature flag missing from `config.json` defaults to true.
- **Defense in depth.** A plan-checker runs before execution, every task gets an atomic commit, a verifier runs after execution, and human UAT is the final gate.

**Context-engineering thesis** (`docs/explanation/context-engineering.md`): quality degrades quietly as the window fills. The model contradicts earlier decisions, style drifts and file names get invented. gsd-core's structural fix is that the main session never touches source files. Research, planning, coding and verification each run in a scoped subagent that reads only the artifacts it needs from disk. Three disciplines work together: fresh context, **spec-driven artifacts** (CONTEXT, RESEARCH, PLAN) and **meta-prompting** (hard-won know-how baked into the agent and workflow prompts).

## 3. The phase loop

`Discuss → (UI design) → Plan → Execute → Verify → Ship`, repeated for each phase of a milestone (`docs/explanation/the-phase-loop.md`).

| Step | Command | Output | Guards against |
|---|---|---|---|
| New project | `/gsd-new-project` | Questioning, then 4 parallel researchers (STACK, FEATURES, ARCHITECTURE, PITFALLS), then a synthesizer (SUMMARY), then REQUIREMENTS.md, then ROADMAP.md, then STATE.md after user approval | Building the wrong thing |
| Spec (optional) | `/gsd-spec-phase` | SPEC.md with "ambiguity scoring" | Vague phase goals |
| Discuss | `/gsd-discuss-phase` | `XX-CONTEXT.md`, a record of locked decisions | The planner guessing your preferences |
| UI design | `/gsd-ui-phase` | `XX-UI-SPEC.md`, a design contract (spacing scale in multiples of 4, type roles, 60/30/10 color with an explicit list of where the accent goes, copywriting contract) | Generic UI |
| Plan | `/gsd-plan-phase` | RESEARCH.md, PLAN.md files, plan-checker loop (max 3 iterations), requirement and decision coverage gates | Ambiguous plans and conflicting parallel work |
| Execute | `/gsd-execute-phase` | Code, one atomic commit per task, SUMMARY.md per plan; plans grouped into dependency **waves** (parallel within a wave, sequential across waves) | Context rot during coding |
| Verify | (inside execute) + `/gsd-verify-work` | VERIFICATION.md (goal-backward), UAT.md (conversational human acceptance) | "Tasks done" without "goal achieved" |
| UI review | `/gsd-ui-review` | UI-REVIEW.md, a 6-pillar visual audit | Visual drift |
| Ship | `/gsd-ship` | PR, archive, STATE advanced | Loose ends |

**How discuss works.** It loads prior context, scouts the codebase, skips "gray areas" already decided in earlier phases, shows the remaining gray areas and lets the user **choose which ones to discuss**. Then it deep-dives each chosen area and writes CONTEXT.md, "decisions clear enough that downstream agents can act without asking the user again". Flags include `--auto`, `--batch`, `--assumptions` (an assumptions-analyzer proposes answers with evidence) and `--power`. This is the closest existing pattern to our "long but skippable" interview.

**Autonomous mode.** `/gsd-autonomous` runs discuss → plan → execute for every remaining phase. It pauses only for gray-area acceptance, blockers or validation requests, then runs a milestone audit and cleanup. `/gsd-quick` and `/gsd-fast` cover small jobs that don't justify the full loop.

## 4. Spec and state files

`.planning/` layout (from ARCHITECTURE.md): `PROJECT.md` (vision, constraints, decisions), `REQUIREMENTS.md` (v1 / v2 / out-of-scope, with REQ-IDs), `ROADMAP.md`, **`STATE.md`** ("the spine": current position, decisions, blockers, metrics; lockfile-protected writes), `config.json`, `research/`, `phases/XX-name/{CONTEXT, RESEARCH, NN-PLAN, NN-SUMMARY, VERIFICATION, VALIDATION, UI-SPEC, UI-REVIEW, UAT}.md`, `quick/`, `todos/`, `threads/`, `seeds/`, `debug/knowledge-base.md`, `ui-reviews/` (screenshots, gitignored) and `continue-here.md` (handoff written by `/gsd-pause-work`).

**PLAN.md format** (`gsd-core/templates/phase-prompt.md`): YAML frontmatter with `wave`, `depends_on`, `files_modified`, `autonomous`, `requirements` (must not be empty) and a **`must_haves`** block (`truths`, `artifacts`, `key_links`). After that come XML-ish sections: `<objective>`, `<context>` (@-file references, with an explicit warning against reflexively chaining prior summaries) and `<tasks>`. Each `<task type="auto">` carries `<files>`, `<read_first>`, `<action>` (concrete values, never "align X with Y"), `<verify>`, `<acceptance_criteria>` (grep-verifiable) and `<done>`. Checkpoint tasks are `checkpoint:decision` (options with pros and cons) and `checkpoint:human-verify` (a URL plus visual-only checks).

## 5. Subagents and verification loops

Agent categories (ARCHITECTURE.md): researchers (4 in parallel), synthesizer, planner and roadmapper, **checkers** (plan-checker, integration-checker, ui-checker, nyquist-auditor; verification loop of at most 3 iterations), executors (parallel within a wave), verifier, mappers, debugger, auditors (ui-auditor, security-auditor), doc writer and verifier.

Patterns worth copying:
- **Executor deviation rules** (`agents/gsd-executor.md`). Rule 1: auto-fix bugs. Rule 2: auto-add missing critical functionality. Rule 3: auto-fix blocking issues. Rule 4: **STOP and ask** about architectural changes (switching libraries, new infrastructure). Every deviation gets logged in SUMMARY.md. Package installs are explicitly *excluded* from auto-fix: if one fails, the executor raises a `checkpoint:human-verify` instead of trying a similarly named package, because that's how slopsquatted or hallucinated packages get in. A **Package Legitimacy Gate** in research checks every package against the registry API.
- **Goal-backward verifier** (`agents/gsd-verifier.md`). It starts from what the phase *should* deliver: which truths must hold, which artifacts must exist and which links must be wired. It's told not to let a high task-completion percentage bias it toward PASS. It also checks `prohibitions` (must-NOT statements).
- **UI auditor** (`agents/gsd-ui-auditor.md`). 6 pillars (Copywriting, Visuals, Color, Typography, Spacing, Experience Design), each scored 1–4, top 3 fixes, BLOCKER/WARNING tiers. Stance: "Assume every pillar has failures until screenshots or code analysis proves otherwise". One example of what it checks: confirming the 60/30/10 color distribution instead of accepting "brand colors are used".
- **DOM verifier** (`agents/gsd-dom-verifier.md`). Checks live-DOM acceptance criteria through a browser MCP after each wave and writes DOM-VERIFY.md. It's additive and never blocks.
- **Context monitor hooks.** A WARNING fires at ≤35% context remaining ("avoid starting new complex work") and CRITICAL at ≤25%, debounced over 5 tool uses. Grok Build exposes matching hook events (`PreCompact`, `Stop`, `SubagentStop` and others, per [docs.x.ai/build/features/hooks](https://docs.x.ai/build/features/hooks)).
- **Sketch / spike.** `/gsd-sketch` makes throwaway HTML mockups of UI ideas and `/gsd-spike` explores an idea experientially. Both suit "show me 3 hero directions before we commit".

## 6. gsd-loop and gsd-path (Grok-native siblings)

- **gsd-loop**: discover (decision map) → spec (contract-grade GitHub issues with `O-N` outcome and `X-N` exclusion clauses) → build (claims the oldest `gsd:ready` issue and opens a PR) → review (audits the PR against the issue contract and CI, posts a verdict). After **3 strikes** a PR is labeled `gsd:escalated`. Every irreversible step stays with a human. That three-strikes escalation is a ready-made template for our watchdog.
- **gsd-path**: every handoff is written to `.project/` "so any session can resume from disk alone", with a lookahead that plans the next milestone while the current one builds. Child briefs name absolute input and output paths and a bounded scope.

## 7. What to copy for the website maker

1. **The artifact spine, renamed for web work.** `.site/BRAND.md` (the brand brain), `SITE-BRIEF.md`, `VISUAL-DIRECTION.md`, `MOTION-SPEC.md`, `SECTION-PLAN.md`, `ASSETS.md` (manifest plus licenses), `RULES.md` (Matt's RULES paragraph plus NO SLOP rules), `STATE.md`, `prompts/NNN-*.md`, `reviews/NNN-REVIEW.md`, `CREDITS.json`.
2. **Gray-area discuss, made skippable.** For each interview module, show the decisions still open, let the user answer, skip ("you decide") or accept AI assumptions with evidence. Lock the results into the brief.
3. **The PLAN.md task schema** for each of the ~100 prompts: files, read_first, action, verify, acceptance_criteria, done, plus a `must_haves` block per section (for example "hero headline visible at 375px without scroll" or "prefers-reduced-motion disables Lenis").
4. **Deviation Rules 1–4 plus the package-legitimacy exclusion** become the watchdog's triage policy.
5. **Goal-backward verifier plus the 6-pillar UI auditor**, extended with a 7th pillar, *Motion*, and an Awwwards-style score (Design 40 / Usability 30 / Creativity 20 / Content 10).
6. **Waves.** Section components that don't touch shared files can be built in parallel Grok Build subagents or worktrees (`grok -w`). Shared motion and setup files run serially.
7. **Pause/resume handoff** (`continue-here.md`) plus context thresholds, so a 100-prompt run survives crashes and compaction.

## 8. What to adapt or drop

- **Drop PR-per-phase ceremony.** Our users aren't engineers. Keep one commit per prompt (Matt's "one prompt, one job, one commit") and tag milestones instead of opening PRs.
- **Replace conversational UAT** with screenshot-based visual approval at 3 or 4 milestones (hero approved, structure approved, motion approved, ship).
- **Make prompts self-contained.** GSD executors rely on @-file context. Matt's guide insists every prompt repeat the full RULES paragraph and never say "as before". The best design does both: keep the RULES block in `AGENTS.md` / `.grok/rules/` (Grok loads these every session, per [docs.x.ai/build/features/project-rules](https://docs.x.ai/build/features/project-rules)) *and* restate a compact RULES header in each prompt.
- **Add asset gates GSD doesn't have**: license check, media budgets (video ≤ ~4 MB loops, per Matt's performance prompt) and a credits entry in the same commit.
- **Fewer agents.** 35 roles is too many. Seven are enough: Interviewer, Art Director, Planner/Prompt-writer, Builder (Grok Build), Reviewer (every ~3 prompts), Watchdog and Finisher.

# 02 · Spec-driven development tools: how each goes from interview to verification

Research date: 2026-10-05. Star counts come from the GitHub API today. Workflow details come from each project's README or official docs, linked inline.

## Comparison

| Tool | Interview / intake | Spec artifact(s) | Task breakdown | Execution | Verification |
|---|---|---|---|---|---|
| **GitHub Spec Kit** (~140k★) | `/speckit-specify` (what and why), optional `/speckit-clarify` (formerly `/quizme`) | `constitution`, `spec.md`, `plan.md`, `checklists/` | `/speckit-tasks` | `/speckit-implement` | `/speckit-analyze` (cross-artifact consistency before build), `/speckit-converge` (repeat until "Converged") |
| **Kiro specs** | Requirements-First or Design-First, plus "Analyze Requirements" | `requirements.md` (user stories and acceptance criteria), `design.md` (architecture, sequence diagrams), `tasks.md` | `tasks.md`, dependency graph grouped into waves | Run tasks one at a time or all at once; waves run in parallel | Real-time task status; property-based "Correctness" testing (IDE only) |
| **Tessl** | `requirement-gathering` skill with an always-on `one-question-at-a-time` rule | `.spec.md` files in `specs/` with YAML frontmatter and `[@test]` links | Implicit | Agent implements only after approval (`spec-before-code` rule) | `spec-verification`, `work-review`; plus a **Spec Registry** of version-accurate library "usage specs" |
| **BMad Method** (~54k★) | `bmad-brainstorming`, `bmad-forge-idea`, `bmad-deep-recon`, `bmad-product-brief`, `bmad-prfaq` | `prd-*.md`, `DESIGN.md` / `EXPERIENCE.md` (`bmad-ux`), `architecture-*.md`, `spec-*.md` | `bmad-ticket` (ordered `tickets.toml`) | `bmad-build` (one session per story), `bmad-build-auto` (unattended) | `bmad-retrospective` judges the combined epic against requirements |
| **Agent OS** (~5.5k★) | "Shape Spec" (enhanced shaping questions run in plan mode), product planning | Standards docs (discovered from code) plus specs | Within the shaped spec | Any agent; standards are *injected* into context when relevant | Standards conformance |
| **Taskmaster** (~28k★) | You write a PRD (`.taskmaster/docs/prd.txt`) | PRD | `parse-prd` → tasks.json, `expand` (subtasks), complexity analysis | `task-master next` feeds the agent one task at a time | Status tracking; optional research model (Perplexity, xAI and others) |
| **OpenGSD** (see 01) | Questioning plus discuss-phase gray areas | PROJECT/REQUIREMENTS/ROADMAP/CONTEXT/UI-SPEC | PLAN.md with waves | Fresh-context executors | Plan-checker, goal-backward verifier, UI 6-pillar audit, UAT |

## 1. GitHub Spec Kit

Source: [github.com/github/spec-kit](https://github.com/github/spec-kit) and its [command reference](https://github.github.io/spec-kit/reference/agentic-sdd.html). Install with `uv tool install specify-cli` and `specify init <project> --integration <agent>`. Commands are agent skills invoked in chat.

**Flow:** "Constitution once per project; specify → plan → tasks → implement → converge per feature." The full order is `constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge`. Clarify, checklist and analyze are optional quality gates.

**Ideas worth stealing:**
- The **constitution**: project principles that every later phase is evaluated against. For us that's the brand brain plus RULES plus NO SLOP rules.
- **Checklists as "unit tests for your requirements"**: they test whether the *spec* is complete and unambiguous, not whether the code works. The reference says implementation "must not silently self-approve" reviewer-owned checklists.
- **Analyze before implement.** If it finds issues, "return to the earlier step that owns them" and fix them at the source.
- **Converge**: assess the implementation against the artifacts, append the remaining work, and loop until it reports converged. That's exactly the shape of our finishing pass.
- Separate extensions handle **bug fixing** (assess → fix → test, verdict `verified | partial | failed`; "missing verification is not a successful fix") and **idea assessment** (intake → research → define → shape → decide).

## 2. Kiro specs

Source: [kiro.dev/docs/specs](https://kiro.dev/docs/specs/) (page updated 2026-10-02). Every spec produces three files: `requirements.md` (or `bugfix.md`), `design.md` and `tasks.md`. That's a three-phase workflow (requirements → design → tasks) with approval gates, or "Quick Spec", which generates all three in one pass without gates. "Run all tasks" builds a dependency graph from `tasks.md` and runs independent tasks concurrently in **waves**. Bugfix specs record current, expected and *unchanged* behavior, an explicit regression guard.

**For us:** "Quick Spec" is the model for the **skip-the-interview** path (generate the brief, direction and plan in one shot from whatever the user dropped in). The "unchanged behavior" field maps onto Matt's protected sections ("Do NOT change the splash page in any way").

## 3. Tessl

Sources: [Tessl launch post](https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry), [Tessl docs](https://docs.tessl.io) (the former "SDD with Tessl" page 404s as of 2026-10-05; docs now focus on skills/plugins/verifiers), [spec-driven-development tile](https://github.com/tesslio/spec-driven-development-tile). Tessl ships two things:
- **Framework / SDD tile**: skills (`requirement-gathering`, `spec-writer`, `spec-verification`, `work-review`) and rules (`spec-before-code`, `one-question-at-a-time`, both always applied). Specs are `.spec.md` files whose requirements link to tests with `[@test]`.
- **Spec Registry**: per the launch post, "more than 10,000" versioned usage specs that teach agents to use specific library versions correctly and avoid API hallucinations.

**For us:** the registry idea matters more than the framework. We should ship **pinned "usage specs" for our stack** (GSAP 3.15 + ScrollTrigger/SplitText, Lenis 1.3, Three r186, R3F 9, drei 10, Astro 7) as files in `.grok/skills/` so Grok Build doesn't write outdated APIs. One example: Lenis moved from `@studio-freight/lenis`, last published 2024-03, to the `lenis` package, now 1.3.26.

## 4. BMad Method

Sources: [README](https://github.com/bmad-code-org/BMAD-METHOD), [Choose a Planning Path](https://docs.bmad-method.org/plan/choose-a-planning-path/). Delivery loop: Clarify → Plan → Build and verify → Learn and adjust.

**Key ideas:**
- **Right-size the process.** The core question is "is the intent already well defined?" If it is, go straight to `bmad-spec`. If not, use the independent tools (brainstorm, forge-idea, deep-recon, product brief, PRFAQ, PRD, UX, architecture), "not stages; pick the ones the gap calls for".
- **Input ceiling.** `bmad-spec` "reads everything you give it in one pass, and the practical ceiling is a few tens of thousands of tokens, roughly a 40-page document… condense them first." That supports our plan to distill the interview into compact briefs before generating prompts.
- **Size follows intent.** One coherent outcome over several sessions is an epic. Roughly 20 or more sessions is a project. Every path uses the same implementation unit, one Build session per story.
- **Human attention on foundational stories, automation for repetitions.** "Early stories often settle the architecture… Give those decisions human attention before automating repetitions." That's the argument for a human approval gate after prompts 1–10 (setup, hero, nav) and then autopilot.
- `bmad-build-auto` runs one unattended session; it "does not choose the next story or own the backlog". Our orchestrator plays that role.
- The `bmad-ux` output names (`DESIGN.md`, `EXPERIENCE.md`) are a good naming pattern for our visual direction files.

## 5. Agent OS (Builder Methods)

Sources: [repo](https://github.com/buildermethods/agent-os), [docs](https://buildermethods.com/agent-os). Workflow: **1. Discover standards** (extract conventions from the codebase) → **2. Inject standards** (deploy the relevant ones into context as needed) → **3. Product planning** → **4. Shape Spec** (enhanced shaping questions in plan mode). Outputs are plain markdown in `agent-os/`, so any tool can read them.

**For us:** *inject only the relevant standards*. Don't paste the whole motion library guide into every prompt. A hero prompt gets the hero and type standards; a 3D prompt gets the three.js performance standard. Grok Build skills support this natively through `paths` globs ("hidden until a matching file is touched") and `when-to-use` triggers ([skills docs](https://docs.x.ai/build/features/skills-plugins-marketplaces)).

## 6. Taskmaster

Source: [README](https://github.com/eyaltoledano/claude-task-master). The PRD lives at `.taskmaster/docs/prd.txt` ("Always start with a detailed PRD. The more detailed your PRD, the better the generated tasks"). Core verbs: `parse-prd`, `next`, `expand <id>`, `research "<query>"`. It supports main, research and fallback model roles, and lists an xAI API key as a provider option.

**For us:** the **`next` primitive**, where the orchestrator always knows the next eligible task from dependencies and status, plus a **fallback model** when the main model errors. In Grok Build terms: `grok-4.7` for 3D, transitions and refactors, and a faster model for copy and simple sections. Matt's guide makes the same split.

## 7. Patterns they all share (design requirements for us)

1. **Write intent before code**, and keep it as files the agent re-reads (constitution, steering, standards, brand brain).
2. **Interview one question at a time** (Tessl rule, Matt's prompts, GSD discuss) with **push-back on vague answers**.
3. **Approval gates on the expensive decisions only** (Kiro gates, BMad's foundational stories, GSD's checkpoint:decision).
4. **Dependency-aware task lists with waves** (Kiro, GSD).
5. **Verification that checks the goal, not just task completion** (Spec Kit converge, GSD goal-backward verifier, BMad retrospective).
6. **Escalate instead of improvising** on architecture or packages (GSD Rule 4, gsd-loop's 3 strikes).

## 8. Where they all fall short for a website maker

None of these tools has:
- a **taste layer** (brand, visual direction, motion appetite, signature moment)
- **multimodal intake** (mood images, voice, screenshots of reference sites)
- **asset pipelines** (Imagine stills, then scroll videos, logo SVG, GLB, licenses and credits)
- **visual verification** (screenshots at breakpoints, Lighthouse budgets, motion review)

They're engineering-process tools. Our product is **"Spec Kit plus an art director"**. Keep their process skeleton and add a creative-direction front end and a visual QA back end.

### Recommended pipeline for our app

`Intake (skippable modules) → BRAND.md + SITE-BRIEF.md + VISUAL-DIRECTION.md + MOTION-SPEC.md → PRD.md (constitution + requirements, with REQ-IDs) → SECTION-PLAN.md → ASSETS.md (generated and fetched) → prompts/001…100 (self-contained, RULES header, must_haves) → Build loop (Grok Build headless, 1 prompt = 1 commit) → Review every 3 prompts (goal-backward + 7 pillars + screenshots) → Watchdog (errors, lag, budgets) → Converge/finishing pass (jury review → fix prompts → QA → credits).`

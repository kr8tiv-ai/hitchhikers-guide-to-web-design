# 240r. Harness ideas scored 7 or higher

Date: 2026-10-19. Research only.

Source study: `hh-build-plan/research/hh-harness-research-2026-10-19.md`, including the 7:20 PM addendum. Every idea in that file scored 7/10 or higher is below, under its original name. Nothing scored 7 or higher is dropped or merged. Ideas scored 6 or below stay out: 14 Enhance-prompt Q&A (6), 15 WebGL via an embed tool such as Unicorn Studio (6), 16 Model routing labels by task (6), 17 Figma/HTML export and hosted publish (5), 18 Design-system import from repo or app as a memory skill (5), 30 Design-system "Rules" plus auto-matching skills (6), 35 Voice interview and critique (5), 36 Clickable prototype flows (4), 37 Old-device and physical-lab testing (6).

Scores are the study's absolute usefulness scores, not a new ranking. "IMPLEMENT" in the study means 7 or higher. Each idea names the 241 spec that should build it. The split is justified in `240r-summary.md`.

Library rule: measure the outcome. Do not ban a library to satisfy an idea.

## 1. Plan-then-critique-the-plan before code

Score: 9. Source named in the study: Anthropic. The study's description: tokens and ASCII wireframes, then a revision that asks whether any similar brief would produce this plan.

Build: after the interview writes the spec and before any page prompt, add a critique step that reads the plan and returns a genericness note. The natural place is the plan phase next to `packages/engine/src/spec/design-outputs.ts` and the interview in `packages/engine/src/interview.ts`. The critique is a structured result: three concrete differences from a generic brief, or a failure. Measure it by fixture briefs that are deliberately generic (a café, a studio, a clinic) and assert the critique rejects a plan that could be swapped between them without an edit. Do not require a particular model vendor.

241 spec: 241f.

## 2. Screenshot fix loop: top 3 issues × max 3 rounds at 3 widths

Score: 9. Source named in the study: Taste. Desk today: vision review and Elevate exist. A capped, prioritised loop at three widths is the missing contract.

Build: `packages/qa/src/elevate-loop.ts` and `packages/qa/src/beauty-gate.ts` (`judgeBeauty`). Cap each Elevate run at three rounds. Each round takes the top three failures from `judgeBeauty` and fixes only those. Capture at three widths drawn from `REVIEW_WIDTHS` in `packages/qa/src/screenshots.ts` (375, 768, 1440). The fourth existing width, 1920, stays for the device matrix in 241b and is not required inside this three-round cap. Measure: a fixture page with four known issues stops after three rounds and reports the untouched fourth, and a clean page stops at round one.

241 spec: 241f.

## 3. Codified AI-cluster blacklist as a gate

Score: 9. Source named in the study: Anthropic, palette and chrome tells. Desk today: `packages/qa/src/antislop.ts` covers copy, not the visual cluster.

Build: extend the anti-slop gate with visual tells as data, not as a library ban. The list is the one the audit already cares about: Inter, Poppins, Roboto, Open Sans, Montserrat, Lato, Arial, Helvetica, or `system-ui` as the display face unless the person named it; a default indigo or violet hero (`DENY_HEX` in `packages/engine/src/brand/tokens.ts`); a blob hero; three identical icon cards; a cloned section rhythm; stock laptop people; fake logos, testimonials, or numbers. Measure on built CSS and on the vision booleans in idea-adjacent audit item 6 (241e). A site that uses Three.js is not a failure. A site whose display face is Inter and whose hero is a purple blob is a failure.

241 spec: 241f. The font names themselves are defined in `240r-fonts.md` and enforced in 241a. This idea is the gate that runs them with the chrome tells. Both specs stay. Do not collapse them.

## 4. Direction dealing: 3 of N researched directions from real SOTD study

Score: 8. Source named in the study: Taste. The study says the library has 18 sites and that this falls short of a real Site of the Day study.

Build: the brand phase deals three directions, each citing a library entry (a real page the desk has already studied), and the person picks one. Reject a deal whose three directions differ only by hue. Files: the interview answers and the brand kit (`packages/engine/src/brand/kit-from-interview.ts`). Measure: a fixture with three directions that share the same type pair and the same section order fails the deal check. Growing the library past 18 is allowed. Inventing a fake "SOTD" citation is not.

241 spec: 241f.

## 5. Ingredients-first @ references to library sections and templates as code context

Score: 9. Sources named in the study: Aura, Relume ("assembled not generated"). Desk today: `@skill` exists. `@section-from-library` likely does not.

Build: a reference the prompt can include that points at a library section and a template file, and the build uses that section's structure instead of inventing a new one. Wire it beside the existing `@skill` activation. Measure: a prompt that names a library section produces markup whose landmarks match that section's fixture, and a prompt with no reference still builds (the reference is an input, not a blocker). This idea is the authoring side. Idea 32 is the deterministic renderer. They stay separate. 241f ships the reference. 241i ships the renderer.

241 spec: 241f.

## 6. Awwwards 40/30/20/10 rubric inside the beauty gate

Score: 8. Source: https://www.awwwards.com/about-evaluation/. Design 40, Usability 30, Creativity 20, Content 10. Outlier scores are trimmed. The study says the beauty gate exists and the weighting is unknown.

Build: `judgeBeauty` in `packages/qa/src/beauty-gate.ts` returns four subscores with those weights, and the jury (`packages/qa/src/jury.ts`, `packages/qa/src/award-jury.ts`, `packages/qa/src/pattern-score.ts`) uses the same weights. A single overall number without the four parts is not this idea. Measure: a fixture that fails usability and passes the other three fails the gate even if a flat average would pass, because usability is 30 of 100 and the floor is explicit. Idea 20 is the measured browser self-score that feeds these four numbers. Idea 6 is the weighting inside the gate. Both stay.

241 spec: 241g.

## 7. Sitemap → section wireframe → style guide staging with approval

Score: 7. Source named in the study: Relume. Desk today: the interview and the spec partly cover this, and nothing waits for an approval between the three artifacts.

Build: `openInterview` (`packages/engine/src/interview.ts`) emits three artifacts in order: a sitemap, a section wireframe, and the style guide (`writeDesignMd` in `packages/engine/src/spec/design-outputs.ts`). The next artifact is written only after the previous one is approved (a recorded answer, not a silent continue). Measure: a run that skips the wireframe approval does not write DESIGN.md. This is the staging order. Idea 8 is the lint of the resulting DESIGN.md. Both stay.

241 spec: 241g.

## 8. DESIGN.md lint to the Google spec

Score: 7. Source: the Google design.md spec, section order and token rules, at https://github.com/google-labs-code/design.md. The study names section order, token refs, and no duplicate keys.

Build: a lint over the DESIGN.md that `writeDesignMd` writes. Required section order: Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's and Don'ts. `{token.ref}` references must resolve. Duplicate keys are errors. Measure: a fixture DESIGN.md with a duplicated color key fails, and one with the sections in this order passes. The families and the type scale from `240r-fonts.md` are part of the Typography section. Idea 29 exports the same file to Tailwind and DTCG. Linting is this idea. Export is idea 29. Both stay.

241 spec: 241g.

## 9. "One bold thing" and one orchestrated motion moment rule in motion.ts

Score: 8. Source named in the study: Anthropic. Desk today: `writeDesignMd` also writes `src/scripts/motion.ts` (`packages/engine/src/spec/design-outputs.ts`). The file is a starting point, not a rule.

Build: the motion file must name exactly one bold visual decision and exactly one orchestrated motion moment (a timeline, not a pile of unrelated fades). Extra moments are allowed only as short opacity under the reduced-motion heuristic in `240r-devices-and-polish.md`. Measure: a fixture motion file with zero named moments fails, and one with five unrelated scroll effects and no single orchestrated timeline fails. Reduced motion still has to leave the page complete (audit item 11).

241 spec: 241g.

## 10. Frame checks: title above the fold, equal margins, no dead blank stretches

Score: 8. Source named in the study: Taste. Desk today: Lighthouse and axe do not catch these. `packages/qa/src/detail-pass.ts` looks at one desktop size.

Build: extend the detail pass to the device projects in `240r-devices-and-polish.md`, not only 1440. Checks: the title is inside the first viewport, left and right margins match within a small tolerance, and no section is an empty band taller than one viewport. Measure with element bounds from Playwright at 375, 768, and 1440 at minimum. A full-bleed hero is not a "dead blank stretch" when it contains the title and the poster.

241 spec: 241g.

## 11. Section-scoped edits plus lock/target to stop regressions

Score: 7. Sources named in the study: Lovable, Bolt. The study calls this Aura's reported weakness. Desk today: unclear.

Build: an Elevate edit names the section it may change and a lock list of sections it must not change. After the edit, screenshot the locked sections and fail if they differ. Files: `packages/qa/src/elevate-loop.ts` and `packages/qa/src/screenshots.ts`. Measure: a fixture that asks for a hero edit and also rewrites the footer fails the lock check. Idea 33 is the prompt sentence. Idea 11 is the mechanical lock. Both stay.

241 spec: 241h.

## 12. Real credited imagery and footage sourcing

Score: 7. Source named in the study: Taste.

Build: every image and video in the built site has an entry in `CREDITS.json` (author, source URL, license). The license checker is `packages/qa/src/licenses.ts`, which audit item 3 also extends for fonts. A generated image is credited as generated, with the prompt id, and is not labelled as a photograph of a real place. Measure: a page with an `<img>` whose URL is absent from CREDITS.json fails. Stock laptop people and fake testimonials stay banned by idea 3 and audit item 6. This idea is the credit record, not the ban list.

241 spec: 241h.

## 13. Redesign order: type → color → frame → states → components, with before/after

Score: 7. Source named in the study: Taste.

Build: a redesign pass walks in that order and stores a before and after screenshot at each step. Skipping to components while the type is still an overused default fails. Files: the Elevate path and `packages/qa/src/screenshots.ts`, using the type pairs from `240r-fonts.md` and the frame checks from idea 10. Measure: a fixture run that changes component markup before the type step is rejected. The order is the idea. The type system itself is 241a. Both stay.

241 spec: 241h.

## 19. Parallel variants and combine

Score: 8. Sources named in the study: Magic Patterns Inspiration ×4, Subframe "header from v1 + layout from v3", Stitch agent manager. Desk today: Elevate refines one line and has no fork and merge step.

Build: from one approved direction (idea 4), produce four variants of a single section, then a combine step that can take the header from one and the layout from another. The combine writes a new artifact. It does not silently overwrite the approved direction. Measure: four variant ids exist, and a combine record names which variant each region came from. A run that returns one variant fails this idea even if the page looks good.

241 spec: 241h.

## 20. Measured real-browser self-score per Awwwards criterion plus top-3 fixes

Score: 9. Source named in the study: the awwwards-skill. The study's procedure: cold throttled load, a sweep from 320px, a keyboard pass, a reduced-motion pass, heading structure, measured LCP, CLS, and INP, then a per-criterion score and the three highest-leverage fixes.

Build: one report that calls the existing gates and adds the four weighted scores from idea 6. Cold load uses the mobile Lighthouse preset in `240r-devices-and-polish.md`. The 320px sweep is an extra width (the iPhone SE descriptor in Playwright is 320×568, key `iPhone SE`, from the same device file cited in the devices note). Keyboard and reduced motion use the device projects. INP is recorded when a scripted interaction produced it. Otherwise the report says INP was not sampled and shows TBT. The report ends with exactly three fixes, ordered by leverage. Files: `packages/qa/src/lighthouse-gate.ts`, `packages/qa/src/performance-gate.ts`, `packages/qa/src/beauty-gate.ts`, `packages/qa/src/report.ts`. Measure: a fixture report contains four criterion scores, the lab metrics, and three fixes. Idea 6 is the weights. This idea is the measured report. Both stay.

241 spec: 241d.

## 21. "Give no juror a reason to mark you down" floor checklist

Score: 7. Source named in the study: the awwwards-skill. Rationale in the study: with 18 or more jurors and the three extreme scores dropped, a site wins by not handing a juror an easy markdown. Usability first.

Build: a checklist that runs before Elevate and fails on the marks jurors actually deduct: horizontal overflow, a control under 44px, a keyboard trap, missing focus, text under 16px, contrast under the token floors, a hover-only control, a video that autoplays with sound, a reduced-motion path that hides content, an empty heading, a fake testimonial. Each item is a yes or no with the Playwright or axe evidence. Files: `packages/qa/src/a11y-gate.ts`, `packages/qa/src/detail-pass.ts`, and the mobile checks in the devices note. Measure: each checklist row is independently fail-able by a fixture. This is the floor. Idea 20 is the scored report above the floor. Both stay.

241 spec: 241h.

## 22. Phase-gated reference loading

Score: 7. Source named in the study: the awwwards-skill. Load motion, WebGL, or scroll references only in the phase that needs them. The study says this fits `@skill` activation and keeps context lean.

Build: the prompt for a phase lists the skills it may load, and a check fails if a WebGL reference is in the copy phase or a motion reference is in the sitemap phase. The existing knowledge packs (`packages/knowledge/packs/`) are the references. Measure: a recorded prompt log for the type phase does not include the Three pack, and the WebGL phase does. Idea 5 is the section reference the author inserts. Idea 22 is which phase is allowed to see it. Both stay.

241 spec: 241h.

## 23. Phone performance budget written into the brief before any 3D

Score: 8. Source: DappaSol's mobile Lighthouse notes, cited in the harness study (https://dappasol.com/guides/cinematic-website-examples/): Lusion 53, Locomotive 71, Active Theory 43, Basement 37, on Lighthouse 13.4.1 with 4× CPU, 16 Sep 2026. The study's point: write the phone target into the brief before the 3D, because those sites scored 37–71 and this desk already gates at 90 or above.

Build: the brief, before any WebGL prompt, records the phone budget from `240r-devices-and-polish.md`: performance at least 90 on the mobile preset, LCP at most 2.5 s, CLS at most 0.1, GLB at most 5 MiB, poster as the LCP image, tier table rather than a width cutoff. A 3D prompt that runs without that block in the brief fails the phase check. Measure: a fixture brief with a WebGL hero and no phone budget is rejected. The budget does not say "no WebGL on phones". It says the phone still gets the scene, after the poster, at a tier the GPU can hold.

241 spec: 241c.

## 24. Device/browser matrix with iOS Safari as P0, plus a full state sweep

Score: 8. Sources named in the study: BrowserStack, BugDrop. The study's sweep: eight states, portrait and landscape, 320px, zoom. Desk today: Lighthouse mobile emulation does not cover Safari or states.

Build: the Playwright projects in `240r-devices-and-polish.md`. WebKit `iPhone 15` is P0. The eight states to sweep on each project that has a chrome: default, hover (only where `pointer: fine`), focus-visible, active, disabled, loading, error, and empty. Plus portrait, landscape, the 320px SE width, and a 200% zoom pass that does not clip the title or cause horizontal overflow. Optional real-device runs (BrowserStack, LambdaTest) are named and not required. Measure: the project list includes WebKit iPhone, Pixel 7, iPad Pro 11 in both orientations, an Android tablet, and desktop, and the state sweep has eight named fixtures. Idea 37's physical lab stays out. This idea is the matrix.

241 spec: 241b.

## 25. Yes/no launch checklist run twice: staging, then the live domain within an hour

Score: 7. Source named in the study: Zorko.

Build: a checklist of yes/no rows (the floor from idea 21, plus the Lighthouse phone and desktop gates, plus the license file). Run it on the staging URL. Run the same list on the live domain within an hour of launch. A live failure reopens the launch. It does not get a waiver because staging passed. Files: `packages/deploy/src/post-deploy-live.ts` already has a floor of 90. Extend that report with the checklist rows and a timestamp delta. Measure: a fixture with staging pass and live fail is a failed launch, and a timestamp gap over an hour is a failed procedure even if both passed. The "within an hour" rule is the study's rule. Keep it.

241 spec: 241h.

## 26. Severity-graded defect log with regression retest after each Elevate pass

Score: 7. Source named in the study: BrowserStack.

Build: every defect has a severity (blocker, major, minor), the project it was seen on, and a retest result after the next Elevate pass. A blocker that is not retested cannot be closed. Files: the Elevate loop and `packages/qa/src/report.ts`. Measure: a fixture log that closes a blocker without a retest entry fails. Idea 2 caps the rounds. Idea 26 records the defects across those rounds. Both stay.

241 spec: 241h.

## 27. Mood adjectives → palette and type in the interview

Score: 7. Source named in the study: Stitch. The study says this is partly covered by the interview and the brand kit.

Build: the interview already collects mood. `packages/engine/src/brand/tokens.ts` maps mood regexes to a pair index, and `brandKitFromAnswers` in `packages/engine/src/brand/kit-from-interview.ts` builds the kit. 241a replaces the six-pair list with the appendix in `240r-fonts.md`, keyed by mood, era, tone, and industry. The interview stores the adjectives that selected the pair, so a later edit can see why Boska was dealt instead of Tanker. Measure: a fixture answer set of "editorial, quiet, publishing" selects an editorial pair from the appendix and records the adjectives, and an answer set that names Inter explicitly is allowed to keep Inter. An answer set that does not name Inter does not receive Inter.

241 spec: 241a.

## 28. Extract a design system from a reference URL

Score: 8. Sources named in the study: Stitch, Magic Patterns. The study also says this helps grow the 18-site library.

Build: given a public URL, extract colors, type roles, and section rhythm into a candidate brand kit or a library note. The extractor does not copy the site's markup, copy, or images. It records tokens and a short structural description, with the source URL. Files: a new extractor beside the brand kit, writing into the library the direction dealer (idea 4) already reads. Measure: a fixture HTML page yields a token file whose colors match the computed styles, and the output contains no sentence from the fixture's body copy longer than a short quote. Respect robots.txt. Do not run this against a logged-in page.

241 spec: 241i.

## 29. DESIGN.md → Tailwind v4 / DTCG export via @google/design.md CLI, with lint as a gate

Score: 8. Source: Google, the `@google/design.md` CLI, named in the study. The study says this strengthens idea 8. It is still its own idea.

Build: after idea 8's lint passes, the CLI exports Tailwind v4 theme variables and a DTCG token file from the same DESIGN.md. A failed lint blocks the export. Measure: a valid DESIGN.md produces both artifacts, and a DESIGN.md that fails idea 8 produces neither. Do not maintain a second token list by hand. Confirm the CLI's current package name and flags at implementation time. This pass did not run the CLI.

241 spec: 241g.

## 31. Persistent decision canvas that keeps rejected directions

Score: 7. Source named in the study: MagicOS. The study says a simple decisions log is enough, and that this also covers Anthropic's note to jot what you have tried.

Build: a decisions log in the project, append-only, with the direction that was dealt, the one that was picked, and the ones that were rejected, each with a one-line reason. The next phase can read it. Nothing deletes a rejected row when a later phase succeeds. Measure: after a pick, the log still contains the rejected directions, and a second phase that reads the log can name them. This is not a visual canvas product. The study says the log is enough.

241 spec: 241i.

## 32. Deterministic section rendering instead of LLM-written markup for library components

Score: 7. Sources named in the study: Subframe, Relume ("assembled"). The study calls it high value and a big build.

Build: library sections render from data (a section id plus props) through a template function, not from a fresh model completion. The model may fill the props (the words, the image credit, the chosen type pair). It does not rewrite the section's markup on each run. Files: the templates under `packages/templates/`, called from the build once idea 5 has named the section. Measure: two runs with the same props produce the same markup bytes for that section. Idea 5 is the reference. This idea is the renderer. Both stay.

241 spec: 241i.

## 33. Re-implement-without-regression prompt template: "Preserve all existing functionality unless…"

Score: 7. Source named in the study: Subframe. The template sentence is the one in the title: preserve all existing functionality unless the instruction says otherwise.

Build: every Elevate and redesign prompt starts with that sentence, plus the lock list from idea 11. The prompt is a fixture in the repo so it cannot drift. Measure: a snapshot test of the prompt string contains the sentence, and a run that omits it does not call the model. Idea 11 enforces the lock in code. This idea is the wording. Both stay.

241 spec: 241i.

## 34. DOM-synced WebGL layer with teardown and GPU budget as a reusable recipe

Score: 7. Sources named in the study: Awwwards Academy, Codrops, and the awwwards-skill. No specific Academy or Codrops lesson URL was re-opened this pass. The recipe is specified in `240r-devices-and-polish.md` section 3, which has the primary sources for tiering, compression, and context loss.

Build: one recipe, `packages/templates/shared/webgl.ts` and the copies under `packages/templates/*/src/hh/webgl.ts`, that does all of the following. The canvas is positioned over a DOM hero. Scroll and pointer drive the scene from the DOM, with ScrollTrigger refresh after fonts. Teardown on page leave disposes the renderer, geometries, materials, and textures, and clears the single context. The GPU budget is the tier table: DPR cap, post chain, KTX2 and Meshopt, pause offscreen and on a hidden tab, context-loss recovery, poster-first LCP. Measure: a second `getContext` throws "one context per page" (already true), a hidden tab pauses the loop, a forced context loss twice shows the still, and a 400px viewport with a tier-3 override still starts the loop. The width cutoff in `shouldUsePoster` is the behaviour this idea removes.

241 spec: 241c.

## Count

28 ideas: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34. Nine ideas from the study are excluded because they scored under 7, listed at the top of this note.

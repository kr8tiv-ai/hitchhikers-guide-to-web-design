---
id: "243l"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243k"]
title: "Desk Run 11 re-test of 243g: style guide drops the owner's colours and name, stub sections, placeholder page sections"
---

# 243l. Make the drafted sitemap, wireframe and style guide match the brief

## Why
Desk Run 11 re-test on main 4c0fa638 (project "Paradise Found Run Eleven C", folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c, files under site-c\.hitchhiker and site-c\DESIGN.md). 243g fixed BUG-083 for Home, Farms and Farm detail, BUG-084 (General Sans now wins over Boska), BUG-085 (clamps scale) and BUG-086 (button ink on paper 13.12:1). What is still wrong, all seen on the freshly drafted files:

1. BUG-089 (S4) Pages with no section detail in the brief get one placeholder section named after the slug: Eco-Building and Food `eco-building-and-food-main`, About `about-main`, Contact `contact-main`, Blog `blog-main`, Privacy `privacy-main`, Terms `terms-main`. Live on the Land has only `sign-up`, although the brief says "caretaker program with sign-up form". Contact should at least carry the contact form the brief implies, Blog a guide list (the brief: one guide a month), Privacy and Terms a policy body, Live on the Land the caretaker program plus the sign-up. A `<slug>-main` id must never reach a sitemap or wireframe the owner reads; when the brief gives nothing, use a plain, meaningful section name derived from the page's purpose.
2. BUG-090 (S3) DESIGN.md front matter says `name: Site`. It must carry the project or business name (here "Paradise Found").
3. BUG-091 (S3) The brief's palette is five named colours: jungle green, sunset gold, ocean blue, soft sand (page) and near-black green, with sunset gold as the accent. DESIGN.md has paper #f3e6d0, ink #14241c, accent #8a6a12 and muted #5c6570 only; jungle green and ocean blue are gone and nothing says why. Every colour the owner named must appear as a token (or be explicitly mapped, with the reason, in the Colors section), and every pairing used for text must state its contrast and pass WCAG AA for its size.
4. BUG-088 still partly open (S4): DESIGN.md has `## Color` with only "See Colors." and `## Type scale` with only "See Typography.". Stub alias sections are clutter in a document the owner reads. Emit each section once. If a downstream reader or schema needs the alias headings, show where and map it in code instead of in the document.
5. BUG-092 (S4) The owner asked for "light, wide, airy sans for headings like the logo" (the logo is PARADISE FOUND in wide caps). The display token has letterSpacing -0.03em and lineHeight 0.95, which is tight and dense, the opposite of wide and airy. When the owner's words describe width or air, the display tracking and leading must follow them (for example zero or positive tracking and a looser line height), and the weight should be light if the family has one; say in the Typography section which words drove it.
6. Hardening (seen once in the 243k gate under load, passed on re-run): packages/cli supervise.test.ts:326 "an ancestor check failure is a failed push" got "Push was refused: SSH key or credentials" instead of "origin/main does not contain the commit". Find why the push-failure classification can depend on timing or ordering (for example which stderr text arrives first, or a shared temp repo/env between tests) and make it deterministic. Do not weaken the assertion.

## Do
1. Fix 1-5 in the engine code that drafts the sitemap, wireframe and DESIGN.md (start from packages/engine/src/spec/design-stages.ts, packages/engine/src/spec/design-outputs.ts, packages/engine/src/brand/type-conflict.ts, packages/engine/src/brand/type-scale.ts and directions.ts; follow the code to wherever the values really come from). Fix the root cause in the generator, not by special-casing this project.
2. Fix 6 in packages/cli.
3. Add unit tests that use the Run 11 brief values (the five colours, the type wish, the DP-2.8 page list) and assert the behaviour above: no `-main` section ids, the project name in DESIGN.md, all five owner colours present or mapped with AA contrast stated, no stub sections, display tracking and leading following "wide, airy". Extend packages/app/e2e/desk-run11-243g.spec.ts or add a 243l spec only if the desk UI behaviour changes. Await every web-first assertion.
4. Do not loosen, skip, `todo` or delete any assertion or test. No retries or raised timeouts as fixes.
5. Run `pnpm -r typecheck`, `pnpm lint` and the full `pnpm test` from the repo root and make them green (a wall-clock timeout of the known flaky kind on this PC may be reported rather than chased, but no wrong-value failure).

## Done when
- A fresh draft for the Run 11 brief has meaningful sections on every page, DESIGN.md named for the business, all five owner colours accounted for with AA pairs, each section once, and display type that reads light, wide and airy.
- The supervise ancestor-check test is deterministic.
- Typecheck, lint and full tests are green on this PC.

## Commit
```
fix(engine,cli): Desk Run 11 style guide keeps the owner's name, colours and airy type, real section names, deterministic push classification (243l)
```
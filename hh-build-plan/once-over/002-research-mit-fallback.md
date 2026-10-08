# 002. Research still plans a GSAP fallback

Status: **proposed**. Not applied. Do not add a fallback project.

## Miss

D-001 and v2 §15.4 say there is no GSAP fallback and no GSAP licence caveat. v2 §21 says the MIT fallback and "avoid Theatre" were removed on purpose.

These files still tell a later reader to keep one:

- `context/research/00-SUMMARY.md` (the GSAP license bullet under Stack)
- `context/research/06-library-stack.md` (the anime.js row marked "MIT fallback", the "GSAP license risk" section, and the mitigation that keeps an MIT path behind a switch)
- `CONTEXT-PACKAGE.md` (v1) §15 and the risk list, which still say to keep the MIT fallback switch

Product code does not implement that switch. `packages/engine/src/spec/motion.ts` throws if the motion markdown contains `gsap fallback` or `@theatre/studio`. No package imports `@theatre/studio`.

## Fix

Strike the fallback sentences and the "avoid Theatre" advice. Add one line that D-001 withdrew them and that GSAP stays the base engine. Do not add a config flag, a second engine, or a comment that deletes Theatre core.

A test may read those three files and fail if they still contain `MIT fallback` or `avoid Theatre`. Do not weaken `renderMotionMd`.

## Why this pass did not do it

The sentences are historical research, not a one-line type error. Rewriting them without a test would land a doc change this prompt says must ship with a test. No GSAP fallback was introduced here.

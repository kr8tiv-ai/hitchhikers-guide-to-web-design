# Live fix 023. Make the docs match the code

From `hh-build-plan/live-bugcheck/heavy-review-4-product.md` item 8. Later Grok runs read these docs as the spec; drift makes them redo or undo decisions.

## Read first

- `README.md` (Develop was fixed in 015; re-check), `hh-build-plan/once-over/REPORT.md` and each `hh-build-plan/once-over/0*.md` (status lines), `hh-build-plan/post-159/SUMMARY.md` (what was applied, with commits), `hh-build-plan/CONTEXT-PACKAGE.v2.md` and any `CONTEXT-PACKAGE.md`, `DECISIONS.md` (find it), `hh-build-plan/RESEARCH-ADDENDUM.md`, `hh-build-plan/live-bugcheck/REPORT.md`
- Doc tests: search `packages/*/test` for tests that read these files (e.g. the research MIT fallback doc test from post-159 fix 002)

## Spec

1. Once-over REPORT.md: each of 001-010 shows its real status (applied with commit, or closed with the reason), matching `post-159/SUMMARY.md`.
2. Remove the withdrawn GSAP MIT-fallback language (and any avoid-Theatre advice already withdrawn) from the context package files, so they agree with DECISIONS.md. Quote the DECISIONS.md line in the commit body.
3. `hh-build-plan/live-bugcheck/REPORT.md` gets a short "Applied" table for the live-bugcheck prompts that have landed so far (prompt, commit hash from `git log`, one line).
4. Any README claim that the code contradicts (commands, Node floor, test commands, what `hh app` does) is corrected. Keep tone and length.
5. Add or extend a doc test so the GSAP MIT-fallback wording cannot come back.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the packages whose doc tests you touched. All exit 0.

## Commit

```
docs: align README, once-over report and context package with the code
```
Do not push.

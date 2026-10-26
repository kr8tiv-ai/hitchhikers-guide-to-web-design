---
id: "243k"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243i"]
title: "CI red on 2396f658: stale same-size read in text-cache on Windows, and a missing await in the 243g E2E spec"
---

# 243k. Fix the two failures GitHub CI shows on main at 2396f658

## Why
243g-243i were pushed to main (2396f658). Audit is green, but CI and E2E are red. Full logs are saved on this PC:
C:\Users\lucid\Desktop\desk-e2e-run11\hh-driver11\logs\ci-40416601660-failed.log and e2e-40416601578-failed.log.

1. CI run 40416601660, job "Lint, typecheck, and unit tests (windows-latest)" only (ubuntu and macos green):
   packages/engine test\text-cache-243d.test.ts:9 "a same-size rewrite is visible on the next cached read"
   at line 17: actual 'alpha-one', expected 'bravo-two' (AssertionError, testCodeFailure, duration about 5 ms).
   This is a real product bug, not a timing flake: `readUtf8Cached` in packages/engine/src/text-cache.ts reuses the cached text when `mtimeNs` and `size` match. On Windows two writes a few milliseconds apart can leave the same mtime (and a same-size rewrite keeps the same size), so the desk can serve stale project file text after a write.
2. E2E run 40416601578, Playwright (ubuntu): packages/app e2e\desk-run11-243g.spec.ts:99 "the sitemap, wireframe, and style guide follow the Run 11 brief" failed at line 147:
   `expect(page.getByRole("button", { name: "Start build" })).toHaveCount(0);` with "Protocol error (Runtime.callFunctionOn): Internal server error, session closed." The assertion is not awaited, so the `finally` block kills the child and the test ends while the assertion is still polling. 191 other specs passed.

## Do
1. text-cache: make a same-size rewrite always visible on the next read, on every OS, without giving up the cache for files that are not changing. Use the "racy timestamp" rule: when a file's mtime is not safely older than the moment it was read and cached (for example within 2 s, or whatever window you justify for NTFS/ext4/APFS timestamp granularity), do not trust the cached entry; re-read (and you may compare the bytes or re-cache only once the mtime is old enough). Keep the ENOENT and size-limit behaviour. Update the module doc comment to describe the real rule.
2. Add a unit test that reproduces the Windows case deterministically on any OS: write, read, rewrite with same-size content and then force the mtime back to the original value with `utimesSync` (so mtime and size both match), and assert the next read returns the new text. Keep the existing test unchanged.
3. desk-run11-243g.spec.ts:147: add the missing `await`. Then search every spec under packages/app/e2e (and any other Playwright specs) for un-awaited `expect(...)` calls on locators/pages (web-first assertions such as toHaveCount, toBeVisible, toContainText, toHaveText, toHaveURL, toBeEnabled, toBeDisabled, toHaveAttribute) and add `await` to each. Consider enabling the `@typescript-eslint/no-floating-promises` rule (or an equivalent existing lint rule) for e2e specs if it can be done without loosening anything else; if enabling it is too broad for this fix, say why in the report.
4. Do not loosen, skip, `todo` or delete any assertion or test. Do not add retries or raise timeouts as the fix.
5. Run `pnpm -r typecheck`, `pnpm lint` and the full `pnpm test` from the repo root and make sure they are green (a wall-clock timeout of the known flaky kind on this PC may be reported rather than chased, but no wrong-value failure). Run the 243g spec with Playwright locally (`pnpm --filter @hitchhiker/app exec playwright test e2e/desk-run11-243g.spec.ts`) and report the result.

## Done when
- text-cache returns the new text after a same-size rewrite even when the mtime is identical, proven by the new test.
- desk-run11-243g.spec.ts awaits every web-first assertion, and no other spec has an un-awaited one.
- Typecheck, lint and full tests are green on this PC.

## Commit
```
fix(engine,app): racy-mtime guard in text-cache and awaited web-first assertions in e2e specs (243k)
```
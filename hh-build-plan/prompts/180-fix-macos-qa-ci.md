---
id: "180"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix the macOS QA CI failure: starter fixture phone gates"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["179"]
files: ["packages/qa/src/playwright-opener.ts", "packages/qa/test/", ".github/workflows/"]
review_checkpoint_embedded: false
---

# 180. Fix the macOS QA CI failure: starter fixture phone gates
## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

Additional rules for this session only:

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.

## Goal

GitHub Actions run 38074297758 on commit da9e44b failed only on `macos-latest`, in the unit tests job. Ubuntu, Windows, E2E, and Audit passed. Make the QA test pass on macOS, Linux, and Windows without lowering any threshold.

## Why this prompt exists

Red main hides later regressions and blocks the improve loop, whose score treats any red test as a regression.

## Known failure

`packages/qa` test "the starter fixture clears the real phone gates" (`packages/qa/test/live-gates.test.ts:436`, TAP `not ok 16`, `failureType: 'testCodeFailure'`) failed in 42 ms, before any browser started. The exact log:

```
error: 'error:068000DD:asn1 encoding routines::illegal padding'
code: 'ERR_OSSL_ASN1_ILLEGAL_PADDING'
node:internal/tls/secure-context:70:13
setCerts -> configSecureContext -> createSecureContext
localCertificate (packages/qa/src/playwright-opener.ts:342)
startFixtureSite (packages/qa/src/playwright-opener.ts:385)
```

So this is not fonts, rendering, timing, path case, or screenshot size. The hand-built DER certificate in `localCertificate()` is rejected by OpenSSL. Leading suspect: `derInt(randomBytes(8))` for the certificate serial. `derInt` only adds a 0x00 pad when the high bit is set. It never strips redundant leading bytes, so a random serial that starts with 0x00 followed by a byte below 0x80, or with 0xFF followed by a byte of 0x80 or more, is a non-minimal DER INTEGER and OpenSSL reports "illegal padding". A zero-length or all-zero value is also invalid. That makes the test flaky on every OS, and macOS happened to hit it. Confirm this by evidence rather than assuming it.

## Read first

- `packages/qa/src/playwright-opener.ts` (`derLen`, `tlv`, `seq`, `derInt`, `oid`, `utcTime`, `pem`, `localCertificate`, `startFixtureSite`)
- `packages/qa/test/live-gates.test.ts` (the failing test and any certificate tests)
- `.github/workflows/ci.yml`, `e2e.yml`, and `audit.yml` (exact OS matrix and commands)
- `gh run view 38074297758 --log-failed` if `gh` is authenticated (read-only)

## Files to create or change

- `packages/qa/src/playwright-opener.ts`: make `derInt` emit a minimal, positive DER INTEGER, or generate the serial so it is always valid (for example force the first byte into 0x01 to 0x7F). A real X.509 serial must be positive and at most 20 bytes. Keep the certificate valid for `localhost` and `127.0.0.1`. Do not add a dependency. Prefer fixing the encoder, not only the serial, so the encoder is correct for any input.
- `packages/qa/test/`: add a regression test for the DER INTEGER encoder and for certificate generation. It must cover the bad serial shapes (leading 0x00 then a byte below 0x80, leading 0xFF then a byte of 0x80 or more, high-bit-set first byte, and the all-zero value) and loop `localCertificate()` or `createSecureContext` enough times (for example 500) that a 1-in-128 flake would fail. Export the helpers only if needed, through the module's existing public surface.
- A workflow file only if the audit in step 4 finds a real macOS-only problem.

## Non-goals

- Do not weaken, skip, delete, or loosen the starter fixture test or any gate threshold (Lighthouse, axe, contrast, tap size, screenshot count of 16).
- Do not add retries, longer timeouts, or `test.skip` to hide the failure.
- Do not weaken approval gates: brief approval, prompt approval, Elevate, Hostinger yes.
- Do not restyle anything.
- No new dependencies, no change to run-build.ps1 or the queue runner.
- Do not start the next prompt.

## Steps

1. Verify first. Run `gh run view 38074297758 --log-failed` if `gh` is authenticated and confirm the error above. Then reproduce locally without a browser: loop `localCertificate()` several thousand times in a small script or test and count `ERR_OSSL_ASN1_ILLEGAL_PADDING` failures. Record the failure rate and the serial prefix that failed. If it never reproduces, read the DER encoder against X.509 and ASN.1 DER rules (minimal INTEGER, definite lengths, UTCTime, SAN encoding) and find the real cause. If the failure no longer exists and the loop test passes 5000 times, record "already fixed: <evidence>", add only the regression test, and commit.
2. Fix the root cause in `playwright-opener.ts`. Check `derLen` for long-form lengths above 127 bytes (0x81 and 0x82 forms), BIT STRING padding byte, and the signature wrap. Run the loop again and show 0 failures.
3. Add the regression test described above.
4. Audit the whole CI workflow for other macOS-only fragility, and fix real problems only: POSIX or Windows path assumptions, `os.tmpdir()` symlink differences (`/var` versus `/private/var`, so compare with `fs.realpath`), case-insensitive filesystem assumptions, `/tmp` hardcoding, shell syntax that differs on BSD tools (`sed -i`, `date`, `sha256sum` versus `shasum`), `bash` versus `zsh`, Chromium or Playwright browser paths on macOS, font fallback or locale assumptions in tests, port binding to `127.0.0.1` versus `localhost`, file watcher limits, and tests that depend on timing. Check the CI logs of the macOS job for other warnings or slow tests near their timeouts. Record each finding as fixed or "not an issue" with evidence in the summary. Do not fix style nits.
5. Run the full verification list on Windows, plus `pnpm --filter @hitchhiker/qa test` several times in a row to catch other flakes.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Acceptance criteria

- [ ] `localCertificate()` yields a certificate that `createSecureContext` accepts on every call across at least 5000 iterations.
- [ ] The starter fixture phone gates test passes with its assertions and thresholds unchanged.
- [ ] A regression test covers the DER INTEGER shapes and the certificate loop.
- [ ] The CI workflows were audited for other macOS-only fragility, and each finding is fixed or recorded.
- [ ] No test was skipped, deleted, or loosened; no approval gate behavior changed; no restyle.

## must_haves

truths:

- The root cause is the invalid DER encoding of the certificate, and it is fixed in the encoder, not hidden by a retry.
- The fixture certificate is valid for `localhost` and `127.0.0.1` on every call.
- The starter fixture phone gates test asserts exactly what it asserted before.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows.
- No approval gate behavior changed and nothing was restyled.

artifacts:

- Fixed DER encoder in `packages/qa/src/playwright-opener.ts`
- Regression test in `packages/qa/test/`
- Audit notes in the commit body

key_links:

- `startFixtureSite` calls `localCertificate`, whose output passes `createSecureContext` every time.
- The regression test exercises the same encoder the fixture site uses.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm --filter @hitchhiker/qa test
pnpm -r test
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/180.md` if that directory exists. The summary names the root cause with evidence (the failing output before, the passing output after, the loop failure rate), files changed, the macOS audit findings, tests run, and anything assumed.

## Commit

```
fix(ci): make the QA starter fixture phone-gate test pass on macOS
```
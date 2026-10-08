# Release

A human runs this checklist before tagging. A release is a checklist, not an automatic publish. Prompt 157 writes this page. It does not deploy. This page does not tag a release and it does not create a remote.

Do not npm publish and do not git push. `npm publish` and `git push` are not steps. Do not deploy.

## Root test

The root `package.json` script `test` runs `pnpm -r test`. Every package under `packages/` defines `test`, so a recursive run does not stop on a package with no tests. Recursive runs skip the workspace root, so the script does not call itself.

From the repo root, in PowerShell:

```powershell
$env:HH_CASSETTE = "replay"
pnpm -r test
```

On macOS and Linux, set HH_CASSETTE to replay in that shell, then run the same `pnpm -r test`.

Expected evidence: exit code 0. CI uses the same cassette value.

## License audit

Run the license audit. GPL and AGPL are out. `@theatre/studio` is out. potrace is out by name. `@theatre/core` with Apache-2.0 stays.

D-001 means no GSAP fallback and no Theatre studio. Theatre runtime is `@theatre/core` only, pinned, never `@latest`. Do not add a GSAP fallback.

```powershell
pnpm licenses list --json
pnpm --filter @hitchhiker/qa test
```

Expected evidence: `auditDeps` in `packages/qa/src/licenses.ts` returns ok true, and the qa tests pass. The `licence` job in `.github/workflows/audit.yml` imports `auditDeps` and fails on any other result. NOTICE has a Third-party section. That section lists the installed licences, including the named exceptions. `Apache-2.0 AND LGPL-3.0-or-later` passes only for a name that starts with `@img/sharp-`. The lone identifier `LGPL-3.0-or-later` passes only for a name that starts with `@img/sharp-libvips-`. It does not list a GPL or AGPL package. It states that `@theatre/studio` is not installed.

## Secret scan

Run the secret scan. Keys stay in the OS keychain or in `.env.local`. See [secrets.md](secrets.md).

```powershell
gitleaks detect --source . --redact
pnpm --filter @hitchhiker/qa test
```

Use gitleaks 8.30.1 so the local scan matches CI. The steps and checksums are in [ci.md](ci.md). Expected evidence: the gitleaks exit code is 0, and `scanText` reports no hits. Do not paste a real key into the tree to prove the scanner.

## Doctor

Run `hh doctor`.

From this repo, the same entry is:

```powershell
node --experimental-strip-types packages/cli/src/main.ts doctor
```

Expected evidence: the report covers node, git, grok, the session id, and the effort flag. A missing optional tool (playwright, whisper, or pdftotext) is a warning. The command does not throw for that, and it does not print an auth result.

## Fixture drive

Run the fixture drive. It is the orchestrator loop against fixture-spawn. It does not call grok and it does not open a socket.

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

Expected evidence: `packages/orchestrator/test/fixture-run.test.ts` passes. An unapproved drive throws before spawn. The queue has no running item at the end.

## Phone gate

Run the phone gate on the Guide app. The scores that count are real-mobile Lighthouse scores (all four at 90 or more). The four categories are performance, accessibility, best practices, and SEO. A floor under 90 is rejected. Desktop scores do not waive a missing phone run.

Install Chromium once, then run the gate:

```powershell
pnpm --filter @hitchhiker/app exec playwright install chromium
pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts -g "phone gate"
```

Expected evidence: each route returns PASS, three runs, and real-mobile Lighthouse scores (all four at 90 or more).

## Hostinger

Hostinger does not run without yes. `deployHostinger` throws when `approved` is not true. This checklist does not deploy. A later yes is a separate human act. This page is not that yes. Vercel, Netlify, and Cloudflare follow the same rule. Deploy commands stay denied. See [secrets.md](secrets.md).

## Once-over

The once-over is a human step. Run prompt 159 in a fresh session. The file is `hh-build-plan/prompts/159-once-over.md`. This page does not embed that prompt. Expected evidence: the once-over report exists and does not hide MISSING rows.

## Stop

Do not npm publish. Do not git push. Do not deploy. When every section above is green, stop. Tagging, a remote, and a publish stay outside this page.

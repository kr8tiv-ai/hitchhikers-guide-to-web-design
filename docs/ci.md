# CI

Three GitHub Actions workflows run on push and on pull request. They need no repository secrets. They do not deploy and they do not publish.

Every third-party action is pinned to a 40-character commit SHA. The version tag sits in a trailing comment. Workflow permissions are `contents: read`.

These pages tell you how to run the same commands on your machine.

## ci.yml

Job `unit` runs on `ubuntu-latest`, `windows-latest`, and `macos-latest` with Node.js 22.

1. On Windows, set `git config --global core.longpaths true` before checkout so long paths do not break the runner.
2. Install pnpm from the `packageManager` field, then Node 22 with the pnpm store cache.
3. `pnpm install --frozen-lockfile` when `pnpm-lock.yaml` is present. If the lockfile is missing, the step prints a warning and runs `pnpm install`.
4. `pnpm -r run --if-present lint` (skipped while no package defines `lint`).
5. `pnpm exec tsc -b`.
6. `pnpm -r test` with `HH_CASSETTE=replay`.
7. `pnpm -r run --if-present eval` with `HH_CASSETTE=replay`, so cassette evals replay once a package defines `eval`.

### Local equivalent (Windows PowerShell)

Run from the repo root.

```powershell
git config --global core.longpaths true
if (Test-Path pnpm-lock.yaml) {
  pnpm install --frozen-lockfile
} else {
  Write-Warning "No pnpm-lock.yaml yet. Falling back to pnpm install."
  pnpm install
}
pnpm -r run --if-present lint
pnpm exec tsc -b
$env:HH_CASSETTE = "replay"
pnpm -r test
pnpm -r run --if-present eval
```

## e2e.yml

Job `e2e` runs on `ubuntu-latest` only. It installs dependencies the same way as `ci.yml`, restores a Playwright browser cache keyed on the lockfile and `packages/app/package.json`, installs Chromium from `@hitchhiker/app` (the package that depends on `@playwright/test`), and runs `pnpm -r run --if-present e2e`. While no package defines `e2e`, that step is a no-op.

### Local equivalent (Windows PowerShell)

```powershell
if (Test-Path pnpm-lock.yaml) {
  pnpm install --frozen-lockfile
} else {
  Write-Warning "No pnpm-lock.yaml yet. Falling back to pnpm install."
  pnpm install
}
pnpm --filter @hitchhiker/app exec playwright install chromium
pnpm -r run --if-present e2e
```

`playwright install` downloads Chromium into the Playwright cache. On the Ubuntu runner the workflow also passes `--with-deps` so the OS libraries Chromium needs are present. Skip that flag on Windows. Run the install through `@hitchhiker/app`, because a root `pnpm exec playwright` does not see that package's binary. If the filtered command fails because Playwright is not installed yet, there is nothing to run.

## audit.yml

### Licence audit

Job `licence` installs the workspace, then runs one Node script.

- When `packages/qa/src/licenses.ts` exists, the script imports `auditDeps` from that module (the licence audit prompt 156 completes) and passes the packages from `pnpm licenses list --json`. A result other than `{ ok: true }` fails the job.
- Until that file exists, the same JSON fails the job when a licence matches GPL or AGPL.

### Local equivalent (Windows PowerShell)

```powershell
if (Test-Path pnpm-lock.yaml) {
  pnpm install --frozen-lockfile
} else {
  Write-Warning "No pnpm-lock.yaml yet. Falling back to pnpm install."
  pnpm install
}
pnpm licenses list --json
if (Test-Path packages/qa/src/licenses.ts) {
  pnpm --filter @hitchhiker/qa test
}
```

Read the JSON for `GPL` and `AGPL` until `auditDeps` is in the tree. After prompt 156, `pnpm --filter @hitchhiker/qa test` is the local gate, and the workflow calls `auditDeps` itself.

### Secret scan

Job `secret-scan` checks out full history (`fetch-depth: 0`) and runs the free gitleaks CLI. It does not use `gitleaks/gitleaks-action`. It does not read a repository secret.

The scan step downloads gitleaks 8.30.1 for `linux_x64` from the pinned GitHub release, checks the SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, and runs `gitleaks detect --source . --redact`. That command scans git history. When `.gitleaks.toml` or `.gitleaksignore` is in the repo, gitleaks loads it. This repo ships `.gitleaks.toml` with an allowlist for replay cassettes and test fixtures (hash keys that trip `generic-api-key`). Built-in rules still apply everywhere else. The CLI does not ask for a licence key, including when the repository owner is a GitHub organization.

### Local equivalent (Windows PowerShell)

```powershell
gitleaks detect --source . --redact
```

Use gitleaks 8.30.1 so the local scan matches CI. If `gitleaks` is not on `PATH`, download `gitleaks_8.30.1_windows_x64.zip` from the gitleaks releases page, check it against `gitleaks_8.30.1_checksums.txt` (SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`), and run the binary in the repo root. No package manager is required.

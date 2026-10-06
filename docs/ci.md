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

Job `e2e` runs on `ubuntu-latest` only. It installs dependencies the same way as `ci.yml`, installs Playwright's Chromium build when the `playwright` package is present, and runs `pnpm -r run --if-present e2e`. While no package defines `e2e`, that step is a no-op.

### Local equivalent (Windows PowerShell)

```powershell
if (Test-Path pnpm-lock.yaml) {
  pnpm install --frozen-lockfile
} else {
  Write-Warning "No pnpm-lock.yaml yet. Falling back to pnpm install."
  pnpm install
}
pnpm exec playwright install chromium
pnpm -r run --if-present e2e
```

`playwright install` downloads Chromium. On the Ubuntu runner the workflow also passes `--with-deps` so the OS libraries Chromium needs are present. Skip that flag on Windows. If `pnpm exec playwright` fails because the package is not installed yet, there is nothing to run.

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

Job `secret-scan` checks out full history and runs `gitleaks/gitleaks-action` at v3.0.0, pinned by commit SHA. The step receives the automatic job token as `github.token`. It does not read a repository secret, and it does not set `GITLEAKS_LICENSE`.

That action asks for a licence key when the repository owner is a GitHub organization. This workflow leaves the key unset on purpose. If a future run stops for that reason, the fix is a steward decision outside this file. Do not add a secret reference here.

### Local equivalent (Windows PowerShell)

```powershell
gitleaks detect --source . --redact
```

That is the same scanner the action installs. If `gitleaks` is not on `PATH`, download the Windows zip from the gitleaks releases page and run the binary in the repo root. No package manager is required.

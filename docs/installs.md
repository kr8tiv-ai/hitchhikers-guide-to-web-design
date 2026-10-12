# Install audit

The desk can install grok, playwright (Chromium), whisper.cpp, and pdftotext. Whisper models on the desk are tiny, tiny.en, base, and base.en. A small model is not offered. Node and pnpm are prerequisites. The desk does not download them.

The desk is not an installable app.

An install stays **unverified** until `scripts/verify-installs.ts` has downloaded it on a machine and this table records that run. A unit test with a mock is not a pass. Unverified rows stay unverified until a later run replaces them.

The harness downloads into a directory under `os.tmpdir()` and deletes it. It does not change the user or machine install. Set `HH_SKIP_INSTALL_VERIFY=1` to print `skipped` and exit 0. That flag is for CI. A local audit runs without it.

```powershell
node --experimental-strip-types scripts/verify-installs.ts
```

The table below is the 2026-10-11 run on win32-x64, Node v24.13.1. Redirect hosts are the final host that run reached.

| id | tool | model | file | bytes | checksum | hosts | result | tested | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| whisper-bin-win32-x64 | whisper |  | whisper-bin-x64.zip | 8928640 | sha256 | release-assets.githubusercontent.com | pass | 2026-10-11 | SHA-256 matched. Smoke ok. Desk check saw whisper. |
| whisper-bin-win32-arm64 | whisper |  | whisper-bin-win-cpu-arm64.zip | 4371193 | sha256 | release-assets.githubusercontent.com | unverified | 2026-10-11 | SHA-256 matched. Binary not executed because this machine is win32-x64. |
| whisper-bin-win32-ia32 | whisper |  | whisper-bin-Win32.zip | 5523979 | sha256 | release-assets.githubusercontent.com | unverified | 2026-10-11 | SHA-256 matched. Binary not executed because this machine is win32-x64. |
| whisper-bin-linux-x64 | whisper |  | whisper-bin-ubuntu-x64.tar.gz | 10364195 | sha256 | release-assets.githubusercontent.com | unverified | 2026-10-11 | SHA-256 matched. Binary not executed because this machine is win32-x64. |
| whisper-bin-linux-arm64 | whisper |  | whisper-bin-ubuntu-arm64.tar.gz | 4608377 | sha256 | release-assets.githubusercontent.com | unverified | 2026-10-11 | SHA-256 matched. Binary not executed because this machine is win32-x64. |
| whisper-darwin | whisper |  | brew install whisper-cpp |  | package-manager | github.com | unverified | 2026-10-11 | macOS command is covered by unit tests. It was not executed on Windows. |
| whisper-model-tiny | whisper | tiny | ggml-tiny.bin | 77691713 | sha256 | us.aws.cdn.hf.co | pass | 2026-10-11 | SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper. |
| whisper-model-tiny.en | whisper | tiny.en | ggml-tiny.en.bin | 77704715 | sha256 | us.aws.cdn.hf.co | pass | 2026-10-11 | SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper. |
| whisper-model-base | whisper | base | ggml-base.bin | 147951465 | sha256 | us.aws.cdn.hf.co | pass | 2026-10-11 | SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper. |
| whisper-model-base.en | whisper | base.en | ggml-base.en.bin | 147964211 | sha256 | us.aws.cdn.hf.co | pass | 2026-10-11 | SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper. |
| grok | grok |  | @xai-official/grok |  | npm registry | registry.npmjs.org | pass | 2026-10-11 | Installed with npm --prefix in scratch. Desk check saw grok. |
| playwright | playwright | chromium | playwright install chromium |  | playwright CLI | cdn.playwright.dev | pass | 2026-10-11 | Chromium installed under PLAYWRIGHT_BROWSERS_PATH in scratch. Desk check saw playwright. |
| pdftotext-win32 | pdftotext |  | oschwartz10612.Poppler |  | package-manager | poppler.freedesktop.org | unverified | 2026-10-11 | Verified from the winget-pkgs installer manifest oschwartz10612.Poppler 25.07.0-0 on 2026-10-12: InstallerType zip, NestedInstallerType portable, no Scope, no ElevationRequirement. The package installs per user. Microsoft.VCRedist.2015+ can show one Windows admin prompt when it is missing. The installer was not run, so this row stays unverified. |
| pdftotext-darwin | pdftotext |  | brew install poppler |  | package-manager | poppler.freedesktop.org | unverified | 2026-10-11 | macOS command is covered by unit tests. It was not executed on Windows. |
| pdftotext-linux | pdftotext |  | poppler-utils |  | package-manager | poppler.freedesktop.org | unverified | 2026-10-11 | Linux commands are covered by unit tests. They were not executed on Windows. |

## Sources

Recipe URLs are pinned in `packages/engine/src/tool-install/recipes.ts`. Redirects may leave the recipe host only for the list on that same source.

| Tool | Recipe URL | Redirect hosts |
| --- | --- | --- |
| whisper binary | `https://github.com/ggml-org/whisper.cpp/releases/download/b5454/<file>` | github.com, objects.githubusercontent.com, release-assets.githubusercontent.com |
| whisper model | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<file>` | huggingface.co, *.hf.co, cdn-lfs.huggingface.co, cdn-lfs-us-1.huggingface.co, us.aws.cdn.hf.co |
| grok | npm package `@xai-official/grok` (docs at `https://x.ai/docs/build/overview`) | registry.npmjs.org, x.ai, docs.x.ai |
| playwright | `pnpm exec playwright install chromium` (docs at `https://playwright.dev/docs/browsers`) | playwright.dev, cdn.playwright.dev |
| pdftotext | package manager, docs at `https://poppler.freedesktop.org/` | poppler.freedesktop.org |

`*.hf.co` matches a whole label, so `us.aws.cdn.hf.co` is allowed and `evilhf.co` is not. A GitHub download cannot hop to a Hugging Face host. http is rejected. The dialog, the check, and the downloader read this same per-source list.

## Not installed by the desk

Node and pnpm have to be on PATH before the desk can install grok or playwright. This audit used Node v24.13.1. The desk does not download Node from nodejs.org and does not download pnpm.

On Windows, when no package manager is on PATH, the install dialog links to the Microsoft Store page for App Installer. The desk does not fetch that page.

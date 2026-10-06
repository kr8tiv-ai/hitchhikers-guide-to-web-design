# Comp screenshots

`packages/app/scripts/screenshot-comps.ts` opens the three comps in Chromium (from `@playwright/test`, Apache-2.0) and writes a full-page PNG for each page, width, and theme.

Pages: `desk`, `dashboard`, `brand-kit`.
Widths: 375, 768, 1440.
Themes: `light`, `dark` (set on `documentElement.dataset.theme` before load).

Files are named `{page}-{width}-{theme}.png`.

From the repo root:

```powershell
pnpm --filter @hitchhiker/app exec node --experimental-strip-types scripts/screenshot-comps.ts
```

Chromium is a Playwright browser install, not a git dependency. If the script cannot launch it:

```powershell
pnpm --filter @hitchhiker/app exec playwright install chromium
```

The PNGs in this folder are the reviewed frames. Each file is under 400 KB, so they are committed. If a later run produces a file at or above 400 KB, leave that PNG out of git and keep this note.

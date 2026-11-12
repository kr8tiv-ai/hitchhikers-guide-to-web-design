# Imagine-first design (260 chain)

Branch: `feat/imagine-first-design` (from `main` @ `922fd750`). Requested by Matt on 2026-11-11: "use Grok Imagine to come up with sketches for whatever the person is looking for. And then we would build based off of those sketches."

This is the method that worked for the Aura H2O / Aura Farms pages and the Tina Campbell site, turned into the product:

```
brief + brand kit + DESIGN.md
   -> Grok Imagine comps (desktop fold, desktop long, mobile; K candidates each)
   -> owner picks / asks for changes (approved comps become references for the next ones)
   -> optional motion reference clips (reference-to-video from the approved comp)
   -> build prompts carry the approved comps as visual truth (text stays live HTML)
   -> compare gate: built screenshot vs approved comp, same aspect, side-by-side + metrics + vision faults
   -> section done only when the gate is clean (or the owner overrides in plain words)
```

## What exists today (main @ 922fd750)

- `packages/assets/src/imagine-http.ts`: REST client for `POST /v1/images/generations`, `POST /v1/videos/generations`, `GET /v1/videos/{id}`. Key only in the Authorization header, redacted errors, retries, poll caps. Prices in `prices.ts`, budget in `media-budget.ts`.
- `packages/assets/src/keychain.ts`: key lookup is `XAI_API_KEY`, then the OS keychain (service `hitchhikers-guide`, account `xai`). Never from a project file.
- `packages/assets/src/section-generate.ts` `resolveDeskProvider`: provider chain from `.hitchhiker` media settings: `grok-cli` (asks the signed-in Grok CLI to use its image/video generation, no key), `browser` (opt-in, hands back on captcha), `api` (opt-in, needs key + fetch).
- `packages/engine/src/spec/page-renders.ts` (245i): ONE text-free 16:9 render per primary page, drafted after the design lock, approved by sha256 in `.hitchhiker/renders.json`. `site-build.ts` refuses to generate site prompts until every primary page has an approved render.
- Gaps this chain closes:
  1. No mobile comp, no tall desktop comp, no candidates to choose from.
  2. Style refs and owner photos are listed as paths in the prompt text only; they are never sent to Imagine as image inputs, and approved comps are not fed back for consistency.
  3. No motion reference clips.
  4. The approved render gates prompt generation but is not handed to the build prompt as the thing to match.
  5. Nothing compares the built page with the approved render.
- Pending prompts in `hh-build-plan/prompts` (245g to 245t, not run yet) plan a screenshot loop against "the render" (245l), page-owned prompts naming the render (245k) and an owner-look contact sheet (245s). The 260 chain makes the approved comp set the render those prompts mean: `reference/renders/<page>.png` stays the desktop-fold comp path so 245k/245l/245s keep working unchanged when they run later.

## Verified xAI endpoints (docs.x.ai, read 2026-11-11, plus `context/sources/xai/`)

- Generate: `POST https://api.x.ai/v1/images/generations` `{ model, prompt, n (1-10), aspect_ratio, resolution?, quality? }`. Aspects include `16:9`, `9:16`, `1:2`, `9:19.5`, `9:20`.
- Edit / multi-reference: `POST https://api.x.ai/v1/images/edits` with `image: { type: "image_url", url }` for one source, or `images: [{ type: "image_url", url }, ...]` for up to 5 sources; `url` may be a public URL or a base64 data URI; optional `aspect_ratio` (default follows the first image). Billed for inputs and output.
- Reference-to-video: `POST https://api.x.ai/v1/videos/generations` with `reference_images: [{ url }, ...]`, `duration`, `aspect_ratio`, `resolution`; poll `GET /v1/videos/{request_id}` until `status` is `done` (`video.url`) or `failed`.
- Image-to-video (first frame): same endpoint with `image`.
- Models already allowed by the repo: `grok-imagine-image`, `grok-imagine-image-2.0`, `grok-imagine-image-quality`, `grok-imagine-video-1.5`, `grok-imagine-video-1.5-lite`, `grok-imagine-video`.
Do not invent any other endpoint or field.

## Rules for every 260 prompt

- Text is always live HTML. Comps are text-free (or carry neutral placeholder bars); prompts to Imagine say so; the build never uses a comp as a page image.
- No key in the repo, in prompts, in logs or in test fixtures. Tests use injected fetch / fake providers. No network, no paid call, no real Grok call in `pnpm test`. A live test stays behind `HH_LIVE=1` + `XAI_API_KEY`.
- Default provider order stays `grok-cli` first (the signed-in login, no key). The API path is opt-in and goes through the existing budget quote.
- Plain-words desk copy, no jargon, no em dashes.
- Reuse existing modules; replace and migrate callers instead of forking. `renders.json` approvals from 245i stay valid (they become the desktop-fold approval).
- Every prompt: failing test first for new behaviour, then green; `pnpm typecheck`, `pnpm lint`, and the touched packages' tests pass. Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill processes you did not start.

## Data model

`.hitchhiker/comps.json`
```json
{
  "version": 1,
  "pages": [{
    "route": "/",
    "views": {
      "desktop":      { "aspect": "16:9",   "viewport": [1440, 810],  "candidates": ["reference/comps/home/desktop-1.png", "..."], "approved": { "file": "reference/renders/home.png", "sha256": "...", "approvedAt": "...", "from": "reference/comps/home/desktop-2.png" } },
      "desktop-long": { "aspect": "1:2",    "viewport": [1440, 2880], "...": "..." },
      "mobile":       { "aspect": "9:19.5", "viewport": [390, 845],   "...": "..." }
    },
    "sections": [{ "id": "hero", "crop": "reference/comps/home/sections/hero.png", "motion": "reference/comps/home/motion/hero.mp4" }],
    "notes": ["change requests in the owner's words"]
  }]
}
```
`reference/renders/<page>.png` is always the approved desktop fold (245i path). Mobile and long comps live at `reference/renders/<page>.mobile.png` and `reference/renders/<page>.long.png`.

## Consistency chain

1. Inputs to the first comp: DESIGN.md tokens/type/brand idea, the sitemap sections, up to 5 reference images (owner photos first, then `reference/refs/*`), sent as real image inputs on the edits endpoint when the provider supports it.
2. Once the home desktop comp is approved, every later comp (other views, other pages, retries) includes it as reference image 1. Mobile of a page also includes that page's approved desktop comp.
3. A change request regenerates with the owner's words plus the current pick as reference.

## Compare gate

For each built page and each approved view: shoot the built page at the comp viewport (fold) or full page (long), composite side by side (labelled COMP / BUILD), compute deterministic metrics in Chromium canvas (no new native deps): coarse luminance layout similarity on a 32x18 grid, dominant-palette distance (ΔE), and edge-density per band. Then a vision review through `think()` with both images returns concrete faults. Clean = no blocking faults and metrics above `design.compare` floors (config, conservative defaults). Output in `qa/compare/<promptId>/` (`*.jpg` composites, `metrics.json`, `faults.md`). Faults go back as a fix turn (reuse the existing feedback-rerun path), up to `design.compare.rounds` (default 2). Out of rounds: the queue pauses for the owner with the composite, never silently passes.

## Prompt queue

See `prompts/INDEX.md`, section "260: Imagine-first design".

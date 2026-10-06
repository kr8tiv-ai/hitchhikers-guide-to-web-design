# 07 · Open 3D models, HDRIs, textures and fonts (plus AI 3D generators)

Research date: 2026-10-05. I tested the API endpoints live from the box today. Licenses are quoted from each source's own license, FAQ or API pages.

## 1. Sources at a glance

| Source | Assets | License | Programmatic access (tested today) | Agent-friendliness |
|---|---|---|---|---|
| **Poly Haven** ([polyhaven.com](https://polyhaven.com/)) | HDRIs (997), textures (865), models (521) | **CC0**: "use our assets for any purpose, including commercial work. You do not need to give credit" ([license](https://polyhaven.com/license)) | `GET https://api.polyhaven.com/assets?type=hdris\|textures\|models` and `GET /files/{id}`, which returns resolution tiers 1k–16k for HDRIs. Per [polyhaven.com/our-api](https://polyhaven.com/our-api): "now free for everyone - including commercial use… all we ask is that it's clear to your users that the assets came from Poly Haven" | ★★★★★ The default for HDRIs and PBR textures. No key needed |
| **ambientCG** ([ambientcg.com](https://ambientcg.com/)) | PBR materials (2,013 "Material" results via the API), HDRIs, models | CC0 ([docs](https://docs.ambientcg.com/api/)) | `GET https://ambientcg.com/api/v2/full_json?type=Material&limit=…` (JSON, paginated, no key) | ★★★★★ |
| **Kenney** ([kenney.nl/assets](https://kenney.nl/assets)) | Stylized low-poly kits (game-style) | **CC0**: "Attribution is not required… Do not use our logo" ([support](https://kenney.nl/support)) | Zip downloads per pack (no API) | ★★★ Good for playful/illustrative worlds; pre-download into a local library |
| **Quaternius** ([quaternius.com](https://quaternius.com/)) | Low-poly characters, nature, buildings, animated packs | **CC0**: "can be used for free without the need for attribution in commercial, educational, and personal projects. All models are under the CC0 License" ([FAQ](https://quaternius.com/faq.html)) | Pack downloads (no API) | ★★★ Pre-cache |
| **Poly Pizza** ([poly.pizza](https://poly.pizza/)) | "10,700+ free models" (low-poly), plus free asset packs | Per model: check each model page (a mix of public-domain and attribution licenses; record the author) | API exists at `api.poly.pizza`. An unauthenticated search returned **401**, so it **needs an API key** | ★★★★ Search by keyword; record the author for CC-BY |
| **Sketchfab** ([sketchfab.com](https://sketchfab.com)) | The largest catalog; filter for downloadable + license | Per model: CC0, CC-BY, CC-BY-SA, CC-BY-NC (avoid NC/ND for client sites) | Search works without auth (`GET https://api.sketchfab.com/v3/search?type=models&downloadable=true&license=cc0&q=chair` returned results). **Downloading** needs a user OAuth token: `GET /v3/models/{uid}/download` returns temporary glTF/USDZ URLs that expire in 300s ([Download API](https://sketchfab.com/developers/download-api/downloading-models)) | ★★★★ Needs an "Connect Sketchfab" OAuth step; store license and author in credits |
| **Smithsonian 3D / Open Access** ([3d.si.edu](https://3d.si.edu/), [si.edu/openaccess](https://www.si.edu/openaccess)) | Museum scans (fossils, artifacts, spacecraft); CC0 for open-access items | CC0 for designated open-access content (check each item) | Open Access API via api.data.gov (free key; [devtools](https://www.si.edu/openaccess/devtools)) | ★★★ Great for heritage, education, museum brands |
| **NASA 3D Resources** ([science.nasa.gov/3d-resources](https://science.nasa.gov/3d-resources/), [GitHub](https://github.com/nasa/NASA-3D-Resources)) | Spacecraft, planets, textures | NASA media guidelines: generally not copyrighted, but **no implied endorsement and no NASA insignia use** ([brand & usage](https://www.nasa.gov/nasa-brand-center/images-and-media/)) | Git repo / direct files | ★★★ Space themes |
| **Khronos glTF Sample Assets** ([GitHub](https://github.com/KhronosGroup/glTF-Sample-Assets)) | Reference glTF models (PBR test cases) | Per-model licenses in `LICENSES/` (REUSE) | Git | ★★ Testing and placeholders |

### Fonts
| Source | License | Access |
|---|---|---|
| **Google Fonts** ([fonts.google.com](https://fonts.google.com/)) | Open-source font licenses. Matt's brand guide: "Google Fonts are free for commercial use" | [Developer API](https://developers.google.com/fonts/docs/developer_api) lists all families with variants, axes and file URLs, sortable by popularity or trend; "requires including an API key". Self-host woff2 for performance and privacy |
| **Fontshare** ([fontshare.com](https://www.fontshare.com/)) by Indian Type Foundry | Per-font `license_type`. The API returned `itf_ffl` (ITF Free Font License). Matt: "free for personal and commercial use" | Public JSON API, no key: `GET https://api.fontshare.com/v2/fonts?limit=…` returns name, category, styles, axes, designers, license_type and CDN file paths |
| Font Squirrel, Typewolf, Fonts In Use | Browsing and discovery (Matt's guides) | Manual |

Matt's pairing rule, which the app should enforce: **two fonts max**. One display face (often Fontshare: Clash Display, Satoshi…) plus one body face (often Google). Body ≥ 16px, line height 1.4–1.6, 45–75 characters per line.

## 2. How the agent should fetch automatically

Proposed `scripts/fetch-assets.mjs` contract, driven by `ASSETS.md`, which the section plan generates:

1. **Resolve the need.** Each asset slot has `{slot, kind: hdri|texture|model|font, query, style, maxSizeMB, licenseAllow: [CC0, CC-BY], usedFor}`.
2. **Search in priority order:**
   - HDRI: Poly Haven, then ambientCG.
   - Texture: Poly Haven, then ambientCG.
   - Model: local cache (Kenney/Quaternius packs), then Poly Haven models, then Poly Pizza (key), then Sketchfab CC0/CC-BY (OAuth), then the AI generator, then user upload.
   - Font: Fontshare API, then Google Fonts API.
3. **Download the right tier.** HDRI at 1k–2k `.hdr` for web, with optional pre-filtered PMREM. Textures at 1k–2k, converted to WebP/KTX2. Models get run through `gltf-transform inspect`, then `optimize --compress meshopt|draco --texture-compress webp`, then a budget check (see 06).
4. **Record provenance automatically** in `src/data/credits.ts` / `CREDITS.json`: `{name, author, license, link, usedFor, category}`. That's the schema from Matt's Prompt 20, with categories "3D models", "Textures and HDRIs", "Fonts", "Code and libraries", "Inspiration". Poly Haven credit is courteous, and it's requested when you use their live API in a product. CC-BY *requires* attribution.
5. **Block** NC (non-commercial), ND (no-derivatives), "editorial use only" and unknown licenses. Escalate to the user instead of substituting silently (the GSD Rule-3/Rule-4 pattern from 01).
6. **Drop-in folder.** `/public/models/custom/` lets the user replace a fetched placeholder later without code changes (Matt's Prompt 17).

**Lighting beats triangles.** Matt's Aura Homes write-up: "what makes 3D look real is light, not more triangles. A free outdoor HDRI from Poly Haven, good tone mapping, soft shadows and a bit of fog beat a million extra polygons." So the default pipeline should spend effort on the HDRI choice (matching the brand's time of day and color grade from the imagery guide) before it goes hunting for high-poly models.

## 3. AI 3D generators (when no open asset fits)

| Service | API | Output | Pricing (from official docs today) | Notes |
|---|---|---|---|---|
| **Tripo** ([tripo3d.ai](https://www.tripo3d.ai/)) | `POST https://openapi.tripo3d.ai/v3/generation/image-to-model` (Bearer key; async task + poll or webhook) ([docs](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard)) | GLB with PBR (`model_url`), preview render | Credits. H-series image-to-model: 20 (no texture) / 30 (+texture); `texture_quality` detailed +20; smart low-poly +10; quad +5 ([pricing](https://docs.tripo3d.ai/get-started/pricing.html)). Search summaries put credits at $0.01 each; **confirm in the dashboard** | Models v3.1-20260211 (up to ~1.5–2M triangles). Use `smart_low_poly` for the web. Matt's prompt library already has a "3D landing page from a Tripo3D model" prompt |
| **Meshy** ([meshy.ai](https://www.meshy.ai/)) | `POST https://api.meshy.ai/openapi/v1/image-to-3d` with `target_formats: ["glb"]`, `target_polycount`, `should_remesh`, `enable_pbr` ([docs](https://docs.meshy.ai/en/api/image-to-3d)) | glb/obj/fbx/stl/usdz/3mf | meshy-7.1 image-to-3D: 20 credits mesh-only, 30 with 2K/4K textures, 35 with 8K ([pricing](https://docs.meshy.ai/en/api/pricing)) | `target_polycount` control suits web budgets |
| **Hyper3D Rodin** ([hyper3d.ai](https://hyper3d.ai/)) | HTTP API with Bearer auth; image-to-3D and text-to-3D, multipart uploads, task status, downloads ([developer.hyper3d.ai](https://developer.hyper3d.ai/)) | GLB and others | I didn't capture current pricing; check the dashboard | |
| **Spline AI** ([spline.design/ai](https://spline.design/ai)) | In-app: "Generate 3D models from a text prompt or an image… open the textured result straight in Spline" | Spline scene / export | Spline plans | Good for non-coders; less suited to the automated pipeline |

**Pipeline for generated models:** brand-consistent reference image from Grok Imagine (`grok-imagine-image-2.0`, $0.04/image per [docs.x.ai](https://docs.x.ai/docs/models); white background, no text), then Tripo or Meshy image-to-3D with a low-poly or polycount cap, then `gltf-transform optimize`, then a visual check render in a Playwright scene, then credits entry ("Generated with Tripo from an original image", plus the vendor's ToS link). Check each vendor's terms on commercial use and ownership of outputs before shipping. Free tiers often differ from paid ones.

## 4. Recommendations

- **Ship a local CC0 cache** in the starter (a curated ~50 HDRIs plus ~100 materials plus a Kenney/Quaternius subset) so 3D prompts never stall on network or keys.
- **Connectors in the app:** Sketchfab OAuth (optional), Poly Pizza key (optional), Tripo/Meshy keys (optional, pay-as-you-go). Poly Haven, ambientCG and Fontshare need no key.
- **License gate in the watchdog:** a prompt that adds a binary asset fails review unless `credits.ts` changed in the same commit (Matt: "Anything borrowed… must get a credits entry in the same commit").

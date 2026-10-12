# Gallery pack schema

The shipped file is `packages/knowledge/galleries/curated.json`. `HH_GALLERY_FILE` can point the desk at another JSON array for a test. The field rules live in `packages/knowledge/scripts/validate-gallery.ts`. The loader in `packages/engine/src/guide/suggest.ts` accepts older rows that omit the new fields. The validator requires them on the shipped pack.

Longer walk notes are in [docs/gallery.md](../../../docs/gallery.md).

## Fields

| Field | Rule |
| --- | --- |
| `id` | Stable kebab slug, unique, never reused. |
| `title` | Our headline, 3 to 9 words. |
| `name` | The site's own name. |
| `source` | Machine value: `awwwards`, `recent`, `gsap-showcase`, `aura`, or `other`. The loader still accepts legacy `godly`. The validator does not, so new rows do not use it. |
| `sourceName` | `Awwwards`, `Recent (formerly Godly)`, `GSAP Showcase`, `aura.build`, `Siteinspire`, `Minimal Gallery`, `Land-book`, `Lapa Ninja`, `Httpster`, `CSS Design Awards`, `The FWA`, `Mobbin`, `Refero`, `Codrops`, or `Direct pick`. |
| `sourcePage` | `https` listing page, or `null` for a direct pick. The host must match the source name. No tracking query (`utm_`, `ref`, `fbclid`), no fragment, no image or video file. |
| `url` | `https` site URL. Same bans as `sourcePage`. Unique after dropping `www.` and a trailing slash. |
| `family` | One family from the list below. |
| `styleWorld` | Derived from `family` by the table below. |
| `styleTags` | 2 to 5 tags from the vocabulary below. |
| `why` | One sentence, 12 to 28 words, about the thinking. |
| `palette` | `{ "note": "...", "hex": ["#RRGGBB"] }`. The note is one sentence. Hex values are 1 to 5, uppercase, and come from the site's CSS or a confirmed listing fact. |
| `typography` | One sentence, under 220 characters. Name a font only when the page or its CSS states it. |
| `borrow` | One sentence, under 220 characters. An idea or a technique, never an asset. |
| `attribution` | `Listed on <sourceName>.` or `Direct pick, no gallery listing.` The card adds the listing link from `sourcePage`. |
| `award` | `none`, `SOTD`, `Honorable Mention`, `Developer Award`, or exactly `SOTY 2025` on Lando Norris only. |
| `motionLevel` | Integer 1 to 10. `motion_level` still loads. |
| `verified` | Boolean. `false` rows stay in the file and are never dealt. |
| `verificationNote` | Required when `verified` is false. |
| `checked` | ISO date, not in the future. |
| `noted` | Still required. Starts with `Look at`, one line. The card shows `why`. |
| `industry` | A real industry label. `style_world` still loads. |

## Families

`editorial`, `brutalist`, `3d-webgl`, `scroll-gsap`, `dark-luxury`, `playful`, `minimal`, `saas`, `architecture-real-estate`, `portfolio`, `ecommerce`, `culture-art`, `fashion-beauty`, `hospitality-food`, `photography`, `nonprofit-events`, `dev-tools-craft`.

The shipped pack uses at least 12 of these, at least 6 rows each, and no family over 25 percent. At least 100 rows are verified. Unverified rows are at most 10 percent.

## Family to style world

| Family | styleWorld |
| --- | --- |
| editorial, photography, culture-art, portfolio | editorial |
| brutalist | brutalist |
| 3d-webgl | 3d-world |
| scroll-gsap, dev-tools-craft | scroll-film |
| dark-luxury, minimal, fashion-beauty, hospitality-food, architecture-real-estate, ecommerce, saas | minimal-luxury |
| playful, nonprofit-events | playful |

## Tag vocabulary

`gsap`, `webgl`, `scroll-driven`, `serif`, `grotesk`, `mono`, `dark`, `light`, `grid`, `full-bleed`, `kinetic-type`, `product-3d`, `cursor-play`, `editorial-layout`, `dense`, `airy`.

## Copy rules

Write every sentence. Do not paste a gallery description, a score, jury text, or a meta description. No exclamation marks, no em dashes, no lorem, and no banned words from the voice list. No `http` in a text field. A Site of the Day row must not contain the string `Year`. Do not call a Site of the Day a Site of the Year. `SOTY 2025` is Lando Norris only. There is no Site of the Year for 2026 in this pack.

## Check

```powershell
pnpm --filter @hitchhiker/knowledge validate:gallery
```

`--online` requests each URL once (HEAD, then GET if needed), waits one second per host, and respects robots. Tests and CI do not pass that flag.

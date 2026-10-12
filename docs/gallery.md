# Gallery walk

The walk deals four sites at a time from a curated pack. A person marks each one love, meh, or hate, and says why. Ten loves, or the end of six rounds, moves the walk to a shortlist of three to five. The desk writes one markdown file per shortlisted site, plus `INDEX.md`.

## Where the options come from

The default pack is `packages/knowledge/galleries/curated.json`. Set `HH_GALLERY_FILE` to a JSON array when a test needs a fixture. The field rules are in [packages/knowledge/galleries/SCHEMA.md](../packages/knowledge/galleries/SCHEMA.md).

The pack is offline. The desk does not call a gallery API, and it does not fetch a site while someone is walking. Cards do not use a screenshot cache.

## Families

A row has a `family` and a `styleWorld` derived from it. The interview still filters on the six worlds: editorial, 3d-world, scroll-film, brutalist, minimal-luxury, playful. A query may also pass `family`.

| Family | styleWorld |
| --- | --- |
| editorial, photography, culture-art, portfolio | editorial |
| brutalist | brutalist |
| 3d-webgl | 3d-world |
| scroll-gsap, dev-tools-craft | scroll-film |
| dark-luxury, minimal, fashion-beauty, hospitality-food, architecture-real-estate, ecommerce, saas | minimal-luxury |
| playful, nonprofit-events | playful |

With no style and no family filter, a round has at most two cards from one family, and the first round spans at least three families when the pool has them. The first ten dealt cards span at least three families. A style filter spreads across the families inside that world and can still borrow a neighbour, with the existing fill note. A family filter stays inside that family.

## How a round is picked

The order is a hash of the walk seed plus the site URL. `emptyWalk` stores the seed, default `hh`. Saved walks that omit it still load.

Quota first: up to two cards from Recent or legacy Godly, and up to two from Awwwards, when the pack has them. The rest of the four come from the GSAP showcase, aura.build (at most two), and other rows. Rows with `verified: false` are never dealt.

From round two, one slot prefers the family with the most loves so far (a tie keeps the first love), and one slot prefers a family not yet seen. That swap never shrinks the round and never repeats a URL.

`ROUND_SIZE` stays 4. `ROUND_CAP` stays 6. `LOVE_TARGET` stays 10.

## Loves and the shortlist

The tenth love, or the close of round six, opens narrowing. Fewer than three loves keep all of them. Otherwise the person picks three to five. `writeReferences` writes, for each site, the source, the listing line, the family, what to borrow, the palette, and the typography. It does not embed an image. The file ends with: Keep the thinking. Do not copy the look, and do not hotlink this site's images.

## Cards

Each card shows a generated SVG tile from `packages/app/src/gallery/tile.ts`. The tile uses the Guide colour tokens, a hash of the URL, and one composition per family. It is not a picture of the site. The card also shows our title, the why line, a borrow line, type and colour inside one disclosure, the line `Listed on <source>`, and an Open site link. The listing link, when there is one, opens in a new tab.

A bad pack is an error card. It shows the loader message and tells you to run the validator. It does not pretend the gallery is empty.

## Adding an entry

1. Open the site yourself. Write `title`, `why`, `palette`, `typography`, `borrow`, and the tags in your own words. Confirm the family from the page.
2. Keep hex values you actually saw in the CSS, or a hex the seed already recorded as a fact. Do not invent a brand colour.
3. If the page does not open, set `verified` to false, explain why, and do not invent a look.
4. Credit the gallery in `sourceName` and `sourcePage`, or use a direct pick.
5. Run `pnpm --filter @hitchhiker/knowledge validate:gallery`.
6. `validate:gallery --online` checks each URL once, with a 10 second timeout, a one second pause per host, and robots respected. Do not run it from tests or CI.

Copy rules: no gallery description, score, jury text, or screenshot. No hotlinked image. No exclamation marks. A Site of the Day is not a Site of the Year. The only Site of the Year in the pack is Lando Norris, 2025.

## Recent, formerly Godly

Matt's taste answer asks for two examples from Godly and two from Awwwards. Godly no longer has a catalog we can cite: the old host redirects to Recent, and Recent says it takes that place. There is no Godly API. The walk keeps the quota (up to two from the lead source, up to two from Awwwards) and names the lead source Recent. A saved row with `source: godly` still loads. New rows use `recent` and the source name `Recent (formerly Godly)`.

This pack has no Recent rows. The Recent listing opened, and its HTML had no outbound site links, so none were invented. Messenger, the A24 showcase page, and Illoca are absent: the first two opened with no colour we could record, and robots refused Illoca. Siteinspire, Land-book, and Lapa Ninja did not open. Nonprofit and events pages in the seed did not open, so those industries are not in this pack.

## What we do not take

We link and describe. We do not copy images, screenshots, thumbnails, video, code, CSS, jury text, scores, or descriptions. The crawler still contains its old thumbnail helper. The desk does not call it and does not serve `/api/gallery/shot`.

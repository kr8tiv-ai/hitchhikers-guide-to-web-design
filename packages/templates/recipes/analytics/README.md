# Analytics

Pick one: Plausible, Umami, or GA4. Plausible and Umami do not add a consent banner. GA4 stays silent until the visitor allows it.

Events are the names in the site-type table that KPIS.md carries: `view_item`, `add_to_cart`, `checkout_start`, `purchase`, `optin`, `cta_click`, `form_submit`, `call_click`, `booking_start`, `booking_complete`, `signup`, `project_view`, `contact`, `article_read_75`, `subscribe`, `directions_click`, `register`, `social_click`, `booking`, `donate_start`, `donate_complete`, `apply_click`, `deck_request`, `store_click`.

`planTrack` refuses an unknown name. GA4 with consent other than `granted` does not send.

## Env names

- `PLAUSIBLE_DOMAIN`
- `UMAMI_WEBSITE_ID`
- `UMAMI_SCRIPT_SRC` (the script URL from the Umami host)
- `GA4_MEASUREMENT_ID` (shape `G-` plus letters and digits)

Plausible and Umami need an account on that product. Umami can be self-hosted. GA4 needs a Google Analytics account. Do not commit ids.

## Stacks

- Astro: `astro/Analytics.astro` renders the Plausible or Umami script, or the GA4 consent banner.
- Next.js: `next/Analytics.tsx` is a client component so the banner can store a choice.
- Vite: `vite/Analytics.tsx` is the same client banner.

The blank starter page does not mount analytics.

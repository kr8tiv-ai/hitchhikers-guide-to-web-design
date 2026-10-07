# Booking

Cal.com or Calendly. Use one. The embed is the same on Astro, Next.js, and Vite.

Cal.com is open source. A Cal.com cloud account, or a self-hosted instance, is required for a real link. `CAL_LINK` is the `name/event` slug, not a full URL.

Calendly needs a Calendly account. Paid features depend on their plan. `CALENDLY_URL` must start with `https://calendly.com/`.

## Env names

- `CAL_LINK`
- `CALENDLY_URL`

Set one. Do not commit a customer booking URL if it is private. A public booking page URL is still configuration, so it stays in the environment.

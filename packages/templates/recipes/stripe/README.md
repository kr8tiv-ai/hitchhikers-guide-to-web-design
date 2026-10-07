# Stripe Payment Links

The site links to a hosted Payment Link. No card form is embedded. The same anchor works on Astro, Next.js, and Vite.

A Stripe account is required. Payment Links are created in the Stripe dashboard. Taking money is a paid relationship with Stripe.

## Env names

- `STRIPE_PAYMENT_LINK_URL`

The value must start with `https://buy.stripe.com/` or `https://donate.stripe.com/`. Do not commit a live link.

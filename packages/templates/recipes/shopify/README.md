# Shopify Buy Button

A product embed for a store that already exists. Inventory stays in Shopify. The same snippet fits Astro, Next.js, and Vite. Load the script only on the product section, not on the blank page.

A Shopify store is a paid account. The storefront access token is an environment variable.

## Env names

- `SHOPIFY_STORE_DOMAIN` (the `*.myshopify.com` host)
- `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
- `SHOPIFY_PRODUCT_ID`

The Buy Button script is `https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js`. It is not vendored in this repo.

/**
 * Shopify Buy Button. The script stays on Shopify's CDN.
 * A Shopify store is a paid account. Tokens stay in the environment.
 */

import { meta } from "./meta.ts";

export { meta };

export const BUY_BUTTON_SRC = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";

export interface ShopifyPlan {
  script: typeof BUY_BUTTON_SRC;
  domain: string | null;
  productId: string | null;
  ok: boolean;
  sends: false;
  missing: string[];
}

export function dryRunShopify(env: Record<string, string | undefined>): ShopifyPlan {
  const missing = meta.env.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) {
    return { script: BUY_BUTTON_SRC, domain: null, productId: null, ok: false, sends: false, missing };
  }
  const domain = env.SHOPIFY_STORE_DOMAIN ?? "";
  if (!domain.endsWith(".myshopify.com")) {
    return { script: BUY_BUTTON_SRC, domain: null, productId: null, ok: false, sends: false, missing: ["SHOPIFY_STORE_DOMAIN"] };
  }
  return {
    script: BUY_BUTTON_SRC,
    domain,
    productId: env.SHOPIFY_PRODUCT_ID ?? "",
    ok: true,
    sends: false,
    missing: [],
  };
}

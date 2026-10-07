/**
 * Stripe Payment Links. The hosted checkout page is the integration.
 * A Stripe account is required. The link URL comes from the environment.
 */

import { meta } from "./meta.ts";

export { meta };

const ALLOWED = ["https://buy.stripe.com/", "https://donate.stripe.com/"];

export interface StripePlan {
  href: string | null;
  ok: boolean;
  sends: false;
  reason?: string;
}

export function dryRunStripe(env: Record<string, string | undefined>): StripePlan {
  const href = env.STRIPE_PAYMENT_LINK_URL?.trim() ?? "";
  if (href.length === 0) return { href: null, ok: false, sends: false, reason: "STRIPE_PAYMENT_LINK_URL" };
  const allowed = ALLOWED.some((prefix) => href.startsWith(prefix));
  if (!allowed) return { href: null, ok: false, sends: false, reason: "url" };
  return { href, ok: true, sends: false };
}

export function paymentLinkAnchor(href: string, label = "Pay"): string {
  return `<a class="hh-pay" href="${href}">${label}</a>`;
}

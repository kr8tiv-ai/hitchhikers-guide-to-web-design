/**
 * Plausible and Umami record without a banner.
 * GA4 waits for consent. A missing grant does not send.
 */

import { isKpiEvent } from "./events.ts";

export type AnalyticsProvider = "plausible" | "umami" | "ga4";
export type Consent = "unknown" | "granted" | "denied";

export interface TrackPlan {
  provider: AnalyticsProvider;
  event: string;
  sent: boolean;
  reason?: string;
}

export function planTrack(provider: AnalyticsProvider, event: string, consent: Consent): TrackPlan {
  if (!isKpiEvent(event)) return { provider, event, sent: false, reason: "unknown event" };
  if (provider === "ga4" && consent !== "granted") {
    return { provider, event, sent: false, reason: "consent missing" };
  }
  return { provider, event, sent: true };
}

export interface AnalyticsSetup {
  provider: AnalyticsProvider | "unset";
  script: string | null;
  needsConsent: boolean;
  missing: string[];
  ok: boolean;
}

export function dryRunAnalytics(env: Record<string, string | undefined>): AnalyticsSetup {
  const domain = env.PLAUSIBLE_DOMAIN?.trim() ?? "";
  const umamiId = env.UMAMI_WEBSITE_ID?.trim() ?? "";
  const umamiSrc = env.UMAMI_SCRIPT_SRC?.trim() ?? "";
  const ga = env.GA4_MEASUREMENT_ID?.trim() ?? "";
  if (domain.length > 0) {
    return {
      provider: "plausible",
      script: "https://plausible.io/js/script.js",
      needsConsent: false,
      missing: [],
      ok: true,
    };
  }
  if (umamiId.length > 0 || umamiSrc.length > 0) {
    const missing: string[] = [];
    if (umamiId.length === 0) missing.push("UMAMI_WEBSITE_ID");
    if (umamiSrc.length === 0) missing.push("UMAMI_SCRIPT_SRC");
    return {
      provider: "umami",
      script: umamiSrc.length > 0 ? umamiSrc : null,
      needsConsent: false,
      missing,
      ok: missing.length === 0,
    };
  }
  if (ga.length > 0) {
    const ok = /^G-[A-Z0-9]+$/.test(ga);
    return {
      provider: "ga4",
      script: ok ? `https://www.googletagmanager.com/gtag/js?id=${ga}` : null,
      needsConsent: true,
      missing: ok ? [] : ["GA4_MEASUREMENT_ID"],
      ok,
    };
  }
  return {
    provider: "unset",
    script: null,
    needsConsent: false,
    missing: ["PLAUSIBLE_DOMAIN", "UMAMI_WEBSITE_ID", "GA4_MEASUREMENT_ID"],
    ok: false,
  };
}

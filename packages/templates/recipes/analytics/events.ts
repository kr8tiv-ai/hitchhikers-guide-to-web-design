/**
 * KPI event names from the site-type table that KPIS.md is specified to carry.
 * Source: CONTEXT-PACKAGE.md module 2, the tracking-events column.
 * The engine writer records the primary KPI phrase. It does not yet print these names.
 * Research 11 also names cta_click, form_submit, booking_complete, and checkout_start.
 */

export const KPI_EVENTS_BY_SITE = {
  sales: ["view_item", "add_to_cart", "checkout_start", "purchase"],
  funnel: ["optin", "checkout_start", "purchase"],
  calls: ["cta_click", "form_submit", "call_click"],
  reservations: ["booking_start", "booking_complete"],
  "sign-ups": ["signup"],
  portfolio: ["project_view", "contact"],
  content: ["article_read_75", "subscribe"],
  local: ["call_click", "directions_click"],
  event: ["register"],
  personal: ["social_click", "booking"],
  nonprofit: ["donate_start", "donate_complete"],
  recruiting: ["apply_click"],
  investor: ["deck_request"],
  app: ["store_click"],
} as const;

export type SiteTypeId = keyof typeof KPI_EVENTS_BY_SITE;

const ALL = new Set<string>(Object.values(KPI_EVENTS_BY_SITE).flat());

export function isKpiEvent(name: string): boolean {
  return ALL.has(name);
}

export function eventsForSite(id: SiteTypeId): readonly string[] {
  return KPI_EVENTS_BY_SITE[id];
}

export function allKpiEvents(): string[] {
  return [...ALL];
}

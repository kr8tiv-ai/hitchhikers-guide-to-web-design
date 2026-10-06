/**
 * Primary KPI and knowledge pack for each DP-2.3 site type.
 * KPI phrases are words. No rates, volumes, or percent signs.
 * Fourteen types: the named list in prompt 015 and the v1 table.
 * Prompt step 2 says "thirteen"; that count does not match the list.
 */

export interface SiteTypeHint {
  id: string;
  kpi: string;
  pack: string;
}

export const SITE_TYPES: readonly SiteTypeHint[] = [
  { id: "sales", kpi: "Revenue and average order value", pack: "sales-psychology" },
  { id: "funnel", kpi: "Opt-in through to purchase", pack: "sales-psychology" },
  { id: "calls", kpi: "Qualified leads", pack: "sales-psychology" },
  { id: "reservations", kpi: "Completed bookings", pack: "ux-conversion" },
  { id: "sign-ups", kpi: "New subscribers", pack: "copywriting" },
  { id: "portfolio", kpi: "Inquiries and time spent with the work", pack: "motion" },
  { id: "content", kpi: "Returning readers", pack: "seo" },
  { id: "local", kpi: "Calls and direction requests", pack: "seo" },
  { id: "event", kpi: "Registrations", pack: "copywriting" },
  { id: "personal", kpi: "Followers and bookings", pack: "copywriting" },
  { id: "nonprofit", kpi: "Donations completed", pack: "sales-psychology" },
  { id: "recruiting", kpi: "Applications started", pack: "ux-conversion" },
  { id: "investor", kpi: "Deck requests", pack: "copywriting" },
  { id: "app", kpi: "Installs started", pack: "ux-conversion" },
];

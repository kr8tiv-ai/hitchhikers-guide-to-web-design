import { meta } from "./meta.ts";

export { meta };

export interface PortfolioEntry {
  title: string;
  summary: string;
  year: number;
  cover: string;
}

export function validatePortfolio(entry: PortfolioEntry): boolean {
  if (entry.title.trim().length === 0 || entry.summary.trim().length === 0) return false;
  if (!Number.isInteger(entry.year) || entry.year < 1900 || entry.year > 2100) return false;
  if (!entry.cover.startsWith("/")) return false;
  return true;
}

export function dryRunPortfolio(entry: PortfolioEntry): { ok: boolean; collection: "portfolio"; sends: false } {
  return { ok: validatePortfolio(entry), collection: "portfolio", sends: false };
}

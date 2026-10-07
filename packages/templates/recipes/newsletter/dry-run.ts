import { ADAPTERS, type NewsletterId } from "./adapters.ts";
import { meta } from "./meta.ts";

export { meta };

export interface NewsletterDryRun {
  id: NewsletterId;
  missing: string[];
  url: string | null;
  sends: false;
  ok: boolean;
}

export function dryRunNewsletter(id: NewsletterId, env: Record<string, string | undefined>, email: string): NewsletterDryRun {
  const adapter = ADAPTERS.find((item) => item.id === id);
  if (adapter === undefined) throw new Error(`Unknown newsletter adapter: ${id}`);
  const missing = adapter.env.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) return { id, missing, url: null, sends: false, ok: false };
  try {
    const plan = adapter.plan({ email }, env);
    return { id, missing: [], url: plan.url, sends: false, ok: true };
  } catch {
    return { id, missing: [], url: null, sends: false, ok: false };
  }
}

/**
 * Cal.com or Calendly. One booking embed per page.
 * Cal.com can be self-hosted. Calendly needs a Calendly account.
 */

import { meta } from "./meta.ts";

export { meta };

export const CAL_SCRIPT = "https://app.cal.com/embed/embed.js";
export const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

export interface BookingPlan {
  provider: "cal" | "calendly" | "unset";
  script: string | null;
  target: string | null;
  ok: boolean;
  sends: false;
}

export function dryRunBooking(env: Record<string, string | undefined>): BookingPlan {
  const cal = env.CAL_LINK?.trim() ?? "";
  const calendly = env.CALENDLY_URL?.trim() ?? "";
  if (cal.length > 0) {
    if (cal.includes("://") || cal.startsWith("/")) {
      return { provider: "cal", script: null, target: null, ok: false, sends: false };
    }
    return { provider: "cal", script: CAL_SCRIPT, target: cal, ok: true, sends: false };
  }
  if (calendly.length > 0) {
    if (!calendly.startsWith("https://calendly.com/")) {
      return { provider: "calendly", script: null, target: null, ok: false, sends: false };
    }
    return { provider: "calendly", script: CALENDLY_SCRIPT, target: calendly, ok: true, sends: false };
  }
  return { provider: "unset", script: null, target: null, ok: false, sends: false };
}

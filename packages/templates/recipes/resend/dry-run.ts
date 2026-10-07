/**
 * Transactional mail through the Resend HTTP API.
 * A Resend account is required. The free tier still needs that account.
 * The key is an environment variable. This module does not send.
 */

import { meta } from "./meta.ts";

export { meta };

export interface MailPlan {
  method: "POST";
  url: "https://api.resend.com/emails";
  headers: Record<string, string> | null;
  body: { from: string; to: string; subject: string; text: string } | null;
  missing: string[];
  ok: boolean;
  sends: false;
}

export function dryRunResend(
  env: Record<string, string | undefined>,
  message: { to: string; subject: string; text: string },
): MailPlan {
  const missing = meta.env.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) {
    return {
      method: "POST",
      url: "https://api.resend.com/emails",
      headers: null,
      body: null,
      missing,
      ok: false,
      sends: false,
    };
  }
  return {
    method: "POST",
    url: "https://api.resend.com/emails",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: {
      from: env.RESEND_FROM ?? "",
      to: message.to,
      subject: message.subject,
      text: message.text,
    },
    missing: [],
    ok: true,
    sends: false,
  };
}

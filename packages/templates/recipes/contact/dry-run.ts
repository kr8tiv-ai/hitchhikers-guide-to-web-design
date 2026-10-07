/**
 * Contact and email intake. One provider per site.
 * Web3Forms, Formspree, or the host's own form action.
 * This plans the request. It does not send it.
 */

import { meta } from "./meta.ts";

export { meta };

export type ContactProvider = "web3forms" | "formspree" | "host";

export interface ContactPlan {
  provider: ContactProvider | "unset";
  url: string | null;
  method: "POST";
  body: Record<string, string> | null;
  missing: string[];
  ok: boolean;
  sends: false;
  reason?: string;
}

export interface ContactFields {
  name: string;
  email: string;
  message: string;
  company?: string;
}

function filled(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function chooseProvider(env: Record<string, string | undefined>): ContactProvider | "unset" {
  if (filled(env.WEB3FORMS_ACCESS_KEY)) return "web3forms";
  if (filled(env.FORMSPREE_FORM_ID)) return "formspree";
  if (filled(env.HOST_FORM_ACTION)) return "host";
  return "unset";
}

export function dryRunContact(env: Record<string, string | undefined>, fields: ContactFields): ContactPlan {
  const provider = chooseProvider(env);
  if (filled(fields.company)) {
    return {
      provider,
      url: null,
      method: "POST",
      body: null,
      missing: [],
      ok: false,
      sends: false,
      reason: "honeypot",
    };
  }
  if (provider === "unset") {
    return {
      provider,
      url: null,
      method: "POST",
      body: null,
      missing: [...meta.env],
      ok: false,
      sends: false,
      reason: "choose one provider",
    };
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email);
  if (!emailOk || fields.name.trim().length === 0 || fields.message.trim().length === 0) {
    return {
      provider,
      url: null,
      method: "POST",
      body: null,
      missing: [],
      ok: false,
      sends: false,
      reason: "fields",
    };
  }
  if (provider === "web3forms") {
    return {
      provider,
      url: "https://api.web3forms.com/submit",
      method: "POST",
      body: {
        access_key: env.WEB3FORMS_ACCESS_KEY ?? "",
        name: fields.name,
        email: fields.email,
        message: fields.message,
      },
      missing: [],
      ok: true,
      sends: false,
    };
  }
  if (provider === "formspree") {
    return {
      provider,
      url: `https://formspree.io/f/${env.FORMSPREE_FORM_ID ?? ""}`,
      method: "POST",
      body: { name: fields.name, email: fields.email, message: fields.message },
      missing: [],
      ok: true,
      sends: false,
    };
  }
  return {
    provider,
    url: env.HOST_FORM_ACTION ?? "",
    method: "POST",
    body: { name: fields.name, email: fields.email, message: fields.message },
    missing: [],
    ok: true,
    sends: false,
  };
}

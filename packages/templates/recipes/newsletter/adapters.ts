/**
 * One newsletter interface, seven providers.
 * plan() builds the HTTP request. subscribe() is the same call for each.
 * Dry runs pass fetchImpl that records the request and do not use the network.
 */

export type NewsletterId = "kit" | "mailchimp" | "mailerlite" | "beehiiv" | "brevo" | "klaviyo" | "hostinger-reach";

export interface SubscribeInput {
  email: string;
}

export interface SubscribePlan {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface NewsletterAdapter {
  id: NewsletterId;
  env: readonly string[];
  plan(input: SubscribeInput, env: Record<string, string | undefined>): SubscribePlan;
}

export type Env = Record<string, string | undefined>;

function need(env: Env, names: readonly string[]): void {
  const missing = names.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);
}

function emailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const kit: NewsletterAdapter = {
  id: "kit",
  env: ["KIT_API_KEY", "KIT_FORM_ID"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    return {
      method: "POST",
      url: `https://api.kit.com/v4/forms/${env.KIT_FORM_ID ?? ""}/subscribers`,
      headers: {
        Authorization: `Bearer ${env.KIT_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: { email_address: input.email },
    };
  },
};

export const mailchimp: NewsletterAdapter = {
  id: "mailchimp",
  env: ["MAILCHIMP_API_KEY", "MAILCHIMP_AUDIENCE_ID", "MAILCHIMP_SERVER_PREFIX"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    const key = env.MAILCHIMP_API_KEY ?? "";
    const token = btoa(`guide:${key}`);
    return {
      method: "POST",
      url: `https://${env.MAILCHIMP_SERVER_PREFIX ?? ""}.api.mailchimp.com/3.0/lists/${env.MAILCHIMP_AUDIENCE_ID ?? ""}/members`,
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: { email_address: input.email, status: "pending" },
    };
  },
};

export const mailerlite: NewsletterAdapter = {
  id: "mailerlite",
  env: ["MAILERLITE_API_KEY", "MAILERLITE_GROUP_ID"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    return {
      method: "POST",
      url: "https://connect.mailerlite.com/api/subscribers",
      headers: {
        Authorization: `Bearer ${env.MAILERLITE_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: { email: input.email, groups: [env.MAILERLITE_GROUP_ID ?? ""] },
    };
  },
};

export const beehiiv: NewsletterAdapter = {
  id: "beehiiv",
  env: ["BEEHIIV_API_KEY", "BEEHIIV_PUBLICATION_ID"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    return {
      method: "POST",
      url: `https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID ?? ""}/subscriptions`,
      headers: {
        Authorization: `Bearer ${env.BEEHIIV_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: { email: input.email },
    };
  },
};

export const brevo: NewsletterAdapter = {
  id: "brevo",
  env: ["BREVO_API_KEY", "BREVO_LIST_ID"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    const listId = Number(env.BREVO_LIST_ID);
    if (!Number.isInteger(listId)) throw new Error("BREVO_LIST_ID must be an integer.");
    return {
      method: "POST",
      url: "https://api.brevo.com/v3/contacts",
      headers: {
        "api-key": env.BREVO_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: { email: input.email, listIds: [listId], updateEnabled: true },
    };
  },
};

export const klaviyo: NewsletterAdapter = {
  id: "klaviyo",
  env: ["KLAVIYO_API_KEY", "KLAVIYO_LIST_ID"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    return {
      method: "POST",
      url: "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/",
      headers: {
        Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY ?? ""}`,
        revision: "2024-10-15",
        "Content-Type": "application/vnd.api+json",
      },
      body: {
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  attributes: {
                    email: input.email,
                    subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                  },
                },
              ],
            },
          },
          relationships: { list: { data: { type: "list", id: env.KLAVIYO_LIST_ID ?? "" } } },
        },
      },
    };
  },
};

export const hostingerReach: NewsletterAdapter = {
  id: "hostinger-reach",
  env: ["HOSTINGER_REACH_API_TOKEN"],
  plan(input, env) {
    need(env, this.env);
    if (!emailOk(input.email)) throw new Error("Email is not usable.");
    return {
      method: "POST",
      url: "https://developers.hostinger.com/api/reach/v1/contacts",
      headers: {
        Authorization: `Bearer ${env.HOSTINGER_REACH_API_TOKEN ?? ""}`,
        "Content-Type": "application/json",
      },
      body: { email: input.email, subscription_status: "subscribed" },
    };
  },
};

export const ADAPTERS: readonly NewsletterAdapter[] = [kit, mailchimp, mailerlite, beehiiv, brevo, klaviyo, hostingerReach];

export function adapterById(id: NewsletterId): NewsletterAdapter {
  const found = ADAPTERS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`Unknown newsletter adapter: ${id}`);
  return found;
}

export async function subscribe(
  adapter: NewsletterAdapter,
  input: SubscribeInput,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number }> {
  const plan = adapter.plan(input, env);
  const response = await fetchImpl(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: JSON.stringify(plan.body),
  });
  return { ok: response.ok, status: response.status };
}

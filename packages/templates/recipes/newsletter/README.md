# Newsletter

Seven adapters share one interface: `plan(input, env)` and `subscribe(adapter, input, env, fetchImpl)`. Ask which platform the site uses. Do not pick one in silence.

Each provider needs its own account. Kit, Mailchimp, MailerLite, Beehiiv, Brevo, Klaviyo, and Hostinger Reach are paid products with free or trial tiers. Hostinger Reach needs a Hostinger account and an API token. None of those values belong in source.

## Env names

- Kit: `KIT_API_KEY`, `KIT_FORM_ID`
- Mailchimp: `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `MAILCHIMP_SERVER_PREFIX`
- MailerLite: `MAILERLITE_API_KEY`, `MAILERLITE_GROUP_ID`
- Beehiiv: `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`
- Brevo: `BREVO_API_KEY`, `BREVO_LIST_ID`
- Klaviyo: `KLAVIYO_API_KEY`, `KLAVIYO_LIST_ID`
- Hostinger Reach: `HOSTINGER_REACH_API_TOKEN`

The same module is used on Astro, Next.js, and Vite. Call it from a server or a host function. The dry run does not perform a network request.

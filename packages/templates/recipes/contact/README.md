# Contact and email intake

One form, one provider. Pick Web3Forms, Formspree, or the host's form action. The dry run plans the POST and does not send it.

A Web3Forms or Formspree account is required for those providers. The host form uses the platform's own mail handling (Netlify Forms, Hostinger mail, or similar). No account key belongs in the repo.

## Env names

- `WEB3FORMS_ACCESS_KEY`
- `FORMSPREE_FORM_ID`
- `HOST_FORM_ACTION`

Set one. Leave the others unset. Values stay in the environment.

## Stacks

- Astro: `astro/Contact.astro`
- Next.js: `next/ContactForm.tsx`
- Vite: `vite/ContactForm.tsx`

The honeypot field is `company`. A filled honeypot is dropped. Inputs set `autocomplete` and email uses `inputmode="email"`. Targets are at least 44px tall.

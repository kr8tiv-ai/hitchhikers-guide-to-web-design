# Resend

Transactional mail via `POST https://api.resend.com/emails`. Same call on Astro, Next.js, and Vite. Run it on the server or the host function, not in the browser.

A Resend account is required. The free tier is still an account, and a verified domain (SPF, DKIM, DMARC) is required before mail to other people will deliver.

## Env names

- `RESEND_API_KEY`
- `RESEND_FROM`

Do not commit values. The dry run builds the request and sets `sends` to false.

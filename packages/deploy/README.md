# @hitchhiker/deploy

Deploy adapters for a site the Guide has already built. Nothing in this package deploys, submits a form, or sends an analytics event unless the caller returns yes. Tokens are read from the OS keychain. They are not written into the project, the deploy record, or an error message.

The stack record is `.hitchhiker/research/STACK-DECISION.md`. Astro and Vite upload built files (`dist`). Next.js is a Node server (`.next`) unless that record says static export (`out`). Astro SSR is a Node app. Hostinger site settings that are not secrets live in `.hitchhiker/deploy/host.json` (`domain`, `username`, `archivePath`). Do not put a token in that file.

A deploy that runs writes `.hitchhiker/deploy/DEPLOYS.md`. A declined yes writes nothing.

## Hostinger

Connect the official MCP server, then pass that client in. The hosted server is `https://mcp.hostinger.com` (OAuth). The local server is `npx -y @hostinger/mcp`. The adapter lists tools at runtime and calls a deploy tool only when that list contains it. Agency tools are not called. If the list has no deploy tool, the adapter uses the API. The API token is the keychain item service `hitchhikers-guide`, account `hostinger`.

Documented API routes, when the MCP list cannot deploy:

- Static archive already on the site: `POST /api/hosting/v1/accounts/{username}/websites/{domain}/deploy`
- Node build: `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds`, then `GET` that collection to poll. The build request is not sent again.

Node versions sent to the API are 18, 20, 22, or 24. The default when `host.json` omits one is 22.

## Vercel, Netlify, and Cloudflare

Static output runs through the existing yes-gated clients. The spawn inside that upload is:

- Vercel: `vercel deploy --prebuilt`
- Netlify: `netlify deploy --dir <output>`
- Cloudflare: `wrangler pages deploy <output>`

Research 11 and `docs.ts` name `wrangler deploy` for Workers static assets. This package runs `wrangler pages deploy`, which is the Pages command named for this adapter. `docs.ts` is unchanged.

Prompt 141 rejects a Node upload on these three CLIs. A Node project still runs `vercel deploy --prebuilt` after that rejection, because Next.js needs the host serverless runtime. Netlify and Cloudflare stay rejected for Node output. Their commands upload a directory of built files.

The CLI prints the deploy URL. A non-zero exit does not write a deploy record.

## Post-deploy checks

`postDeployChecks` judges a mobile Lighthouse run with the phone floor from prompt 122: performance, accessibility, best practices, and SEO all at least 90. The injected runner owns the mobile preset and the median of three runs. Every route is requested. A 404 is reported with that route. The deploy record is left in place.

The contact form is posted only after its own yes, and only to the inbox address already on the page (`data-inbox`, `hh-inbox`, or a mailto link). An analytics test event is sent only after its own yes, and only when the page includes Plausible or Umami. The report asks you to confirm the event in your dashboard.

HTTPS and the `strict-transport-security` header are checked. An `http` URL is expected to redirect to `https`. Open Graph tags are read and drawn as a text preview card.

Sitemap submission is a written instruction for Google Search Console and Bing Webmaster Tools. The Guide does not submit the sitemap.

## Opt-in live smoke

Injected tests never call a host. A live smoke uses your own account. Set `HH_LIVE` to `1` for that shell only, run one host, then unset it. Do not point it at a client you do not mean to overwrite. Hostinger deploy replaces the site files.

### Hostinger

1. Create an API token in hPanel. Hostinger shows it once. Store it in the OS keychain under service `hitchhikers-guide` and account `hostinger`.
2. Or sign in to the official MCP server (`https://mcp.hostinger.com`, or `npx -y @hostinger/mcp`) and pass that client.
3. Write `.hitchhiker/deploy/host.json` with your domain, username, and archive path. No token in the file.
4. Set `HH_LIVE` to `1` and call `deploy("hostinger", projectDir, deps)` with `yes` returning true.
5. Open the URL in `DEPLOYS.md` and run `postDeployChecks` against it. Confirm the form mail in your own inbox and the analytics event in your dashboard.
6. Unset `HH_LIVE`.

### Vercel

1. `vercel login` on your own account.
2. Build the project so `vercel deploy --prebuilt` has output to upload.
3. Set `HH_LIVE` to `1` and call `deploy("vercel", projectDir, deps)` with `yes` returning true.
4. Run `postDeployChecks` on the printed URL, then unset `HH_LIVE`.

### Netlify

1. `netlify login` on your own account.
2. Build the static output (`dist` for Astro or Vite, `out` for a Next static export).
3. Set `HH_LIVE` to `1` and call `deploy("netlify", projectDir, deps)` with `yes` returning true.
4. The command is a draft deploy. Run `postDeployChecks` on the printed URL, then unset `HH_LIVE`.

### Cloudflare

1. `wrangler login` on your own account.
2. Build the static output.
3. Set `HH_LIVE` to `1` and call `deploy("cloudflare", projectDir, deps)` with `yes` returning true. The command is `wrangler pages deploy` for that directory.
4. Run `postDeployChecks` on the `pages.dev` URL, then unset `HH_LIVE`.

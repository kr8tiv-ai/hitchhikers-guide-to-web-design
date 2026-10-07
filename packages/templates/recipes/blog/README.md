# Blog

Posts are a content collection: title, description, and date. Astro uses `astro/content.config.ts`. Next.js (`next/posts.ts`) and Vite (`vite/posts.ts`) read the same Markdown with `read-post.ts`.

Keystatic is optional. Pin `@keystatic/core@0.6.9` (MIT, https://github.com/Thinkmill/keystatic). It is not a dependency of the blank starter.

Local storage needs no account. GitHub storage needs a GitHub OAuth app, which is a registered account, and these env names:

- `KEYSTATIC_GITHUB_CLIENT_ID`
- `KEYSTATIC_GITHUB_CLIENT_SECRET`
- `KEYSTATIC_SECRET`

Leave them unset for local mode. Do not commit the values.

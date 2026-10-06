# 11 · Integrations: X, xAI, Imagine, voice, email, forms, payments, booking, CMS, analytics, hosting

Research date: 2026-10-05. Prices are as published on the linked pages on that date. Anything marked **verify** conflicts between sources or wasn't confirmed.

## 1. Identity and AI

### X account (OAuth 2.0)
- **Auth**: OAuth 2.0 Authorization Code with PKCE ([docs.x.com](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)).
  - Scopes we'd need: `tweet.read users.read offline.access` for brand context; add `tweet.write media.write` only if the user opts into launch posting.
  - Access tokens are short-lived (2h) and `offline.access` returns a refresh token.
- **API pricing**: X moved to **pay-per-use** credits ([X API pricing](https://x-preview.mintlify.app/x-api/getting-started/pricing)). Examples on that page: reading a post costs about $0.005; creating a post costs about $0.015, or $0.20 if it contains a URL; owned reads are cheaper. The same page says developers can earn back part of their spend as xAI API credits. **Verify the numbers at build time.** This is a recent change, so the posts-with-URL price matters for "launch tweet" features.
- **Media**: chunked upload via v2 `/2/media/upload` initialize → append → finalize → status ([media quickstart](https://docs.x.com/x-api/media/quickstart/media-upload-chunked)), then `POST /2/tweets` with `media.media_ids` ([create post](https://docs.x.com/x-api/posts/create-post)). Some third-party docs (bundle.social) still claim media needs OAuth 1.0a. **Verify** with a test app.
- **Matt's intent (Q24)**: the X link is mainly about *identity* (the Grok/Imagine account), with an optional pull of posts, bio and images as brand context. **MVP scope: read-only bio, avatar, banner and the last 50 posts** to feed the voice guide (Babel Fish), using user-supplied developer credentials. Launch posting is a v2 opt-in.

### xAI (Grok, Imagine, Voice)
- **Grok Build** runs locally under the user's SuperGrok login (`grok login`, or `--device-auth`), or with `XAI_API_KEY` ([Grok Build overview](https://docs.x.ai/build/overview)). Matt Q3: users need SuperGrok.
- **Imagine API** ([image guide](https://docs.x.ai/docs/guides/image-generation), [video guide](https://docs.x.ai/docs/guides/video-generation), [models](https://docs.x.ai/docs/models)):
  - Images: $0.02 (`grok-imagine-image`), $0.04 (`-image-2.0`), $0.05 (`-quality`).
  - Video: $0.02/s (`video-1.5-lite`), $0.05/s (`grok-imagine-video`), $0.08/s (`video-1.5`).
  - Async video jobs; temporary URLs.
  - **Important**: the API bills an xAI developer account (console.x.ai), which isn't necessarily the same as SuperGrok app limits. **Verify** whether Grok Build's login exposes Imagine generation. If it doesn't, the app needs an `XAI_API_KEY` for asset jobs or the **DIY path** (Matt Q20): we give ready-made prompts, the user generates them in the Grok app (counted against their subscription) and drops the files back in.
- **Budget UX**: ask for a "comfort spend" up front. Show a running estimate (for example, 8 hero stills × $0.04 + 2 × 10s video-1.5 × $0.08/s = $1.92) before each batch.
- **Voice input** (Matt Q2/Q31):
  - xAI speech-to-text supports REST transcription and real-time WebSocket streaming, 12 audio formats and word timestamps ([STT docs](https://docs.x.ai/docs/model-capabilities/audio/speech-to-text)). From the models page: $0.10/hr REST, $0.20/hr streaming.
  - Free local alternative: **whisper.cpp** (MIT; Metal/Core ML on Apple Silicon, Vulkan, WebAssembly build) ([repo](https://github.com/ggml-org/whisper.cpp)), or OpenAI Whisper ([repo](https://github.com/openai/whisper)), or in-browser Transformers.js ([docs](https://huggingface.co/docs/transformers.js/index)).
  - **Recommendation**: push-to-talk defaults to local whisper.cpp (free, private, offline). "Grok Voice" STT is an opt-in toggle (cheap at $0.10/hr, but needs an API key). The interviewer replies in text only (no TTS), per Matt Q8.

## 2. Website features (shipped out of the box, per Matt Q23)

| Need | MVP default | Alternatives | Notes |
|---|---|---|---|
| **Contact / intake form** | [Web3Forms](https://web3forms.com/) or [Formspree](https://formspree.io/) (no backend) | Netlify Forms (if on Netlify), Hostinger mail, a serverless function + Resend | Honeypot + server-side validation; mobile `inputmode`/`autocomplete` |
| **Transactional email** | [Resend](https://resend.com/pricing) (free tier: 3,000 emails/mo, 100/day) | Postmark, SES | Needs a verified domain: SPF/DKIM/DMARC (Matt's email guide covers this) |
| **Newsletter** | [Kit](https://kit.com/) embed | [Mailchimp](https://mailchimp.com/developer/), MailerLite, Beehiiv, Brevo, Klaviyo, Hostinger Reach | Matt's library prompt compares these seven; ask instead of assuming |
| **Payments / store** | [Stripe Payment Links](https://docs.stripe.com/payment-links) (no code, hosted checkout) | Stripe Checkout + serverless, Snipcart, Shopify Buy Button, Lemon Squeezy | Payment Links fit static sites; a store with inventory needs Shopify or a backend (escalate as Rule 4) |
| **Booking / reservations / calls** | [Cal.com embed](https://cal.com/help/embedding/adding-embed) | Calendly embed, OpenTable/Resy widgets for restaurants | Cal.com is open source |
| **Blog / CMS** | [Astro content collections](https://docs.astro.build/en/guides/content-collections/) (Markdown in repo; the AI writes posts) | [Keystatic](https://keystatic.com/) (git-based editor UI), [Sanity](https://www.sanity.io/) (hosted), WordPress headless | Matt Q18: offer keyword-based blog posts written for them; Schema.org `BlogPosting` |
| **Analytics / KPI tracking** | [Plausible](https://plausible.io/privacy-focused-web-analytics) (no cookie banner) or [Umami](https://umami.is/) (self-host) | GA4 (needs consent banner in the EU) | Map each KPI to an event: `cta_click`, `form_submit`, `booking_complete`, `checkout_start` |
| **Video / media** | Self-hosted MP4/WebM (AV1 + H.264) with poster | Mux, Cloudflare Stream, YouTube-nocookie | Matt's encoding recipe in report 06 |
| **Portfolio** | Content collection + image pipeline | | |
| **Special tooling** (MLS listings, maps, 3D configurators…) | **Auto-discover**: search the [MCP Registry](https://registry.modelcontextprotocol.io/) ([repo](https://github.com/modelcontextprotocol/registry)) and npm, then propose options with licenses and costs | | Install only after a safety check (Matt's masterclass "MCP safety check"; GSD's package-legitimacy gate) and user approval |

## 3. 3D generation (optional, Matt Q19)
- **Default**: open-source GLBs auto-pulled (Poly Haven, Kenney, Quaternius, ambientCG; see report 07).
- **Custom**: [Tripo API](https://www.tripo3d.ai/api) and [Meshy API](https://www.meshy.ai/api), both text/image → 3D, credit-priced (report 07). Wrap each as a tool (`generate_3d(prompt|image) → glb`) with a cost preview, then post-process with gltf-transform (Draco/Meshopt, texture resize).
- **Explain the options**: free stock (fast, generic), AI-generated (custom, costs credits, needs cleanup), or commissioned or hand-modeled (best, slow).

## 4. Hosting and deploy (Matt Q22: Hostinger first)

| Target | How the app deploys | Fit | Source |
|---|---|---|---|
| **Hostinger** (priority) | Hostinger API with a user-generated API token (Matt's masterclass step 9: "Hostinger shows it only once"). The official **Hostinger API MCP server** exposes hosting, DNS, domains and VPS tools | Shared/cloud hosting for static output; domains + email in one place | [developers.hostinger.com](https://developers.hostinger.com/), [hostinger/api-mcp-server](https://github.com/hostinger/api-mcp-server) |
| **Vercel** | `vercel deploy` CLI | Best for Next.js / SSR / ISR | vercel.com/docs/cli (blocked our fetcher; known CLI) |
| **Netlify** | `netlify deploy` CLI; free plan (300 credits/mo), Personal $9/mo | Static + forms + functions | [netlify.com/pricing](https://www.netlify.com/pricing/) |
| **Cloudflare** | Workers with static assets (`wrangler deploy`) | Fast global static + edge functions | [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) |

The app always **deploys for them *and* writes a DEPLOY.md** with manual steps (Matt Q22). Deploying is an externally visible action, so it's gated behind explicit approval in the "So Long and Thanks for All the Fish" phase. Domain + DNS: Hostinger DNS API, or the user's registrar instructions.

## 5. Inputs the app must ingest (Matt Q32)
- PDFs: pdftotext / pdf.js.
- Screenshots and images: Grok 4.7 image input.
- Website URLs: Playwright crawl capturing screenshots at 2 viewports, text, colors and fonts (computed styles), and detected libraries (`window.gsap`, `THREE`, Lenis classes).
- Pinterest boards: public board scrape via Playwright, or ask for a screenshot/export, since there's no reliable open API.
- Competitor URLs: same crawler, plus an SEO extract (titles, H1s, meta, schema, word counts).
- Existing brand guides: parse into `BRAND.md` / `VOICE.md`.

## 6. MVP recommendation
**Ship in v1:**
- X read-only link
- Imagine (API key or DIY prompts)
- Local whisper.cpp push-to-talk, plus optional xAI STT
- Web3Forms/Formspree + Resend
- Kit / Mailchimp embed choice
- Stripe Payment Links
- Cal.com embed
- Astro content collections blog + AI-written posts
- Plausible/Umami with KPI events
- Deploy to Hostinger (API/MCP) + Netlify + Cloudflare + Vercel via CLIs, always with DEPLOY.md
- MCP-registry discovery for special asks (approval-gated)

**v2:**
- X launch posting
- Keystatic/Sanity editor
- Shopify store
- Tripo/Meshy as first-class tools
- Cloud runner

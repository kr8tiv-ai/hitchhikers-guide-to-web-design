# Video

Self-hosted film. Each entry has a poster, an H.264 file, a WebM file, and captions. No streaming account is required. Encode with `scripts/optimize-media.ts`. If ffmpeg is missing, video encoding is skipped and the message says so.

The phone path uses the poster. Do not scrub a film on a small screen.

No env vars. Files stay on the site's own host. The same fields fit Astro content collections, Next.js, and Vite.

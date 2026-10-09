# Live fix 013. The crawler can fetch loopback, private and metadata addresses

From `hh-build-plan/live-bugcheck/heavy-review-1.md` item 8. Verify first.

## Read first

- `packages/crawler/src/thumbnails.ts` (`isPublicHttp`, `parseHttpUrl`), `packages/crawler/src/crawl.ts` (redirect handling), every crawler fetch entry point, and the app routes that call the crawler (imports, gallery, prior-site URLs)

## Bug

A pasted or imported URL can make the local desk GET `http://127.0.0.1:<port>/`, `http://192.168.x.x/`, or `http://169.254.169.254/`, and redirects are followed with only a scheme check.

## Spec

1. One `assertPublicTarget(url)` that resolves DNS (`dns.lookup` with `all: true`) and rejects loopback, unspecified, link-local (incl. 169.254.0.0/16 and fe80::/10), private (10/8, 172.16/12, 192.168/16, fc00::/7), CGNAT 100.64/10, multicast, and IPv4-mapped IPv6 forms of those. Literal IPs and `localhost`/`*.localhost` too.
2. Apply it to the first URL and to every redirect hop (manual redirects, max hops kept). Connect to the resolved address where the HTTP client allows it (pin), otherwise re-check right before the request.
3. A clear error to the person: "That address is on your own network, so the Guide will not fetch it."
4. Tests with an injected resolver: each blocked range, a public host allowed, a redirect from public to 127.0.0.1 blocked. No real network in tests.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run crawler and app tests. All exit 0.

## Commit

```
fix(crawler): refuse private, loopback and metadata addresses on every hop
```
Do not push.

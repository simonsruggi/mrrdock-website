# mrrdock-website

Landing page for [MRRDock](https://github.com/simonsruggi/MRRDock) — the free, open-source
MRR tracker for the macOS menu bar.

**Live:** https://mrrdock.simoneruggiero.com

Static pages in `public/` plus a small Pages Functions layer (`functions/_middleware.js` →
`src/router.js`) for the read-only API, the MCP server and markdown negotiation, deployed to
Cloudflare Pages (project `mrrdock`) on every push to `main`. No framework, no npm dependencies.

## Why it exists

The GitHub repo alone does not rank: competitors (CatBar, IndieBar, MRRTracker) each own a
domain, a Product Hunt page or a Mac App Store listing. This page is the indexable,
linkable home for the product — schema.org `SoftwareApplication` + `FAQPage`, `llms.txt` for
AI crawlers, IndexNow on every deploy — and it is "agent-ready": AI assistants get the same facts
as JSON, markdown or MCP tools.

## For agents

| URL | What |
| --- | --- |
| `/llms.txt` | Product summary + "When to use MRRDock" |
| `/docs` | Developer docs (also `/developers`) |
| `/openapi.json` | OpenAPI 3.1 of the read-only API |
| `/api/v1/info`, `/api/v1/platforms[/{id}]`, `/api/v1/release` | Product facts; the release is read live from the app's Sparkle feed |
| `/mcp` | MCP server, Streamable HTTP, tools `get_mrrdock_info`, `list_supported_platforms`, `get_latest_release` |
| `/.well-known/api-catalog`, `/.well-known/mcp/server-card.json` | Discovery |
| `Accept: text/markdown` | Markdown version of every page (and of 404s) |

No authentication, 60 requests/minute per IP, errors as `application/problem+json`.

## Layout

```
data/product.js     THE source of truth: every fact about the app lives here
src/                router, API, MCP, OpenAPI, markdown/llms.txt (all read data/product.js)
functions/          Pages middleware, just calls src/router.js
public/index.html   the home (hand-written; <!-- gen:* --> blocks are generated)
public/{about,contact,privacy,docs,404}.html, sitemap.xml   generated, don't edit
public/og.png       1280×640 social preview, generated with scripts/make-og.py
public/<uuid>.txt   IndexNow key
scripts/build.mjs   regenerates public/ from data/product.js (--check in CI)
tests/              node --test: API, MCP, markdown, 404s, coherence with public/
URLS.txt            one URL per line, used by the IndexNow script and for HTTP checks
```

Change a fact → edit `data/product.js` → `npm run build` → `npm run check` → commit.

## Deploy

Push to `main`. The workflow runs `npm run check` (public/ up to date + tests), writes `public/version.txt`, deploys to Cloudflare Pages,
verifies from the outside that production serves that commit, the H1, the API, MCP, real
404s and markdown negotiation, submits the URLs to IndexNow and notifies Discord.

Check what is live:

```bash
curl -s https://mrrdock.simoneruggiero.com/version.txt
```

## Moving to a dedicated domain

`mrrdock.app` was free at the time of writing. To switch: add the custom domain to the
`mrrdock` Pages project, replace the subdomain in `public/index.html` (canonical, og:url,
JSON-LD `@id`/urls), `sitemap.xml`, `robots.txt`, `llms.txt`, `URLS.txt`,
`scripts/indexnow-submit.sh` and the workflow smoke test, then 301 the old subdomain to it.

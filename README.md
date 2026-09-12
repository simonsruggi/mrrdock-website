# mrrdock-website

Landing page for [MRRDock](https://github.com/simonsruggi/MRRDock) — the free, open-source
MRR tracker for the macOS menu bar.

**Live:** https://mrrdock.simoneruggiero.com

Static single page, no build step and no framework: `public/` is deployed as-is to
Cloudflare Pages (project `mrrdock`) on every push to `main`.

## Why it exists

The GitHub repo alone does not rank: competitors (CatBar, IndieBar, MRRTracker) each own a
domain, a Product Hunt page or a Mac App Store listing. This page is the indexable,
linkable home for the product — schema.org `SoftwareApplication` + `FAQPage`, `llms.txt` for
AI crawlers, IndexNow on every deploy.

## Layout

```
public/index.html   the page (inline CSS, no JS)
public/og.png       1280×640 social preview, generated with scripts/make-og.py
public/llms.txt     what the product is, for AI crawlers
public/robots.txt   + sitemap.xml
public/<uuid>.txt   IndexNow key
scripts/            IndexNow submit, OG image generator
URLS.txt            one URL per line, used by the IndexNow script and for HTTP checks
```

## Deploy

Push to `main`. The workflow writes `public/version.txt`, deploys to Cloudflare Pages,
verifies from the outside that production serves that commit and that the H1 is in the
served HTML, submits the URLs to IndexNow and notifies Discord.

Check what is live:

```bash
curl -s https://mrrdock.simoneruggiero.com/version.txt
```

## Moving to a dedicated domain

`mrrdock.app` was free at the time of writing. To switch: add the custom domain to the
`mrrdock` Pages project, replace the subdomain in `public/index.html` (canonical, og:url,
JSON-LD `@id`/urls), `sitemap.xml`, `robots.txt`, `llms.txt`, `URLS.txt`,
`scripts/indexnow-submit.sh` and the workflow smoke test, then 301 the old subdomain to it.

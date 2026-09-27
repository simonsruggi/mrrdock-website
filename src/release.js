// Latest release, read from the Sparkle feed the app itself uses to update:
// whatever the app offers as an update is what the API reports, with no
// version number to keep in sync by hand.
import { PRODUCT } from "../data/product.js";

const FEED = PRODUCT.distribution.updateFeed;
const CACHE_SECONDS = 900;

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};
const attr = (xml, name) => {
  const m = xml.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

// First <item> of the feed = newest release (the release script prepends).
export function parseAppcast(xml) {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!item) return null;
  const body = item[1];
  const version = tag(body, "sparkle:shortVersionString");
  if (!version || !/^\d+(\.\d+){0,3}$/.test(version)) return null;
  const pub = tag(body, "pubDate");
  const date = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null;
  const enclosure = body.match(/<enclosure[\s\S]*?\/>/);
  const length = enclosure ? Number(attr(enclosure[0], "length")) : NaN;
  return {
    version,
    build: tag(body, "sparkle:version"),
    publishedAt: date,
    minimumMacOS: tag(body, "sparkle:minimumSystemVersion"),
    downloadUrl: enclosure ? attr(enclosure[0], "url") : null,
    downloadSizeBytes: Number.isFinite(length) ? length : null,
    releaseNotesUrl: `${PRODUCT.links.releases}/tag/v${version}`,
  };
}

// Returns { ok: true, release } or { ok: false } when the feed can't be read.
export async function latestRelease(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(FEED, {
      headers: { "User-Agent": "mrrdock-website" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!res.ok) return { ok: false };
    const release = parseAppcast(await res.text());
    return release ? { ok: true, release: { ...release, source: FEED } } : { ok: false };
  } catch {
    return { ok: false };
  }
}

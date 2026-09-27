// Read-only REST API over data/product.js (+ the live update feed for releases).
import { SITE_URL, API_VERSION, PRODUCT, PLATFORMS, FEATURES, MRR_FORMULA, FAQ, ALTERNATIVES } from "../data/product.js";
import { latestRelease } from "./release.js";

// Fixed window kept in memory: each Worker isolate counts on its own, so the
// limit is best-effort per edge location (stated as such in /docs).
export const RATE_LIMIT = { limit: 60, windowSeconds: 60 };

export const ERROR_CODES = {
  not_found: "No endpoint at this path.",
  platform_not_found: "No supported platform with that id.",
  invalid_parameter: "A query parameter has an invalid value.",
  method_not_allowed: "Only GET, HEAD and OPTIONS are accepted.",
  rate_limited: "Too many requests from this IP.",
  release_feed_unavailable: "The app's update feed could not be read right now.",
};

export const SUPPORT_FIELDS = ["mrr", "activeSubscriptions", "trials", "revenue28d"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const hits = new Map();
export function rateLimit(request) {
  const key = request.headers.get("cf-connecting-ip") || "anonymous";
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || now >= entry.reset) {
    if (hits.size > 5000) hits.clear();
    entry = { count: 0, reset: now + RATE_LIMIT.windowSeconds * 1000 };
    hits.set(key, entry);
  }
  entry.count += 1;
  const remaining = Math.max(0, RATE_LIMIT.limit - entry.count);
  const reset = Math.max(1, Math.ceil((entry.reset - now) / 1000));
  const headers = {
    "RateLimit-Policy": `"default";q=${RATE_LIMIT.limit};w=${RATE_LIMIT.windowSeconds}`,
    RateLimit: `"default";r=${remaining};t=${reset}`,
  };
  const limited = entry.count > RATE_LIMIT.limit;
  if (limited) headers["Retry-After"] = String(reset);
  return { limited, headers };
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
      ...CORS,
      ...headers,
    },
  });
}

export function problem(status, code, title, detail, resolution, headers = {}) {
  return new Response(
    JSON.stringify({ type: `${SITE_URL}/docs#errors`, title, status, code, detail, resolution }, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/problem+json; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORS,
        ...headers,
      },
    }
  );
}

const platformSummary = (p) => ({
  id: p.id,
  name: p.name,
  supports: Object.fromEntries(SUPPORT_FIELDS.map((f) => [f, p[f]])),
  apiUsed: p.apiUsed,
  key: p.key,
  notes: p.notes,
  url: `${SITE_URL}/api/v1/platforms/${p.id}`,
});

export function productInfo(release) {
  return {
    name: PRODUCT.name,
    tagline: PRODUCT.tagline,
    summary: PRODUCT.summary,
    category: PRODUCT.category,
    platform: PRODUCT.platform,
    license: PRODUCT.license,
    price: PRODUCT.price,
    requirements: PRODUCT.requirements,
    install: PRODUCT.install,
    distribution: PRODUCT.distribution,
    latestRelease: release,
    supportedPlatforms: PLATFORMS.map((p) => ({ id: p.id, name: p.name })),
    features: FEATURES.map((f) => ({ name: f.name, description: f.text })),
    mrrCalculation: MRR_FORMULA,
    privacy: PRODUCT.privacy,
    alternatives: ALTERNATIVES,
    faq: FAQ.map((f) => ({ question: f.q, answer: f.a })),
    tech: PRODUCT.tech,
    links: PRODUCT.links,
    author: { name: PRODUCT.author.name, url: PRODUCT.author.url, github: PRODUCT.author.github },
  };
}

// Returns { platforms } or { error: "invalid_parameter", detail }.
export function listPlatforms(supports) {
  if (supports === undefined || supports === null || supports === "") {
    return { platforms: PLATFORMS.map(platformSummary) };
  }
  if (!SUPPORT_FIELDS.includes(supports)) {
    return { error: "invalid_parameter", detail: `supports must be one of: ${SUPPORT_FIELDS.join(", ")}.` };
  }
  return { platforms: PLATFORMS.filter((p) => p[supports] === true || p[supports] === "optional").map(platformSummary) };
}

export function getPlatform(id) {
  const p = PLATFORMS.find((x) => x.id === id);
  return p ? platformSummary(p) : null;
}

export const ENDPOINTS = [
  { method: "GET", path: "/api/v1/info", description: "Everything about MRRDock: requirements, install, latest release, platforms, features, privacy, FAQ." },
  { method: "GET", path: "/api/v1/platforms", description: "Supported payment platforms and what each one reports. Optional ?supports=mrr|activeSubscriptions|trials|revenue28d." },
  { method: "GET", path: "/api/v1/platforms/{id}", description: "One platform: coverage, API used, key and permissions needed." },
  { method: "GET", path: "/api/v1/release", description: "Latest release (version, build, date, download URL, minimum macOS), read live from the app's update feed." },
];

const withHeaders = (res, headers) => {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
};

const RELEASE_UNAVAILABLE = () =>
  problem(
    503,
    "release_feed_unavailable",
    "Release feed unavailable",
    "The app's update feed could not be read right now.",
    `Retry in a minute, or read ${PRODUCT.links.releases} directly.`,
    { "Retry-After": "60" }
  );

// Handles every /api path. Returns a Response.
export async function handleApi(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return problem(405, "method_not_allowed", "Method not allowed", `${request.method} is not supported: the API is read-only.`, "Use GET.", {
      Allow: "GET, HEAD, OPTIONS",
    });
  }

  const rl = rateLimit(request);
  if (rl.limited) {
    return problem(
      429,
      "rate_limited",
      "Too Many Requests",
      `More than ${RATE_LIMIT.limit} requests in ${RATE_LIMIT.windowSeconds} seconds.`,
      "Wait for the number of seconds in the Retry-After header, then retry.",
      rl.headers
    );
  }

  let res;
  if (path === "/api" || path === "/api/v1") {
    res = json({
      name: `${PRODUCT.name} public API`,
      version: API_VERSION,
      readOnly: true,
      authentication: "none",
      docs: `${SITE_URL}/docs`,
      openapi: `${SITE_URL}/openapi.json`,
      mcp: `${SITE_URL}/mcp`,
      endpoints: ENDPOINTS.map((e) => ({ ...e, url: `${SITE_URL}${e.path}` })),
    });
  } else if (path === "/api/v1/info") {
    const r = await latestRelease(fetchImpl);
    res = json(productInfo(r.ok ? r.release : null));
  } else if (path === "/api/v1/platforms") {
    const out = listPlatforms(url.searchParams.get("supports"));
    res = out.error
      ? problem(400, out.error, "Invalid parameter", out.detail, "Omit ?supports to list every platform.")
      : json(out);
  } else if (path.startsWith("/api/v1/platforms/")) {
    const id = path.slice("/api/v1/platforms/".length);
    const p = /^[a-z0-9-]{1,32}$/.test(id) ? getPlatform(id) : null;
    res = p
      ? json({ platform: p })
      : problem(
          404,
          "platform_not_found",
          "Platform not found",
          "No supported platform with that id.",
          `Valid ids: ${PLATFORMS.map((x) => x.id).join(", ")}. Platforms without native support can be read through the 'custom' HTTPS endpoint.`
        );
  } else if (path === "/api/v1/release") {
    const r = await latestRelease(fetchImpl);
    res = r.ok ? json({ release: r.release }) : RELEASE_UNAVAILABLE();
  } else {
    res = problem(404, "not_found", "Not Found", `No endpoint at ${path.slice(0, 200)}.`, `See ${SITE_URL}/api/v1 for the list of endpoints.`);
  }
  return withHeaders(res, rl.headers);
}

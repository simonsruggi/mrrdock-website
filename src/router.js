// Everything dynamic on the site. Static files in public/ are served by Pages
// (next()); this adds the API, MCP, generated documents, markdown negotiation,
// discovery Link headers and markdown 404s.
import { SITE_URL } from "../data/product.js";
import { handleApi, json } from "./api.js";
import { handleMcp, serverCard } from "./mcp.js";
import { buildOpenApi } from "./openapi.js";
import { llmsTxt, MARKDOWN_PAGES, notFoundMarkdown } from "./content.js";

export const LINK_HEADER = [
  `</llms.txt>; rel="describedby"; type="text/plain"`,
  `</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"`,
  `</docs>; rel="service-doc"; type="text/html"`,
  `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  `</.well-known/mcp/server-card.json>; rel="service-meta"; type="application/json"`,
  `</mcp>; rel="mcp-server"`,
].join(", ");

const text = (body, type, extra = {}) =>
  new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      ...extra,
    },
  });

const apiCatalog = () => ({
  linkset: [
    {
      anchor: `${SITE_URL}/api/v1`,
      "service-desc": [{ href: `${SITE_URL}/openapi.json`, type: "application/vnd.oai.openapi+json;version=3.1" }],
      "service-doc": [{ href: `${SITE_URL}/docs`, type: "text/html" }],
      "service-meta": [{ href: `${SITE_URL}/.well-known/mcp/server-card.json`, type: "application/json" }],
    },
  ],
});

const GENERATED = {
  "/llms.txt": () => text(llmsTxt(), "text/plain"),
  "/openapi.json": () => json(buildOpenApi()),
  "/.well-known/api-catalog": () =>
    new Response(JSON.stringify(apiCatalog(), null, 2), {
      headers: {
        "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    }),
  "/.well-known/mcp/server-card.json": () => json(serverCard()),
};

const wantsMarkdown = (request) => (request.headers.get("accept") || "").toLowerCase().includes("text/markdown");

const normalize = (pathname) => {
  const p = pathname.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "");
  return p.length > 1 ? p.replace(/\/+$/, "") : "/";
};

export async function route(request, next, fetchImpl = fetch) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api" || path.startsWith("/api/")) return handleApi(request, fetchImpl);
  if (path === "/mcp" || path === "/mcp/") return handleMcp(request, fetchImpl);

  const isRead = request.method === "GET" || request.method === "HEAD";
  if (isRead && GENERATED[path]) return GENERATED[path]();

  if (isRead && wantsMarkdown(request)) {
    const page = MARKDOWN_PAGES[normalize(path)];
    const headers = { Vary: "Accept", Link: LINK_HEADER };
    if (page) return text(page(), "text/markdown", headers);
    // Only answer markdown for paths that really have no static file.
    const res = await next();
    if (res.status === 404) {
      return new Response(notFoundMarkdown(path), {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", ...headers },
      });
    }
    return res;
  }

  const res = await next();
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("text/html")) return res;
  const out = new Response(res.body, res);
  out.headers.append("Vary", "Accept");
  out.headers.set("Link", LINK_HEADER);
  return out;
}

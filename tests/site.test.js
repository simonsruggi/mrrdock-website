// node --test tests/  — exercises the router the way Pages runs it, with a
// fake static layer (next) and a fake update feed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { route } from "../src/router.js";
import { parseAppcast } from "../src/release.js";
import { PRODUCT, PLATFORMS, FAQ, SITE_URL } from "../data/product.js";

const APPCAST = readFileSync(new URL("./fixtures/appcast.xml", import.meta.url), "utf8");
const feed = async () => new Response(APPCAST, { status: 200 });
const deadFeed = async () => new Response("nope", { status: 500 });

const STATIC = {
  "/": "<html>home</html>",
  "/about": "<html>about</html>",
  "/og.png": null,
};
const next = (path) => async () =>
  path in STATIC
    ? new Response(STATIC[path] ?? "png", { headers: { "content-type": STATIC[path] ? "text/html; charset=utf-8" : "image/png" } })
    : new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

let ip = 0;
const req = (path, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", `10.0.0.${++ip % 250}`);
  return new Request(`${SITE_URL}${path}`, { ...init, headers });
};
const get = (path, init, f = feed) => route(req(path, init), next(path), f);

test("appcast parsing returns the first item", () => {
  const r = parseAppcast(APPCAST);
  assert.equal(r.version, "1.1.2");
  assert.equal(r.build, "4");
  assert.equal(r.minimumMacOS, PRODUCT.requirements.minimumMacOS);
  assert.match(r.downloadUrl, /v1\.1\.2\/MRRDock\.zip$/);
  assert.equal(r.publishedAt, "2026-09-27T09:50:18.000Z");
});

test("/api/v1/info is JSON with live release and product facts", async () => {
  const res = await get("/api/v1/info");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.ok(res.headers.get("ratelimit"));
  const body = await res.json();
  assert.equal(body.name, "MRRDock");
  assert.equal(body.latestRelease.version, "1.1.2");
  assert.equal(body.install.homebrew.command, PRODUCT.install.homebrew.command);
  assert.equal(body.supportedPlatforms.length, PLATFORMS.length);
  assert.equal(body.faq.length, FAQ.length);
});

test("/api/v1/info survives a dead feed with latestRelease null", async () => {
  const body = await (await get("/api/v1/info", {}, deadFeed)).json();
  assert.equal(body.latestRelease, null);
});

test("/api/v1/release: 200 live, 503 problem when the feed is down", async () => {
  assert.equal((await (await get("/api/v1/release")).json()).release.version, "1.1.2");
  const res = await get("/api/v1/release", {}, deadFeed);
  assert.equal(res.status, 503);
  assert.match(res.headers.get("content-type"), /application\/problem\+json/);
  assert.equal((await res.json()).code, "release_feed_unavailable");
});

test("platforms list, filter, single, errors", async () => {
  const all = await (await get("/api/v1/platforms")).json();
  assert.deepEqual(all.platforms.map((p) => p.id), PLATFORMS.map((p) => p.id));
  const trials = await (await get("/api/v1/platforms?supports=trials")).json();
  assert.ok(trials.platforms.every((p) => p.supports.trials === true));
  assert.ok(!trials.platforms.some((p) => p.id === "gumroad"));
  const bad = await get("/api/v1/platforms?supports=cohorts");
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, "invalid_parameter");
  assert.equal((await (await get("/api/v1/platforms/stripe")).json()).platform.name, "Stripe");
  const missing = await get("/api/v1/platforms/superwall");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "platform_not_found");
});

test("unknown API path and write methods are problem+json", async () => {
  const res = await get("/api/v2/whatever");
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /problem\+json/);
  const post = await get("/api/v1/info", { method: "POST", body: "{}" });
  assert.equal(post.status, 405);
  assert.equal((await post.json()).code, "method_not_allowed");
});

test("rate limit returns 429 with Retry-After", async () => {
  let last;
  for (let i = 0; i < 61; i++) last = await get("/api/v1/platforms", { headers: { "cf-connecting-ip": "192.0.2.1" } });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
  assert.equal((await last.json()).code, "rate_limited");
});

test("openapi, api-catalog, server card, llms.txt are valid and consistent", async () => {
  const spec = await (await get("/openapi.json")).json();
  assert.equal(spec.openapi, "3.1.0");
  const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
  assert.ok(ops.every((o) => o.operationId && o.description));
  assert.equal(new Set(ops.map((o) => o.operationId)).size, ops.length);
  for (const path of Object.keys(spec.paths)) {
    const concrete = path.replace("{id}", "stripe");
    assert.equal((await get(concrete)).status, 200, `${path} declared but not served`);
  }
  const cat = await get("/.well-known/api-catalog");
  assert.match(cat.headers.get("content-type"), /application\/linkset\+json/);
  assert.ok((await cat.json()).linkset[0]["service-desc"]);
  const card = await (await get("/.well-known/mcp/server-card.json")).json();
  assert.equal(card.transport.endpoint, `${SITE_URL}/mcp`);
  const llms = await (await get("/llms.txt")).text();
  assert.match(llms, /## When to use MRRDock/);
  assert.ok(llms.includes(PRODUCT.install.homebrew.command));
  for (const m of llms.matchAll(/`GET (\/api\/[^`]+)`/g)) {
    const res = await get(m[1].replace("{id}", "stripe"));
    assert.equal(res.status, 200, `${m[1]} in llms.txt not served`);
  }
});

test("MCP: initialize, tools/list, tools/call, errors", async () => {
  const rpc = (body) =>
    get("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
  const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
  assert.equal(init.result.serverInfo.name, "mrrdock");
  const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["get_mrrdock_info", "list_supported_platforms", "get_latest_release"]);
  const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_supported_platforms", arguments: { platform: "revenuecat" } } })).json();
  assert.equal(call.result.structuredContent.platform.id, "revenuecat");
  const rel = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_latest_release", arguments: {} } })).json();
  assert.equal(rel.result.structuredContent.release.version, "1.1.2");
  const unknown = await (await rpc({ jsonrpc: "2.0", id: 5, method: "nope" })).json();
  assert.equal(unknown.error.code, -32601);
  const notif = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notif.status, 202);
  assert.equal((await get("/mcp")).status, 405);
});

test("markdown negotiation on pages, Vary and Link on HTML", async () => {
  for (const path of ["/", "/about", "/contact", "/privacy-policy", "/docs"]) {
    const res = await get(path, { headers: { accept: "text/markdown" } });
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type"), /^text\/markdown/);
    assert.match(res.headers.get("vary"), /Accept/);
    assert.ok((await res.text()).startsWith("# "), path);
  }
  const html = await get("/");
  assert.match(html.headers.get("content-type"), /text\/html/);
  assert.match(html.headers.get("vary"), /Accept/);
  assert.match(html.headers.get("link"), /rel="service-desc"/);
});

test("real 404s, markdown body when asked, static assets untouched", async () => {
  assert.equal((await get("/does-not-exist")).status, 404);
  const md = await get("/does-not-exist", { headers: { accept: "text/markdown" } });
  assert.equal(md.status, 404);
  assert.match(md.headers.get("content-type"), /text\/markdown/);
  assert.ok((await md.text()).length > 20);
  const png = await get("/og.png", { headers: { accept: "text/markdown" } });
  assert.equal(png.headers.get("content-type"), "image/png");
});

test("static pages carry facts from data/product.js", () => {
  const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
  const home = read("index.html");
  assert.ok(home.includes(PRODUCT.install.homebrew.command));
  assert.ok(home.includes('href="/docs"'), "home must link the docs");
  assert.ok(home.includes("utm_source=MRRDock&amp;utm_medium=footer"));
  for (const p of PLATFORMS) assert.ok(home.includes(p.name), p.name);
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const app = ld["@graph"].find((n) => n["@type"] === "SoftwareApplication");
  assert.ok(app.sameAs.includes(PRODUCT.links.repository));
  for (const f of ["about.html", "contact.html", "privacy-policy.html"]) {
    const textLen = read(f).replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").length;
    assert.ok(textLen > 1000, `${f} too short (${textLen})`);
  }
});

test("old privacy URLs redirect permanently to /privacy-policy", () => {
  const rules = readFileSync(new URL("../public/_redirects", import.meta.url), "utf8");
  for (const from of ["/privacy", "/privacy/", "/privacy.html"]) {
    assert.ok(rules.split("\n").includes(`${from} /privacy-policy 301`), from);
  }
  assert.doesNotMatch(rules, /\s404\s*$/m, "a 404 line makes Pages drop the whole file");
});

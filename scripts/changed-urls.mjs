#!/usr/bin/env node
// Maps files touched by a push to site URLs for the Discord deploy notification.
//
// Usage: node scripts/changed-urls.mjs <base-sha> [head-sha]
// Prints one markdown link per changed URL (max 6), empty if nothing maps.
// Works with Next.js (app router), static HTML, Astro, and public files.

import { execFileSync } from "node:child_process";

const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const MAX = 6;
const ZERO = "0".repeat(40);

const [baseArg, headArg = "HEAD"] = process.argv.slice(2);
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const exists = (rev) => {
  try { git(["cat-file", "-e", `${rev}^{commit}`]); return true; } catch { return false; }
};
const usable = baseArg && baseArg !== ZERO && baseArg !== headArg && exists(baseArg);
const range = usable ? `${baseArg}..${headArg}` : `${headArg}~1..${headArg}`;

let files = [];
try {
  files = git(["diff", "--name-only", range]).split("\n").filter(Boolean);
} catch {
  try { files = git(["show", "--name-only", "--pretty=format:", headArg]).split("\n").filter(Boolean); }
  catch { process.exit(0); }
}

const ASSET_RE = /\.(webp|jpe?g|png|gif|svg|ico|woff2?|ttf|eot|mp4|mp3|wav|ogg|pdf)$/i;
const paths = new Set();

for (const file of files) {
  // Next.js app router: app/[lang]/foo/bar/page.tsx -> /foo/bar
  const appRoute = file.match(/^(?:src\/)?app\/(.+)\/page\.[jt]sx?$/);
  if (appRoute) {
    const segs = appRoute[1].split("/").filter((s) => !s.startsWith("[") && !s.startsWith("("));
    paths.add("/" + segs.join("/"));
    continue;
  }

  // Next.js app router: app/page.tsx -> /
  if (/^(?:src\/)?app\/page\.[jt]sx?$/.test(file)) {
    paths.add("/");
    continue;
  }

  // Next.js pages router: pages/foo.tsx -> /foo
  const pagesRoute = file.match(/^(?:src\/)?pages\/(.+)\.[jt]sx?$/);
  if (pagesRoute) {
    const name = pagesRoute[1];
    if (name === "index") paths.add("/");
    else if (name === "_app" || name === "_document") continue;
    else if (!name.startsWith("[")) paths.add("/" + name.replace(/\/index$/, ""));
    continue;
  }

  // Astro: src/pages/foo.astro -> /foo
  const astroRoute = file.match(/^src\/pages\/(.+)\.astro$/);
  if (astroRoute) {
    const name = astroRoute[1];
    if (name === "index") paths.add("/");
    else paths.add("/" + name.replace(/\/index$/, ""));
    continue;
  }

  // Public files (non-assets): public/foo.html -> /foo or /foo.html
  const pub = file.match(/^public\/(.+)$/);
  if (pub && !ASSET_RE.test(pub[1]) && !/^_/.test(pub[1])) {
    const name = pub[1];
    // Skip IndexNow verification keys
    if (/^[0-9a-f]{8}-[0-9a-f-]{20,}\.txt$/i.test(name)) continue;
    // .html files: link without extension (most servers serve clean URLs)
    if (name === "index.html") paths.add("/");
    else if (name.endsWith(".html")) paths.add("/" + name.replace(/\.html$/, ""));
    else paths.add("/" + name);
    continue;
  }
}

if (!SITE) process.exit(0);
const list = [...paths].filter(Boolean).sort().slice(0, MAX);
for (const p of list) console.log(`↳ [${p}](${SITE}${p})`);

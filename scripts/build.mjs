#!/usr/bin/env node
// Regenerates everything in public/ that comes from data/product.js:
// the marked blocks of index.html, about/contact/privacy-policy/docs/404 pages,
// sitemap.xml. `--check` writes nothing and fails if a file is out of date
// (run by CI before deploying).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL, PRODUCT, PLATFORMS, FEATURES, FAQ, SAME_AS, PAGES } from "../data/product.js";
import { aboutMarkdown, contactMarkdown, privacyMarkdown, docsMarkdown } from "../src/content.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const CHECK = process.argv.includes("--check");
const P = PRODUCT;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- tiny markdown → HTML (only what src/content.js uses) ----------
function inline(s) {
  return s
    .split(/(`[^`]*`)/)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u.replace(SITE_URL, "") || "/"}">${t}</a>`)
        .replace(/&lt;(https?:\/\/[^&\s]+|mailto:[^&\s]+)&gt;/g, (_, u) => `<a href="${u}">${u.replace(/^mailto:/, "")}</a>`);
    })
    .join("");
}

export function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let firstH1 = true;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) {
      const level = h[1].length;
      if (level === 1 && firstH1) { firstH1 = false; }
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level}${level > 1 ? ` id="${id}"` : ""}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<div class="tablewrap"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table></div>"
      );
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (line.startsWith("> ")) {
      out.push(`<p class="lead">${inline(line.slice(2))}</p>`);
      i++;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||- |> )/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

// ---------- shared blocks ----------
const NAV = PAGES.filter((p) => p.path !== "/");

// Same snippet as the hand-written public/index.html.
const ANALYTICS = `<script defer data-ea-website-id="mrrdk8q3v2x7n" data-ea-domain="mrrdock.simoneruggiero.com" data-ea-track-accuracy="most accurate" src="https://pure-analytics.com/tracking/utilities/script.js"></script>`;

function footer() {
  return [
    "<footer>",
    '  <div class="wrap">',
    `    <nav class="footnav" aria-label="Site">${[{ path: "/", title: "Home" }, ...NAV]
      .map((p) => `<a href="${p.path}">${esc(p.title)}</a>`)
      .join(" · ")} · <a href="${P.links.appPrivacy}">App Privacy</a> · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">API</a></nav>`,
    `    <p>${esc(P.name)} is ${esc(P.license.id)} licensed. <a href="${P.links.repository}">Source and issues on GitHub</a>.</p>`,
    `    <p>Made with ❤️ by <a href="https://simoneruggiero.com?utm_source=MRRDock&amp;utm_medium=footer">Simone Ruggiero</a></p>`,
    "  </div>",
    "</footer>",
  ].join("\n");
}

const person = () => ({
  "@type": "Person",
  "@id": `${SITE_URL}/about#author`,
  name: P.author.name,
  url: P.author.url,
  sameAs: [P.author.url, P.author.github],
});

function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: P.name,
        publisher: { "@id": `${SITE_URL}/about#author` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: P.name,
        description: P.summary,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "MRR tracker",
        operatingSystem: `${P.requirements.minimumMacOSName} or later`,
        processorRequirements: P.requirements.binary,
        url: `${SITE_URL}/`,
        downloadUrl: P.install.download,
        installUrl: P.install.download,
        softwareHelp: { "@type": "CreativeWork", url: P.links.readme },
        releaseNotes: P.links.changelog,
        image: `${SITE_URL}/og.png`,
        screenshot: [`${SITE_URL}/screenshots/overview.png`, `${SITE_URL}/screenshots/by-source.png`],
        license: P.license.url,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: P.price.currency },
        author: { "@id": `${SITE_URL}/about#author` },
        codeRepository: P.links.repository,
        sameAs: SAME_AS,
        featureList: [
          `Aggregates MRR across ${PLATFORMS.filter((p) => p.id !== "custom").map((p) => p.name).join(", ")} and any custom HTTPS endpoint`,
          ...FEATURES.map((f) => f.name),
        ],
      },
      person(),
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

function pageJsonLd(page, type) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": type,
        "@id": `${SITE_URL}${page.path}#page`,
        url: `${SITE_URL}${page.path}`,
        name: `${page.title} — ${P.name}`,
        description: page.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#app` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: P.name, item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: page.title, item: `${SITE_URL}${page.path}` },
        ],
      },
      ...(type === "AboutPage" ? [{ ...person(), sameAs: [P.author.url, P.author.github] }] : []),
    ],
  };
}

const jsonLdTag = (obj) =>
  `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n</script>`;

function featuresHtml() {
  return [
    '    <div class="grid">',
    ...FEATURES.map((f) => `      <div class="card"><h3>${esc(f.name)}</h3><p>${esc(f.text)}</p></div>`),
    "    </div>",
  ].join("\n");
}

function platformsHtml() {
  const cell = (v) =>
    v === true ? '<td class="yes">✔</td>' : v === false ? '<td class="no">—</td>' : `<td class="muted">${esc(v)}</td>`;
  return [
    '    <div class="tablewrap">',
    "      <table>",
    "        <thead><tr><th>Platform</th><th>MRR</th><th>Active subs</th><th>Trials</th><th>28-day revenue</th></tr></thead>",
    "        <tbody>",
    ...PLATFORMS.map(
      (p) => `          <tr><td>${esc(p.name)}</td>${cell(p.mrr)}${cell(p.activeSubscriptions)}${cell(p.trials)}${cell(p.revenue28d)}</tr>`
    ),
    "        </tbody>",
    "      </table>",
    "    </div>",
  ].join("\n");
}

function faqHtml() {
  return FAQ.map((f) => `    <details><summary>${esc(f.q)}</summary>\n      <p>${esc(f.a)}</p></details>`).join("\n\n");
}

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(\\s*<!-- /gen:${name} -->)`);
  if (!re.test(html)) throw new Error(`missing <!-- gen:${name} --> block`);
  return html.replace(re, (_, a, b) => `${a}\n${content}${b}`);
}

// ---------- pages ----------
const home = readFileSync(join(PUBLIC, "index.html"), "utf8");
const style = home.match(/<style>[\s\S]*?<\/style>/)[0].replace(
  "</style>",
  `.page{padding-block:48px 56px}
.page h1{font-size:clamp(1.8rem,4.6vw,2.6rem)}
.page h2{margin-top:36px}
.page h3{margin-top:22px}
.page ul{padding-left:1.2em;margin:0 0 16px}
.page li{margin-bottom:6px}
.page .lead{margin:0 0 22px;text-align:left}
.page table{min-width:0}
.topnav{display:flex;gap:16px;align-items:center;padding-block:18px;font-size:.95rem}
.topnav a.brand{color:var(--text);font-weight:700}
.footnav{margin-bottom:10px}
</style>`
);

function subPage(page, md, type, { status404 = false } = {}) {
  const title = status404 ? `Page not found — ${P.name}` : `${page.title} — ${P.name}, ${P.tagline}`;
  const canonical = `${SITE_URL}${page.path}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
${status404 ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">\n<meta name="robots" content="index, follow">`}
<link rel="icon" href="/icon-256.png" type="image/png">
<link rel="apple-touch-icon" href="/icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(P.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${SITE_URL}/og.png">
${status404 ? "" : `<meta property="og:url" content="${canonical}">\n`}<!-- generated by scripts/build.mjs from data/product.js: edit there -->
${style}
</head>
<body>
<header class="wrap topnav"><a class="brand" href="/">${esc(P.name)}</a>${NAV.map((p) => `<a href="${p.path}">${esc(p.title)}</a>`).join("")}</header>
<main class="wrap page">
${mdToHtml(md)}
</main>
${footer()}
${status404 ? "" : jsonLdTag(pageJsonLd(page, type))}
${ANALYTICS}
</body>
</html>
`;
}

const outputs = {};
let homeOut = home;
homeOut = replaceBlock(homeOut, "features", featuresHtml());
homeOut = replaceBlock(homeOut, "platforms", platformsHtml());
homeOut = replaceBlock(homeOut, "faq", faqHtml());
homeOut = replaceBlock(homeOut, "footer", footer());
homeOut = replaceBlock(homeOut, "jsonld", jsonLdTag(homeJsonLd()));
outputs["index.html"] = homeOut;

const byPath = Object.fromEntries(PAGES.map((p) => [p.path, p]));
outputs["about.html"] = subPage(byPath["/about"], aboutMarkdown(), "AboutPage");
outputs["contact.html"] = subPage(byPath["/contact"], contactMarkdown(), "ContactPage");
outputs["privacy-policy.html"] = subPage(byPath["/privacy-policy"], privacyMarkdown(), "WebPage");
outputs["docs.html"] = subPage(byPath["/docs"], docsMarkdown(), "TechArticle");
outputs["404.html"] = subPage(
  { path: "/404", title: "Page not found", description: `This page does not exist on the ${P.name} website.` },
  [
    "# Page not found",
    "",
    `There is nothing at this address. ${P.name} is the ${P.tagline}: start from one of these pages.`,
    "",
    ...PAGES.map((p) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`),
    "",
  ].join("\n"),
  "WebPage",
  { status404: true }
);

outputs["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(
  (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${p.updated}</lastmod>
    <changefreq>${p.path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${p.path === "/" ? "1.0" : "0.6"}</priority>
  </url>`
).join("\n")}
</urlset>
`;

let stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const path = join(PUBLIC, file);
  let current = null;
  try { current = readFileSync(path, "utf8"); } catch {}
  if (current === content) continue;
  if (CHECK) stale.push(file);
  else { writeFileSync(path, content); console.log(`wrote public/${file}`); }
}
if (CHECK && stale.length) {
  console.error(`Out of date (run node scripts/build.mjs): ${stale.join(", ")}`);
  process.exit(1);
}
if (CHECK) console.log("public/ is up to date with data/product.js");

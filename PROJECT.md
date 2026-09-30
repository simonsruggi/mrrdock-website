# PROJECT — mrrdock-website

## Scopo
Pagina di atterraggio indicizzabile per MRRDock (app menu bar macOS, repo `simonsruggi/MRRDock`).
Serve tre cose: rankare sulle query commerciali ("mrr tracker macos menu bar", "free
Baremetrics alternative", "CatBar alternative"), essere citabile dagli answer engine, e dare
un link stabile da mettere su Product Hunt, Hacker News, awesome-list e nel campo *homepage*
del repo GitHub.

## Scelte
- **HTML statico, zero framework e zero JS lato client.** Next.js qui non aggiungerebbe nulla
  e il contenuto deve stare nell'HTML servito (i crawler AI non eseguono JS).
- **Agent-ready (27/09/2026)** con **Pages Functions** e non un Worker separato: un solo
  `functions/_middleware.js` che chiama `src/router.js`. Aggiunge API read-only `/api/v1/*`
  (info, platforms, release), MCP Streamable HTTP su `/mcp`, `/openapi.json`, `/llms.txt`,
  `/.well-known/api-catalog` e `/.well-known/mcp/server-card.json`, `Accept: text/markdown` su
  ogni pagina con `Vary: Accept`, header `Link` (RFC 8288) sull'HTML, 404 markdown. Nessuna
  auth/OAuth: il sito non ha account e non la simula. I 404 veri vengono da `public/404.html`
  (senza, Pages fa fallback SPA sulla home: era il soft-404 segnalato da is-agentic).
- **Fonte unica dei dati: `data/product.js`.** Pagine about/contact/privacy-policy/docs/404, sitemap,
  blocchi `<!-- gen:* -->` della home (funzionalità, tabella piattaforme, FAQ, footer, JSON-LD
  con `sameAs`), API, MCP, openapi, llms.txt e markdown leggono da lì. `node scripts/build.mjs`
  rigenera `public/`, `--check` in CI fa fallire il deploy se è disallineato. La **versione
  corrente non è scritta da nessuna parte**: `/api/v1/release` legge in tempo reale
  l'`appcast.xml` Sparkle dell'app (cache 15 min), cioè esattamente ciò che l'app offre come
  aggiornamento. Se il feed non risponde: `release` → 503 problem+json, `info` → `latestRelease: null`.
- **Sottodominio di `simoneruggiero.com`** invece di un dominio nuovo: gratis e immediato.
  `mrrdock.app` era libero al 12/09/2026 — il README spiega come spostarsi.
- **Cloudflare Pages** (progetto `mrrdock`), deploy via push, come tutti gli altri siti.
- **JSON-LD `SoftwareApplication` + `FAQPage`**: il primo è ciò che rende la pagina
  eleggibile come risultato "app gratuita per macOS", il secondo copre le domande a intento
  commerciale ("è davvero gratis?", "alternativa gratis a Baremetrics?").
- **Testo duplicato dal README, non riscritto ex novo.** È voluto: le due pagine devono dire
  gli stessi numeri (formula MRR, copertura per piattaforma). Quando cambia il README,
  cambia anche questa pagina.

## Verifica dopo un deploy
```bash
npm run check                                                  # locale: public/ coerente + test
curl -s https://mrrdock.simoneruggiero.com/version.txt        # SHA in produzione
curl -s https://mrrdock.simoneruggiero.com/api/v1/release     # versione letta dall'appcast
curl -sI -H 'Accept: text/markdown' https://mrrdock.simoneruggiero.com/
python3 ~/scripts/is-agentic-rescan mrrdock.simoneruggiero.com
```
Il workflow verifica già SHA, H1, API, MCP, 404 veri e markdown; se il job è verde la
produzione è verificata dall'esterno. Prova locale: `wrangler pages dev public` (mai deploy a mano).

## Da fare
- Immagine OG rigenerabile: `python3 scripts/make-og.py` (font di sistema SFNS).
- Se arriva `mrrdock.app`: dominio custom su Pages + 301 dal sottodominio.

# PROJECT — mrrdock-website

## Scopo
Pagina di atterraggio indicizzabile per MRRDock (app menu bar macOS, repo `simonsruggi/MRRDock`).
Serve tre cose: rankare sulle query commerciali ("mrr tracker macos menu bar", "free
Baremetrics alternative", "CatBar alternative"), essere citabile dagli answer engine, e dare
un link stabile da mettere su Product Hunt, Hacker News, awesome-list e nel campo *homepage*
del repo GitHub.

## Scelte
- **HTML statico a mano, zero framework e zero JS.** Una pagina sola: Next.js qui non
  aggiungerebbe nulla e il contenuto deve stare nell'HTML servito (i crawler AI non eseguono JS).
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
curl -s https://mrrdock.simoneruggiero.com/version.txt        # SHA in produzione
curl -s https://mrrdock.simoneruggiero.com/ | grep -c 'MRR tracker'
./scripts/indexnow-submit.sh
```
Il workflow fa già tutti e tre; se il job è verde la produzione è verificata dall'esterno.

## Da fare
- Immagine OG rigenerabile: `python3 scripts/make-og.py` (font di sistema SFNS).
- Se arriva `mrrdock.app`: dominio custom su Pages + 301 dal sottodominio.

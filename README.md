# Chummer Anarchy 2.0

A character generator and career tracker for **Shadowrun: Anarchy 2.0**: the
Commlink6 / Chummer experience, built for Anarchy 2.0’s nuyen-only rules.
(Not Anarchy 1st edition, which uses different rules.)

- **Guided creation.** Pick Ganger, Runner or Prime Runner and optionally a
  book package. A live nuyen receipt, with every rule checked and cited to its
  page. A GM can approve any exception.
- **Shadow Amp builder.** An amp type plus effects from the effect table gives
  its rating, cost and Essence automatically. 426 prebuilt amps come from the
  core book and Daegann’s expanded list.
- **Career ledger.** After Finalize, record earnings and spend them at the
  creation prices. History is append-only, and an entry is undone by voiding it.
- **Printable sheet** laid out like the official one. Your browser’s “Save as
  PDF” makes the PDF.
- **The 13 rulebook characters** (Lightning plus the 12 pregens) load with one
  click. The engine reproduces every number the book prints for them; see
  [docs/book-discrepancies.md](docs/book-discrepancies.md).

## Run it

Characters are stored in the browser that uses the app. **Export** writes a
`.ca2.json` file, which is the copy to keep.

### Locally

```bash
npm install
npm run dev        # http://localhost:5173
```

### Docker

```bash
docker build -t chummer-anarchy2:latest .
docker run -d -p 8480:80 -v /path/to/custom:/usr/share/nginx/html/custom chummer-anarchy2:latest
```

### Unraid

1. Build the image on the server (the repo is private, so there is no public
   registry image yet):
   `docker build -t chummer-anarchy2:latest /mnt/user/appdata/chummer-anarchy2/src`
2. Copy `unraid/chummer-anarchy2.xml` to
   `/boot/config/plugins/dockerMan/templates-user/my-chummer-anarchy2.xml`.
3. Docker tab → **Add Container** → pick *chummer-anarchy2* → Apply. The web
   UI is on port 8480.

### Any static host

`npm run build` and serve `dist/`.

## Game data and house rules

All rules and content are XML in `public/data/` (served as `/data/`), with XSD
schemas in `public/data/schema/`, so other tools can read and extend them. The
format is documented in [docs/data-format.md](docs/data-format.md).

House rules and extra content go in `custom/` (the mounted appdata folder on
Unraid), listed in `custom/index.xml`:
- the same `id` replaces a book entry;
- `<remove id="…"/>` deletes one;
- a new `id` adds one.

The app’s **Game data** page shows what loaded and any errors.

## Develop

```bash
npm test                 # engine + data tests (Vitest)
npm run validate:data    # XSD + reference checks
npm run build && npm run e2e   # Playwright smoke test
```

`tools/` holds the one-off extractors that produced the catalog:
- `dhsa_rows.py` and `dhsa_to_xml.py` read Daegann’s amp list;
- `build-samples.mjs` builds the pregens.

Design: [spec](docs/superpowers/specs/2026-09-27-chummer-anarchy2-design.md),
[plan](docs/superpowers/plans/2026-09-27-chummer-anarchy2-v1.md).

---

Shadowrun is a registered trademark of The Topps Company, Inc.; Catalyst Game
Labs publishes it under license. This is a private, unofficial fan tool. The
catalog XML summarizes book content and must be reviewed before the
repository is ever made public.

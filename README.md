# Chummer Anarchy 2.0

A character generator and career tracker for **Shadowrun: Anarchy 2.0**: the
Commlink6 / Chummer experience, built for Anarchy 2.0’s nuyen-only rules.
(Not Anarchy 1st edition, which uses different rules.)

- **Guided creation.** Pick Ganger, Runner or Prime Runner and optionally a
  book package. A live nuyen receipt, with every rule checked and cited to its
  page. A GM can approve any exception.
- **Shadow Amp builder.** An amp type plus effects from the effect table gives
  its rating, cost and Essence automatically. There are 470 prebuilt amps from
  the core book and Daegann’s expanded list v3.4b (core-book entries cite their
  core-book page), plus 84 add-ons you can apply: ammo, accessories, vehicle
  and deck mods, and implant grades.
- **Weapons, vehicles, mental armor.** Weapon damage is worked out from
  Strength and bonuses. Vehicles and drones show Pilot, Body, Handling, Speed,
  Armor and damage thresholds. Astral Armor, Mystic Armor and biofeedback
  filters raise the mental thresholds.
- **Technomancers** (from the CGL Conversion Guide): the Emerged amp, the
  Tasking skill, a living persona (Firewall = Willpower, Attack = Charisma),
  and 31 complex forms.
- **Lifestyles** (CRB p.165) adjust what each run pays.
- **Career ledger.** After Finalize, record earnings and spend them at the
  creation prices. History is append-only, and an entry is undone by voiding it.
  Creation can be reopened until the first ledger entry.
- **Printable sheet** laid out like the official one. Your browser’s “Save as
  PDF” makes the PDF.
- **28 sample characters** load with one click: the rulebook's 13 (Lightning
  plus the 12 pregens) and the 15 from Daegann's pregen booklet (SRA2 Pregens
  v1.0f). The engine reproduces every number the books print for them; see
  [docs/book-discrepancies.md](docs/book-discrepancies.md).

## Run it

Served by its own small Node server (Docker / Unraid), the app saves every
runner as an XML file in the `characters` folder, shared by every browser on
your LAN. Runners already saved in a browser move there on first load. With
no server (`npm run dev`, a plain static host), runners stay in the browser.
**Export** writes the same XML file. See
[docs/character-format.md](docs/character-format.md).

### Locally

```bash
npm install
npm run dev        # http://localhost:5173 (runners saved in the browser)
npm run serve      # build + server on :80 (set PORT, CHAR_DIR, CUSTOM_DIR)
```

### Docker

```bash
docker build -t chummer-anarchy2:latest .
docker run -d -p 8480:80 -v /path/to/characters:/data/characters -v /path/to/custom:/data/custom chummer-anarchy2:latest
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
npm run build && npm run e2e   # Playwright: smoke, import/export, phone, themes, technomancer, mods
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

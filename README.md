# Chummer Anarchy 2.0

A character generator and career tracker for **Shadowrun: Anarchy 2.0**: the
Commlink6 / Chummer experience, built for Anarchy 2.0’s nuyen-only rules.
(Not Anarchy 1st edition, which uses different rules.)

**Bring your own books.** The app ships the rules engine only. Amps, spells,
complex forms, gear, rules text and sample runners come from the PDFs you
upload on the **Books** page: the core rulebook, the Conversion Guide,
Daegann’s expanded amp list and pregen booklet and the quick-reference sheets
are read by recipes; any other book can be read by an AI you set up (your
own API key), and you review its entries before they’re added.

- **Guided creation.** Pick Ganger, Runner or Prime Runner and optionally a
  book package. A live nuyen receipt, with every rule checked and cited to its
  page. A GM can approve any exception.
- **Shadow Amp builder.** An amp type plus effects from the effect table gives
  its rating, cost and Essence automatically. Imported books add their prebuilt
  amps and add-ons (ammo, accessories, vehicle and deck mods, implant grades).
  Two books defining the same amp are both kept and told apart.
- **Weapons, vehicles, mental armor.** Weapon damage is worked out from
  Strength and bonuses. Vehicles and drones show Pilot, Body, Handling, Speed,
  Armor and damage thresholds. Astral Armor, Mystic Armor and biofeedback
  filters raise the mental thresholds.
- **Technomancers** (from the CGL Conversion Guide): the Emerged amp, the
  Tasking skill, a living persona (Firewall = Willpower, Attack = Charisma),
  and the complex forms your books bring.
- **Lifestyles** (CRB p.165) adjust what each run pays.
- **Career ledger.** After Finalize, record earnings and spend them at the
  creation prices. History is append-only, and an entry is undone by voiding it.
  Creation can be reopened until the first ledger entry.
- **Printable sheet** laid out like the official one. Your browser’s “Save as
  PDF” makes the PDF.
- **Sample characters** from your imported books load with one click: the
  rulebook’s pregens and Lightning, and Daegann’s pregen booklet. Each import’s
  report lists any printed number the engine doesn’t reproduce; see
  [docs/book-discrepancies.md](docs/book-discrepancies.md) for the rules calls.
- **Canon and non-canon.** The core rulebook and Conversion Guide are canon.
  Published material that isn't official rules (Daegann's expanded amp list
  and pregens, the quick-reference sheets) carries a **Non-canon** badge, and
  a runner can be set to canon only, which flags any on the Review tab.
- **Rules reference** from the Base, Magic, Matrix and Vehicles quick
  reference sheets: a searchable page plus hover help on matching effects.

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
npm run serve      # build + server on :80 (set PORT, CHAR_DIR, CUSTOM_DIR, LIBRARY_DIR, PYTHON)
```

### Docker

```bash
docker build -t chummer-anarchy2:latest .
docker run -d -p 8480:80 -v /path/to/characters:/data/characters -v /path/to/custom:/data/custom   -v /path/to/library:/data/library chummer-anarchy2:latest
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

## Books

Open **Books** from the library and drop your PDFs there. Each upload is kept,
with the importer’s Markdown, in the `library` folder (never served over
HTTP). A known book is imported at once into `custom/imported/<source>/`,
with a report of anything that didn’t match what the book prints. Re-import
reruns it; Remove takes its entries out again (and optionally deletes the PDF).

A book no recipe knows can go to an AI: set up Anthropic, an OpenAI-compatible
server (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio), Google Gemini or
AnythingLLM under **AI settings**. The key is stored on the server in a file
of its own and never shown again. Before anything is sent the page names the
provider and how many parts the book goes in; the proposals then wait on a
review screen where you accept, edit or drop each one.

Imports need the server (Docker or `npm run serve`) and Python 3 with
`importer/requirements.txt`.

## Game data and house rules

The mechanics (levels, metatypes, skills, pricing, amp types and effects,
packages, lifestyles, generic weapons, armor and vehicles) are XML in
`public/data/` (served as `/data/`), with XSD schemas in
`public/data/schema/`, so other tools can read and extend them. Imported
books are overlays in `custom/imported/`. The format is documented in
[docs/data-format.md](docs/data-format.md).

House rules and extra content go in `custom/` (the mounted appdata folder on
Unraid), listed in `custom/index.xml`:
- the same `id` replaces an entry (imported ids look like `crb.jazz`);
- `<remove id="…"/>` deletes one;
- a new `id` adds one.

Descriptions (amp, spell and gear text, rules text) are private: the importer
writes one file per source in `custom/texts/`, never in this repository.

The app’s **Game data** page shows each source and whether it's canon, what
loaded, and any errors.

## Develop

```bash
npm test                 # engine tests on a made-up catalog (Vitest); book tests need your own imports
npm run validate:data    # XSD + reference checks
npm run test:py          # importer tests (Python 3.12)
npm run build && npm run e2e   # Playwright, with a stub importer: smoke, books, AI review, themes…
```

`importer/` turns book PDFs into catalogs (`python -m importer`; recipe `dhsa` reads Daegann’s amp list, `pregens` his pregen booklet into sample runners, `crb` the core rulebook’s spells, Shadow Amps, gear and its 13 sample runners, `cg` the Conversion Guide, `qref` the quick-reference sheets).

Book tests (`tests/books/`) run only when your private catalogs are present
(`BOOKS_DIR`, default `.extract/private/oracle`; imports in
`.extract/private/custom`); in CI they are skipped with the reason.

Design: [spec](docs/superpowers/specs/2026-09-27-chummer-anarchy2-design.md),
[plan](docs/superpowers/plans/2026-09-27-chummer-anarchy2-v1.md),
[PDF importer](docs/superpowers/specs/2026-09-27-pdf-importer-design.md).

---

Shadowrun is a registered trademark of The Topps Company, Inc.; Catalyst Game
Labs publishes it under license. This is a private, unofficial fan tool. No
book content ships with it; the git history still holds catalogs from before
the importer and must be purged before the repository is ever made public.

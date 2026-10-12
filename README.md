# Nova Prime Chummer

A self-hosted character generator and career tracker for two games: **Shadowrun: Anarchy 2.0** and **Shadowrun Sixth World (SR6)**.

You run it on your own network (a home server, a NAS, a PC). Everyone at the table uses it in a browser. It ships the rules engine only. You bring your own books. See [How data comes in](#how-data-comes-in).

- Release history: [CHANGELOG.md](CHANGELOG.md)
- Example sheets: [Example character sheets](#example-character-sheets)

## What it is

Build runners with each book's own creation rules. A **Review** tab checks every rule and cites the book and page. If a runner breaks a rule, Review says which one. A GM can approve an exception.

When a runner is finished, you **Finalize** it. From then on the career ledger tracks every change: Karma and nuyen earned, spent and refunded. A mistake is voided, never silently edited.

Also in the box:

- **NPCs and critters** for GMs: grunts, prime NPCs, critters, spirits and sprites with their stat blocks.
- **Campaigns** with a GM. The GM adds players. Players put their runners in. The GM sees the runners. Players see the roster.
- **Compendiums**: your own collections of entries, private or shared with a campaign's GMs.
- **Printable sheets** that follow the official layout. Use your browser's "Save as PDF".
- **Ask the rules**: an AI answers rules questions from your own imported data, with book and page. You choose the provider and bring the key.
- **Optional rules and house rules** that the GM switches on or off for the whole table.
- A **trash** for deleted runners, **example characters** to load, and a **portrait** picker.

The two games are kept fully apart. Runners, NPCs, campaigns, books, data, edits, trash and AI settings belong to one game. The server refuses an object from the other game. Only your account and its role are shared. The first screen asks which game you want, and an icon in the header switches.

## Both systems

### Shadowrun: Anarchy 2.0

Anarchy 2.0 uses nuyen only. This is the 2.0 rule set, not Anarchy 1st edition.

- **Creation**: pick Ganger, Runner or Prime Runner, and optionally a book package. A live nuyen receipt shows every rule.
- **Shadow Amps**: an amp builder. An amp type plus effects gives its rating, cost and Essence. Imported books add prebuilt amps and add-ons.
- **Technomancers**: the Emerged amp, the Tasking skill, a living persona and complex forms (from the Conversion Guide).
- **Also covered**: weapons, vehicles and drones, mental armor, lifestyles, and knowledge and languages.
- **Optional rules**: Table setup holds the book's optional rules and your house rules. The GM turns them on or off. Players see a read-only list.
- **Canon**: material that is not official rules carries a **Non-canon** badge. A runner can be set to canon only.
- **Sheets**: Printer-friendly, Full color and Book style.
- **Rules reference**: a searchable page built from the quick-reference sheets.

### Shadowrun Sixth World

- **Five creation methods**: priority, sum to ten, point buy, karma and lifepath. Lifepath needs a book that prints life modules.
- **Budgets**: attribute, skill, adjustment, Karma, nuyen, Essence, power, contact and knowledge points, each itemized.
- **Tabs**: Concept, Creation method, Attributes, Skills, Qualities, Magic or Resonance, Augmentations, Gear, Vehicles, Contacts and lifestyle, Review and Ledger.
- **Derived values** come from the engine: dice pools, condition monitors, initiative, Defense Rating, Essence and Magic loss, and more.
- **Creation rules** (Table setup): the numbers the book prints in its text, each with its page. The admin sets the server's. A GM can give a campaign its own. The standard creation numbers ship as defaults (`public/data/sr6/creation-defaults.xml`).
- **Optional and house rules**: the Sixth World Companion's optional rules and several house rules, all off until a table turns them on.
- **Career ledger**: spend Karma on attributes, skills, qualities, spells, initiation and more. Spend nuyen on gear and lifestyle.
- **Sheets**: six styles (Printer-friendly, Full color, Book style, Neon, Hex, Dossier).

## How data comes in

The app ships **no book content**: no tables, no rules text, no descriptions. A fresh server shows a setup page until you load your core data.

### 1. Upload books you own

Open **Books** (admin) and drop in the PDF of a book you own. The importer converts the PDF, then reads its tables and rules into game data. A report lists anything it could not read or match. Nothing is guessed.

**Only use books you own.** Your PDFs stay in your `library` folder and are never served over the web. Nothing is shared or redistributed. Book descriptions stay private to your server.

- Books with a built-in recipe import at once. Shadowrun 6 reads only books that have a recipe.
- **Anarchy only**: any other book can be read by an AI you set up. You review every proposed entry before it is added.
- **Re-import** reruns one book. **Re-import all books** reruns every book (after an app update, say). Your edits, runners and NPCs are kept.
- Each game has its own AI settings for Ask the rules, including its own AnythingLLM workspace. Put only that game's books in it.
- **Data packs** (Anarchy only): a small zip of the core tables (no descriptions, PDFs or keys). Download one from a server that has the core book. Upload it to set up another server.

### 2. Enter data yourself

- **Game data** is a catalog editor. **Restore book version** undoes an edit. A re-import never touches your edits.
  - Anarchy: the admin and GMs edit any entry or add new ones under a house-rule source you name.
  - Shadowrun 6: you can change existing entries only. There are no new entries and no house-rule sources.
- **Export my edits** and **Import edits** save your changes as an edits file. Import previews what a file adds, changes and conflicts with.
- **Custom XML overlays** (Anarchy only) in the `custom` folder, listed in `custom/index.xml`, add, replace or remove entries. XSD schemas ship in `public/data/schema/`. Shadowrun 6 has no hand-written overlays. Its schemas are in `public/data/sr6/schema/` and describe the files the importer and the edits write.
- **Table setup** holds your house rules and optional-rule switches.

Formats: [Anarchy data](docs/data-format.md), [SR6 data](docs/sr6-data-format.md).

## Install and host

The container needs three folders:

| Folder in the container | What it holds                                                     |
| ----------------------- | ----------------------------------------------------------------- |
| `/data/characters`      | Saved runners, one XML file each, a folder per account            |
| `/data/custom`          | Imported book data, your edits, overlays, campaigns               |
| `/data/library`         | Uploaded PDFs, their converted text, reports, AI settings, backups |

### Unraid

1. **Docker** tab, then **Template repositories**. Add `https://github.com/jbowensii/unraid-templates` and **Save**.
2. **Add Container** and pick _nova-prime-chummer_. Apply.
3. Open the web UI on port **8480**.

The template maps the folders to `/mnt/user/appdata/nova-prime-chummer/characters`, `.../custom` and `.../library`. It sets `PUID` 99 and `PGID` 100, Unraid's `nobody` and `users`. The image is pulled ready-built, so there is no build step on the server.

### Docker

```bash
docker run -d --init -p 8480:80 \
  -v /path/to/characters:/data/characters \
  -v /path/to/custom:/data/custom \
  -v /path/to/library:/data/library \
  ghcr.io/jbowensii/nova-prime-chummer:latest
```

The container starts as root only to hand the three folders to `PUID`:`PGID` (default 99:100), then runs as that user. Add `-e PUID=1000 -e PGID=1000` to match another host user. Or use `--user` to skip this step.

To build the image yourself: `docker build -t nova-prime-chummer:latest .` (add `--build-arg OCR=1` for scanned books).

### From source

You need Node 22 and Python 3.12 (the importer).

```bash
npm ci
pip install --require-hashes -r importer/requirements.lock
npm run serve      # builds, then serves on :80 (set PORT, CHAR_DIR, CUSTOM_DIR, LIBRARY_DIR, PYTHON)
```

`npm run dev` runs the interface alone on `http://localhost:5173`. It has no server, so no accounts, no Books page and no importer.

### First run

1. Read the one-time **setup code** from the container log: `docker logs nova-prime-chummer`. It is new on every restart and works once.
2. Open the app. Enter the code with a name, username and password. That creates the first **admin**.
3. Go to **Books** and import your core rulebook (or upload a data pack).
4. Create accounts for everyone else on the **Users** page. There is no self sign-up.

Locked out? Run `docker exec nova-prime-chummer node server/users.mjs reset <username>`. It prints a one-time code for `<app address>/#/setup/reset`.

## Options

### Accounts and roles

Every account has one role.

| Role       | Can do                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **admin**  | Everything: Books, imports, AI settings, Users, sign-in, backup and restore, background art, catalog edits            |
| **editor** | Acts as a GM: runs campaigns, NPCs and compendiums, edits the catalog, sets Table setup and house rules               |
| **player** | Own runners, plays in campaigns, reads Game data and Table setup, Ask the rules                                       |

The server enforces every rule. A hidden button is only convenience. There is always at least one enabled admin.

### Sign-in

- **Local accounts** with an app password. This is the default.
- **Authelia (OpenID Connect)**: admin turns it on under **Settings, Sign-in**. An account is set to sign in with Authelia on the Users page. It needs a public https address (`PUBLIC_URL` or a trusted proxy). Authelia 4.39 or later.
- **Behind a reverse proxy**: set `TRUST_PROXY` (Unraid template: _Trusted proxy_) to the proxy's address. Set `PUBLIC_URL` (_Public address_) to the one address people use. Full setup, including rate-limiting sign-in at the proxy and the Authelia client config: [docs/hosting-auth.md](docs/hosting-auth.md).

### AI providers

Set up per game (admin, Books, AI settings). Pick one of:

- Anthropic
- An OpenAI-compatible server (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio)
- Google Gemini
- AnythingLLM (with a workspace)

**Load models** lists a provider's models. **Test** checks the saved settings. Keys are stored on the server and never shown again. The admin sets a daily question limit per person on the Users page.

### Table setup

The GM's page for the whole table: the book's optional rules, house rules, and (SR6) the creation-rules numbers. Rules can be locked so they bind every runner. Review flags a runner that uses what the table does not allow.

### Backup and restore

**Settings, Backup** downloads everything as one zip: runners, accounts, edits, imported books, PDFs, background art and AI settings. API keys are included only if you tick **Include my API keys**. **Restore** shows what is in the zip first. It saves a safety copy to `library/.backups` before it replaces anything.

### Backgrounds and art

The admin uploads page backgrounds (PNG, JPEG or WebP) under **Settings, Background art** and switches each on or off. Anyone can fade them or turn them off in their own browser. The character sheet has its own background switches. Each game has its own page background and sheet watermark.

## FoundryVTT support

Export runners, NPCs, compendiums and book data as JSON files, then import them into Foundry with a companion module. Each module refuses the other game's file.

| Game        | Module                                                                                                                   | Foundry system                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| SR6         | [Nova Prime Chummer — SR6 Importer](https://github.com/jbowensii/chummer-sr6-foundry)                                    | Shadowrun 6 "Eden" (`shadowrun6-eden`) |
| Anarchy 2.0 | [Nova Prime Chummer — Anarchy 2 Importer](https://github.com/jbowensii/chummer-anarchy2-foundry)                         | Shadowrun Anarchy 2 (`sra2`)         |

**Install a module in Foundry**: Add-on Modules, then **Install Module**. Paste the manifest URL and install.

- SR6: `https://github.com/jbowensii/chummer-sr6-foundry/releases/latest/download/module.json`
- Anarchy 2: `https://github.com/jbowensii/chummer-anarchy2-foundry/releases/latest/download/module.json`

**Export from the app**: use **Export for Foundry** in a runner or NPC editor, **Export for Foundry…** on the runner list or NPCs page (tick the ones you want, or a campaign), or **Export book data for Foundry** on Game data. Book descriptions are included by default. The file is for your own Foundry only, so do not share it.

Formats: [Anarchy export](docs/export-format.md), [SR6 export](docs/sr6-export-format.md).

## Example character sheets

Coming soon.

## Development

```bash
npm run check          # type check, data validation, unit tests
npm run test:py        # importer tests (Python 3.12)
npm run build && npm run e2e   # Playwright end-to-end tests
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format fixes)
npm run coverage       # test coverage
```

Docs live in [docs/](docs/): data, character and export formats for each game, the design system, sign-in and hosting ([hosting-auth.md](docs/hosting-auth.md)), and deployment notes ([deploy-tower04.md](docs/deploy-tower04.md)).

### Code map

- `server/books.mjs`: the server's route table (its header lists every route) and the map of the modules behind it.
- `src/sr6/engine/budgets.ts`: Shadowrun 6 budgets. It re-exports choices, purchases, bonuses, attributes, essence, magic, skills, contacts and karma.
- `src/sr6/engine/creation.ts`: the creation settings (Table setup).
- `importer/sr6/catalog.py` and `importer/sr6/recipes/crb.md`: the Shadowrun 6 import.
- `importer/convert.py` and `importer/pdf/`: PDF to Markdown.

## Thanks

This project stands on the work of others.

- **Commlink6**, the Shadowrun 6 character generator by the RPGFramework / Genesis team.
- **Chummer5a**, the Shadowrun 5th Edition Chummer application.
- And various others.

Shadowrun is a trademark of its owners (The Topps Company, Inc.; Catalyst Game Labs publishes it under license). Nova Prime Chummer is an unofficial fan tool. It is not affiliated with or endorsed by them. No book content ships with it.

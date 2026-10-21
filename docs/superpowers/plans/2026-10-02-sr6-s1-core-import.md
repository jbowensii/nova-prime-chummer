# SR6 S1 — Core rulebook import, SR6 catalog, Books / Rules / Game data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin uploads the Shadowrun 6 core rulebook PDF on the SR6 Books page. The importer turns it into markdown, regroups each item's stat row and description into one block, and a recipe writes the SR6 catalog (one XML file per kind, each with its XSD) into `custom/sr6/`. SR6 pages then show it: Books (upload, status, report, re-import, remove), Rules (the rule sections, searchable) and Game data (sources, counts per kind, a browser of every entry, and catalog edits that survive re-imports). Anarchy is unchanged, and neither game can see the other's data.

**Architecture:** The pipeline is PDF → `importer/convert.py` (new opt-in `sr6` layout: font-aware headings, header-band tables, margin furniture dropped) → `book.md` → `importer/sr6/regroup.py` (pure text: pairs table rows and boxes with descriptions by normalized name) → `regrouped.md` → `importer/sr6/recipes/crb.py` (reads only the regrouped file) → `custom/sr6/imported/crb/<kind>.xml`, private descriptions in `custom/sr6/texts/crb.xml`. The SR6 importer reuses `xmlio` (atomic writes, id scoping, status/import records, index, sources) under an SR6 root namespace. The server keeps one job queue: `booksApi` gains a second area (`library/sr6/`, `custom/sr6/`) reached through `/api/sr6/books*` and `/api/sr6/edits*`, and `/custom/sr6/` is served on its own guarded route. The client gets a generic SR6 catalog loader (`src/sr6/catalog/domain/load.ts`), the Anarchy Books page with a `game` param, and two new SR6 pages.

**Tech Stack:** as the repo already uses (TS/React/Vitest/Playwright/Node server, no new dependencies; Python 3.12 importer with pdfplumber and lxml).

**Spec:** `docs/superpowers/specs/2026-10-02-sr6-ruleset-design.md` (§1 "Data source", "Tables vs descriptions", "First book"; §2; §3 Import pipeline; §6 S1; §7). Builds on S0 (`docs/superpowers/plans/2026-10-02-sr6-s0-picker-split.md`, done on `feat/sr6` at 416c192). Rulings the spec left open are marked (R).

## Global Constraints

- Branch `feat/sr6` (integration branch, no tower04 install until the SR6 line ships; ledger `.superpowers/sdd/sr6/progress.md`). Never touch `public/data/*.xml` (the owner's local core copies), `public/custom/`, `custom/`, `library/` or `.extract/private`. No book text in the repo or tests: every test uses made-up names and numbers; layout notes give only structure (fonts, sizes, positions, heading levels, column names). Never kill processes by image name.
- Anarchy unchanged: every existing Vitest, Python and Playwright suite passes unchanged except the S0 scope assertions that this release replaces on purpose (`tests/server/games.test.ts` "scope": `/api/sr6/books` and `/api/sr6/edits` now answer; `tests/server/server.test.ts`: `/custom/sr6/` now has its own route). The Anarchy converter output is byte-identical (`CONVERTER_VERSION` stays `"6"`).
- SR6 data format (R): namespace `urn:chummer-sr6:data:1`, root `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="<kind>" version="1">`, one file per kind. XSDs are in `public/data/sr6/schema/` (`common.xsd` + one per kind + `sources`, `texts`, `edits`). Shipped `public/data/sr6/sources.xml` holds one source: `CRB`, publisher Catalyst Game Labs, canon, `texts="texts/crb.xml"`, named "Shadowrun, Sixth World Core Rulebook".
- Layout (R): `library/sr6/<book-id>/` (`original.pdf`, `upload.xml`, `status.xml`, `import.xml`, `book.md`, `regrouped.md`); `custom/sr6/imported/crb/<kind>.xml`, `custom/sr6/imported/index.xml`, `custom/sr6/imported/sources.xml`, `custom/sr6/texts/crb.xml` (private), `custom/sr6/edits/edits.xml` + `texts.xml`. There is no `core/` split. Every entry id is scoped by source (`crb.<slug>`) through `xmlio.write_overlay`, as the Anarchy books are. The builder (S2) keys attributes by `abbr` and skills by `attr`, which are never scoped.
- Overlays carry no prose (R). Descriptions, game-effect text and rule text go only to `custom/sr6/texts/crb.xml` (`<text of="<kind>" id="…">`). Stat values are kept as printed, as strings: dashes are normalized to `—`, `¥` and thousands commas are dropped from costs, and nothing else changes. Only the fields named as integers below are parsed. S2 parses formulas such as `Rating × 500` or `F+1`. Book errors stay as printed, and a value that doesn't fit its column's pattern is kept and reported (`kind="book-value"`).
- Cross-references are names in S1 (R): metatype traits, critter powers, NPC gear and weapons are kept as printed lists. S2 resolves them.
- No AI, review or data pack for SR6 in S1 (R). A book no SR6 recipe matches ends `failed` with "no SR6 recipe matched this book".
- Python tests go in `importer/tests/test_sr6_*.py` (R), because `npm run test:py` discovers only `importer/tests`. Run with `npm run test:py`, or `py -3.12 -m unittest importer.tests.test_sr6_regroup -v` for one module.
- Old project (`../SR6-eden-Forge`), reference only and never copied wholesale: `schemas/*.json` informed the field lists below. `extractor/xtable.py` (`header_cells`/`assign_row`) is the model for Task 2's header-band reader, written fresh. `extractor/rowengine.py` is the fallback idea if a table still comes out lost. `extractor/eden_codes.py`/`eden_align.py` (Eden type/subtype vocabulary) are for F1's export, not S1.

### Probe of the owner's PDF (structural facts only; Task 10 confirms)

`Downloads/Shadowrun 6e\Shadowrun 6e-Sixth World Core Rulebook-Current Printing-CAT28000.pdf`: 322 pages, 612×765 pt, metadata title "Shadowrun, Sixth World: Core Rulebook", SHA-256 `15067e02c99c750f30cd94de95bbcc3c08497a2cf637a53d206761ef0cea18e3`. **Printed page = PDF page − 1.** Today's converter (v6) loses most stat tables. Only the header band comes out as a table, the rows come out as loose lines with names glued to cells or one-row tables without their names, and two-column text interleaves on table pages because the loose rows cross the gutter. Nearly all headings come out as plain lines too, because item headings are 13 pt against 10.5 pt body, under the 1.25× band. Fonts: body serif 10.5 (bold run-in labels in its bold face). One display family serves for headings at 60 (chapter), 21 (section), 15 (subsection), 13 (item) and 9 (box title, spell tag line). Tables use a 7 pt sans family: header row in its black weight, rows regular, stat-box labels bold ending in `:`. Table titles and some box titles are the display family in lower case, directly above the table. Art captions are the same lower case. The margin tab letters sit at the outer edge (x < 30 or x > width − 35) in small display sizes. Running heads and page numbers sit at the outer edge or in the bottom 35 pt. Item shapes:
- **Gear:** a titled table (name column first, header label such as WEAPON) at the page top, with the descriptions under 13 pt headings elsewhere in the chapter.
- **Spells and sprites:** the 13 pt heading, a 9 pt "(tags)" line, then a 2-line stat band, then text.
- **Qualities and adept powers:** the heading (an optional "(1 to 3)" suffix), then bullet or bold-labelled lines (`Cost:`, `Game Effect:`, `Activation:`), then text.
- **Critters and grunts:** a box with a 9 pt title, attribute band tables (`B A R S W L I C ESS`; `DR I/ID AC CM MOVE`), then labelled lines (`Skills:`, `Powers:`, `Gear:`, `Weapons:`…). A grunt box sits under its "Professional Rating N" 15 pt heading.
- **Priority table:** five letter rows with wrapped cells, the letter vertically centred.

### SR6 catalog kinds (Task 1; every entry: `id`* `source`* `page`* attributes, `<name>`, optional `<text>` that is empty in imports)

| file / kind | tag | attributes (* required; all strings as printed unless noted int) | children |
|---|---|---|---|
| priorities | priority | letter* | metatype (name*, points* int)×n, attributes (points* int), skills (points* int), magic (kind* full\|aspected\|mystic-adept\|adept\|technomancer\|mundane, rating int)×n, resources (nuyen* int) |
| metatypes | metatype | — | range (attr* bod\|agi\|rea\|str\|wil\|log\|int\|cha\|edg, min* int, max* int)×9, trait (text)* |
| attributes | attribute | abbr* (BOD…EDG, MAG, RES, ESS), group* physical\|mental\|special | — |
| skills | skill | attr* (abbr, lower case), untrained* true\|false | spec (text)* |
| qualities | quality | kind* positive\|negative, karma int, perLevel true, maxLevel int | — |
| weapons | weapon | category*, dv, modes, ar, ammo, avail, cost | — |
| armor | armor | category*, defense, capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware, category*, rating, essence, capacity, avail, cost | — |
| electronics | device | category*, rating, array, programs, avail, cost | — |
| gear | gear | category*, rating, capacity, avail, cost | — |
| vehicles (R) | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | — |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics (R) / echoes (R) | metamagic / echo | — | — |
| critterpowers (R) | critterpower | type, action, range, duration | — |
| critters / spirits / npcs | critter / spirit / npc | category (critter/spirit), rating int (npc: Professional Rating), group (npc); bod agi rea str wil log int cha ess mag res edg dr init actions cm move | skills, powers, optionalPowers, weaknesses, attacks, augmentations, gear, weapons (text, each at most once) |
| sprites | sprite | attack, sleaze, data, firewall, init, res | skills, powers |
| lifestyles | lifestyle | cost (per month) | — |
| contacts | contact | connection, loyalty, archetype | — |
| rules | rule | chapter*, level* int 1–4, parent (a rule id) | — |

`sources` (source id*, publisher*, canon*, texts, file, sha256, imported; `<name>`), `texts` (`<text of id>` text) and `edits` (any entry tag above, plus `by`) complete the set. The kinds marked (R) are not in the spec's list. The core rulebook prints them, and S2's builder or S3's NPC editor needs them.

---

### Task 1: SR6 catalog format, XSDs, made-up fixture, validation
**Files:** `public/data/sr6/schema/common.xsd` (attribute group `ref`: `id` `[a-z0-9][a-z0-9.\-]*`, `source` `[A-Z][A-Z0-9-]{0,19}`, `page` positiveInteger; `Remove`; root attribute group `version`), one XSD per kind in the table plus `sources.xsd`, `texts.xsd` and `edits.xsd` (a choice of every entry type, each with optional `by`). `public/data/sr6/sources.xml`. `docs/sr6-data-format.md` (new: the table above, layout, load order, scoping, texts, edits, that values are as printed). `tests/fixtures/sr6/custom/` (made-up: `imported/index.xml`, `imported/sources.xml` naming CRB with `texts="texts/crb.xml"`, `imported/crb/<kind>.xml` with one or two invented entries per kind, ids already scoped `crb.…`, `texts/crb.xml`, `edits/edits.xml` changing one invented weapon's `cost`, `edits/texts.xml`). `tools/validate-data.mjs` (a file whose root is `sr6:data` validates against `public/data/sr6/schema/<kind>.xsd` with SR6's `common.xsd`. New flag `--sr6=<dir>` walks that dir like a custom dir (imported/sources.xml, imported/index.xml, edits/*) plus `public/data/sr6/sources.xml`. The Anarchy cross-reference checks skip SR6 files). `package.json` (`validate:data` adds `--sr6=tests/fixtures/sr6/custom`). `importer/sr6/__init__.py` (new: `NS = "urn:chummer-sr6:data:1"`, `SCHEMA_DIR` → `public/data/sr6/schema` (or `$CA2_DATA_DIR/sr6/schema`), `KINDS = {"priorities": "priority", …, "rules": "rule"}`, kind → tag in table order). `server/games.mjs` (`SR6_KINDS`, the same kind → tag map). `src/sr6/formats/domain/types.ts` (new: `type Sr6Kind`, `SR6_KINDS: Record<Sr6Kind, { tag: string; label: string }>`). `tests/sr6/formats/kinds.test.ts` (new).
- [ ] Tests first:
  - `npm run validate:data` fails on a broken copy (a missing `category` on a weapon, a `karma="x"` on a quality, an `sr6:data` file with `kind="weapons"` holding a `<spell>`) and passes on the fixture.
  - `tests/sr6/formats/kinds.test.ts`: `SR6_KINDS` in `server/games.mjs` and `src/sr6/formats/domain/types.ts` have the same kinds and tags, and each kind has `public/data/sr6/schema/<kind>.xsd`.
  - `importer/tests/test_sr6_kinds.py`: `importer.sr6.KINDS` matches the XSD folder, and lxml validates every fixture file against its XSD.
  - Implement, `npm run check` + `npm run test:py`, commit "SR6 S1: catalog format, XSDs and made-up fixture".

### Task 2: Converter — opt-in SR6 layout
**Files:** `importer/sr6/layout.py` (new), `importer/convert.py` (`convert(pdf_path, md_path, pages=None, sr6=False)`. When `sr6` is set: `fonts = layout.fonts(pdf)` once; per page `words = layout.furniture(page, words)`. Header-band tables from `layout.band_tables(words, fonts)` join `boxes` (so their words leave the text lines and the gutter test) and `blocks` (via `_table_md`). A line's level is `layout.heading_level(line, fonts)` instead of `_heading_level`. The result has `converter: "sr6-1"`. With `sr6=False` nothing changes), `importer/tests/minipdf.py` (`_build_pdf` gains F3 Times-Roman and F4 Courier resources; new `sr6_layout_pdf()`), `importer/tests/test_sr6_layout.py` (new).
- `layout.fonts(pdf) -> Fonts(body: str, size: float, heading: str, levels: dict[float, int])`: the family is the font name after `+` and before the first `-` (`SabonLTStd-Roman` → `SabonLTStd`). Body is the family and size of the most common char size. Heading family is the family with the most chars above body×1.1, other than body's. `levels` counts that family's sizes after furniture, keeps sizes with ≥ 200 chars across the book (≥ 3 in the made-up PDF; parameter `min_chars`) that are above body×0.8, sorts them largest first and gives them levels 1–5.
- `layout.furniture(page, words)` drops words with x0 < 30 or x0 > width − 35 or top > height − 35.
- `layout.heading_level(line, fonts)`: every word in the heading family at a level size (±0.3), or 0.
- `layout.band_tables(words, fonts) -> list[(bbox, rows)]`:
  - Table words are in neither body nor heading family and smaller than body. Header words are those in a bold/black face (`convert._BOLD`), on a line of ≥ 2 such words, with none ending in `:`.
  - A header line is split into separate tables at x-gaps > 40 pt (two spells side by side). Header lines ≤ 1.6× line height apart merge (multi-line headers).
  - Columns: header words cluster into cells at x-gaps > 6 pt. Each column runs from its x0 to halfway into the next gap. The first column extends 10 pt left, the last 60 pt right.
  - Rows are the regular table words below the header within that span. They stop at a y-gap > 3× the median line pitch, a new header, a body or heading word inside the span, or a line opening with a bold label ending in `:` (stat-box labels stay text).
  - Row lines: lines with a first-column word are anchors, and every other line joins the nearest anchor by top (ties go to the one above). A line with no anchor before it starts a row. Cells are the column's words in reading order joined by spaces. The bbox runs from the header top to the last row bottom.
- [ ] Tests first, on `sr6_layout_pdf()`, all invented. It has Times body text in two columns, Courier 21 "Gadget Shop" and Courier 13 "Zap Gun" headings, a Courier 13 lower-case "zappers" label, a Helvetica-Bold 7 header `GADGET DV COST` spanning both columns with three Helvetica 7 rows (one with a cost wrapped onto a second line, one name of three words), a margin letter at x = 595 and a page number at the bottom. The test checks:
  - The md has `## Gadget Shop`, `#### Zap Gun` and `#### zappers`.
  - The table comes out as `| GADGET | DV | COST |` with three full rows and the wrapped cost joined.
  - No margin letter and no page number appear.
  - Both text columns read column by column.
  - Two side-by-side 2-column header bands give two tables.
  - A bold `Skills:` line under a band stays text with `**Skills:**`.
  - `convert(…)` without `sr6` gives exactly the output it gives today for every existing minipdf fixture (the current `test_convert.py` still passes).
  - Implement, `npm run test:py`, commit "SR6 S1: converter's SR6 layout (headings by font, header-band tables)".

### Task 3: Regroup — rows and boxes with their descriptions
**Files:** `importer/sr6/regroup.py` (new, pure text, no imports from recipes), `importer/tests/test_sr6_regroup.py` (new).
- Interfaces:
  - `VERSION = "1"`.
  - `norm(name, aliases=None) -> str`: NFKD, accents dropped, lower case, `&`→`and`, quotes dropped, everything but `[a-z0-9 ]` → space, spaces collapsed, a leading "the " dropped, then `aliases.get(key, key)`.
  - `regroup(md, aliases=None, name_headers=frozenset()) -> (text, report)`.
  - `blocks(text) -> list[Block]`.
  - `@dataclass Block(type: "item"|"section", name, chapter, section, label, page: int, header: list[str], row: dict[str, str] | None, stats: list[dict[str, str]], tags: str, labels: dict[str, str], text: str, level: int)`. `page` is the PDF page, and the recipe applies its offset.
- Rules (R):
  - Chapter = the last `#` heading, section = the last `##`/`###`. A **label** is a heading with no upper-case letter: a table title if a table follows with no text line between, otherwise an art caption (dropped).
  - A **catalog table** has ≥ 2 columns, and either its first header cell is in `name_headers` (a `regroup` keyword parameter the recipe passes) or ≥ ⅓ of its rows pair. Every other table is rule text and stays in its section's text.
  - An **item heading** is a level-4/5 heading with an upper-case letter. A **box** is an item heading or label followed, with no body text between, by tables and/or `**Label:** value` lines. Its tables become `stats` (each a header → cell dict) and its labelled lines `labels`. A heading wholly in parentheses right under an item heading is that item's `tags`. Labelled lines (optionally bulleted) inside a description also go to `labels`.
  - A description is the item heading's body text up to the next heading of level ≤ 5. Tables met inside it belong to their own table, not the text.
  - Pairing is within the chapter. Each catalog row and each titled box pairs with the item heading of the same `norm` key. If the full key misses, the key without a trailing `( … )` is tried. A heading `A 70/75` stands for `A 70` and `A 75`. A heading ending in "series" takes every unpaired row that starts with the rest of its key.
  - Report rows: `unpaired-row` (name, table, page), `unpaired-description` (only in chapters that have catalog tables), `duplicate` (a key seen twice in a chapter: the first pairs, the others are emitted unpaired), `shared-description` (one description on several rows).
  - Output: per item, `<!-- item {json} -->` + the item's header and row as a markdown table + its stats tables + labelled lines + text + `<!-- end -->`. JSON holds name, chapter, section, label, page, tags, level. Section blocks are `<!-- section {json} -->` … `<!-- end -->` in reading order. A first line `<!-- regrouped v1 -->`.
- [ ] Tests first, made-up markdown in the sr6 layout's shape:
  - Chapter `# GADGETS` with a `#### zappers` label and table `| GADGET | DV | COST |` holding rows Zap Gun, Fizz Rifle 70, Fizz Rifle 75, Lost Row and Zap Gun again, then headings `#### Zap Gun`, `#### Fizz Rifle 70/75` and, on the next page, `#### Orphan Gadget (Rating 1–3)`. Each heading has invented text.
  - `#### Glow Ward` → `##### (Indirect Glow, Area)` → a `| RANGE | DV |` band → text with `• **Cost:** 4 Karma`.
  - A `#### Fuzzbeast` description plus a `##### fuzzbeast` box with an attribute band and `**Skills:** Sneaking 3` (pairs case-blind).
  - A `## Making Trouble` section with a rule table and text.
  - Assertions:
    - Zap Gun pairs, and the second Zap Gun row is `duplicate` and unpaired.
    - Both Fizz Rifles carry the shared text, with `shared-description`.
    - Lost Row is `unpaired-row`. Orphan Gadget is `unpaired-description`, and its key without the suffix is "orphan gadget".
    - Glow Ward has `tags` "Indirect Glow, Area", `stats` `[{"RANGE": "LOS", "DV": "3"}]` and `labels` `{"Cost": "4 Karma"}`.
    - Fuzzbeast has its stats and `labels["Skills"]`.
    - The rule table stays in the Making Trouble section's text.
    - `aliases={"zapp gun": "zap gun"}` pairs a row spelled "Zapp Gun".
    - `blocks(regroup(md)[0])` round-trips every field.
    - The page is the item heading's page, or the row's page when there is no description.
  - Implement, `npm run test:py`, commit "SR6 S1: regroup step".

### Task 4: The core rulebook recipe
**Files:** `importer/sr6/recipes/__init__.py` (`THRESHOLD = 0.6`, `RECIPES = [crb]`, `identify(meta, md_head)` as Anarchy's, reusing `importer.recipes.Result`), `importer/sr6/recipes/crb.py`, `importer/sr6/recipes/crb.md` (layout survey: the probe facts above, no book text), `importer/tests/test_sr6_crb.py`.
- `crb.py`:
  - `ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun, Sixth World Core Rulebook", "Catalyst Game Labs", True`, `SHA256 = ("15067e02…18e3",)` (full hash), `PAGE_OFFSET = 1`.
  - `match`: the SHA → 1.0; title or head containing "Sixth World" and "Core Rulebook" → 0.9 (R: the city editions are untested).
  - `ALIASES = {}` and `NAME_HEADERS = {"WEAPON", "ARMOR", "ITEM", "AUGMENTATION", "DEVICE", "VEHICLE", "LIFESTYLE"}`, both filled in by Task 10.
  - `SECTIONS`: an ordered list of (chapter key, section-or-label substring, kind, category) that maps blocks to kinds. Initial: GEAR + a weapon table label → weapons with the label's slug as category; armor/augmentation/electronics/vehicles labels likewise; MAGIC + Spells/Rituals/Adept Powers/Metamagic; MATRIX + Complex Forms/Echoes/Sprites; WILD LIFE / critters / spirits / powers; RUNNING THE GAME + Professional Rating → npcs; CHARACTER CREATION + Qualities / priority table / metatype attributes table / Lifestyle; SKILLS + skill headings.
  - `HEADERS`: kind → {printed column header → attribute} (`"DV": "dv", "MODES": "modes", "ATTACK RATINGS": "ar", "AMMO": "ammo", "AVAILABILITY": "avail", "COST": "cost", …`, the band `B A R S W L I C ESS M EDG` → `bod … edg`, `I/ID` → init, `AC` → actions, `CM` → cm, `MOVE` → move, `DR`/"Defense Rating" → dr).
  - `extract(regrouped, ctx=None) -> Result`: walks `regroup.blocks()`. Each item block → (kind, entry attrs) through `SECTIONS` + `HEADERS`, or `report kind="unmapped"`. An unknown column → `unknown-column`, the column dropped. A value off its pattern → `book-value`, kept. Then:
    - Priority rows are parsed from the metatype cell (`Name, Name (13)`) and the magic cell (`Full: 4 Magic, …`); the metatype attribute table gives `range`s and its "Racial Qualities:" sub-row gives `trait`s.
    - Qualities: `kind` from the section (Positive/Negative), `karma`/`perLevel` from the `Cost`/`Bonus` label, and `maxLevel` from a `(1 to N)` name suffix, which is stripped from the name.
    - Adept powers: `cost`/`perLevel` from "N PP (per level)", plus `activation`.
    - Spells: category from the section, tags from `tags`, the rest from the stats band.
    - Rules: every section block in the rules chapters (GAME CONCEPTS, COMBAT, MAGIC, MATRIX, RIGGING, RUNNING THE GAME; others by `SECTIONS`) → `rule` with chapter, level and parent. Its text, rule tables included as markdown, goes to texts.
  - ids are `slug(name)` (`importer.recipes.dhsa.slug`), made unique within a kind with `-2`… (`kind="duplicate-id"` reported). Each kind with entries → `<kind>.xml` (header comment "Generated by the importer (recipe sr6 crb) from the Shadowrun 6 core rulebook."). Descriptions, game effects and labels that are prose → `Result.texts`. The regroup report is added by run (Task 5).
- [ ] Tests first, on a made-up regrouped file (written with `regroup` from made-up md, or literal `<!-- item … -->` blocks):
  - One invented entry of each kind maps to the right file with the right attributes.
  - Every written file passes lxml validation against its XSD.
  - No `<text>` in an overlay holds text, and the texts hold the descriptions.
  - A priority row's metatype and magic cells parse to children.
  - A quality "Lucky Streak (1 to 3)" with "Cost: 4 Karma per level" gives `karma="4" perLevel="true" maxLevel="3"` and the name "Lucky Streak".
  - An unknown column gives `unknown-column`, and a cost "12x" stays "12x" with `book-value`.
  - The page is the PDF page − 1.
  - `match` scores the SHA at 1.0, a made-up head naming "Sixth World … Core Rulebook" at 0.9 and an Anarchy head at 0.
  - Implement, `npm run test:py`, commit "SR6 S1: core rulebook recipe".

### Task 5: SR6 run, remove and CLI
**Files:**
- `importer/xmlio.py` (new `@contextlib.contextmanager root(prefix, ns)` and `_root()`, default `("ca2", NS)`. `merged_texts` and `update_sources` write `<{prefix}:data xmlns:{prefix}="{ns}" …>`. Anarchy output is unchanged).
- `importer/sr6/run.py` (new). `run(book_dir, custom_dir, convert_pdf=True, file_name=None)` follows `importer.__main__.run`:
  - status converting → `convert(pdf, book.md, sr6=True)`
  - identifying → `identify` (no match: `failed`, "no SR6 recipe matched this book")
  - extracting → `regroup(md, recipe.ALIASES, name_headers=recipe.NAME_HEADERS)` → `regrouped.md`, then `extract(regrouped)`. No new status state, so `status.xsd`, the client's `LIVE` and `sweep` stay as they are.
  - Inside `xmlio.root("sr6", importer.sr6.NS)` it writes the overlays with `xmlio.write_overlay(custom/imported/<src>/, …)`, texts with `merged_texts` → `custom/texts/<src>.xml`, `update_index`, and `update_sources(custom_dir, library_dir)`. Then `write_import` with recipe, source, counts and the regroup report + the recipe report, then done. `remove(book_dir, custom_dir, forget=False)` = `importer.__main__.remove` inside the same `root(...)` (the samples and npcs lists don't exist for SR6, so they're skipped).
- `importer/sr6/__main__.py` (new: `main(argv)` with `run <book> --custom <custom/sr6> [--md] [--file NAME]`, `remove <book> --custom D [--files]`, `edit …` (Task 6), `regroup <md> <out>` and `summary <book>` (prints counts per file and report rows grouped by kind, names included, for local use)). `importer/__main__.py` (`main`: `argv[0] == "sr6"` → `importer.sr6.__main__.main(argv[1:])` before `use_custom`. Usage lines added). `importer/tests/test_sr6_run.py` (new).
- [ ] Tests first, on a made-up `book.md` and `--md`, no PDF:
  - `run` writes `custom/imported/crb/*.xml` with scoped ids (`crb.zap-gun`), `custom/texts/crb.xml`, `custom/imported/index.xml` and `custom/imported/sources.xml` under the `sr6:data` root in SR6's namespace.
  - It writes `regrouped.md` and an `import.xml` whose report holds the regroup's `unpaired-row`.
  - An Anarchy `merged_texts` call outside `root()` still writes `ca2:data`.
  - A book with no match → `failed`.
  - `remove` clears the source folder, texts and index entries and keeps another book of the same source.
  - `python -m importer sr6 summary` prints the counts.
  - The existing `test_run.py` still passes.
  - Implement, `npm run test:py`, commit "SR6 S1: SR6 import run, remove and CLI".

### Task 6: SR6 edits layer
**Files:** `importer/sr6/edits.py` (new: `set_entry(custom_dir, kind, id, body, by=None)`, `remove_entry(custom_dir, kind, id) -> bool`, reusing `importer.edits.EditError`, `MAX_BODY` and `USERNAME`). `importer/sr6/__main__.py` (`edit set <kind> <id> [--by U] --custom D` (entry on stdin), `edit remove <kind> <id> --custom D`; exit 3 = refused). `importer/tests/test_sr6_edits.py`.
- Rules (R): S1 edits existing entries only (no added entries, no house sources).
  - The body is `<edit><TAG …/><description>…</description></edit>`, without DTD or entities, and `TAG` must be `KINDS[kind]`. Its `id` must equal the URL id and be an id in `custom/imported/index.xml`'s files. `source`/`page` must equal the imported entry's.
  - The entry, wrapped in `<sr6:data kind="<kind>" version="1">`, must validate against `<kind>.xsd` with lxml, and the first lxml error message is the refusal.
  - It is stored in `custom/edits/edits.xml` (kind="edits", `by` set), replacing the same id. The description goes to `custom/edits/texts.xml` (`of=kind`); empty means "the book's text" and removes the text entry.
  - `remove_entry` drops both.
  - Writes go through `xmlio.write_file` inside `xmlio.root("sr6", NS)`.
- [ ] Tests first, against the made-up fixture copied to a temp dir:
  - Saving a weapon with a new `cost` stores it with `by`.
  - Unknown kind, wrong tag, an id not in the catalog, a changed `source`, a `karma="x"` quality and a DOCTYPE body are each refused with a message.
  - An empty description removes the edited text.
  - `remove_entry` returns true and then false.
  - Implement, `npm run test:py`, commit "SR6 S1: SR6 edits layer".

### Task 7: Server — SR6 books, jobs, edits and `/custom/sr6/`
**Files:**
- `server/books.mjs`:
  - `AREAS = { ca2: { library: libraryDir, custom: customDir, pre: [] }, sr6: { library: join(libraryDir, 'sr6'), custom: join(customDir, 'sr6'), pre: ['sr6'] } }`.
  - `handle(req, res, url, send, who, game = 'ca2')`. When `game === 'sr6'` only these are handled: `POST|GET /api/books`, `GET /api/books/:id/report`, `POST /api/books/:id/reimport`, `DELETE /api/books/:id[?files=1]`, `GET /api/edits`, `PUT|DELETE /api/edits/:kind/:id`. Any other path returns `false`.
  - `bookDir(game, id)`. Queue entries are `{ game, id, steps }`, and `busy(game, id)` checks the area. Steps are `[...pre, 'run', dir, '--custom', area.custom, '--file', f]` and `[...pre, 'remove', …]`. In `importer()`, `cmd0 = args[0] === 'sr6' ? args[1] : args[0]` decides the child/serial tracking, so `sr6 edit` never becomes the job `child`.
  - `sweep()` covers both areas. `rebuildCore`, AI, review and data pack stay Anarchy only (R).
  - `edits()` takes the area: kinds from `SR6_KINDS` for sr6, `GET` maps tags back to kinds, `POST /api/edits/sources` → 404 for sr6.
  - The reimport's `recipe === 'ai'` check is unchanged.
- `server/server.mjs`:
  - `api()`: for a scoped path, `/^\/api\/(books|edits)(\/|$)/` → `books.handle(req, res, u, send, who, 'sr6')`, then `false` → 404.
  - Static: the exact prefix `/custom/sr6/` → a signed-in session, `serveFile(res, join(customDir, 'sr6'), rest)`, with the campaigns guard factored out of today's branch into `customGuard(dir, asked)`: by name, case, trailing dots/spaces, `:`/`~` and inode against `custom/sr6/campaigns.xml`. Any other spelling (`/custom/SR6/…`, `/custom/sr6./…`) still falls to the Anarchy branch's 404. Header comment updated.
- `tests/fixtures/stub-worker.mjs`: `sr6` shifts the command. `sr6 run` copies `tests/fixtures/sr6/custom/{imported,texts}` into `--custom` and writes import.xml (source CRB, recipe crb, counts, one `unpaired-row`). `sr6 remove` deletes `imported/crb` and `texts/crb.xml` and rewrites index.xml. `sr6 edit set|remove` writes or drops the entry in `edits/edits.xml` and refuses `<name></name>` like the Anarchy stub.
- `tests/server/sr6-books.test.ts` (new), `tests/server/games.test.ts` and `tests/server/server.test.ts` (the two S0 assertions adjusted as in Global Constraints).
- [ ] Tests first:
  - Admin uploads to `/api/sr6/books` → 202 → listed done under `/api/sr6/books` with source CRB and counts, absent from `/api/books`. Files sit in `library/sr6/<id>/` and `custom/sr6/imported/crb/`.
  - Report, reimport and delete work. A player gets 403 on SR6 book routes. An editor `PUT /api/sr6/edits/weapons/crb.x` → 204 and `GET /api/sr6/edits` lists `{ kind: 'weapons', id }`. An unknown kind → 400.
  - `/api/sr6/books/:id/ai`, `/api/sr6/review/x`, `/api/sr6/datapack` and `/api/sr6/edits/sources` → 404.
  - An Anarchy and an SR6 upload queued together run one at a time (STUB_LOG order).
  - A restart marks an interrupted `library/sr6/<id>` failed.
  - `GET /custom/sr6/imported/index.xml` → 200 signed in and 401 signed out. `/custom/sr6/campaigns.xml`, `/custom/sr6/CAMPAIGNS.XML`, `/custom/sr6/campaigns.xml.` and a hard link to it → 404. `/custom/SR6/imported/index.xml` → 404. `/custom/imported/index.xml` still serves Anarchy's. Anarchy's `/api/edits` never lists SR6 edits.
  - Implement, `npm run check`, commit "SR6 S1: server routes for SR6 books, jobs, edits and /custom/sr6/".

### Task 8: SR6 catalog loader
**Files:**
- `src/sr6/formats/domain/types.ts`: `Sr6Part { tag; attrs: Record<string, string>; text: string }`; `Sr6Entry { id; kind: Sr6Kind; name; source; page: number; attrs: Record<string, string>; parts: Sr6Part[]; text: string; edited?: boolean }`; `Sr6Source { id; name; publisher; canon; texts?; file?; sha256?; imported?; origin: 'shipped' | 'imported' }`; `Sr6Catalog { entries: Record<Sr6Kind, Map<string, Sr6Entry>>; sources: Map<string, Sr6Source>; original: Map<string, Sr6Entry>; files: { file; kind; entries }[]; errors: { file; message }[] }`. The catalog is generic in S1 (R), and S2 adds typed views.
- `src/sr6/catalog/domain/load.ts`:
  - `collectSr6Files(get)` loads, in order: `data/sr6/sources.xml`, `custom/sr6/imported/sources.xml`, the files in `custom/sr6/imported/index.xml`, the texts each source names (`custom/sr6/<texts>`), then `custom/sr6/edits/edits.xml` and `texts.xml`.
  - `buildSr6Catalog(files: SourceFile[])` (`SourceFile` from `src/ca2/catalog/domain/load.ts`). The root must be `data` in SR6's namespace, or the error is "not an SR6 data file" (so an Anarchy file is refused). Each element maps by tag to its kind: same id replaces, `<remove id>` deletes, sources merge as `mergeSource` does. texts fill `text` by (of, id). Edits replace by id, keep the original in `original` and set `edited`, and an empty description keeps the book's text.
  - `loadSr6Catalog(base = './')` uses `fetch` like `loadCatalog`.
  - `sr6EntryXml(e: Sr6Entry): string` gives the entry element for an edit body (attrs escaped, parts kept, `<name>`, empty `<text/>`).
- `tests/sr6/catalog/load.test.ts` (new).
- [ ] Tests first, on `tests/fixtures/sr6/custom` read from disk:
  - Every kind has its entries.
  - The CRB source comes from the shipped file plus the imported file and sha.
  - Texts fill descriptions.
  - The edited weapon has the new cost, `edited` and the original in `original`.
  - A file with the Anarchy namespace → an error, its entries not loaded.
  - An unknown tag → an error.
  - `sr6EntryXml` round-trips through `buildSr6Catalog`.
  - Implement, `npm run check`, commit "SR6 S1: SR6 catalog loader".

### Task 9: SR6 Books, Rules and Game data pages
**Files:**
- `src/features/book-library/Books.tsx` (`BooksScreen({ c, reload, game })` with `c?: Catalog` and `game?: 'sr6'`):
  - The API base is `sr6/books`, and uploads go through `sendFile('sr6/books', …)`.
  - For SR6 it hides the AI settings link, DataPack, the AI buttons and the "Also in other books" dupes.
  - `supportedBooks(path)` reads `data/sr6/sources.xml`, the intro says "Upload the Shadowrun 6 core rulebook PDF you own", and source titles come from `b.name`. Anarchy renders unchanged.
- `src/sr6/shell/ui/Sr6App.tsx`: it loads `loadSr6Catalog()` on mount (a failed load shows the error banner) and passes `refresh` to Books.
  - Routes: `books` (admin) → `<BooksScreen game="sr6" reload={refresh} />`, `rules` → `<Sr6Rules c />`, `data` → `<Sr6Data c reload />`, anything else → the S0 runners shell.
  - The S0 placeholders go.
- `src/sr6/game-data/ui/Rules.tsx` (new). The `rules` entries are grouped by chapter, then by level/parent. It has a search box (title + text) and a chapter select, and each section shows its text. With no rules, the empty state reads "No SR6 rules yet." plus the Books link for the admin. With titles but no texts, it reads "Only titles are shown: the rules text isn't installed." Rules is for everyone (R: no SR6 table rules in S1).
- `src/sr6/game-data/ui/Data.tsx` (new):
  - A Sources table (id, name, publisher, canon, entries, descriptions installed or not, file, checksum, as Anarchy's).
  - Entries per kind (a table of `SR6_KINDS` labels with counts).
  - A browser: kind select + search, rows with name, `src p.N` and an Edit button (editors).
  - "Your catalog edits", listing edited entries with Changed / Orphaned and their Edit buttons.
  - Load errors listed.
- `src/sr6/game-data/ui/EditEntry.tsx` (new). `Sr6EditEntry({ c, kind, id, onClose, onSaved })` is a `Modal` with name, one text input per attribute except `id`/`source`/`page`, the parts read-only (R), and a Description textarea (the book's text; unchanged or empty = the book's).
  - Save → `PUT sr6/edits/<kind>/<id>` with `<edit>${sr6EntryXml(e)}<description>…</description></edit>`.
  - "Restore book version" → `DELETE`, then `onSaved()` reloads.
  - Server refusals show in the dialog.
- `src/core/chrome/nav.tsx`: the SR6 menu becomes Your runners, Books (admin), Rules, Game data, with the current page from the second segment.
- `src/core/ui-kit/app.css` (design-system tokens only).
- `e2e/sr6.spec.ts` (new; own server and data folder like `e2e/games.spec.ts`, an admin, an editor and a player).
- [ ] e2e first:
  - Admin: switch to SR6 → Books → upload a PDF (stub) → done with "recipe crb", the counts and a Report naming the unpaired row. Game data shows source CRB with the counts per kind. The browser finds an invented weapon. Rules finds an invented rule and shows its text.
  - Editor: edit that weapon's cost → the Edited mark and the new cost → Restore book version → the old cost.
  - Player: sees Rules and Game data with no Books item and no Edit buttons.
  - Isolation: the Anarchy Game data page shows no SR6 source, and `page.request.get('/custom/sr6/campaigns.xml')` is 404.
  - Remove the book → Game data's empty state "No SR6 data yet".
  - Check by hand: light and dark at phone width.
  - Implement, `npx playwright test` (full suite), `npm run check`, commit "SR6 S1: SR6 Books, Rules and Game data pages".

### Task 10: Owner's local real-book check (nothing committed)
- [ ] Locally, outside the repo (e.g. `%TEMP%\sr6-check\`): copy the owner's PDF to `library/sr6/book1/original.pdf`, then run `py -3.12 -m importer sr6 run <tmp>\library\sr6\book1 --custom <tmp>\custom\sr6` and `py -3.12 -m importer sr6 summary <tmp>\library\sr6\book1`.
- [ ] Record, in `.superpowers/sdd/sr6/s1-realbook.md` (git-ignored; numbers and kinds only):
  - wall time
  - counts per kind
  - report counts per kind
  - the unpaired rows and descriptions list (local only)
  - every catalog table's header row and label per chapter, from `regrouped.md`
- [ ] Targets:
  - Every kind is non-empty except contacts (the book may print none: report it).
  - Unpaired rows + descriptions are under 5 % of the items in each kind.
  - Every lost table (a run of loose rows in `book.md` between band tables) is noted. If any remain after Task 2's reader, the old project's `extractor/xtable.py`/`rowengine.py` approach is the fallback, as its own follow-up task.
  - 5 entries per kind are spot-checked against the PDF by eye.
- [ ] Fixes go to the recipe's constants (`ALIASES`, `NAME_HEADERS`, `SECTIONS`, `HEADERS`) or to Task 2/3 rules. Each gets a made-up test (no book text) and its own commit "SR6 S1: real-book fixes (…)". Run again until the targets hold. Nothing from the run (md, XML, numbers) is committed. The owner also loads the result in the app (`custom/sr6/` of a local server) and checks the Rules and Game data pages.

### Task 11: Docs and ledger (controller)
- [ ] `README.md` (SR6 Books/Rules/Game data; the `library/sr6/` and `custom/sr6/` layout), `docs/data-format.md` (a pointer to `docs/sr6-data-format.md`), `CHANGELOG.md` (Unreleased: SR6 S1), `.superpowers/sdd/sr6/progress.md` (S1 range, review fixes, deferred items).
- [ ] Final review of S1 (isolation audit as in S0's review: listings, `/custom/sr6/`, edits, jobs), then `npm run check` + `npm run test:py` + Playwright, all on `feat/sr6`. No release; the SR6 line ships after S2/S3.

## Rulings (R) summary
- Source id `CRB`; per-kind files under `custom/sr6/imported/crb/` with source-scoped ids; no `core/` split. Namespace `urn:chummer-sr6:data:1`, XSDs in `public/data/sr6/schema/`, shipped `public/data/sr6/sources.xml`.
- No prose in overlays, only in the texts file. Values are kept as printed (only counts, points, karma, levels and pages are integers). Cross-references are names until S2.
- Kinds added beyond the spec's list: vehicles, metamagics, echoes, critterpowers.
- The SR6 layout is an opt-in converter mode (`sr6=True`, recorded as converter `sr6-1`). Anarchy output is byte-identical.
- The regroup has its own rules: pairing within a chapter, lower-case labels, the box rule, the parenthesis and slash rules, the "series" rule, and HTML-comment JSON block markers.
- One shared job queue. No AI, review or data pack for SR6. Unmatched books fail.
- `/custom/sr6/` is served only on its exact lowercase prefix and never serves `campaigns.xml`. Anarchy's `/custom/` still 404s `sr6/`.
- Books is reused with `game="sr6"`. Rules and Game data are new SR6 pages, because Anarchy's are bound to its catalog type. Rules is for everyone, with no SR6 table rules. Ask stays hidden.
- SR6 edits cover existing entries only, validated by the kind's XSD via lxml. Parts are read-only in the form. Adding entries and house sources come with S2.
- Printed page = PDF − 1. Other printings match by title at 0.9 and are untested. Python tests go in `importer/tests/test_sr6_*.py`.

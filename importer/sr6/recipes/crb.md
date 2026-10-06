# SR6 core rulebook (CRB): layout survey

Structure only, no book text. The owner's PDFs (SHA-256s in `crb.py`): the 2019 printing, 322 pages, 612 × 765 pt, and
the City Editions (Hong Kong, the latest printing, 2025; Seattle; Berlin), 342–349 pages: the same pages 1–321 (some
values and names updated), then a chapter on the city and fiction after the index, which `END_PAGE` leaves out (the
city chapter is read apart: below). Their
first pages name no core rulebook and carry no title, so they are known by fingerprint only. Printed page = PDF page − 1
(`PAGE_OFFSET`) in all of them. The real-book check runs on the Hong Kong edition (the owner's rule: the latest
printing).

## The City Editions' city chapter (crb_city.py)

Each City Edition's city chapter is a source of its own (CRB-SEA, CRB-BER, CRB-HK; `crb.extra` -> `Result.extra`, which
run.py writes to custom/sr6/imported/<source>/ beside the CRB, records in import.xml `extra`, and removes with the
book), so the CRB catalog stays the 2019 printing's. Only its game pages are read (`CITIES`: PDF pages Seattle 328-341,
Berlin 331-345, Hong Kong 330-339): the fiction, the city overview and the back cover are left out. In them:

- Qualities: level-3 headings with `Cost:` / `Bonus:` lines (bold or, in Berlin, plain bullets).
- Contacts: a level-3 heading with a metatype line (`Female Elf`, read as a tag or a level-4 heading), the description,
  then a level-5 box with the band (or the band in the description itself: Trubble): a contact and its NPC. A box
  printing two beings' bands into each other (Seattle's Brynne Taggart and Ni Ni Xiaolu, Berlin's Cashmere and Saif
  Alhazred) is not guessed: those contacts are reported.
- Gear: small tables under lower-case titles (ITEM, TYPE or VEHICLE first: one entry a row) or a box's own table (named
  by the box or the heading it describes; several tables under one heading: `Ballistic Tent (2)`); Berlin's street
  weapons as bold names with bracketed stats; Berlin's prices print thousands with a dot (`32.000¥`). A vehicle table
  printed in the text of a section whose name another box with its own table has (Berlin's airbike values in the
  walker's section) is reported, as is a box title with no values (the Kuznechik Airbike).
- The rest (plot hooks, the city's reputation and heat modifiers, gear descriptions no row took): rule sections.

## Fonts (converter sr6 layout, Task 2)

- Body: a serif family at 10.5 pt; bold run-in labels (`Cost:`, `Game Effect:`) in its bold face.
- Headings: one display family at 60 (chapter, level 1), 21 (section, 2), 15 (subsection, 3), 13 (item, 4) and 9
  (box titles, spell and matrix-action tag lines, 5). The Hong Kong and Berlin chapters set a 27 pt title on enough
  pages for the converter to take it for a level (dropping 9 pt), so the recipe gives the sizes (`HEADING_LEVELS`) for
  the printings it knows.
- Tables: a 7 pt sans family; header row in its black weight, rows regular, stat-box labels bold ending in `:`.
- Table titles, some box titles and art captions: the display family in lower case.
- Margin tab letters at the outer edge, running heads and page numbers at the edge or in the bottom 35 pt: dropped.

## Item shapes (what regroup hands the recipe)

- Gear: a titled catalog table (first header WEAPON, ARMOR, ITEM, AUGMENTATION, DEVICE, VEHICLE), descriptions under
  level-4 headings elsewhere in the chapter. The kind comes from the first header, label or section (`SECTIONS`).
- Spells and sprites: level-4 heading, a level-5 `(tags)` line, a one-row stat band, then text.
- Qualities and adept powers: level-4 heading (optional `(1 to N)` suffix), labelled lines, text.
- Critters, spirits and grunts: a box (level-5 title) with attribute bands (`B A R S W L I C ESS`, `DR I/ID AC CM
  MOVE`) and labelled lists (`Skills:`, `Powers:`, `Gear:`, `Weapons:` …). Grunt boxes sit under a level-3
  "Professional Rating N" section.
- Skills, rituals, matrix actions and lifestyles: level-3 sections, their tag lines and labels on level-5 lines.
- Implant grades: the `GRADE | ESS COST | COST | AVAIL` table in the gear chapter's Grades item (a rule table in its
  text): one grade a row, `x`/`+` dropped. Autosofts: the rigging chapter's Autosofts section's labelled lines are
  programs of type autosoft, priced and rated by the gear chapter's `Autosoft (Rating 1-9)` row (its avail
  `Rating (1-9)` read as `Rating`).
- Priority table (first header PRIORITY: five letter rows) and metatype attribute table (first header METATYPE, a
  "Racial Qualities:" sub-row per metatype): rule tables, kept in their section's text and read from there.
- Contents (pp 3-6), index (305-310) and the character sheet (320-321) read across columns; nothing maps them.

## Checked against the PDF (Task 10)

- Chapters (level 1): game concepts, character creation, archetypes, skills, combat, magic, matrix, rigging, wild life,
  running the game, gear. Lifestyles are level-3 sections in game concepts (cost on a level-5 tag line). Grunts (level-3
  "Professional Rating N" sections), sample contacts, critters and critter powers (level-3 sections, a TYPE/ACTION/
  RANGE/DURATION band in the text) are all in wild life; spirits are level-4 items in magic (a heading printed twice
  over its box); sprites, echoes (a section's bulleted labelled lines) and programs (the Programs section's `Basic` and
  `Hacking` headings' labelled lines; each takes its type's price from the gear chapter's `Cyberprogram, <type>` row)
  in matrix. Combat spells sit under level-5
  item headings ending in "Spells". The ten archetypes (a level-2 section with a level-5 `metatype: <name>` box: the
  stat band and labelled lines) are no catalog kind: they become sample runners (importer/sr6/archetypes.py).
- Gear rows map by their table's first header and title only (a section name can mislead): the augmentation tables
  name the body part (HEADWARE, EYEWARE, EARWARE, BODYWARE, LIMB, CYBERJACK), vehicle tables the vehicle class (CARS,
  BOATS, … DRONES). The matrix chapter reprints the commlink and cyberdeck tables; a look-alike vehicle list
  (VEHICLE | SIMILAR MODELS) and the bone lacing effects table are skipped.
- From PDF page 305 on: the index, then reprinted reference tables (`END_PAGE`), left out.
- A few boxes print two beings side by side (each band once per being, labels two to a line): split by the title's
  words. A box title or two differ from their description's heading (`crb_aliases.json`).
- Prices print formulas (rating, capacity or force times a number; squares; divisions), add-ons (`+N`), per-unit
  prices, two items on one row (`A/B` names, a month or a year price, synthetic or obvious limb columns) and a few
  prices naming another item (reported).

## Formula styles and issues (importer v2)

- `Rating x N¥`, `Force x N¥` (foci, also their bonding Karma), `Capacity x N¥` (sensors, priced by their
  capacity: the capacity range is the rating) -> `R*N`. `(Rating/3)` avail -> `(R/3)`, rounding up (the book never
  says; Commlink6 rounds down).
- Rows printed one per rating (`Cyberears (Rating 1)` … with a name-only row over them, `Rating N` rows): the group's
  cost, avail, Essence and capacity become one `tier()` rule on every row (`tier(R; 1: 1000; 2: 3000; …)`).
- Capacity used in brackets: `[2]` is a number, `[Rating]` -> `R`. Vehicle seats `1/3` (front/back) -> `1 + 3`.
- Issues: a rated price with no rating range anywhere (`missing rating`, about 50: armor and gear rows priced
  `Rating x N¥`); rows the table prints with no avail or price (`missing`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- Issues: the crossbows' rows print no firing modes (`missing modes`).

## Table shapes and value styles (importer v2)

- **Short names in a table.** A gear table may print a shorter name than the item's description heading
  (`Laser mic` under `#### Laser microphone`, a maker left off): regroup pairs the row with that heading
  (`shorter_name`) and names the entry by the heading when it is the full name (`full_name`: the abbreviated last
  word, or a maker in front). A heading that adds words after the row's name (`… Step-Van`) is a title: the row's
  name stays.
- **Two fields in one cell.** A DV with a note (`1P + special`): the DV, the note to the text.
- **A value only the description gives.** The crossbows' table prints no ammo; their description does (internal
  magazines holding a count of bolts): `ammo_from_text` reads `N(m)` from the holder vocabulary (`AMMO_HOLDERS`:
  internal magazine m, clip c, drum d, belt, cylinder cy, break action b, muzzle loader ml).

## Where a value the row leaves out is printed (importer v3, resolve.py)

Before an issue is written, the same book is searched (every recipe that reads through `crb.extract` gets this):
- **Another table naming the item:** the implant weapons (hand razors, spurs, cyberjaw, handblade, hardening) print
  their attack in the weapon tables and their price in the cyberware tables; the shields print DR, avail and cost in
  the armor table; the sensors print `Capacity x N¥` under shorter names (`Laser mic`, `Omni-directional mic`).
- **A sentence:** a rating range in the description (`ratings 1 to 6`, `maximum rating 9`): headjammers, jammers,
  locks, maglocks, tutorsofts, fake SINs and licenses, sensor arrays.
- **The corpus** (other books): the `Cyberprogram, <type>` and `Autosoft` rows price the other books' programs and
  autosofts by their type.

The core rulebook's errata (Aug 2019, Feb 2020) predate the City Editions; their statements apply only to the 2019
printing (the loaded printing is the newest).

## Sections read as kinds (importer v3, sections.py)

- **Foci kinds:** the run-ins under `#### Enchanting Foci`, `#### Metamagic Foci`, … (Alchemical focus, Centering focus)
  are gear, priced as their class's row (`Enchanting focus`: its Force formula) in the same book; a run-in whose class
  row the book doesn't print is left out.
- **Shared classifier (A5):** the echoes (`### Echoes`), the basic and hacking programs (`#### Basic` / `#### Hacking` under
  `### Programs`) and the autosofts (`### Autosofts`) are read as run-ins by the shared vocabulary in sections.py; the
  recipe's own LABEL_SECTIONS map for them is gone. The sprite powers (`#### Name` under `### Sprite Powers`) and the
  traditions (`#### Hermeticism` under `### Traditions`) are entries too (the sprite powers print no Range or Duration).
- **Spell features:** the bold run-ins of the `## Rituals` intro, which says its rituals have keywords (Anchored,
  Material Link, …).
- **Ammunition types:** the `ammo types` table (TYPES | AR | DV | COST MULTIPLIER): each row an ammunition type, its
  price the multiplier as printed (no availability or price of its own to ask for).
- **Actions:** `### Minor Actions` and `### Major Actions` under `Game Timing and Actions` (each `#### Name (I|A)`;
  the `actions` table pairs its rows with them, so the name comes plain and the `(I)/(A)` from the heading, an
  alias); `#### N-Edge Boosts` and `#### Edge Actions` under `Spending Edge`, as bullets (`• **Name (Action):** …
  Cost: N Edge`); `## Matrix Actions` (each `### Name` with its `(Major)`/`(Minor)` tag line); the Matrix Edge
  actions as bullets. Not actions: the `edge actions by cost` lists, the box titles in lower case.
- **Mentor spirits:** `#### Name` under `### Mentor Spirit Archetypes` (their Advantages and Disadvantages are a level
  further down: the description).
- Prose only, not read (no section of their own): the magic types (the Magic/Resonance step's five options), the
  licence types (Fake License's paragraph), the senses (Enhanced Perception), the ritual keywords (the Rituals intro's
  bold run-ins: no section words).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Sixth World Core Rulebook-Hong Kong City Edition-CAT28000H.pdf>" --out "%TEMP%\sr6-check"

It recreates `<out>/library/sr6/book1/` (a copy of the PDF) and `<out>/custom/sr6/`, runs the full import (convert,
identify, regroup, extract, write) and prints: the wall time; the status; recipe, source, pages, converter and match
score; every written `<kind>.xml` with its entry count; the report rows grouped by kind with a count and every row
(regroup's unpaired-row, unpaired-description, unpaired-box, duplicate, shared-description; the recipe's unmapped,
unknown-column, book-value, missing-value, duplicate-id); then `xsd: all valid` or each file its XSD refuses (exit 1).
`book.md`, `regrouped.md` and `import.xml` stay in `<out>/library/sr6/book1/` for inspection;
`python -m importer sr6 summary <out>/library/sr6/book1` prints the summary again.

# SR6 Sixth World Companion (SWC): layout survey

Structure only, no book text. Two copies are known (SHA-256s in `swc.py`), both 210 pages, 750 × 939 pt, printed page =
PDF page − 1 (`PAGE_OFFSET`): the owner's, in the book's own fonts (bold labels, header-band tables), and an earlier one
with its fonts re-embedded as Liberation Serif/Sans (labels unbolded, no tables: the tables come out as text lines). The
recipe reads both.

## What the converter needed (sr6-2)

- The two text columns sit about 2 pt apart (less than a word space): rows split where the content stream jumps.
- Bullets are a tiny raised glyph and the labels (`Contact Points:`) a point smaller than their values: rows cluster by
  baseline, a tiny glyph joining the row beside it.
- In the Liberation copy, no header-band tables: the book's tables print as bold text lines, read by the recipe.

## Item shapes

- Life modules (BUILDING A SHADOW, Life Path): the three opening modules are level-5 items under "Starting down the life
  path", their grants in sentences. Adult modules are level-5 items under the level-4 "Choices Life Modules" and "Event
  Life Modules", their grants in bulleted labelled lines (`Choose one: +1 to A, B, or C`, `Resources:`, `Contact Points:`,
  `Contact Types:`, `Knowledge skill (choose N)`). A module heading with a bracket in another font isn't a heading: it is
  a `Name [ X only ]` line in the module before it. The first event's heading reads as a label of the group heading.
  The worked example's sidebar runs into the last event (reported as unread-line).
- Metavariants (TYPES AND SHADOWS, "Creating a Metavariant…"): the attribute-range tables, each table's columns in
  pieces: a header of abbreviations (a table header, its one row the first metavariant's, named on the line under it; or
  a text line), `Name` rows, then number-only rows for the same names (under a header of the rest, or in order);
  `Racial Traits:` lines (wrapped) under each row. The same tables print earlier in the chapter and in the table index
  (`END_PAGE`); only the summary is read. Karma costs (the development table) are creation settings, not catalog values:
  `metatypeKarma:swc.<id>` in `public/data/sr6/creation-defaults.xml`. The development tables' `PRIORITY A`–`E`
  columns (a row a metavariant, `N/A` where it can't be taken; `Dour` is the duende's row, a plural name the
  metasapient's) give each metavariant its `<priority letter points>` children: priority creation offers it at those
  letters. The core rulebook's metatypes' rows are skipped; a row naming no metavariant of the book is reported.
- Qualities (PEOPLE OF EXCEPTIONAL QUALITY, EXPRESS YOURSELF, DARKER ALTERATIONS): a `Cost: N Karma` (positive) or
  `Bonus: N Karma` (negative) line; a block holding several (metagenic qualities) names each by the short title line
  above it. Lifestyle qualities (WHAT YOU GET) cost lifestyle points: rules.
- Critter powers: level-5 items under "New Critter Powers", `Type:`/`Action:`/`Range:`/`Duration:` lines.
- Contacts ((META)HUMAN RESOURCES): `Typical Connection Rating: N`, and a stat band (`B A R S W L I C ESS` over its
  values) with `Active Skills:` as an NPC (group Contact).
- Everything else in the chapters is a rule section; PACKs (SUIT UP) are bundles of other books' gear: rules.

## Formula styles and issues (importer v2)

- No price formulas. Issues: two qualities print no Karma (`missing karma`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Table shapes and value styles (importer v2)

- **A vehicle in the text.** A lower-case title over a tag line (`(Personal Motor Vehicle)`) is an item (regroup);
  its stats print as a speed table (`SPD INT | TOP SPD`) and a bold header line over a value line, headers run
  together (`SEATAVAIL`): `shapes.vehicle_band` reads them into a vehicles entry, the tag its category.
- **Run-in prices.** A quality whose price line says `See text` takes the Karma its own paragraphs print
  (`bonus of N Karma`, a second for the Awakened: karma and karmaMax).

## Sections read as kinds (importer v3, sections.py)

- **Qualities:** each quality path step (`##### Critter Bond: Lost`) is a quality too, named without the path
  (`Lost`), positive with a Cost line, negative with a Bonus line. A step with only a Game Effect (most of the
  paths' steps) is a quality too: negative, with a `kind` issue; a Cost line by a rule (`5 x new rating`) makes it
  positive (importer v4). Its Karma in the text (`Gain N Karma`) is read; a buy-off price (`buy it off for N
  Karma`) is not its Karma.
- **Quality sets:** each row of a table listing qualities with a Karma price (`TYPE | KARMA | METATYPE | POSITIVE
  METAGENIC QUALITIES | NEGATIVE …`, the metagenic collectives under `Collectives`): its Karma, metatypes and qualities.
- **Contact types:** the bullets (`• **Academic:** …`) under `## Contact Types`.
- **Quality paths:** `#### Quality Path: Name` under `## Quality Paths`, the headings under each its steps.
- **Actions:** `## New Optional Edge Actions` (bullets with the action they go with).
- **Packs** (SUIT UP): a heading over a `(N nuyen)` line in the chapter printing PACK headings (`#### Hacker PACK A`,
  `#### Dirt Poor` under `## Complete Character PACKs`, `#### Armed Suzuki Mirage` under `## Bikes`), its `**Essence
  Cost:**` and its labelled contents lists (`**Gear:**`, `**Weapons:**`; not `Recommended Skills`); each `**Name** (w/
  contents): **N nuyen**` paragraph under a `… PACKs` heading (the weapon, armor, sensor and identity packs; the price
  may wrap onto its own line); each `Pilot Rating N: N nuyen` line (the autosoft packs: `Recon Autosofts 2`). A
  trailing `PACK` is dropped from the name (`Armed GMC Bulldog`), one inside it reads `Pack` (`Hacker Pack A`). Two
  packs of one weapon (plain and silenced) keep the printed name twice; the book doesn't name the second.
  Importer v5: the `(N nuyen)` line may carry a requirement (`(116,000 nuyen, Vehicle's Body must be at least 10)`:
  `Rigger's Baby`, `Combat Biker`) or lose its parentheses (`139,800 nuyen`: the `Armed YMC Delfin PACK`); a
  paragraph's wrapped line that opens with a parenthesis (`(rating 3), contacts …`) continues it (`Ultrasound
  Contacts`, `Exquisite Fake ID`).

## Infected gained powers and weaknesses (owner 2026-10-16)

- Each type's `Gained Powers:` and `Gained Weaknesses:` items (pp. 110–114) become `<power name rating? ref?>` and
  `<weakness name>` children (`_gains`): the name as printed less its page citations, a number its rating (`Armor 1`,
  `Armor (4)`, Lamia's `Armor (6) (replaces Armor (4))`: rating 6, the note kept), `ref` the critter power this book
  prints of that name (Adaptive Coloration, Corrosive Secretion, Desire Reflection). The free pick's sentence and the
  modifiers (`+1 initiative die`, `+2 to base movement rates`, `–1 Logic`) are no items. The book's typos read: the comma
  left out after a parenthesis (Ghoul's `Enhanced Senses (Hearing, Smell) Natural Weapon`, Loup-garou's `(Metahuman
  Flesh) –1 Logic`), the unclosed parenthesis of Nosferatu's and the vampire's `Induced Dormancy (Lack of Air, (Essence)
  Minutes, (p. 228, SR6)` (it runs to the list's end, the last item). Every list reads.
  The rest resolve by name in the app across the library (data.ts `gainedEntry`: the core rulebook's critter powers and
  its critter weaknesses, printed as rules). Nibiinaabe's `Darkness` names a spell, not a power: `overrides/swc.json`'s
  owner row (`"gen": "owner"`, `replaces`) makes it `Innate Spell (Darkness)`, the core rulebook's critter power with the
  spell it casts in its parenthesis. A name nothing has stays as printed (owner 2026-10-16: Goblin's `Dietary
  Restriction`, the book's word for Requirement), shown quietly and noted once in the runner's Review (`data.unresolved`).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<the Companion PDF>" --out "%TEMP%\swc-check"

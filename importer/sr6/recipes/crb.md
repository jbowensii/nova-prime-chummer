# SR6 core rulebook (CRB): layout survey

Structure only, no book text. The owner's PDF (current printing, SHA-256 in `crb.py`): 322 pages, 612 × 765 pt.
Printed page = PDF page − 1 (`PAGE_OFFSET`).

## Fonts (converter sr6 layout, Task 2)

- Body: a serif family at 10.5 pt; bold run-in labels (`Cost:`, `Game Effect:`) in its bold face.
- Headings: one display family at 60 (chapter, level 1), 21 (section, 2), 15 (subsection, 3), 13 (item, 4) and 9
  (box titles, spell and matrix-action tag lines, 5).
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
- Priority table (first header PRIORITY: five letter rows) and metatype attribute table (first header METATYPE, a
  "Racial Qualities:" sub-row per metatype): rule tables, kept in their section's text and read from there.
- Contents (pp 3-6), index (305-310) and the character sheet (320-321) read across columns; nothing maps them.

## Checked against the PDF (Task 10)

- Chapters (level 1): game concepts, character creation, archetypes, skills, combat, magic, matrix, rigging, wild life,
  running the game, gear. Lifestyles are level-3 sections in game concepts (cost on a level-5 tag line). Grunts (level-3
  "Professional Rating N" sections), sample contacts, critters and critter powers (level-3 sections, a TYPE/ACTION/
  RANGE/DURATION band in the text) are all in wild life; spirits are level-4 items in magic (a heading printed twice
  over its box); sprites and echoes (a section's bulleted labelled lines) in matrix. Combat spells sit under level-5
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

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<the core rulebook PDF>" --out "%TEMP%\sr6-check"

It recreates `<out>/library/sr6/book1/` (a copy of the PDF) and `<out>/custom/sr6/`, runs the full import (convert,
identify, regroup, extract, write) and prints: the wall time; the status; recipe, source, pages, converter and match
score; every written `<kind>.xml` with its entry count; the report rows grouped by kind with a count and every row
(regroup's unpaired-row, unpaired-description, unpaired-box, duplicate, shared-description; the recipe's unmapped,
unknown-column, book-value, missing-value, duplicate-id); then `xsd: all valid` or each file its XSD refuses (exit 1).
`book.md`, `regrouped.md` and `import.xml` stay in `<out>/library/sr6/book1/` for inspection;
`python -m importer sr6 summary <out>/library/sr6/book1` prints the summary again.

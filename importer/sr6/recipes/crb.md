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

## Open (Task 10, with the PDF)

- The chapter names in `SECTIONS`/`RULE_CHAPTERS` are substrings of the real chapter headings, not checked yet.
- A grunt box title printed right under its Professional Rating heading (no text between) becomes the section's tag
  line in regroup, not an item.
- The spell, ritual, skill and lifestyle label names (`Linked Attribute`, `Untrained`, `Keywords`, `Cost`) and the
  priority cell formats are the probe's reading; the first real run reports what misses (`missing-value`,
  `book-value`, `unknown-column`, `unmapped`).

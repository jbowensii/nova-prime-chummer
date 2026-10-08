# SR6 Street Wyrd (SW): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `sw.py`): 170 pages, printed page = PDF page − 1
(`PAGE_OFFSET`); the back cover (`END_PAGE`) is left out. Two chapter titles are set at 56 pt and the fiction's at 27
(the guess takes only 60 for a level: `HEADING_LEVELS`).

## Item shapes

- Spells (THE TOME OF NOW, the blood magic spells, the spell design examples): as in the core rulebook (level-4
  heading, a `(tags)` line, the `RANGE TYPE DURATION DV [DAMAGE]` band); the category is the section's (Combat,
  Health…), else the tags' (`Direct Combat, Blood`).
- Spirits (A CONGRESS OF SPIRITS): a box titled with the spirit's name (`guidance spirits`), its bands and `Skills:`,
  `Powers:` lines, printed before or after its section's heading: named by the title. Blood and insect spirits (TOIL AND
  TROUBLE): boxes or level-5 headings with their bands in the text (category blood, insect).
- Spirit powers: level-4 headings with a `TYPE ACTION RANGE DURATION` band (critter powers); a heading's tag line
  printed as a heading of its own (`(Karma) (Free)`) is joined back.
- Adept powers (FORCE AND GRACE): level-3 sections with `Cost:` and `Activation:`; adept metamagics: level-3 sections
  under `Adept Metamagics`. Initiate metamagics (RUNGS OF POWER): level-4 headings under their school (Astral/Metaplanar
  Studies, Practical Conjuration…), each followed by a level-5 `Game Information` block that joins it. `New
  Metamagic: Sacrifice` is Sacrifice.
- Preparations (IMBUING MAGIC): level-4 headings with bulleted `Formula:`, `Drain Value:`, `Cost:` lines: gear
  (category preparations), the cost as its row (`450¥/charge`: per charge); a cost by variant is kept and reported.
  The athame focus's box is gear.
- Traditions (SEEING AND BELIEVING): the level-4 headings under the faith and logic sections, and a level-3 `…
  Tradition(s)` section with none under it; the insect tradition (TOIL AND TROUBLE). The recommended qualities boxes
  (lower-case titles) stay rule sections.
- Qualities: level-4 headings with `Cost:`/`Bonus:`; one tag line `(Bonus: 3 Karma per level, 5 levels maximum)`.
- Spell design, ingredients, triggers, free and ally spirits, magical groups, mentor spirits, strictures and the
  appendix: rule sections.

## Formula styles and issues (importer v2)

- Preparations `N¥ per charge` -> `Q*N`, unit charge. The New Preparations intro gives no availability, and no
  section does: every preparation has `<issue field="avail" code="missing">` (about 85).
- Two preparations printed in one cell (`N¥/charge (A); N¥/charge (B)`) are `ambiguous`.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

- **Adept ways (sections.py `_bought_as_quality`):** `## Adept Ways and Their Benefits` is tagged `(20 Karma)` and
  says adepts take a way "by selecting it as a quality": each `### <Name> Way` heading under it (the section's own
  noun) is a positive quality at 20 Karma. `Innate Talent`, `Focused Channeling` and `Spark of Brilliance` are the
  ways' shared abilities, not qualities.

## Commlink6 check (importer v4)

- Section kinds (importer v4): FORCE AND GRACE's `Adept Metamagics` headings are metamagics; a `New Metamagic: X` heading names one.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Street Wyrd-Core Magic Rulebook-CAT28003.pdf>" --out "%TEMP%\sw-check"

## Importer v5

- A level-3 section over a family of traditions (`Traditions of Karma`, `Abrahamic Traditions`) prints each tradition
  as a bold run-in in its prose (`The **Aztec tradition** is …`, `**Path of**` + `**the Wheel**`): one tradition a
  run-in, its text the lines up to the next, `tradition(s)` left off as a search name. A section printing none stays
  one tradition itself.
- A preparation whose Cost prints two versions (`450¥/charge (Hose); 550¥/charge (Tsunami)`, the second's
  parenthesis wrapping onto the text) is two entries: the second named by its version, or a heading naming both
  (`No Job Too Small, No Job Too Big`, versions `NJTS`, `NJTB`) split in two.
- `New Metamagic: X` at level 3 is left to the sections reader (its PREFIX); deeper ones are still renamed here.

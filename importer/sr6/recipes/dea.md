# SR6 Deus Ex Arcana (DEA): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `dea.py`): 186 pages (CAT28012), printed page = PDF page − 1
(`PAGE_OFFSET`); the back cover (`END_PAGE`, PDF pages 185-186) is left out. The font guess (`layout.fonts`) is right
(chapter titles 60 pt, then 21, 15, 13, 11), pinned in `HEADING_LEVELS`. The book is Street Wyrd's sequel: the recipe
reads with SW's preparing (`sw.prepare`) and its kind map (`sw.kind`) behind its own.

Nine chapters, all rule chapters: lore (DO YOU BELIEVE IN MAGIC?, INHERITORS OF POWER, NATIONAL POWERS, LOCATIONS OF
POWER) and the game chapters (ARCANA UNLEASHED, WALKING THE MAGICAL PATH, MAGICAL EDGE, THINGS OF A MYSTICAL NATURE,
THINGS THAT GO BUMP IN THE NIGHT, MYSTICAL SHOPPING LIST).

## What the book prints differently from SW (prepare_md)

The book prints its small-face lines as body text, so `prepare_md` sets them as the headings and tables the regroup
reads:
- A tag line right under a heading (`(Manipulation)`, `(Anchored, Spell)`, `(5 Karma)`) or a `Cost:`/`Bonus:` line is a
  level-5 heading (SW's are set in a small face and read so).
- A spell's band is a bold `Range Type Duration DV [Damage]` line over `LOS (A) P S 3` lines, not a table: set as the
  table. A duration printed as the digit 5 is the sustained S (Malos Aires). A band with two rows (Mind Jammer: Touch,
  LOS (A)) is two spells, `Mind Jammer, Touch` and `Mind Jammer, LOS` (Commlink6's), the heading and tag again for each,
  the text under the last. The Communication Spells are level-3 headings: made level 4 like the other spells.
- A critter power's band (`Type Action Range Duration` + `P Major LOS Sustained`) is a table.
- A being's box title is a plain lower-case line over its `B A R S W L I C M ESS` table (a heading elsewhere): set as a
  level-5 heading, and a level-3 creature heading with such a table under it is made level 4 so its box pairs with it.
- `New Quality: Brumeur` is a line, its cost `12 (6 for Awakened characters)`: two level-4 headings, `Brumeur (mundane)` at
  12 and `Brumeur (awakened)` at 6 (Commlink6's two records; `_split_entries`). `COST ¥` is `COST`; the Ukkru and fool's mithril cost tables list
  sizes only: their rows are named `Ukkru Small (...)`.
- Headings set in capitals or lower case that are entries (`THE RED BEAR`, `toxic red bear`, `lemur as a mentor spirit`,
  `HARDENED WILL`) are retitled; a lone `Advantages` line is a heading (Lemur's mentor box).
- The two quality paths are headed `Quality Path: ...` (the sections reader's prefix). The mentor-spirit path's name
  is hyphenated (`Mentor-Spirit`) so its steps are not read as mentor spirits (its heading names them).
- `Sensory Ranges of Detection Spells` (a rules box) is retitled without `Spells`: the reader takes a heading ending in
  `spells` for a section of spells and gave the spells after it Detection.

## Item shapes

- Spells (ARCANA UNLEASHED New Spells, Communication Spells): level-4 heading, a `(Category)` tag, the band. The category is
  the tag's (`Manipulation`, `Direct Combat`). Ward Evil prints `(Voodoo)` and no category: not read; `overrides/dea.json` adds it under Manipulation (owner
  2026-11-13).
- Rituals: level-4 heading, a tag `(Anchored, Spell)`, `Threshold:` and `Ritual Time:` lines.
- Qualities: metagenic (cost line, a heading each), the minor-talent sparks, gifts and curses (level-3 headings with
  `Cost:`/`Bonus:`), the quality-path steps (a `(5 Karma)` tag, given as their Cost) and Brumeur (a place's section).
- Adept powers (Toxic Adept Powers) and metamagics (New Metamagics, Toxic Metamagics): level-4 headings.
- Mentor spirits: the sections reader's (headings under `Mentor Spirits`, `Advantages`/`Disadvantages`).
- Traditions: Avengers and Poisoners (Toxic Magic Traditions), and the four `Re-Awoken` ones (owner 2026-11-13, as
  Commlink6 has them): under `Advanced Tradition Game Information` (p. 99) `_split_entries` retitles the `Hermetic` and
  `Shamanic` headings and makes the `Unified Magic Theory` one a heading for each tradition attribute its text offers
  (`either Charisma or Logic as their tradition attribute`): `Re-Awoken UMT (Charisma)` and `(Logic)`.
- Minor Awakened (a magic type): the level-3 section `MINOR AWAKENED TALENTS` (p. 115), retitled `Minor Awakened`.
  Patterncraft (a skill): `New skill: Patterncraft` (p. 111), read by its `Linked Attribute` line.
- Critter powers (New Spirit and Critter Powers), critters (fauna, Gomorrah Apple Tree, Homunculus, Shedim, the toxic
  critter template) and toxic spirits (tag `(Toxic Spirit of Earth)`): a being's box paired with its heading.
- The magical materials (Awakened metals, Ukkru, Fool's mithril: gear) and the Mana Redistribution Grenade (weapons).
- Rule sections: the lore chapters, Edge-enhanced spellcasting, the astral quest, reforging and the rest.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Deus Ex Arcana-Core Advanced Magical Rulebook-CAT28012.pdf>" --out "$env:TEMP\dea-check"

Commlink6 1.15 holds the book as `deus_ex_arcana` (`tools/cl6check/canon.py` `BOOK_SOURCE`, source `dea`).

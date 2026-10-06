# SR6 general recipe: layout survey

Structure only, no book text. One reading (`general.py`) for the books with no recipe of their own: the campaign and
adventure books, plot sourcebooks, runner resource books and setting books, the Missions and Shadows in Focus
adventures, the Beginner Box's Battle Royale adventure, the character conversion guide and two fan scenarios
(Holostreets, `canon="false"`). Each book is a recipe in `RECIPES`: a source id (a short form of its title, a letter
first: `THN` for 30 Nights), its name, the pattern its PDF title matches (0.9) and two or three phrases its first page
prints (its contents or title lines: 0.8 + 0.05 a phrase, so the QSR edition of Echoes of a Lost Signal and the
conversion guide, which names the core rulebook, win). Not read: the GM screen, card decks, errata, the fillable sheet,
maps, the Beginner Box dossiers, instant guide and quick-start rules (no stat blocks in the book shape), Adversary
(fiction) and Wild Pitch (a Shadowrun 5th Edition scenario).

Every page's text drawn twice in some (Final Bets, Scotophobia, …): the converter keeps the first layer. Printed page
= PDF page − 1 (a cover first). Every chapter's sections are rules.

## Item shapes

- Stat blocks: the core rulebook's bands (`B A R S W L I C … ESS`, `DR I/ID AC CM MOVE`) and labels (`Skills:`,
  `Gear:`, `Weapons:` …), in any of these forms: a box under a heading; the bands in the text under a description (the
  cast chapters, level-2 to level-5 headings: the block becomes the being); a name set in body type right over the band
  or over a tag line (`(Professional Rating 4)`, `(Force 5)`, `(Male Human)`), sometimes with a lower-case box title
  between the tag line and the band (prepare() makes the name a heading, the tag its tags, drops the box title). A
  `Professional Rating N` (tag, name or first line) gives the NPC's rating, its group the section; a block with a
  `Connection Rating:` label is a contact (contacts and an NPC, group Contact); one with `Powers:` and no gear,
  augmentations, adept powers, complex forms or spells is a critter; the others are NPCs (group the book's name). A
  band's second `R` is Resonance. Two beings printed side by side in one band (`| B … ESS | B … ESS | M |`) under their
  names stacked right over it (a heading each, or name, tag line and box title): prepare_md() gives each its own band
  (a column after the last group is the second's), the defense band and labels after it shared; where the names don't
  stack over the band (a contact's description between them) only the first is read. A box printing several beings
  one after another, each under a lower-case title right over its band (after a labelled line or a weapon's
  bracketed stats): one being each. One stat block for several names (`Saint Joseph Houngan/Mambo`,
  `Government Agent/Corp Troubleshooter`): one being per name with the same stats, unless a name it gives is
  another block's too (`Grey Cell Watcher/Investigator` and `…Watcher/Decker` stay as printed).
- Tables with a price: by their header, vehicles (`HAND`/`ACCEL`, the short `ACC PIL HAN SEN` too), weapons (`DV`,
  `MODE`, `ATTACK RATINGS`), armor (`DR`), augmentations (`ESSENCE`), electronics (`ATTRIBUTES (D/F)`, `DEVICE
  RATING`), else gear (a number in `COST` or an `AVAIL` column: a list of restaurants priced `¥¥` stays a table); an
  item's box with a price (`TYPE DV … AVAIL COST`) is its row. Category: the table's title, else its section.
- Spells: a box with `RANGE` and `DURATION` under a section naming a spell category.
- Qualities: a heading (level 3 to 5) with `Cost:`/`Bonus:` in Karma (Emerald City's Local Character entries, Power
  Plays', Shadow Cast's archetype qualities).
- Life modules: the Sixth World Companion's adult form printed in body type after a `Life Modules` heading or line
  (Dealers of Death, Shadows in Focus: New Orleans): a title run (`Event:` `Brush With Death`), prose, the grants as
  labelled lines, read with the Companion's reader (`swc._lifemodule`); the run goes on through a page's running head.
  Emerald City prints none (its lifepath-flavoured entries are qualities).

## Formula styles and issues (importer v2)

- The few priced tables: `Rating x N¥`, Essence `Rating x .N` -> `R*N`; `N¥/NV` -> `Q*N`, unit NV.
- Issues: items a book lists with no avail or price (`missing`), words in an avail cell (`unreadable`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Table shapes and value styles (importer v2)

- **Vehicle bands in the text** (30 Nights, Assassins Night, The Third Parallel print a bold header line over a
  value line, headers interleaved or run together): `shapes.vehicle_band` reads them; the general recipe does not
  file them as vehicles yet (NPC rides, not catalog items).

## Sections read as kinds (importer v3, sections.py)

- **Qualities** (Shadow Cast): each quality path step with a `Karma Cost` line.
- **Quality paths** (Shadow Cast): `### Quality Path: Name` under `## Quality paths`, its steps the headings under
  it; a chapter printing those names only its `Quality Path:` headings as paths (`Roleplaying`, `Strategies`
  after them are its sections).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-30 Nights-Campaign Book-CAT28400.pdf>" --out "%TEMP%\general-check"

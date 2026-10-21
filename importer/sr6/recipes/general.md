# SR6 general recipe: layout survey

Structure only, no book text. One reading (`general.py`) for the books with no recipe of their own: the campaign and
adventure books, plot sourcebooks, runner resource books and setting books, the Missions and Shadows in Focus
adventures, the Beginner Box's Battle Royale adventure, the character conversion guide and two fan scenarios
(Holostreets, `canon="false"`). Each book is a recipe in `RECIPES`: a source id (a short form of its title, a letter
first: `THN` for 30 Nights), its name, the pattern its PDF title matches (0.9) and two or three phrases its first page
prints (its contents or title lines: 0.8 + 0.05 a phrase, so the QSR edition of Echoes of a Lost Signal and the
conversion guide, which names the core rulebook, win). Not read: the GM screen, card decks, errata, the fillable sheet,
maps, the Beginner Box dossiers, instant guide and quick-start rules (no stat blocks in the book shape) and Wild
Pitch (a Shadowrun 5th Edition scenario). Adversary is fiction but prints a mentor spirit and a car: read (owner,
2026-10-21).

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
- Qualities: a heading (level 3 to 5) with `Cost:`/`Bonus:` in Karma (Emerald City prints `5 Points`: Karma points, importer v4) (Emerald City's Local Character entries, Power
  Plays', Shadow Cast's archetype qualities).
- Life modules: the Sixth World Companion's adult form printed in body type after a `Life Modules` heading or line
  (Dealers of Death, Shadows in Focus: New Orleans): a title run (`Event:` `Brush With Death`), prose, the grants as
  labelled lines, read with the Companion's reader (`lifemodules.lifemodule`); the run goes on through a page's running head.
  Emerald City prints none (its lifepath-flavoured entries are qualities).

## Formula styles and issues (importer v2)

- The few priced tables: `Rating x N¥`, Essence `Rating x .N` -> `R*N`; `N¥/NV` -> `Q*N`, unit NV.
- Issues: items a book lists with no avail or price (`missing`), words in an avail cell (`unreadable`).
  (`<formula>` and `<issue>`: docs/sr6-data-format/formulas-and-issues.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Table shapes and value styles (importer v2)

- **Vehicle bands in the text** (30 Nights, Assassins Night, The Third Parallel print a bold header line over a
  value line, headers interleaved or run together): `shapes.vehicle_band` reads them; the general recipe does not
  file them as vehicles yet (NPC rides, not catalog items).
- **A price list in a description** (regroup `price_list`, every recipe): a titled table in an item's text with AVAIL
  and COST columns, its rows names and half of them priced, is a catalog (the core rulebook's credsticks); not a
  grade table (`x1.2`), a second stacked table, one titled with its item's name, or one a later chapter reprints.
- **Row groups and sub-tables** (converter sr6-5, regroup): a name-only row over indented rows (or a bold one over
  rows of one price shape) is their `group`; a table stacked under another's title whose first header names a class
  is a sub-table of its own, that header its category, the parent title kept.
- **The page's bottom band** (converter sr6-4): only the running feet's faces are dropped there; a table's last rows
  and body lines reaching into the band stay (NPC gear lines, reference rows).

## Sections read as kinds (importer v3, sections.py)

- **Qualities** (Shadow Cast): each quality path step with a `Karma Cost` or `Karma Bonus` line (`6 points`), or
  named as a step (`Step Two: X`) with a Cost line in nuyen (positive); a bare `Step 1` or a step granting a quality
  printed elsewhere (`gain the X quality`) is none (importer v4).
- **Quality paths** (Shadow Cast): `### Quality Path: Name` under `## Quality paths`, its steps the headings under
  it; a chapter printing those names only its `Quality Path:` headings as paths (`Roleplaying`, `Strategies`
  after them are its sections).

## Game Information chapters (the adventure and plot books)

The rules items an adventure or plot book prints sit in a `Game Information` chapter (Dealers of Death, Shadows in
Focus: New Orleans, Slip Streams …): a **kind heading** (`POSITIVE QUALITIES`, `NEGATIVE QUALITIES`, `QUALITY PATHS`,
`Life Modules`, `ADEPT POWERS`, `SPELLS`, `Powers`, `Characteristics`, `Swamp Gear`, `Vehicles & Drones`) introduces
items, each a **child heading** with its stat line or labels (`Cost:`, `Bonus:`, `Game Effect:`, `Activation:`, a
toxin's `Vector:`/`Speed:`/`Power:`, a box table) and its description. The category is the kind heading (a table's
title first), the chapter giving the context. Read with the general reading, nothing per book:

- **Magazine-style books** (the 16 to 32 page PDFs: Dealers of Death, New Orleans, Age of Rust, Los Alamos, the
  Missions): the converter drops the running head and page number printed on every page (`layout.fonts`: a line in
  the top band repeated in place, font and words on half the pages or more), so the book's own heading sizes get the
  levels (a size on the cover alone gets none); before, the running title, the series line and the page number took
  three of the five levels and the item names (15 and 13 pt) came out as body text.
- **Two columns over a full-width box** (Dealers of Death p. 10, a `Developing immunity` sidebar under the qualities):
  the gutter is accepted when every row it splits is two columns meeting in the content stream, the box's lines
  aside; a line set at the box's margin (its title) is the box's. Before, the two columns were read line by line,
  interleaved, and a name set in two lines (`Developed` / `Immunity`) came out split.
- **Two stat tables side by side in the two text columns, a few points apart** (Tarnished Star's Honda Raptor beside
  the VAA Estrada-77): two header rows with no x in common are two tables, never one header stacked over two lines
  (only a label of a cell or two stacks beside another line). Before, the two merged and the Raptor's stats were lost.
- **A title at the foot of one column over a full-width table** (Deadly Arts p. 143's `Unguided Launcher`, below
  both columns): the table's title, read with it after both columns (before, the other column's text came between
  them and the launcher was a rule section). A heading below every line of the other column, under 2 line heights
  over a full-width table, with nothing of its column between.
- **A quality path's bare steps** (Shadow Cast's `Gestalt` and `Operations Ace`: `Step 1`, `Step 2`): qualities named
  as printed, the path their category and group (`Gestalt: Step 2`), Karma from `By investing 10 Karma` or the path's
  `spend 10 Karma, and they move to step 1` (sections.py, every book).
- **A kicker over a name** (`Part of the Family:` set small over `Deserted`): `prepare_md` makes them one heading, the
  name's level (`Part of the Family: Deserted`, the name as printed); a quality
  path step set at the path heading's own level and naming the path is its step, under its printed name.
- **Kinds by heading**: qualities (Cost or Bonus in Karma), adept powers (`ADEPT POWERS`, each child with its Cost or
  Activation label), toxins (a heading over `Vector`, `Speed` and `Power` lines: gear, category the heading over it),
  spells (their box), gear, weapons and vehicles (their tables), life modules (the Companion's form).
- **An item's one stat line** (Dealers of Death's bracelets): a heading whose text holds a one-row priced table with no
  name column (`TYPE | MODE | DV | … | AVAIL | COST`, the type its first cell) is that item, named by the heading
  (`catalog.stat_lines`, now every book's: crb.md, Item shapes; a TYPE table of several rows gives `Stakes (Wooden)`,
  `Stakes (Silver)`, New Orleans p. 27).
- **A single new adept power** (`New Adept Power` over `Improved Mental Attribute`, Collapsing Now p. 62): the kind
  heading's singular counts too.
- **A box title a letter or a joining word off its heading** (`ceramic or plasteel knife` under `Ceramic/Plasteel
  Knife`, `tiffani elegence …` under `Tiffani Elegance …`: difflib ratio of the keys 0.88 or more): the heading's
  name, the printed one.
- **A spell box with its category under TYPE** (`TYPE Illusion | RANGE | DV P | DURATION | DRAIN 4`): TYPE the type
  (P), DV the drain, the category the catalog's (`Illusion spells`).
- **A weapon's stat line set as text** (The Kechibi Code's Guizhen devices, Falling Point's pistols): a bold header
  `**DV MODES A RT AT TA INCK G AMMO AVAIL COST**` (the attack ratings' header set sideways) over loose values, the
  ammunition's holder wrapped around them (`12 (power` … `cell)`): `prepare_md` makes it the box table under its box
  title (a title in lower case gets capitals: it names the item). The values are read by their shapes (DV, modes,
  attack ratings, availability before the price); what is left is the ammunition, as printed.
- **An adept power's cost in Power Points** (`Cost: 0.25 PP per level`): cost 0.25, a level each.
- **Lists a section grants** (Slip Streams' `Powers` and `Characteristics` under `Returned Soldiers`, the list's
  text naming the section): Karma-0 qualities, `granted`, category `Returned Soldier power` / `Returned Soldier
  characteristic` (a characteristic is a drawback: negative); a heading priced in Karma (`Returned Soldier (12
  Karma)`) is a quality whose text's `Select two powers … and one characteristic …` are its choices; the prose's
  effects and tests (`effects.py`). See docs/sr6-data-format/kinds.md, Qualities granted and chosen.

## Shapes of the books registered in 0.18.0 (Seoul Survivor, the Missions Guide, Adversary)

- **A stat line in square brackets** under an item's heading (`[Capacity 2, Availability 3, Cost: 250¥]`; a weapon's
  `[Hold-Out, DV 2P, SS/BF, AR 12/7/—/—/—, 6(b), Avail: 2(F), Cost: 300¥]`, wrapped over two lines): prepare_md()
  makes it the stat box table (labelled parts under their labels, the modes and ammunition by their shapes, an
  unlabelled first part the type), read as an item's one stat line. A stat block's weapon (`Bite [Close Combat, DV
  3P, …]`) has a name before it and no price: none. A lower-case box title that starts its heading's name (`type 81`
  under `Type 81 “Gwisin”`) names the heading's item.
- **A price line with the cost first, by rating** (`Cost: 500 x Rating, Availability 5, Rating 1-6` opening the text,
  prose_items.py, every book): the heading's item, a class it names after it its category (`Bujeok (Magical Gear)`:
  Bujeok, Magical Gear).
- **A price list set as text lines** (`Grenade Availability Cost`, then `Grenade of gold 5 700 ¥`, two rows or more,
  prose_items.py): gear, the header's first word its category, named as printed.
- **A header gluing two columns** (`SEATAVAIL`, its values glued in the cell before: `3 —`): both split back.
- **A development table set as text lines** (`**Variant Bod Agi Rea Str**`, `Major Dokkaebi 1–7 …`, the rest of the
  attributes under `Wil Log Int Cha Edg M`, `Racial Qualities:`): metatypes, read with the Sixth World Companion's
  reader (`catalog.metavariants`); a heading whose `Requirement:` names one of them is its racial ability, a critter
  power (action and duration from the line).
- **A mentor spirit printed on its own** (`Advantages` with the `All:`/`Magician:`/`Adept:` lines right under a
  heading that is no entry, Adversary p. 5): that heading is a mentor spirit, its Disadvantages part of its text
  (sections.py).
- **A priced version in an item's text** (prose_items.variants, every book): `For an additional 500 nuyen, a Type 81
  can be printed with a custom-fit suppressor, which …` -> `<item> with suppressor`, the item's stats and table, its
  cost plus that (the effects reader leaves that sentence to the version: the suppressor's Perception threshold is
  its, not the base pistol's); `… can be upgraded to a “sporting breed” version, with a … body 3 frame for a total base
  cost of 5000¥` -> `<item> (Sporting breed)`, that cost and the stats the sentence names.
- **An ammunition type under its own heading** (`Polymer Composite` over `(ammo type)` and `AR –2, Cost Multiplier:
  x2`): an ammotype, its cost the multiplier, the AR change its effect.
- Seoul Survivor prints Samsung's drone as `Jind-0` (a zero for the letter O): renamed Samsung Jind-O by the owner's
  ruling (overrides/ssv.json, its sporting version too), the printed name an alias.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-30 Nights-Campaign Book-CAT28400.pdf>" --out "%TEMP%\general-check"

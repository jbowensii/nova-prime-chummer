# SR6 Firing Squad (FS): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `fs.py`): 162 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). The weapon and armor stats at the back reprint the chapters' tables (`END_PAGE`, left out).

## Item shapes

- Weapons (WEAPONS RACK): a level-4 heading, its text and a stat box titled with the item's name in lower case
  (`TYPE DV MODE ATTACK RATINGS AMMO AVAIL COST`); the section (Blades, Rifles…) is the category. Some boxes are
  titled shorter than the heading, or carry a footnote row, so regroup leaves them unpaired: the recipe gives such a box
  the description right before it when all its title's words are in that heading. Headers set too close print as one
  (`AMMOAVAIL`, `ATTACK` + `RATINGSAMMOAVAIL`, `DV CLOSEDV` + `NEAR`): split, the value at its last space.
- Ammo: the Ammo section's boxes with no TYPE or MODE (gear, category ammo). The rEVOlution Arms pages' heading starts
  in lower case, so it reads as a caption and their weapons sit in the Ammo section: those with a TYPE or MODE are
  weapons (category revolution-arms).
- Armor (SUIT UP): level-3 headings, each with its box (`DR SOCIAL CAPACITY AVAIL COST`; DR is the defense, SOCIAL
  its social attribute). A box with distinct TYPE rows (Light, Medium, Heavy) is one entry a row. A box below its text can
  stay in the text: taken back when it has no name column and a few rows. Style armor's level-2 section is its
  category. Vashon Island's table lands in the next section's text (`Cumulative`): it goes back to the section whose text
  names its first row, one entry a suit, its `Extras:` rows (and the label after its last row) an EXTRAS cell.
- Armor modifications: described under their own level-3 headings, priced in one box of one-row tables (`GEAR
  CAPACITY AVAILABILITY COST`): one entry per row, with the text of the heading of the same name.
- Weapon modifications, melee weapon modifications and weapon accessories: weapons, their level-2 section the category
  (as the core rulebook files its accessories).
- Tac-apps (HONING YOUR EDGE): an `APP AVAIL COST` table, gear.

## Recipe hints of the book-fs round (structure only)

- A heading naming several items (`… Rhino, Behemoth, Juggernaut`, `… Mod 1 and Mod 2`): each lower-case box under it
  is the item its title names, spelt as the heading spells it, the heading's text theirs (`_boxes`).
- A WEAPONS RACK item whose few TYPE rows sit in its text (`Paint Grenades`: Standard, Large) takes them as its box.
- A SUIT UP section pointing to its stats elsewhere (`(stats on p. 55)`, Vashon Island's later suits): the rows of the
  armor list on that page whose first word its text prints as a name, and no entry has, are its suits (`_pointed`).
- A box of its item's own band over priced WEAPON rows (the Underbarrel Weapon Attachment Mount): each row an item
  grouped under the mount (`_hosted`).
- The chapter's list of armor modifications reprints the MEMS section's own list: a reprinted row is no second entry.
- Sentence-priced add-ons and supplies (crb `add_ons`, general): the Pulse's and the laser rifles' batteries, the
  Colt Agent Special's laser sight, the M-24's arm-brace (its Near/Medium +1 an `item:ar` effect), the tactical
  hammer's knife/spike head (an accessory of both hammers).
- The p. 152 summary (PDF 153 on, `END_PAGE`) reprints the chapters' tables: left out, the chapters' rows are the
  entries (the Heritage Line is p. 16's).
- Qualities (VIOLENT ENDS): level-3 headings with `Bonus: N Karma` (Phobia prints one a rarity, wrapped: karma the
  lowest, karmaMax the highest); a `(Behavior, 1 to 6)` tag line reads as a heading
  of its own and is joined back. The quality paths' steps have no karma: rules.
- NPCs (FIGHTING FORCES): a `(Professional Rating N)` tag and a stat band; the level-3 section is the group.
- Martial arts (HONING YOUR EDGE): styles are level-4 headings with `Similar Styles:`, `Category:` and `Signature
  Technique:` lines, techniques level-4 headings with a `**Category:**` after their last sentence (at times broken
  over two lines): martialarts and martialtechniques (importer/sr6/recipes/shapes.py `martial`).
- Edge actions and boosts, maneuvers, statuses: no catalog kind, rule sections.

## Errata

The Firing Squad errata PDF in the owner's folder mixes value fixes with renames, an added modification and rewritten
rules (Suppressive Fire), so it is not applied: the import keeps the book's printed values.

## Formula styles and issues (importer v2)

- `Rating x N¥`, `(Rating x N¥)`, capacity `[Rating x N]` -> `R*N`; `N¥ + (Rating x N¥)` -> `N + (R*N)`; `x2`
  (a multiple of the weapon's price): an `ambiguous` issue stating `base*2`. Ammo `12 x2(c)` (two clips) stays as printed.
- Issues: rated accessories with no rating range (`missing rating`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- A DV given by the rating (`(1–10) S`) -> `<formula field="dv">R</formula>`.

## Sections read as kinds (importer v3, sections.py)

- **Qualities:** each quality path step (`#### Step 2: No Code or Penitent or Re-Bound`: three), its kind from its
  Cost or Bonus line or its text naming it a positive or negative quality. A step printing neither (most of
  VIOLENT ENDS' paths) is still a quality, negative with a `kind` issue (importer v4); one that only grants a quality
  printed elsewhere (`gain the X quality`) is not.
- **Ammunition types:** the `TYPE | DV | ATTACK RATINGS | AVAIL | COST MULTIPLIER` table (handloaded, match-grade).
- **Actions:** `## New Edge Actions` (HONING YOUR EDGE): each `### Name` an Edge action, its cost in `Cost: N Edge`;
  `## New Edge Boosts` (`### N-Edge Boost`). Not actions: `New Edge Actions by Cost` (its `N Edge` lists).
- **Quality paths:** `## Quality Paths` (VIOLENT ENDS): each `### Name`, its steps the `#### Starting point`,
  `#### Step N: …` headings under it.

## Kept table maps (the general table reader, tables.py)

`kind()` stays: measured, the general reader agrees on 40 of 87 tables. Firing Squad files its weapon modifications and accessories (no DV) as weapons, and Toughweave as armor.

## Commlink6 check (importer v4)

- Stat matching (cl6check): Commlink6 names the armor rows of two makers by an abbreviated maker plus the variant, a maker-product row by the product, and one weapon by another spelling; their stats find them (9 renames).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Firing Squad-Core Combat Rulebook-CAT28002.pdf>" --out "%TEMP%\fs-check"

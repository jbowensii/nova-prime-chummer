# SR6 Tarnished Star (TS): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `ts.py`): 178 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). From PDF page 175 on: ads (`END_PAGE`, left out). The PDF carries every page's text twice; the
converter keeps the first copy, but its headings keep stray spaces (`Mancatc her`, `Vehicles and Dro nes`): the recipe
compares them without spaces, and rule section names keep them.

## Item shapes

- Weapons (RIGHT TOOLS FOR THE JOB): a level-3 heading with the description (or a level-4 one under it), then a
  level-5 box titled with the item's name: a table (`TYPE DV MODE ATTACK RATING AMMO AVAIL COST`; its unpriced rows
  are footnotes, to the text) or a bold header line over a value line (read from the right: the type may be several
  words). A box whose table has several priced rows (the Foamtek explosives) is one entry a row, named by the box's
  first word and the row's TYPE. A TYPE cell holding the DV (`Special 2S`) is split. The category is the TYPE.
- A box takes the description of the heading above it that has a word of its title (compared without spaces); that
  heading is then no rule section.
- Ammunition (a box named `… Ammunition`): gear, category ammo; its DV and attack ratings go to the text.
- Catalog tables (first header ITEM, DEVICE, NAME, WEAPON: `NAME_HEADERS`): shields, armor and helmets (ITEM with
  DEFENSE RATING; SOCIAL to the text), the trauma response system (ITEM without one: gear, armor-modifications), the
  shields' bash (WEAPON), badgecams, inhibitor bands and scanners (DEVICE), drugs and the injector rig (NAME; POWER to
  the text, cost per dose). A `Notes:` row is the row above's text; a name with ` Notes: ` in it is split.
- Vehicles and drones (VEHICLES AND DRONES): a level-5 box, a class line (`(Bike)`: the category), then two one-row
  tables (`HAND ACCEL SPD INT TOP SPD BOD ARM`, `PILOT SENSE SEAT AVAIL COST`). Anything else is reported
  (missing-value): the Honda Raptor's box prints no values, they run into the VAA Estrada's (two HAND tables and a
  stray value line), so neither is guessed.
- ROLL CALL: the archetypes (a level-2 heading and its box: NPCs, group Archetype, no Professional Rating), the
  contacts (a level-3 heading with `Uses:` … labels and a box: a contact and its NPC) and the NPCs (`Professional
  Rating N: <group>` sections). A box's band printed as a bold header over a value line (`**B A R S W L I C ESS**`)
  is read as its band; `Active Skills` is its skills list.
- Rules: WORKING THE CASE, the gear chapter's rule sections, and IT'S WHO YOU KNOW's Game Information and blackmail
  sections; the rest of the book is setting, left out. The book prints no qualities.

## Table shapes and value styles (importer v2)

- **Stacked bands.** A vehicle box's two tables (`HAND … ARM` over `PILOT SENSE SEAT AVAIL COST`) come joined from
  regroup (`_stacked`); `_vehicle` reads either shape.

## Formula styles and issues (importer v2)

- Vehicle seats `2+2`, `1/3` -> `2 + 2`. `N¥ per dose`, `Rating x N¥ per dose` -> `Q*N`, `Q*(R*N)`.
- Issues: an injector rig's row with no price printed (`missing`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Tarnished Star-Runner Resource Book-CAT28516.pdf>" --out "%TEMP%\ts-check"

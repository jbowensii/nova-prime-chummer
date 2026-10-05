# SR6 Explosive Decompression (ED): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `ed.py`, the latest copy): 186 pages, 612 × 765 pt,
printed page = PDF page − 1 (`PAGE_OFFSET`).

## What the recipe gives the converter and regroup

- Heading sizes (`HEADING_LEVELS`): 60, 21, 15, 13 and 9 as the core rulebook's, and the missions' 44 pt titles as
  level 2 (the guess takes them and the 17 pt mission numbers for levels of their own, shifting the rest).
- `prepare()`: in OPENING BAY DOORS and PREPARE FOR LAUNCH the book sets a stat table's title apart from the table
  (a column or a page section away: `evo star wing (thruster pack)`, `Evomars voidsearcher`), so the table lands in
  another item's text. An untitled stat table (`HAND`, `HANDL`, `ACCEL` or `ITEM` first, text right above) takes the
  nearest title above it (80 lines) that no table follows and that names no titled table (an art caption such as
  `EVO II` beside `evo armadillo II`). A vehicle table's lower-case title is capitalised, so regroup reads it as an
  item heading over its box (with no labels after it, a lower-case title reads as a caption).

## Item shapes

- Spacesuits (`ITEM DEFENSE RATING CAPACITY AVAIL COST`): armor, category spacesuits; a one-row table whose row says
  only `Space Suit` is named by its title (`aresspace guardian`) and takes that suit's description.
- Gear (`ITEM AVAIL COST`, the E-PECS `ITEM DEVICE RATING …`): gear, category its level-2 section.
- The rEvolution Arms lasers (`WEAPON TYPE DV MODE …`): weapons, category energy-weapons. The ArmTech grenade
  launcher's band (no name column) lands in the next section's text: not read.
- Thruster packs, spaceships, starships, drones (`HAND`/`HANDL ACCEL SPD INT TOP SPD …`): vehicles, category thruster
  packs or the level-2 section; each takes the description whose heading holds all its title's words (its name too
  when the heading's words are all in the title: `Evomars rifter` -> `EvoMars Rifter`). The generic escape pod's
  table prints one header fewer than its values (book-value).
- Mission rosters: a level-3 section with a `(Professional Rating N)` tag line and the text, a lower-case box with
  the bands and labels: NPCs (group Mission Rosters); the named characters print no rating (`UNRATED_NPCS`, the same
  group). The custom vehicles and drones listed with them stay in the rules.
- No qualities: the book prints none. Everything else (space travel, the void, comms, the 20 mission logs) is rules.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Explosive Decompression.pdf>" --out "%TEMP%\ed-check"

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
  goes to the text). A box with distinct TYPE rows (Light, Medium, Heavy) is one entry a row. A box below its text can
  stay in the text: taken back when it has no name column and a few rows. Style armor's level-2 section is its
  category. Vashon Island's table lands in the next section's text and is not read.
- Armor modifications: described under their own level-3 headings, priced in one box of one-row tables (`GEAR
  CAPACITY AVAILABILITY COST`): one entry per row, with the text of the heading of the same name.
- Weapon modifications, melee weapon modifications and weapon accessories: weapons, their level-2 section the category
  (as the core rulebook files its accessories).
- Tac-apps (HONING YOUR EDGE): an `APP AVAIL COST` table, gear.
- Qualities (VIOLENT ENDS): level-3 headings with `Bonus: N Karma`; a `(Behavior, 1 to 6)` tag line reads as a heading
  of its own and is joined back. The quality paths' steps have no karma: rules.
- NPCs (FIGHTING FORCES): a `(Professional Rating N)` tag and a stat band; the level-3 section is the group.
- Martial arts (HONING YOUR EDGE): styles are level-4 headings with `Similar Styles:`, `Category:` and `Signature
  Technique:` lines, techniques level-4 headings with a `**Category:**` after their last sentence (at times broken
  over two lines): martialarts and martialtechniques (importer/sr6/recipes/shapes.py `martial`).
- Edge actions and boosts, maneuvers, statuses: no catalog kind, rule sections.

## Errata

The Firing Squad errata PDF in the owner's folder mixes value fixes with renames, an added modification and rewritten
rules (Suppressive Fire), so it is not applied: the import keeps the book's printed values.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Firing Squad-Core Combat Rulebook-CAT28002.pdf>" --out "%TEMP%\fs-check"

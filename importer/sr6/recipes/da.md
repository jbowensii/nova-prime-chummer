# SR6 Deadly Arts (DA): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `da.py`): 186 pages, printed page = PDF page − 1
(`PAGE_OFFSET`); the back cover (`END_PAGE`) is left out.

## Fonts

The core rulebook's families. The chapter titles are set at 48 to 60 pt (the guess takes only 56 for a level) and the
fiction's at 27, so the recipe gives the sizes (`HEADING_LEVELS`); a title's second line at 40 pt joins it.

## Item shapes

- Weapons: a level-5 box (`Machine Guns`) listing several weapons, each its own little table (`NAME TYPE DV MODES
  ATTACK RATINGS AMMO AVAIL COST`, a `Note:` under it), their descriptions under level-4 headings before the box. A name
  set on two rows (`Ruhrmetall` over `SF-10 …`) is joined (`shapes.rows`), a row in parentheses (`(when link fired)`)
  is a variant of the one above. Headers printed together (`AMMOAVAIL`, `SPD INT TOP SPD`) are split. The box title is
  the category.
- Vehicles and drones: a box of two bands (`HAND … PILOT`, `SENSOR SEAT AVAIL COST`) right under the vehicle's level-3
  heading, titled with its short name: one entry named by the heading; its level-2 section is the category.
- Single items with a box (Krime Gloves, implants, mods): the box under its heading; a `New Cyberware:` line before it
  names the category. An implant (an `ESSENCE` column) is an augmentation (as the core rulebook files implant weapons).
- Rows of one TYPE, SIZE or CLASS column (power supplies, shells, warheads, vaults): `<title> (<type>)`.
- Weapon mods (`MOD MOUNT AVAIL COST`) are weapons (category weapon-mods), armor accessories armor
  (armor-modifications), comm nodes (`NAME DR ATTR PROGRAM`) electronics.
- Martial arts (BLEEDERS & BONE BREAKERS): level-4 headings under `New Martial Arts: …` with `Category:` and
  `Signature Technique:` lines in plain text (styles), under `New Martial Arts Techniques` with `Category:` (techniques;
  what follows a `;` is a restriction).
- Spells: a level-3 section `Name (Category)` with its band (`RANGE TYPE DURATION DV`) in its text. Adept powers
  (`Cost:`, `Activation:`), metamagics, rituals (`Name (Anchored)`, `Threshold:`) and qualities (`Name (Positive)`,
  `Cost:`/`Bonus:`) as in the core rulebook.
- Edge actions, hotmods, design options, medical drugs and the rest: rule sections. The fiction and the lore
  chapters (When peace isn't an option, A New State of Warfare, Force Projection) aren't read.

## Not read

The medical gear price list prints as text lines under a mangled header. A weapon row whose columns ran together is
repaired when its cells fit their columns (below); one that doesn't keeps its shifted values (book-value).

## Table shapes and value styles (importer v2)

- **Stacked bands.** A wide weapon or vehicle row is printed as two one-row tables, the second headed with
  the price columns (`NAME … ATTACK RATINGS` over `AMMO | AVAIL | COST`; `NAME | HAND …` over `ARMOR … AVAIL | COST`).
  regroup joins them into one row (`_stacked`: as many rows, no shared header, the price columns only in the second).
- **Header cell on two lines.** `ATTACK` over a first row holding only `RATINGS`: joined into the header (`_header_rest`).
- **A box's next item after a note.** A box (`Linear Kinetic Cannons`) lists items one table each with a `Note:` and
  plain text between them: a later table with the box's header stays one of its rows.
- **Cells run together.** The vehicle weapon tables (lasers, railguns) have rows where the converter set two
  cells as one (`SS(1)—/14/20/22/18(4km)`: mode and attack ratings; `—/—/10/12/12 (16km) 40(br) + Energy`: attack
  ratings and ammo), the later cells one column left and a stray price at the end. regroup's `_repair_row` splits the
  cell where both halves fit their columns' shapes (MODES, ATTACK RATINGS, AMMO, AVAIL, COST) and drops the stray
  cell, only when every shaped cell then fits. Otherwise the row stays as printed (book-value report).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Deadly Arts-Core Advanced Combat Rulebook-CAT28011.pdf>" --out "%TEMP%\da-check"

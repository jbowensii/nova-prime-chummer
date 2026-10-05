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

The medical gear price list prints as text lines under a mangled header; a few weapon rows whose columns ran together
keep shifted values (reported as book-value); the Ferrus series' second band is a separate box.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Deadly Arts-Core Advanced Combat Rulebook-CAT28011.pdf>" --out "%TEMP%\da-check"

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
- **A header printed twice.** `… | AVAIL | COST | COST` (the mobile lodge): the first cell keeps the header (the
  price), the second is `COST (2)` (reported as an unknown column).
- **Rows under a nicknamed heading** (`MGL-48` under `ArmTech MGL-48 Decimator`, `Ballista II` under `Ballista II
  Missile System`): the row's name stays; the heading only describes it.
- **A note under each of a box's tables** (`Note:`, `Crew Served:` under each weapon of a box): kept with that
  table's row (regroup: the table's `notes`, emitted as NOTE … columns, read into the item's text), not only the
  box's first.
- **Model names under a maker's heading.** A box row `Firebolt` takes the description under `Ares Firebolt`
  (`shapes._match`: one word of five letters or more, the heading's second word).

## Formula styles and issues (importer v2)

- Vehicle weapon mounts `N¥ + [N¥ x Size]`, avail `N(I) + Size` -> `N + (N*R)`, `N + R` (Size is the rating).
  Seats `2/6` -> `2 + 6`. Shots `N¥ per shot` -> `Q*N`, unit shot. Modes `up to FA`: every mode up to full auto
  (the fire-mode ladder SA, BF, FA; no formula, the reading is the app's).
- Energy weapons print `Energy` as their ammo and `Uses N Energy per … shot` in a note: `ref(gear:<supply>,
  energy)/N`, rounded down, the supply the note or description names (`Includes power backpack`, `uses a power
  clip`) or the section's prose (`come with power clips`); the power supply table's ENERGY column is the gear's
  `energy`. A weapon naming no supply gets none. `20(c) + Energy` (railguns) keeps its printed ammo.
- Mounts and launchers priced by Size take the SIZE column's range as their rating.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Sections read as kinds (importer v3, sections.py)

- **Converter recovery (regroup):** the `New Medical Tools/Gear` table keeps only its first row as a table; the rest
  are plain lines `Name avail price¥` (a name-only line, `Medkit`, over one-word sub-rows `<Sub> (Rating 1–6) <avail>
  Rating x <N>¥`). Regroup reads them back as the table's rows (`Medkit <Sub> (Rating 1–6)`); its last header cell
  carries the next table's header run into it (`RANGE TYPE DURATION DV COST`: read as COST).
- **Vehicle design:** the `#### Name` headings under `### Mil-spec Design Options` (`Mil-spec Comms (I, II, III)`: one
  each; `(1-12)`: the rating range). Not yet: the warheads' Capacity notes (prose, p. 146).
- **Actions:** `## New Edge Actions` (REGISTERED AS A LETHAL WEAPON): each `### Name`. The `**New Edge Action:
  Called Shot: …**` bold lines of the advanced weapon rules are not read yet (no section of their own).
- **Bold-header tables (regroup `_bold_table`):** `New Exotic Weapons`, the Armsman polearm and `Mortar bombs` print
  their header as one bold line (`**WEAPON TYPE DV ATTACK RATING AVAIL COST**`) and each row as a plain line, read
  from the right by the columns' shapes (`3 km`: a range with its unit). A name wrapped around its row (`Goblin` over
  the values, `Stomper` under; `Garrote` + `(Razorwire)`) and a price set on a line of its own are joined. A
  lower-case model code (`m60`) is a row of its own, not a variant of the row above. Not yet: the rocket and missile
  table (`Standard 0 (60mm` / `Rocket x .5m) …`: every cell wrapped column by column).

## Product configurations and footnotes (categories.py, shapes.configurations)

- **A maker's product with configurations.** The Cougar Weapons Armsman Collapsible Polearm is a box titled with the maker
  and the product (two lines in print, one heading in book.md) over rows named by configuration (`Knife`, `One-hand`,
  `Spear`, `Pike`, header `WEAPON TYPE DV ATTACK RATING AVAIL COST`). Each row is its own weapon with its own printed
  stats; category Armsman Collapsible Polearm, maker Cougar Weapons, TYPE Blade (Close Combat, Blades). The two
  footnotes on the AR cells are those rows' `<note field="ar">`; the wireless bonus is in each row's text. Commlink6's
  `Cougar Polearm (Small)` and `(Large)` bundle the rows under a name the book doesn't print: cl6check counts them
  Commlink6-only. (Before: the box's WEAPON header wasn't a name column, so the four rows were only rule text.)

## Kept table maps (the general table reader, tables.py)

`kind()` stays: measured, the general reader agrees on 62 of 77 tables. Deadly Arts files weapon mods, launchers, VLS cells and racks as weapons (no DV column), power supplies, mortar bombs, railgun ammo and warheads as gear (they print DV), and armor mods as armor.

## Commlink6 check (importer v4)

- Stat matching (cl6check): Commlink6 names the PAG by its full title, the MAID drones with the maker and without the class, and a fuel row by its weapon; their stats find them (5 renames).
- Unit prices (importer v4): the artillery, cannon, mortar and railgun ammunition rows print `N each`; the app (values.ts rated()), the importer's readable() and cl6check read it as N.
- Actions (importer v4): MIL-SPEC MAYHEM's `New Fire Actions and Statuses` lists its called shots as bold title lines: actions (`New Edge Action: X` names an Edge action; `New Status: X` is none).
- Energy weapons (cl6check): their AMMO cells print the magazine and `+ Energy`; Commlink6 keeps the magazine, so cl6check compares the magazine (the printed cell stays as printed).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Deadly Arts-Core Advanced Combat Rulebook-CAT28011.pdf>" --out "%TEMP%\da-check"

## Deadly Arts gaps (book-da)

General rules (regroup, crb, cl6check), each measured on the 74-book corpus:
- **Products side by side** (regroup `_products`): the ballistic and autocannon ammunition tables print a band line
  (`regular HEX Assault Cannon`) over a header with its price columns twice (`SIZE | AVAIL | COST PER 10 | BLAST
  PROFILE | AVAIL | COST PER 10`). A row is one product a band: the first band's under the row's name (`B25`), each
  later band's `<row> (<band>)` (`B25 (HEX Assault Cannon)`); a band of dashes only is no product. The heading over
  the table is their title (category). `COST PER 10` is a cost per 10 (crb `fields`).
- **Ammunition-type lists** (regroup `TYPES_TITLE`): the `warhead types` tables in Naval Weapons' text are ammunition
  types (crb `ammo_type`), priced as modifiers; a nameless row is a band of the one above (`Hex (Capacity 20)`).
- **Box variants** (regroup `_VARIANT_LINE`): a lower-case line over each of a box's bands (`command car`, `support
  car`, `battle wagon` under `Renraku Omukade`) names that band's item: `Renraku Omukade (Command car)`.
- **Wrapped bold-header tables** (regroup `_bold_table`): the rockets and missiles (pp. 57, 58) and the extreme
  cyberweapon features and enhancements (p. 45). A row's lines are split as the book centres its values on them (as
  many over as under, or one more over); a rocket's class wraps too (`0 (40mm x` over `1m)`, shape `CLASS`); a name
  header printed on two lines around the others (`CYBERWARE` / `ESSENCE CAP COST` / `FEATURE`); a `Note:` between
  rows stays text; lines after the last row are text again. The p. 58 header prints AVAIL over the sensor column
  (`PILOT AVAIL SENSOR COST` over `0 0 5(I)`): a bold table whose AVAIL cells print no legality letter while most of a
  neighbour's do has the two swapped (`_swapped_avail`).

After the merge with the adventure branch's converter (sr6-6), the medical gear list is a real table under its
heading (a box): a row grouped under a name-only row is named with it, as a catalog row is (`Medkit Advanced (Rating
1–6)`); regroup's run-together repair never splits inside a number (the MGL-24 prints `7,500¥` under AVAIL: the book's
misprint, kept as printed for an override edit).

Recipe hints (da.py): `DRUG` names the drugs table's rows (their headings are sections); a priced NAME table in a rule
heading's text is a list of items titled by that heading (`Expanded Rocket/Missile Rules`: Standard Rocket, Standard
Missile; `_text_list`).

Left (da-gaps.md): Commlink6's composed names (`Railguns & Linear Kinetic Cannons`, `Hardened`), `Urumi` (no row
printed), `Foundation Focus` (priced as the core rulebook's spell focus by a sentence), the converter's two boxes side
by side (`Combat MAID`) and the Incision spell set inside the medical gear table.

# SR6 import completeness vs CommLink6, 2026-10-13 (updated 2026-10-16)

Measured on a fresh import of all 68 books (branch `fix/sr6-name-bugs`, run 14), compared with CommLink6 1.14.0 by
`tools/cl6check`. Report folder: `.extract/cl6check14` (not committed). English records only; German records, records
with no book and page, and CommLink6 pseudo-records are left out. Active effects are left out of every number here
(owner decision: they are their own, last task).

## Result

| Measure | Value |
|---|---|
| Completeness, all English records | 4,476 / 4,476 = **100.0%** |
| Completeness, pages we own | 4,424 / 4,424 = 100.0% |
| Class match (our `class` = CommLink6 TYPE/SUBTYPE) | 2,353 / 2,353 = **100.0%** |
| Accuracy, every compared field equal | 4,082 / 4,307 = 94.78% (was 91.49%) |
| Accuracy, with verified printed differences counted as printed | 4,304 / 4,307 = **99.93%** (was 94.03%) |
| Importer errors (class a) | 1 (was 5) |
| Unsettled field differences (class c) | 2 (was 31) |
| Deliberate extra classes in our data (not CommLink6's) | 98 entries |
| Counted as already in our data (`relocated.json`) | 148 |
| Via the `commlink6-sr6-optional` package | 21 |
| Left out: CommLink6 fields no book prints | 444 |

## How the accuracy was reached (2026-10-14 to 2026-10-16)

The owner reviewed the field differences one at a time against the book page:

- **Printed differences kept (class b).** Where the book prints our value, ours is kept and counted as printed
  (`tools/cl6check/value_keep.json`), e.g. Power Suit and Très Chic availability `Rating/2`, Fangs `500¥ + 2 doses
  toxin`, the Cyberdecks' availability, Control rig `Rating^2 x 30,000¥`, the Neurochemical Regulator colony template.
  The 275 remaining class b rows are mostly cost 69, availability 61, legality 26.
- **Latest printing wins.** The Core Rulebook's Current Printing outranks the city editions; items an older printing
  prints that the Current Printing omitted in error stay (Sim module, Shotgun ammo row).
- **Errata wins for No Future.** The book prints 5E availabilities; the official errata's 6E values are applied
  (instruments, yo-yos, skates, Molotov, presses, cameras, Cybereyes/Cyberears ratings 6 and 7, removed items).
- **One item per variant.** Rows the book prints once for several things are split: Sim module and Sim module w/ Hot
  sim, Swindler Stick per credstick grade (5), Manadyne MB-10/PB-10/MB-100/PB-100, Skateboard (Hardened/Bladed) and
  Roller skates (Bladed), Gonzo Case per deck, sealed ammo pouch, large blast shield, MEMS medkit pouch by capacity,
  Transgenic chameleon skin (Basic/Dynamic) and Transgenic rhino skin, Ghoul per base metatype.
- **Structure from CommLink6** where it reads the book better: vehicle mounts offer a hardpoint, the imaging scope's
  optical capacity 3, folding stock and simrig fits.
- **Clothing is armor** with its printed Social Rating; case capacities are stored as printed.
- **Infected and Awakened.** The Sixth World Companion's Infected types are data (strain, base metatype, optional
  powers, free pick, Awakened price), the 26 optional powers are imported with their karma, and the app has an
  Awakened flag (derived, with a warned override) and an Infected selector behind the default-off setting
  "Infected Player Characters Allowed".

## What is left

- Class a (1): Core Rulebook Arrow rating. CommLink6 gives 1–14; the book prints only availability `(Rating/3)` and
  cost `(Rating x 2)¥`, no range.
- Class c (2): Hack & Slash Breadbox Case capacity `Unlimited/Unlimited` (CommLink6 99) and Gonzo Case `2/2`
  (CommLink6 2), stored as printed.
- 1,000 items we have that CommLink6 does not (npcs 265, augmentations 132, lifemodules 92, critters 71, gear 71,
  contacts 64, qualities 63, spirits 52, weapons 40, qualitypaths 32; the qualities include the 23 Infected optional
  powers CommLink6 has no record of). Not yet validated against the book text.
- Later: active effects (last), Eden export (class map, Matrix devices), critter and vehicle builder.

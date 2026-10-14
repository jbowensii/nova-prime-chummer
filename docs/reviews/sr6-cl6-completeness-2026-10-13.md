# SR6 import completeness vs CommLink6, 2026-10-13

Measured on a fresh import of all 68 books (branch `fix/sr6-cl6-parity`), compared with CommLink6 1.14.0 by `tools/cl6check`. Report folder: `.extract/cl6check7` (not committed). English records only; German records, records with no book and page, and CommLink6 pseudo-records are left out.

## Result

| Measure | Value |
|---|---|
| Completeness, all English records | 4,412 / 4,412 = **100.0%** (was 4,226 / 4,410 = 95.83%) |
| Completeness, pages we own | 4,364 / 4,364 = 100.0% |
| Class match (our `class` = CommLink6 TYPE/SUBTYPE) | 2,333 / 2,333 = **100.0%** |
| Accuracy, every compared field equal | 3,922 / 4,287 = 91.49% |
| Deliberate extra classes in our data (not CommLink6's) | 75 entries (classes listed in `importer/sr6/classes/extra_classes.json`) |
| Accuracy, with verified printed differences counted as printed | 4,031 = 94.03% |
| Importer errors (class a) | 5 |
| Left out: CommLink6 records no book prints as an item | 69 |

## How the 100% is made up

- Matched by the importer or the name matcher (90% similar names, brand and category headings, per-book override tables): 4,287.
- Counted as already in our data (`tools/cl6check/relocated.json`, 105 records): items we have under another name, in another book, or only as a rules section. Owner decision: these count as complete.
- Counted via the `commlink6-sr6-optional` package (`tools/cl6check/optional_package.json`, 21 records, contents in `docs/sr6-cl6-optional-package.md`): CommLink6 differences we will ship as an optional data package. They count as matches in this analysis only and are not in the core data.

## What changed since the first draft of this report

- The first fresh run left 154 unmatched English records, by cause: name not in our converted text 69, no page in this book 34, name only in running text 16, block or heading dropped by the importer 28, page beyond the owned PDF 5, bold run-in name in prose 2. Each was searched in the raw book text at 90% name similarity; the results are in `.extract/cl6check3/search/`.
- They were closed by: recording items we already have under another name, in another book or as a rules section (`relocated.json`); per-book override entries that create or alias an item from CommLink6's rule data (`importer/sr6/overrides/*.json`); importer rules (brand and maker headings name table rows, the x Guide Override heading, Hunter's Alloy, the Liar's Medium and UV Light tables); and the optional package.
- Overrides are rule data only. No item description is ever written by an override; descriptions come from the owner's PDF text (the Compile and Decompile Sprite actions copy the heading's text through `text_from`).
- The five Hack & Slash sprites were not missing: CommLink6 files them under Hack & Slash but cites the Core Rulebook page (p193), where we have them.

## Items we have that CommLink6 does not

994 items. Spreadsheet: `.extract/cl6check4/we-have-commlink6-does-not-2026-10-13.xlsx`. By kind: npcs 265, augmentations 136, lifemodules 92, gear 76, critters 71, contacts 64, spirits 52, weapons 49, qualities 39, qualitypaths 32. These have not been validated against the book text yet; that is the next step.

## Class and category (CommLink6 TYPE/SUBTYPE)

- Every matched item carries CommLink6's own class in a new optional `class` attribute (2,333 of 2,333 = 100.0%): 240 categories mapped once in `importer/sr6/classes/category_class.json`, plus per-item override rows in `importer/sr6/overrides/*.json`.
- The 207 items CommLink6 cannot classify were decided one by one by the owner against the book page (194 classes, 9 removals, 4 merges). Where CommLink6 has no class, a deliberate extra class was added and registered (CRITTERWARE/AUGMENTATION and /GEAR for critter-only gear, which players cannot select; DRONE_*/SPACE; VEHICLES/SPACE_BIKES and /SPACE_BOARDS; the WEAPON_LASER family).
- New override operations: remove, merge, move_kind, rename (documented in `docs/sr6-data-format.md`).

## Open work

- Accuracy (field values): 91.49%. The ranked worklist is in the session notes (`field-worklist.md`): effect-name vocabulary, weapon skill and specialization, slots and mounts, requirements keyed by value.
- Types and categories for the 477 entries CommLink6 does not have: proposals and the 79 category groups awaiting an owner class are in `.extract/extras-class/`.
- Eden classification: the module (`chummer-sr6-foundry`) must translate CommLink6 classes to Eden (cyberjack, grenades, accessories as `mod` items, unclassed vehicle mods and ammo). Plan in `.extract/eden-class/`.
- Validate the extras against the book text.

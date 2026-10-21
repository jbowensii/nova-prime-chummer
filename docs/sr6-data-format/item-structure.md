# Item structure (Commlink6's data, kept and not applied) (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Owner decision 2026-10-14: the structure Commlink6 gives an item is in our data too, where the books don't print it (the
importer reads none of it from the text). Children of any entry (`common.xsd` tail), and attributes of the item kinds:
- `<slot id value?/>` a slot the item offers; `<fits slot/>` a slot it fits; `<variant name/>` a variant it comes in;
  `<relevance topic/>` a topic it is relevant to; `<flag>text</flag>` a kind flag; attributes `modonly="true"` (bought only as
  an add-on), `size` (a weapon's size class) and `ammoClass`.
- `<modifier kind type ref value …/>` (kind `valmod`, `checkmod`, `itemmod` or `allowmod`: a modification), `<prerequisite
  kind type ref …/>` (kind `datareq` or `valuereq`) and `<selection type ref options …/>` (a pick it offers) are Commlink6's
  own rule data, every attribute as it gives it (`$RATING` formulas, conditions). **No rule reads them**: the app applies our
  `<effect>`s, `<link>`s, `<requires>` and `<choice>`s only, so a character's maths is the same with or without them
  (`tests/sr6/catalog/structure.test.ts`). They are the reference the day those are written from the books or checked against it.
- A `<prerequisite … negate="true"/>` is the owner's, not Commlink6's: an exclusion the book prints, a warning only, never
  enforced (every prerequisite is a warning, 0.11.1). The Silencer/suppressor (CRB p. 261, "not compatible with revolvers or
  shotguns"; owner 2026-10-16) has `type="WEAPON_TYPE"` `ref="revolvers"` and `ref="shotguns"` in place of Commlink6's list
  of the weapon subtypes it fits: a weapon it is fitted to is a revolver when its ammunition prints `(cy)` (a cylinder), a
  shotgun when its category is Shotgun. The row is filed under weapons, the kind of our entry (the id is an implant weapon's too). cl6check keeps ours for its `requires` family (value_keep.json).
- `src/sr6/catalog/domain/structure.ts` `structureOf(entry)` reads them all.
Where they come from: `python -m tools.cl6check.familymap <cl6-diffs.csv>` writes the id rows `{"id", "set", "kids", "gen":
"family"}` of the per-book tables from the Commlink6 record of each entry with a difference in that family; applied by
`overrides/` after the import (a child the entry already has is not added twice). An entry several Commlink6 records match
(a rated item's levels) gets the union.

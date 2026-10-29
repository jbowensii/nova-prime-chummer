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

**Fit (plan docs/analysis/sr6-item-classification-fit.md, Stages 1-4, 2026-10-29).** Hooks, usages and host
requirements are now applied:
- `<slot id value unit maxSize rule remove>`: `unit` is `capacity` (fitted items' costs add up to `value`; 99 or more
  is no limit) or `one` (one item per hook); no unit is an old catalog (one item per unit of value). `maxSize` caps one
  item's cost (a small drone's half hardpoint). `rule` S, V or F: made by the importer the way Commlink6's code does it
  (importer/sr6/hooks.py: standard hooks by class, vehicle capacities from Body/Seats/Pilot with the data's HOOK
  values added, fashion on body armor with a Social rating); a `rule="F"` fashion hook is not designer fashion.
  `remove="true"`: a hook Commlink6 takes away (the app reads none).
- `<fits slot cost mode rule>`: cost in the hook's capacity (none: 1), mode `embedded`, `implanted`, `carried` or
  `virtual`; `rule` W or I when the importer synthesized it (a weapon's vehicle-mount and implant usages, by its
  size and subtype). An item with an embedded usage of its own (no rule) is fitted only, never bought on its own.
- A weapon with no WEAPON_SIZE gets one: `sizeFrom="class"` by Commlink6's own subtype rule, `sizeFrom="category"` a
  guess from its printed category for one with no class (owner ruling 3: listed for review).
- `<prerequisite … group negate apply>`: group 0 all must hold, each other group (a Commlink6 `<selreq>`) any one.
  The app tests against the host what Commlink6 tests at embed time (`structure.ts requirementsOf`): `apply="DATA_ITEM"`
  tests, and a selreq group whose members all carry that `apply` (a member with none holds by itself). A holster's
  gun-type group is the one exception, always tested (owner ruling 6). A failure is Review's `catalog.requirement`
  warning, and the accessory picker lists the entry greyed with the reason.
- One fit test (`structure.ts fit`) serves the accessory picker, the add-time guard and Review: the host's hooks plus
  the instance's added slots less its removed ones, the size cap, then room (alternatives placed by matching).
- Where they come from: `python -m tools.cl6check.slotmap <runs>` writes each matched entry's data hooks, usages and
  grouped requirements (`"gen": "slot"` rows); `importer/sr6/classes.py associations` adds the code's.
Where they come from: `python -m tools.cl6check.familymap <cl6-diffs.csv>` writes the id rows `{"id", "set", "kids", "gen":
"family"}` of the per-book tables from the Commlink6 record of each entry with a difference in that family; applied by
`overrides/` after the import (a child the entry already has is not added twice). An entry several Commlink6 records match
(a rated item's levels) gets the union.

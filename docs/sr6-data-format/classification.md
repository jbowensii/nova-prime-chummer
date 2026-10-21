# Commlink6's classification (`class`) (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

The entries of weapons, armor, augmentations, electronics, gear, vehicles, programs, spells and ammotypes (and
categories.xml's categories) may carry `class`: Commlink6's own classification, verbatim, in its keys: `TYPE/SUBTYPE`
(`ARMOR/ARMOR_BODY`, `SOFTWARE/AUTOSOFT`), `TYPE` alone, or the record's tag for a kind with no type (`spell`,
`ammotype`). The app ignores it; `python -m tools.cl6check` compares it (the "class match" line), and the Foundry module
translates it to Eden's keys later. Where it comes from: `importer/sr6/classes/category_class.json` ({kind: {category:
class}}) gives it to every entry of a category whose Commlink6-matched entries share one class (90% or more); an entry
of another category gets it from an id row of its book's override table (`{"cl6", "kind", "id", "set": {"class"},
"gen": "class"}`, id unscoped); an entry that already has one keeps it; an entry Commlink6 has no record for gets none.
Both are made by `python -m tools.cl6check.classmap <category_class_map.csv> <runs dir>` (re-runnable; it replaces only
the rows with `"gen": "class"`).

# Common rules (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Every file has the same root, and one file holds one kind:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="weapons" version="1">
  ...entries...
</sr6:data>
```

- `kind` names the catalog and picks the schema (`public/data/sr6/schema/<kind>.xsd`, sharing `common.xsd`).
  `version` is the schema version, currently `1`. Child elements are unqualified.
- Every entry has `id` (pattern `[a-z0-9][a-z0-9.-]*`, unique within its kind), `source` (a source id, pattern
  `[A-Z][A-Z0-9-]{0,19}`) and `page` (the printed page). Then a `<name>`, the kind's own children, and an optional
  `<text>`, which is empty in imported files.
- An overlay removes an entry loaded before it with `<remove id="..."/>`.
- **Values are kept as printed**, as strings: dashes are normalized to `—`, `¥` and thousands commas are dropped from
  costs, and nothing else changes. Formulas such as `Rating × 500` or `F+1` stay formulas (the builder parses them).
  Only the attributes marked *int* below are integers. Book errors stay as printed: the import report lists a value
  that doesn't fit its column, and fixes go through the edits layer.
- **Prices** (`cost`, `avail`, a focus's `karma`, an implant's `essence`) are a number or a formula the app evaluates at
  the rating the item is bought at: numbers, `Rating` (also `Capacity`, `Force` or `Level`, any case: the same
  rating), `+`, `×`/`x`/`*`, `/` (rounded up), `^` and parentheses, an optional leading `+` (an add-on's price) and a
  legality suffix on `avail` (`(L)`, `I`, …). An item priced by its capacity takes its capacity range as its `rating`.
  A nuyen amount printed under AVAIL (`15,000¥`) is a licence price ("available with licence"): it stays in `avail` as printed, never moved to `cost`. Alone it means freely available (availability 0) with that licence fee; `2, 15,000¥` is rating 2 plus the fee (`availability()` in `src/sr6/catalog/domain/values.ts` reads both; the stored text is unchanged).
  `per` names what one cost buys (`10 rounds`, `100m`, `month`). A row printing two items is split into two entries:
  `A/B` names with `x/y` prices, `x/month or y/year` prices (`<name> (month)`, `<name> (year)`), `1,000¥ for cyberdeck/5,000¥ for cyberhack` prices (`<name> (cyberdeck)`, `<name> (cyberhack)`), and the cyberlimb
  table's per-variant price columns (`<name> (synthetic)`, `<name> (obvious)`). A price naming another item
  (`900 + Gizmo`) stays as printed and is reported.
- **Formulas and issues** (optional children of any entry, after its kind's own children and before `<text>`; see
  Formulas and issues below): `<formula field="cost">R * 200</formula>` says how a field is worked out, the printed
  attribute staying as printed; `<issue field="avail" code="missing" page="91">note</issue>` marks a field the book
  prints nothing for, or one the importer couldn't read.
- **Choices** (optional children of any entry, `<choice kind="…"/>`): what the player picks when the entry is taken.
  `kind` is one of: `quality` (count picks from the qualities of `category`, max the most), `mixed` (a life module's
  `points` to one of `options`), `skill` (one of `from`, names separated by `; `), `specialization` (in the chosen
  skill, or in `category`), `knowledgeskill`, and `sense`, `trueelement`, `licencetype` (one entry of that kind, of
  `category` when given). `free` labels a value the player may write instead (`other (L) item`). The importer writes
  them for a power's `select a sense (sight, hearing, …)`, for a bracketed power definition (`Skill (choose one from
  …)`), for a heading's `selected from the list below` options, and for Fake License's licence type.
- **Cross-references are names** for now: metatype traits, critter powers, NPC gear and weapons are lists as printed.
- **No prose in the catalog files.** Descriptions, game effects and rule text go only to the source's texts file.

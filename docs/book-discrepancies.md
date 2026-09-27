# Book discrepancies

Where the numbers printed in the books disagree with the rules as the engine
applies them. We follow the rules and record the disagreement, instead of
bending the engine to match a printed number.

The per-book lists (which amps, which pregens, printed and computed values)
are book data, so they aren't kept here: each import's report on the Books
page lists them (`library/<book>/import.xml`, `<row>` elements). This page
keeps the rules calls behind those reports.

## Catalog amps

A recipe breaks every amp it reads into rule effects and compares the result
to the printed rating:

- **Computed below printed:** the difference is filled with *Additional
  narrative effect* (+1, CRB p.63) and tagged `note="balances printed rating"`.
  Books assign narrative effects loosely, so this keeps catalog prices true
  to the book.
- **Computed above printed, where the text lists a drawback** ("Disadvantage
  when it wears off", "must take High Risk"): the difference becomes a
  *Negative effect* tagged `note="book drawback"`. It is book-sanctioned, so it
  needs no GM approval while it matches the catalog entry.
- **Computed above printed with no drawback text:** a report row. The amp
  keeps its computed rating and pays the rules price.

Typical causes: a situational Risk Reduction priced below the effect table,
a range change priced at +1 instead of +2, and vehicles whose chassis isn't
in the CRB table (water craft, minidrones), for which the nearest chassis is
used.

## Sample runners

A printed amp rating the rules can't reproduce is a report row too; the
runner keeps the computed rating. Where a stat block contradicts itself
(attributes back-computed from dice pools, unarmed DV and thresholds), the
majority wins and the odd number isn't tested. A custom specialization rolls
with its skill's attribute.

## Expanded-list entries the rulebook doesn't print

The owner's rule: an amp the expanded list (DHSA) cites to the core rulebook
but the rulebook doesn't print stays non-canon. Six are Daegann's splits, not
rulebook entries, and import only as non-canon DHSA entries: the flying
microdrone, small and medium drones (the rulebook folds flight into its base
drones' Speed) and the deck Attack, deck Firewall and vehicle Flying mods
(rows of the Shadow Amp effects table, which the app ships as effects).
Concealment is printed, on a pregen sheet, so it is a canon CRB amp; so is
every other amp only a rulebook sheet prints. A sheet amp whose name differs from a
similar box amp (a damaged or unbranded model, another maker's version) stays
its own entry; `importer/recipes/crb.md` lists them.

## Effect-table exceptions the book makes

The effect table (CRB p.61) limits initiative enhancements to Qualities,
cyberware/bioware and adept powers, but the combat drugs are Equipment amps
that grant initiative. Effects carried by a catalog amp exactly as the book
prints them are treated as book-sanctioned; the same effects on a home-made
amp are flagged.

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

The owner's rule (0.5.6): a sample runner is what its book prints. Its amps
keep the printed type and the effects their lines read (a line no effect
reads stays the amp's text), with nothing added, dropped or retyped to meet
the printed rating; its items are every printed entry. The printed rating is
kept on the amp's snapshot, and where the rules rate the amp otherwise the
runner's Review tab says so, as it shows everything else the book prints
against the rules (over budget, a Negative effect's GM approval, an Equipment
amp with no printed item). Nothing in the file approves or explains it. Where a stat block contradicts itself
(attributes back-computed from dice pools, unarmed DV and thresholds), the
majority wins and the odd number isn't tested. A custom specialization rolls
with its skill's attribute.

## Shadowrun 6 sample runners

The same rule for Shadowrun 6's samples (the core rulebook's archetypes, Smooth
Operations' faces): the runner is what the stat block prints. The importer
reads each item the way it's printed (a variant, a cyberlimb's kind, a grade)
and gives a standard boost (wired reflexes, muscle toner, dermal plating, a
full cyberlimb's Physical box …) the bonus the rules give it. A skill printed
`(Acting +3)` has the specialization Acting turned into an expertise (CRB p.
92): both are written; the specialization is paid for, and the expertise with the
customization karma at its advancement price (CRB pp. 66, 68; owner, 2026-10-09). A quality printed
with a level is an entry that comes in levels (`Addiction 5` is the core
rulebook's Addiction, not a quality path's one-level step of that name), and an
item printed at a rating is never an entry named for another rating
(`cybereyes 3` is the core rulebook's basic system at Rating 3). A level
printed on a quality that has none (`Magic Resistance 2`: CRB p. 72 prints one
flat cost) is a misprint: the quality is taken once and Review notes it. A
switchable bonus (wireless, activated, sustained) is printed in brackets, `4(6)`,
the value with it on; an always-on one (a reflex recorder, muscle toner, a passive
adept power) is folded into the printed number, so the natural value is the
printed less it, unless the brackets already hold it (owner, 2026-10-10). A rank
printed without brackets is never read down by a switchable bonus (`Con 7` with a
voice modulator stays 7). Where a book rule explains the printed numbers,
the runner gets that option as its own creation rule, marked assumed (the book
doesn't say): the prime runner's 100 Karma (CRB p. 64), the first printing's
cap on illegal gear only (CRB p. 66). A value the book misprints is corrected by
the owner's override file (`<samplefix>`), never by the importer. It keeps the printed attributes, Essence,
initiative, condition monitors and Defense Rating in `<printed>`. Review
compares them with the rules' numbers and warns where they differ ("the book
prints N; the rules give M", with the page). Over budget, a skill above the
cap, an expertise without its rank, a seventh quality, a rating the item doesn't
come in and the like show as on any runner. Nothing in the file corrects the
book. A reflex recorder adds 1 to the rating of the skill printed with it (CRB
p. 293), one recorder per skill (`reflex recorder (Close Combat & Firearms)` is
two). Not compared: a cyberlimb's own
attributes. The book prints no priorities:
the importer picks the letters that overspend least for the printed build
(Magic and Edge on adjustment points, what a pool can't hold bought with
karma, a specialization the skill points left over can't cover bought with
karma, nuyen past the resources with karma); when no priority assignment fits
the karma, it tries the Sixth World Companion's Sum-to-Ten (letters may repeat)
and takes it when it overspends less. A metatype's own quality is free whether
or not the block says "trait"; an Allergy is priced from its printed severity
and allergen; a quality another imported book prints (a face's Sixth World
Companion quality) is found in that book's catalog. Review shows what is still
overspent.

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

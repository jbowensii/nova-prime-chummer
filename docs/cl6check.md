# cl6check: measuring our SR6 imports against Commlink6

`tools/cl6check` compares what the SR6 importer reads from the owner's PDFs with Commlink6, the system of record. It
gives the numbers each data-quality phase is judged by:
- **completeness**: how many of Commlink6's records we have;
- **accuracy**: how many matched records agree with Commlink6 field by field.

It reads the Commlink6 jar installed on the owner's machine each time it runs. The repo holds no Commlink6 data,
no book text and no report output. The tests (`importer/tests/test_cl6check.py`) use invented data.

## Running it

1. **Import every book into a scratch folder.** Write a books file with one `<run name>|<pdf path>` line per book,
   then run:

   ```
   python -m tools.cl6check import books.txt <scratch>
   ```

   This runs `python -m importer sr6 check` for each book, ten at a time, into `<scratch>/<run name>`.

2. **Compare:**

   ```
   npm run cl6check -- --ours <scratch> --out <report dir> [--save-baseline]
   ```

   or `python -m tools.cl6check --ours <scratch> --out <report dir>`.

Options:
- `--ours` takes either a folder of import runs or a single `custom/sr6` folder. A book printed in several runs
  (the core rulebook in each city edition) is read from the newest printing's run (the Current Printing, else the PDF's
  date; ties in name order); older runs only add the entries it lacks and fill fields it left open. The PDF arbitration
  reads that run's PDF.
- `--jar` names the jar. Without it, the tool uses `$CL6_JAR`, then the default install
  (`~/CommLink6/app/stable/commlink6-*-complete.jar`; a folder means the newest jar in it). When no jar is found,
  the tool prints "skipped" and exits 0, so CI, which has no jar, is unaffected.
- `--out` names the report folder. Without it, the tool uses `$CL6CHECK_OUT`, then `.extract/cl6check`
  (gitignored).
- `--save-baseline` stores this run's metrics as `<out>/baseline.json`. Every later run reports its change against
  that file, or against the file `--baseline` names.
- `--no-pdf` skips the PDF check, which makes every difference class c. It is quicker.
- `--fail-under completeness=99,accuracy=99` exits 1 when either measure falls below its threshold.

Errata (decision D1): measure an import made without the errata overlay and one made with it. Class b shows what
the overlay changes.

## Effects parity replay

`python -m tools.cl6effects` counts how many of Commlink6's modifications (1,079 "variables": a value or a kind a
record changes) our imported entries carry as `<effect>`s. It re-imports nothing from the books: it takes the saved
import runs (`.extract/cl6check-runs26`: a full import of all 74 books made 2026-10-19 after the column-detection fix (PR #82), with `python -m tools.cl6check import`; or `--runs` / `$CL6_RUNS`), rewrites their effects with the importer of the
tree you name (`effects.apply`, the overrides, the classes, the `gen="cl6"` and `gen="book"` rows,
`effects.copy_links`, in the order of `run.py _read`), and compares them with the jar. Each variable ends as one of:

- strict match: our entry has the same target, kind and value;
- book-ruled: the book states it differently and the owner ruled for the book (`tools/cl6effects/bookruled.json`);
- accepted placeholder: Commlink6 prints `0` or `-98`, no real effect (`tools/cl6effects/cl6placeholder.json`).

```
python -m tools.cl6effects --tree . [--base <other tree>] [--runs <saved runs>] [--out <dir>] [--jar <jar>]
```

- `--tree` is the code tree to measure: a checkout, or an unpacked `git archive` of a commit. `--base` measures a second
  tree too and prints every Commlink6 row whose status differs (entry, Commlink6 effect, ours before and after), then
  each `gen="book"` correction row the base has and the tree has not, whose effects are missing from the tree's own
  import (a retired row must leave its effect behind as a reader rule).
- `--out` (default `.extract/cl6effects`) gets the rebuilt runs, one folder per tree. A worktree has no `.extract`:
  pass `--runs` with the main checkout's. Windows only for now: `library/` of each run is linked with `mklink /J`.
- With no jar (`--jar`, `$CL6_JAR`, `~/CommLink6/app/stable`) it prints "skipped" and exits 0, as `cl6check` does.
- It also prints the number of `the drop ... matches no effect` warnings (a `gen="book"` row's `drops` that took out
  nothing: the row was written against a reader that has changed).

Expected on main: `parity: 1079/1079 (100.0%)` (1,027 strict + 42 book-ruled + 10 placeholders), `book-ruled keys that
no longer fit: 0`, `still open by category: {}` and 0 unmatched drops.

**Rule:** before merging any change to `importer/sr6/effects/`, `importer/sr6/overrides/*.book.json` or the
reader, run it on main (`--tree` an archive of `origin/main`) and on the branch. Both must read 1,079/1,079 with no
unmatched drops. If a branch changes a number on purpose (a new Commlink6 row, a new owner ruling), update the two
JSON files in `tools/cl6effects/` in the same change. `importer/tests/test_cl6effects.py` covers the evaluator on a
tiny fixture without the jar.

## The production import gate (2026-10-20)

The replay above cannot see what only production does. Its saved runs already hold the structure the override rows
gave each entry, and each run is one book alone. The first measurement of the live server's "Re-import all"
(docs/reviews/sr6-cl6-comparison-2026-10-20.md) found 21 effects and 6 records lost that every replay had passed:
- effects read before the override rows that gave an entry the structure they depend on (a rocket's `Missile` variant);
- steps that need the whole library: the cross-book fill, the core rulebook's Current Printing with its older printings
  filling in, an errata's life modules, links to another book's entries.

So a reader, override, pipeline (`importer/sr6/run.py`) or corpus (`importer/sr6/resolve.py`) change is also measured on
a fresh production import:

```
python -m tools.cl6check import --library <books file> .extract/cl6check-runsNN [--md-from .extract/cl6check-runs26]
python -m tools.cl6effects --fresh .extract/cl6check-runsNN
python -m tools.cl6check --ours .extract/cl6check-runsNN --out .extract/cl6check-runsNN-report
```

- `import --library` imports every book of the books file into one library, one after the other in the file's
  order (`library/sr6/<run name>`, one `custom/sr6`), with `python -m importer sr6 run --reuse`, as the server's
  upload and Re-import all do. `--md-from` copies each book's `book.md` from earlier per-book runs, so a PDF already
  converted by this converter is not converted again. The log is `import.log` in the output folder. A full import of
  the 74 books with `--md-from` takes about 15 minutes. Without it, every PDF is converted, which takes much longer.
- `cl6effects --fresh` measures the import as it is, with no rebuild. It can be repeated (`--fresh A --fresh B`).
  It measures per-book runs too, but they have no cross-book links, so they read lower.
- cl6check reads the library's single `custom/sr6`. The PDF check uses each book's own `original.pdf`.

Expected on main: effects `parity: 1079/1079`, completeness 4,474/4,474, class a 0, accuracy with class b as printed
4,307/4,307.

**Rule:** a change to the reader, the overrides, `run.py` or `resolve.py` runs both gates: the replay (main and the
branch, 0 differing rows) and a fresh `import --library` with the branch, which must read the numbers above.

## The final analysis (2026-10-20)

`python -m tools.cl6check.final_analysis --ours <library import> --printings <per-book runs>` builds the owner's two
lists in docs/reviews/sr6-cl6-final-analysis-2026-10-20.md:
- every Commlink6 record that no book of ours prints;
- every change we made to Commlink6's data, with its page or ruling.

It rewrites only the part between the doc's two markers. With `--check` it recomputes the counts and prints
`counts reconcile: ok` when they match the doc's totals table (exit 1 if they don't). It also reads the records the
reader leaves out (`reader.read(jar, listing)`) and the jar's German-only (`de_*`) and Misc. (US) (`other_us`) books,
which the reader skips.

## Value and structure overrides (2026-10-14)

- `valuemap` (`python -m tools.cl6check.valuemap <diffs.csv> [<diffs of a run on the result>]`) writes a per-book override row
  (`importer/sr6/overrides/<src>.json`, `"gen": "value"`) for each counted field difference that `value_keep.json` does not
  keep. `keep` lists the values the PDF's text layer prints (the owner's check of the 361 reviewed rows, native agents reading
  the page text, 2026-10-14); the checker settles a difference there as class b, whatever class it had (a, or c after the trace). A `variants` entry there (field `variants`) accepts an item that Commlink6 gives variant tags (an install option, a Guided/Rocket Assist warhead option) as one item. `hold` is what the owner decides (two
  Commlink6 records disagree about one entry; a per-rating item). `verdicts` are the owner's rulings that ours is right
  (docs/reviews/cl6-class-a-decisions-2026-10-17.md: 37 rows, each with its book page and reason): keyed by source, kind,
  Commlink6's id and name, our id, field, and both values, so a row is class b only while Commlink6's value and ours are
  the ones ruled on; a change to either makes it a new difference, settled again. valuemap writes no override for them.
- `familymap` writes the structured data (`"gen": "family"`): a weapon's `skill`/`spec`, an armor's `social`, the item
  structure (slots, variants, relevance, flags, `modonly`, size) and Commlink6's own modifications, prerequisites and picks
  (docs/sr6-data-format/item-structure.md, Item structure). Nothing reads the last three: the per-effect metric counts only our own
  `<effect>`s (`effects_own`).
- A Commlink6-only record is an entry of ours (importer/sr6/overrides `"gen": "cl6only"` adds), is "already in our data"
  (`relocated.json`) or is in the optional package; only the rule options are not entries, as the app's rule presets.
- `RETIRED` ("Depreciated …") records are out of every count, except `wss_explosive` (the latest Firing Squad prints it).
- Infected (2026-10-16): Commlink6 has the Companion's Infected qualities as `quality type="INFECTED"` (one record per base
  metatype: `ghoul_human` … `ghoul_troll`, `mutaqua_mundane`/`mutaqua_awakened`) and no record for the Infected Optional
  Powers Table (p. 109); its same-named entries are critter powers (core rulebook, Street Wyrd), metagenic qualities and
  adept powers. Our Infected qualities carry its class `INFECTED`; the 26 optional powers are qualities of ours with no
  Commlink6 record (counted among our extras, their class `INFECTED/OPTIONAL_POWER` a deliberate extra). Qualities are not
  a class-compared kind, so neither class moves the class match.
- Infected per base and Awakened prices (owner 2026-10-16): the Ghoul is five qualities of ours (`Ghoul (Human)` … `Ghoul
  (Troll)`, `swc.ghoul-human` …), matched exactly with Commlink6's five records (its human one is named `Ghoul`: an alias of
  `Ghoul (Human)` in swc.json), each with its own family row. A quality's `<karmaif value>` (its Karma when the character is
  Awakened) is one of its prices for the karma comparison, as `karmaMax` is (`ours.py` reads it as `karmaIf`): our one
  Mutaqua, Nosferatu, Wendigo and Astral Hazing match both of Commlink6's records (`*_mundane`/`*_awakened`,
  `astral_hazing_non_awakened`/`_awakened`), so their "two records disagree" hold rows are gone. Astral Hazing's `requires`
  (each record its own magic kinds, ours their union) and the Silencer/suppressor's (Commlink6's list of the weapon subtypes
  it fits; ours the book's exclusion, revolvers and shotguns, a `negate="true"` prerequisite) are kept as ours in
  value_keep.json: accepted structural differences.

## What it does

| module | job |
|---|---|
| `reader.py` | Reads every English record in the jar. Its text is keyed by (prefix, id): `npc.shaman` is not `tradition.shaman`. The text file named like the record's file wins (`core_seattle`, `easycome`). It normalises spelling variants (`val`, swapped `type`/`ref`, boolean spellings). It leaves out German books, `lang="de"` records and records with no English name, and counts them. |
| `canon.py` | Turns a record into our vocabulary: kind (a record type or item type → our catalog kind; types we have no kind for are *unmodelled*), source id, aliases (`Grenade, Party` → `Party Grenade`; the name joined with each variant). Price, availability, essence and capacity are evaluated at each rating, from `$RATING` formulas and per-rating tables, along with the variants' own values. It also builds the field families. |
| `ours.py` | Reads our catalog in the same shape. `value()` reads a printed value the way the engine's `rated()` does. |
| `match.py` | Matches records to entries of the same book, in stages: exact, loose (plurals, punctuation, rating words), parenthetical first (`Tonfa (Zoé Heritage)` is our `Zoé Heritage Tonfa`, not the generic `Tonfa`), no parenthetical, alias, split row (`A / B`), word order, initials (Commlink6 shortening a maker of two words or more: `VI Ace of Clubs` is our `Vashon Island (Ace of Clubs)`, `VI Steampunk` our `Steampunk` grouped under `Vashon Island`), contained (one name's words inside the other's, on a nearby page), group (Commlink6's name made of our row's words and its category's or maker's: `Implanted Shotgun` is our `Shotgun` in the `Cyber implant weapon` category), fuzzy. (A footnote mark in an attack rating, `*` or `†`, is set aside. A rating's parenthetical, `(R 1-6)`, is set aside in the keys; a variant's word that starts with r, `(Razorwire)`, is not. Rows sharing all a record's words: those on its page when some are. A fuzzy name whose stats conflict loses to an entry whose stats are the record's. Another book's entry of the same name counts as the object only in a category sharing a word with the home book's: Body Shop's `Buzzsaw` implant weapon is not Deadly Arts' `Buzzsaw` extreme cyberweapon feature.) A formula citing another book's entry (`ref(gear:crb.spell-focus, cost, R)`) is resolved over the whole corpus, as the app's merged catalog does. A record can match several entries (a parent and its variant rows). Fields are compared against the entry that agrees most. |
| `fields.py` | Per-field comparators. Numbers are compared at every rating. A printed range compares by containment, and a cell printing several values compares by the values it prints. A variant's value counts as a match. Legality is compared apart from the availability number. An ammo cell printing what else the weapon draws on (`20(c) + Energy`) compares by its magazine. |
| `arbitrate.py` | Classes each difference from the import's own `original.pdf`: **a** = the PDF prints Commlink6's value (an importer error); **b** = it prints ours (a verified printed difference, such as errata or another printing); **c** = not settled. |
| `patterns.py` | Finds and scores the general rules that predict Commlink6's UI tags (see Patterns below). |
| `modifiers.py` | Expresses Commlink6's modifications as path-and-value modifiers, aligns them with our descriptions, and mines phrase templates (see Modifier patterns below). |
| `report.py` | Builds the metrics, the cause of every miss, the deltas against the baseline, and the files. |
| `corpus.py` | Our book data as one corpus ordered by publication date: one import run per SR6 PDF (every core rulebook printing, the errata, the card decks and handouts the importer skips). Each book has its date, its book.md and regrouped.md as lines (page, heading and its level, table header) and its catalog entries. `entries()` groups an object across every book by kind and loose name; `variants()` finds the entries printing the name with a qualifier; `mentions()` finds every line printing a name (through a word index); `disagreements()` lists the books whose PDF date and sources.xml month differ. |
| `lineage.py` | For one object, every value each book prints, ordered by publication date per field, from these readers: catalog fields; table rows printing the name; stat blocks with no name under a heading naming it; card stat lines; NPC bracket lines (context only); errata statements. The winner is the value published last. |
| `crops.py` | Renders the printed page around a value (pypdfium2) to read it by eye: `locate()` finds the value beside the item's name in pdfplumber's words; `crop()` saves the band with the rows around it; `sheet()` stacks labelled crops. |
| `formula.py` | Reads printed formulas ('Rating x 2,000¥', '1,000¥ + [500¥ x Size]', '300¥ per CF', '(Rating/3)', a trailing note set aside) into a small expression grammar, evaluates them (`/` rounded up or down), evaluates tiered bands, and `flattened()` checks whether Commlink6's numbers are a formula at some rating or count (step 4). |
| `trace.py` | Traces every Commlink6 value to where it sits in the corpus, and gives each difference a pattern family (see below). |

### The corpus and the trace (phase 1 of the parity work)

Commlink6 stays the answer key: the corpus is built only from the PDFs.

1. Import every SR6 PDF into one folder of runs: `python -m tools.cl6check import <books file> <runs>`, one line per
   PDF, with the four core printings and the errata included.
2. Trace: `python -m tools.cl6check trace --runs <runs> --out <dir>` writes:
   - `<dir>/cl6-trace.csv`: one row per difference, with names and values. It is for the owner only.
   - `<dir>/cl6-trace.md`: the dates, the counts per family with examples, and the full not-found list.

**Dates.** A book's date is its PDF's own. The tool takes the first of these that applies:
1. the metadata modification date;
2. the creation date.

Either is taken only when it falls in the year the book prints in its © line, or the year after; a later date is a
re-save. Without one, the tool uses the © year with sources.xml's month. Failing that, it uses sources.xml alone.

Books sort by date, then by label. Beginner Box material is context only: it is listed, but never wins.

**Readers.** Each reader adds observations of an object:
- Catalog entries.
- Table rows whose first cell names the object. A first cell that names it with a qualifier is another variant's
  row.
- Stat blocks with no name of their own, under a heading naming the object. A first cell such as `Rating 3` names
  the variant.
- Card stat lines, such as `**DV:** 3P **Mode:** SA` or a vehicle card's bold header row. A card's second
  configuration is left out.
- NPC lines such as `Name [Type, DV 3P, SA/BF, …]`. These are context only.
- Errata statements:
  - `X's Near AR is changed from A to B`: a patch on one attack-rating band of the value before it;
  - `Change … the cost to N¥` under a heading naming the object;
  - `X: Availability N`.

  A qualifier before the name (`Rating 7 Widgets`, `Deluxe-grade Widget …`) makes the statement another
  variant's.
- Section defaults: a general statement above the object ("all / every / each / these … Availability N") in a
  section's intro or a table footnote, one heading level up at a time. It applies to every item under the section;
  the item's own value wins over it.

Another book's text counts only when that book catalogues the object too, or imports nothing (a card deck). Another
book's entry counts only under the object's own name, and in a kind its home book gives it.

**Found objects.** An entry of ours under the object's name is the object even when it prints no field the tool
compares (a mentor spirit, a tradition, a metamagic): it is found, with no fields compared.

**Renamed by stats.** Commlink6 renamed some items by hand (`VI Ace of Cups` for a row printed `Vashon Island (Ace of
Cups)`). A record no name finds is compared by its stats, not its name, with our entries in its own book and kinds that
no Commlink6 record matches (`match.by_stats`). The stats are the compared fields (cost and every other number
formula-aware, at every rating; availability, DV, AR, modes, ammo, Essence, capacity, rating range, defense, the
vehicle stats); categorical fields such as a spell's type, and the quality's sign, tell too little and don't count. A
field agrees only where our entry prints a value, and conflicts only where it prints another one.
- **Strong**: three stats or more agree exactly (two on the record's own page, ±1), none conflicts, and the match is
  unique: one item of ours (its variant rows count as one), no entry another record already matches fits as well, and
  no other missing record of the same book family matches the same entry (unless our row prints several names, `A / B Drone`, and each
  record's name shares a word with its own one of them). It counts as found (family `renamed by stats`), compared with that
  entry. Our printed name stays canonical; Commlink6's is only a search alias.
- **Weak** (one stat, or ties): not counted. The not-found row lists the candidates (`stat`).

The owner's review list, `stat-match-review.csv` (book, page, kind, Commlink6 name, verdict, candidate, agreeing and
conflicting stats; names only, never committed), holds the strong matches first, then the weak candidates.

**Found values.** A field the importer filled from an errata (`<found how="errata">`, importer/sr6/resolve.py) is
read as that errata's observation, dated by it, not the book's.

**Winner.** The winner is the value published last. A reprint of a value its book family already printed keeps the
date that value first appeared. For example, the Hong Kong printing repeating the 2019 text does not make that value
newer than another book's. Only a valid SR6 value wins (owner decision 2026-10-07): a value outside its field's SR6
vocabulary (`importer/sr6/vocab.py`: an action `Complex`, `Simple` or `Free`, an availability's legality `R` or `F`)
is recorded in the chain with why (`Obs.invalid`) and passed over; the latest valid value before it wins (Los Alamos'
`Complex` for Silence falls back to Street Wyrd's `Major`). When no printing is valid the latest stands. The trace
counts these fields (`later value not SR6, passed over`).

**Variant rows.** A record also matches our variant rows (entries printing its name with a qualifier, in the latest of
its home family's books that print one). When one of them agrees with the record on the same fields with fewer
differences than the winners, the record is compared with that row (`compared with a variant row`): Commlink6's one
`Widget` may be our `Widget (Large)`. When no entry prints the record's name itself (only rows with a qualifier: `Claws (Digging)`, `Claws (Razor)`), those rows are its variant rows. A record named with its rating (`X Rating 1`) is compared with the row printing that name, not another rating's row the words read alike.

**Families.** Each difference between Commlink6 and the winner goes to the first family that holds Commlink6's value.
The order of the checks is in trace.py's module docstring. The families:
- own row;
- per-rating or variant row;
- errata sentence;
- section default;
- conversion error (from a page verdict);
- older printing or superseded;
- another book;
- Commlink6 misread (the row above or below, or two adjacent digits swapped);
- heading;
- description sentence;
- another column;
- not found.

A misread is not counted against our accuracy.

**Page verdicts (step 3).** A weak link must be confirmed on the printed page. Weak links are:
- another column;
- a misread backed by one field of the neighbouring row;
- a value one digit off ours.

To confirm one, crop the page (`crops.py`), read it, and record the verdict in the owner's verdicts file:
`{"<src>|<id>|<field>": {"family", "note", "crop"}}`. The file lives outside the repo. Pass it with
`trace --verdicts <json>`.

A verdict sets the row's family, with the note and the crop as its location:
- the page prints Commlink6's number in our item's cell: a conversion error;
- the page prints ours: a Commlink6 misread, unless the page shows another pattern.

A weak link with no verdict goes to not found.

## Reading the report

The report folder holds three files:
- `cl6-report.md`: the summary.
- `cl6-metrics.json`: counts only. This is also the baseline format.
- `cl6-diffs.csv`: one row for each miss, field difference, family gap and extra entry, with names. It is for the
  owner only and is never committed.

The report's sections:
- **Headline.** Completeness is given over three denominators:
  - all English records;
  - the kinds we model;
  - the owned pages. This excludes records with no page in their book, and pages beyond the owned PDF (the
    Dealers of Death preview).

  Accuracy is given twice. Raw counts every difference. "b as printed" counts verified printed differences as
  equal.

  **Commlink6-only** (owner decision): what no book prints is left out of both measures and counted on its own
  line. A record is Commlink6's own (`canon.cl6_only`) when it is a rule setting (rule options), a record it retired
  (`Depreciated …`), or an option row priced at zero that is not for sale (availability 99: a firing mode, a range, a
  pilot rating) or points elsewhere (`Adapter (see …)`), or a record named in German (`… Pfeile (10x)`,
  `… Druckluftkartusche`, `Kalte Munition`: a German-word vocabulary, `canon.GERMAN`; no English book prints it). A
  field is Commlink6's own when ours is empty and the
  printed line shows neither value (the report), or, in the trace (family `Commlink6-only field`), when no reading of
  ours holds the field and no text near the object holds Commlink6's value, or when ours is a readable value and
  Commlink6's one value is printed nowhere in the object's book (its `999999999` cap for a dearer price, no legality
  for a row that prints one). A record whose name the book prints nowhere, made only of a product's words (its
  category and maker) and none of a row's own, is a listing Commlink6 composed from the product's rows (`Cougar Polearm
  (Small)` over the Armsman's Knife, One-hand and Spear): Commlink6-only (`match.bundled`).
- **Completeness by book and by kind.** The gap plan's K1 kinds (actions, packs, ammunition types, mentor spirits,
  vehicle design, data structures, quality paths, spell features, contact types, quality sets, licence types, magic
  types, rule options, senses, true elements) are catalog kinds of ours now (`canon.SECTION_KINDS`), read from the
  books' own sections: their records count in every denominator. An unmodelled kind is a record type none of ours
  maps to.
- **Field families.** For each family, the records where Commlink6 has the datum, and those where ours is equal.
  The families are subtype, skill/spec, social, size/ammo, variants, slots, effects, choices, requires, and
  Commlink6's UI tags counted as data (decision D5): relevance (topics such as MAGICAL or a skill/specialization),
  flags (AUGMENTATION, MATRIX_DEVICE, …) and modonly.

  Ours is read from the elements the gap plan proposes (`subtype`, `skill`/`spec`, `social`, `size`/`ammoClass`,
  `<variant>`, `<slot>`/`<fits>`, `<effect>`/`<test>`/`<grant>`/`<allow>`, `<choice>`, `<requires>`,
  `<relevance topic>`, `<flag>`, `modonly`). They are
  near 0% until those phases land. A weapon accessory's printed MOUNT column already counts as its fits, unless the entry has a `<slot>`/`<fits>` of its own (a vehicle mount's `Under`). `value_keep.json` also keeps ours for a `social` family difference.

  Effects compare as (element, `type:ref`, value). When phase 6 fixes our effect targets, map them in
  `ours.families`.
- **Accuracy by field and by kind**, with the a/b/c split.
- **Causes.** Every miss and every field difference is ranked by count:
  - a missing record is bucketed by where its name sits in the import's `book.md` and `regrouped.md` (gap plan
    §0's buckets);
  - a field difference is bucketed by field, reason and class.
- **Patterns.** For each UI tag, the general features of our entries that predict Commlink6's tagging. A feature is
  never an item name. The features are:
  - kind, category (the printed table or section) and type;
  - a bracketed capacity, and which columns the row prints;
  - words of the name, the category and the description;
  - the skills the description names;
  - Commlink6's subtype.

  Each rule "feature → tag" (or a pair of features) gets a precision, a recall and an F1 score. A greedy union of
  precise rules (precision ≥ 0.75, at most 4) gives the candidate rule set that a later phase implements in the
  importer, so every entry of ours gets the tag. "extras" counts our entries with no Commlink6 record that the set
  would tag. A proxy tag, "addon", marks items that fit a slot and are never implanted; it is the "bought only as an
  add-on" sense, which Commlink6's own `modonly` does not carry.
- **Modifier patterns.** This section is the raw material for the phase 6 effects grammar.
  - Each of Commlink6's modifications becomes a modifier: (path, operator, value, condition).
    - The path starts at the character, the item or its host, and narrows to a part and then a specific target,
      for example `character/roll/skill:perception`, `character/initiative/…-dice-physical` or
      `item/attack-rating`.
    - The operator is one of +, +natural, max, +dice, +edge, grant, allow and so on.
    - The value may be per rating.
    - The condition may be a mode such as wireless, a variant, a choice, or situational.
  - A modifier on a matched record is **aligned** with the first sentence of our description that names its
    target (the game's own words for it) and prints its value (or "Rating" for a per-rating value). That sentence,
    reduced to its skeleton, is a **template**: `{N} dice on {T} tests`, with slots for the target, the value and
    the rating.
  - Each template is run over every description:
    - **precision** is the share of its matches that reproduce a real modifier of that item. The target must come
      from the family's vocabulary, and the number must match when one is printed.
    - **recall** is the share of its family's described modifiers that it reproduces.
  - The coverage lines give the share of Commlink6's modifiers that the top 20 and top 50 templates reproduce.
  - The path vocabulary lists the character → part → specific tree, with counts.
  - Pre-installed gear (`embed`) and the slot hooks belong to the slots and includes families, so they are left
    out of the alignment.
- **Fidelity.** Match stages, page agreement, and our entries with no Commlink6 record. These are for information
  only.
- **Moved since the baseline.** Every percentage that changed.

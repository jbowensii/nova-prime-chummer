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
  (the core rulebook in each city edition) is read from the first run, in name order.
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

## What it does

| module | job |
|---|---|
| `reader.py` | Reads every English record in the jar. Its text is keyed by (prefix, id): `npc.shaman` is not `tradition.shaman`. The text file named like the record's file wins (`core_seattle`, `easycome`). It normalises spelling variants (`val`, swapped `type`/`ref`, boolean spellings). It leaves out German books, `lang="de"` records and records with no English name, and counts them. |
| `canon.py` | Turns a record into our vocabulary: kind (a record type or item type → our catalog kind; types we have no kind for are *unmodelled*), source id, aliases (`Grenade, Party` → `Party Grenade`; the name joined with each variant). Price, availability, essence and capacity are evaluated at each rating, from `$RATING` formulas and per-rating tables, along with the variants' own values. It also builds the field families. |
| `ours.py` | Reads our catalog in the same shape. `value()` reads a printed value the way the engine's `rated()` does. |
| `match.py` | Matches records to entries of the same book, in stages: exact, loose (plurals, punctuation, rating words), no parenthetical, alias, split row (`A / B`), word order, contained (one name's words inside the other's, on a nearby page), fuzzy. A record can match several entries (a parent and its variant rows). Fields are compared against the entry that agrees most. |
| `fields.py` | Per-field comparators. Numbers are compared at every rating. A printed range compares by containment, and a cell printing several values compares by the values it prints. A variant's value counts as a match. Legality is compared apart from the availability number. |
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

**Winner.** The winner is the value published last. A reprint of a value its book family already printed keeps the
date that value first appeared. For example, the Hong Kong printing repeating the 2019 text does not make that value
newer than another book's.

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
- **Completeness by book and by kind.** An unmodelled kind is a gap-plan K1 kind (actions, packs, ammo types,
  mentor spirits, …).
- **Field families.** For each family, the records where Commlink6 has the datum, and those where ours is equal.
  The families are subtype, skill/spec, social, size/ammo, variants, slots, effects, choices, requires, and
  Commlink6's UI tags counted as data (decision D5): relevance (topics such as MAGICAL or a skill/specialization),
  flags (AUGMENTATION, MATRIX_DEVICE, …) and modonly.

  Ours is read from the elements the gap plan proposes (`subtype`, `skill`/`spec`, `social`, `size`/`ammoClass`,
  `<variant>`, `<slot>`/`<fits>`, `<effect>`/`<test>`/`<grant>`/`<allow>`, `<choice>`, `<requires>`,
  `<relevance topic>`, `<flag>`, `modonly`). They are
  near 0% until those phases land. A weapon accessory's printed MOUNT column already counts as its fits.

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

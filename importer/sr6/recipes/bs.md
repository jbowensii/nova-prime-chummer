# SR6 Body Shop (BS): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `bs.py`): 194 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). From PDF page 189 on: the augmentations index (`END_PAGE`, left out).

## Item shapes

- The first chapter's title is no heading: its pages sit under CONTENTS; from PDF page 7 (`CONTENTS_END`) the recipe
  names it. Its optional qualities are level-5 boxes titled `Negative Quality: <name>` with a `Bonus:` line.
- Cyberware, bioware, geneware, nanoware (CHROME LIFE, BUILDING YOUR BODY, CHANGING THE CODE, TAMING THE WILD): the core
  rulebook's shape, descriptions under level-4 headings, priced in a titled catalog table at the end of the section
  (first header CYBERWARE, BIOWARE, SYMBIONT, GENEWARE <group>, TYPE, ITEM, AUGMENTATION, CYBERLIMB …). The table title
  (minus "table") is the category. Headers printed short (`CAP`, `ESS`, `AVAL`, `DAMAGE`) are renamed; TREATMENT TIME,
  POWER and the critter tables' TRAINING/CRITTERJACK REQ. columns go to the text.
- A name-only row over rows that no description has (`Cybertails` over `Balance`, `Prehensile`) names them
  `<group> (<row>)` (`VARIANT_ROWS`, regroup's `_variants`); they share the group's description.
- Each augmentation has its type (`crb.ware_type`, from the table's title, first header or category): cyberware,
  bioware, geneware (the therapeutic and augmentic tables, the critter genetic augmentations), symbionts, transgenics
  (transgenic infusions) and nanoware (nanohives, the nano-critter augmentations).
- Nanotech gear (`ITEM | RATING | AVAIL | COST`) and drugs (`DRUG | POWER | AVAIL | COST (PER DOSE)`) are gear. The
  nanite colonies print a template and a pre-built price: two entries. A drug described with `Vector:`, `Availability:`
  and `Cost:` lines and in no table (EDGE OF ESSENCE) is read from those lines.
- Implant and bioware weapon stats (`MELEE WEAPONS | TYPE | DAMAGE | ATTACK RATINGS`, `WEAPONS | DV | ATTACK RATINGS`):
  weapons.
- Critters (TAMING THE WILD): attribute bands (`B A R S W L I C ESS`) under a heading or a lower-case box title; the
  baseline stat blocks are category critter, the engineered ones augmented critter. A table printed beside a band
  (a 1D6 table, the genetic engineering equipment row) is split from it; the equipment row is gear.
- Cybernetic shells (EDGE OF ESSENCE): headings priced on a `(Cost: …, Availability: …)` tag line, named under the
  heading before them.
- Qualities: level-4 headings with `Cost:` / `Bonus:` lines in Karma (EDGE OF ESSENCE, the first chapter's boxes).
- Implant grades (New and Revised Implant Grades: omega grade, exoware, gammaware, each a level-3 section): grades,
  their factors read from the prose (`x1.1 Essence cost`, `adds ten percent to the base Essence cost`, `0.4 Essence
  multiplier`, `can only be applied to cyberware`); the sections stay rules too. Cybermancy, surgery, drug rules: rule
  sections.

## Formula styles and issues (importer v2)

- `N¥ per dose` (drugs, toxins, nanites), `Rating x N¥ per dose` -> `Q*N`, `Q*(R*N)`, unit dose. `Rating x N¥`,
  `(Rating) x N¥`, Essence `Rating x 0.N`, avail `(Rating + N)(L)` -> `R*N`, `(R + N)`. Capacity `[Rating]`,
  `(Rating/2)`.
- A price naming what it holds (`N¥ + contents`): an `ambiguous` issue stating the rule (`N + base`); the user
  prices the contents.
- Issues: rows printing `*` (a footnote: the single cybereye is priced from the core cybereyes) are `unreadable`;
  rated rows with no range `missing rating`; the colony/kit products printed two to a row keep the first, the
  second product's avail and price unread.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- **A price per unit in the description.** A row with a plain price whose description prices it per length
  (`per ten centimeters`, with a minimum and maximum): `Q*N`, unit `10 cm` (the minimum and maximum stay in the text)
  (`formula.text_unit`).
- A row printing only footnote marks (`*`) whose description prices it off another item (`one half the Essence
  and nuyen cost`, `one half the capacity`): an `ambiguous` issue per field stating the rule (`base*0.5`, `base`)
  (the single cybereye: the base system is the user's to pick).
- Rows by level (`Telescoping modification (Level 1)`, `(Level 2)`): one `tier()` rule where the levels differ
  (capacity `tier(R; 1: 2; 2: 4)`); the same price on each level stays a plain number.

## Table shapes and value styles (importer v2)

- **Thousands point.** A few prices print `1.200¥`: read as 1200 (a point followed by exactly three digits).

## Sections read as kinds (importer v3, sections.py)

- **Qualities:** the bold run-ins under `#### Positive Qualities` / `#### Negative Qualities` (CHANGING THE CODE), each
  with its `• **Cost:** N Karma` line (a label printed again under a heading leaves the rest to the text: regroup).

- **Derived items (sections.py `derived`):** `Transgenics As Bioware` states its rule against the base item
  (`... cost fifty percent more Essence than their bioware equivalent, but cost thirty percent less nuyen`) and lists
  what it applies to (`The following bioware can be imitated through transgenic infusions`, then `Bioware: ...`,
  `Biosenses: ...` lines). Each listed item is an augmentation `Transgenic <item>` with `<formula>`s
  `ref(augmentations:<base>, essence[, R])*1.5` and `ref(..., cost[, R])*0.7`; its type, category, rating range and
  availability are the base's. A listed item the book has no entry for (frog tongues, webbed hands and feet) keeps
  the rule as an `ambiguous` issue. Not yet: `chemical glands and exhalation spray (corrosive spit and fangs,)
  natural venoms`, whose comma sits inside the parentheses.

## Kept table maps (the general table reader, tables.py)

The recipe's map stays: measured, the general reader agrees on 41 of 46 tables. The critter cyberlimb accessories and exoframe modules (no ESSENCE column) are augmentations in the book's filing.

## Commlink6 check (importer v4)

- Stat matching (cl6check): Commlink6 names an endosymbiont variant and a fuel row its own way; their stats find them (2 renames).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Body Shop-Core Augmentation Book-CAT28007.pdf>" --out "%TEMP%\bs-check"

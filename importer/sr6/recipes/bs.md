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
- Implant grades (omega, exoware, gammaware), cybermancy, surgery, drug rules: no catalog kind, rule sections. The
  grade multipliers the app uses are creation settings, not catalog entries.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Body Shop-Core Augmentation Book-CAT28007.pdf>" --out "%TEMP%\bs-check"

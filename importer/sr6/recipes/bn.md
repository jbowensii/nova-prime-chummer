# SR6 Bestial Nature (BN): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `bn.py`, the latest copy): 36 pages, 612 × 765 pt, printed
page = PDF page (`PAGE_OFFSET` 0).

## What the recipe gives the converter and regroup

- Heading sizes (`HEADING_LEVELS`): 27 (chapter), 21, 15, 13 (item; lower case: a table or sidebar title), 9 (tag lines).
  The guess takes the running head (`BESTIAL NATURE`, 40 pt) and the page number (26 pt) on each page's top for
  levels; with the recipe's sizes the page number still reads as a chapter heading (within 5 % of 27).
- `prepare()` (run.py calls it before regroup): drops the running head, the page number and the `PAGE` tab, and joins
  the headings' words the display face's kerning splits (`Si xth`, `SI Ns`, `Smar t`, `A nimalism`) unless the second
  part is a word of the book and the joined one isn't.

## Item shapes

- Chapters: Pack Tactics and Pay Data are fiction (no rules); Sixth World Shifters, Animalism, Shifter Gear.
- The Shifter quality (New Positive Quality: Shifter): one level-4 item a form (furry, scaly, feathery, fins), the
  book's metatype-like option: a positive quality whose karma is its `Minimum Base Cost`; powers, weakness and attack
  stay in its text.
- Positive and negative add-ons (level-4 items under Positive/Negative Add-ons, `Cost:`/`Bonus:`, a few printed
  without bold): qualities named `<name> (Shifter add-on)` (they modify the Shifter quality and share names with the
  core rulebook's qualities); `(1 to N)` gives the levels. The worked examples under them stay a rule.
- Animalism powers (level-3 and level-4 headings under Animalism Powers): metamagics, one a grade as metamagic is one
  an initiation grade.
- Shifter life modules (adult and event, Shifter only): rules for now (the Companion's life-module reading is its own).
- Gear: a `TYPE DEFENSE RATING …` table (barding, smart clothes: armor), an `ITEM AVAIL COST` table (gear), a silver
  bullets box (ammunition), and three drones (a `(Small … Drone)` tag) whose `HAND ACCEL …` tables print out of place
  (one in the next drone's text, one as a box, one under its heading printed again): matched in reading order.

## Formula styles and issues (importer v2)

- `Rating x N¥`, `N¥ + (Rating x N¥)`, capacity `Rating`. Issues: shifter add-on qualities print no Karma
  (`missing karma`), barding prints no rating range.
  (`<formula>` and `<issue>`: docs/sr6-data-format/formulas-and-issues.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Bestial Nature.pdf>" --out "%TEMP%\bn-check"

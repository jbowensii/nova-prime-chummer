# SR6 Smooth Operations (SO): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `so.py`, the latest copy): 178 pages, printed page = PDF
page − 1 (`PAGE_OFFSET`). From PDF page 171 a novel's preview (`END_PAGE`, left out). Heading sizes
(`HEADING_LEVELS`): 60, 21, 15, 13, 9 as the core rulebook's; the guess takes the contents' 11 pt for level 5 and
leaves the 9 pt tag lines (`(Health)`, a face's box title) as text.

## Item shapes

- Spells (MANA-INFUSED MANNERS, Spells): a level-4 heading, its category on a plain text line (`(Health)`), a
  `RANGE TYPE DURATION DV` band in the text. The category line becomes the spell's category (as the core rulebook's
  section names give it). A ritual among them (`(Anchored)`, `Threshold:`): rituals, the tag its keywords.
- Adept powers (`Cost: N PP …`, `Activation:`; `(max N levels)` in the cost gives the levels), metamagics (level-4
  items under Metamagics), mentor spirits (rules: no catalog kind), alchemical preparations (`Formula:`, `Drain Value:`,
  `Cost: N¥/charge`: gear, category alchemical-preps, priced per charge).
- Social gear (SOCIAL SHOPPING): titled tables whose first header names the item (OUTFIT: clothing, owner 2026-10-15: armor entries with no Defense, the SOCIAL RATING column as `social`; ARMOR MOD: armor
  modifications; NAME, FASHION ACCESSORIES, PROFESSIONAL GROOMING SERVICES, ESPIONAGE GEAR: gear by level-2 section),
  the descriptions under level-3 headings (`Uniform (Rating 1-6)`) with a `Game Information` item under each: a row
  takes its section's text and Game Information. A row with no name under a named one is another rating of it
  (`<name> (Rating 3–4)`); a row wrapped onto the next (`Fashion` … `Rating x` + `Statement` … `500¥`) is joined. The
  perfumes' effects table repeats the names (no prices): its rows stay in the text.
- Qualities (MORE THAN A PRETTY FACE): level-3 sections with `Cost:`/`Bonus: N Karma`; `(1 to N)` in the price gives
  the levels, a second price (`13 Karma (6 Karma if …)`) karmaMax. The quality paths' priced steps are qualities too;
  their unpriced steps and the life-path modules are rules.
- Faces (FACES IN THE CROWD): six sample characters, a level-2 section with `Metatype:` and its stat bands in the text:
  sample runners (importer/sr6/archetypes.py, as the core rulebook's archetypes). What they list from the core rulebook
  is found in its catalog as already imported (import it first, or import Smooth Operations again after it); anything
  else is reported unmatched. The band `DR | I/ID | AC | CM` gives the printed initiative, monitors and Defense Rating. The book prints no contact or grunt stat blocks.
- The Shadowland BBS subscriptions (`SUBSCRIPTION AVAIL COST MINIMUM REP`): a rule table.

## Table shapes and value styles (importer v2)

- **A second table of the names.** The perfumes print an effects table and a price table, each with the names
  in its first column: two tables, never one stacked row (the second's first column repeats the first's).

## Formula styles and issues (importer v2)

- Rows by rating band (`Transforming Garment (Rating 1–2)` …) -> one `tier()` rule. `Rating x N¥ (10 uses)`: the
  note set aside -> `R*N`. Avail `Rating/2` -> `R/2`. `N¥ per charge` (preparations) -> `Q*N`.
- `N¥ + Certified Credstick Cost`, `N¥ + Weapon Cost`: an `ambiguous` issue stating the rule (`N + base`: the
  credstick or weapon it is made from is the user's).
- Issues: the preparations print no availability (`missing avail`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Sections read as kinds (importer v3, sections.py)

- **Actions:** the `#### Name` headings under `## Spending Edge on Social Tests` (its Edge boosts).
- **Actions:** `## New Status Edge Actions`, `## Response Edge Actions` and the Edge actions under `Spending Edge on
  Social Tests` (SOCIAL EDGE): each `#### Name`.
- **Mentor spirits:** `#### Name` under `## Mentor Spirits` (MANA-INFUSED MANNERS).
- **Quality paths:** the `Quality Path: Name` headings.

## Recipe hints (importer v4)

- **`VARIANT_ROWS`**: the espionage gear table prints a name-only row (`Explosive Cosmetics`) over the rows it groups
  (`Lipstick`, `Eyeliner`, `Finishing Powder`, `Nail Polish Remover`): each is `Explosive Cosmetics (<row>)`. The group
  ends at the first row of two words or more the book describes under a heading of its own anywhere (`Injector Pen`),
  a rule of regroup's `_variants` for every book with the hint (Body Shop's too).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Smooth Operations-Core Face Rulebook-CAT28009.pdf>" --out "%TEMP%\so-check"

# SR6 Smooth Operations (SO): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `so.py`, the latest copy): 178 pages, printed page = PDF
page − 1 (`PAGE_OFFSET`). From PDF page 171 a novel's preview (`END_PAGE`, left out). The converter's guessed heading
sizes are right.

## Item shapes

- Spells (MANA-INFUSED MANNERS, Spells): a level-4 heading, its category on a plain text line (`(Health)`), a
  `RANGE TYPE DURATION DV` band in the text. The category line becomes the spell's category (as the core rulebook's
  section names give it). A ritual among them (`(Anchored)`, `Threshold:`): rituals, the tag its keywords.
- Adept powers (`Cost: N PP …`, `Activation:`; `(max N levels)` in the cost gives the levels), metamagics (level-4
  items under Metamagics), mentor spirits (rules: no catalog kind), alchemical preparations (`Formula:`, `Drain Value:`,
  `Cost: N¥/charge`: gear, category alchemical-preps, priced per charge).
- Social gear (SOCIAL SHOPPING): titled tables whose first header names the item (OUTFIT: clothing; ARMOR MOD: armor
  modifications; NAME, FASHION ACCESSORIES, PROFESSIONAL GROOMING SERVICES, ESPIONAGE GEAR: gear by level-2 section),
  the descriptions under level-3 headings (`Uniform (Rating 1-6)`) with a `Game Information` item under each: a row
  takes its section's text and Game Information. A row with no name under a named one is another rating of it
  (`<name> (Rating 3–4)`); a row wrapped onto the next (`Fashion` … `Rating x` + `Statement` … `500¥`) is joined. The
  perfumes' effects table repeats the names (no prices): its rows stay in the text.
- Qualities (MORE THAN A PRETTY FACE): level-3 sections with `Cost:`/`Bonus: N Karma`; `(1 to N)` in the price gives
  the levels, a second price (`13 Karma (6 Karma if …)`) karmaMax. The quality paths' priced steps are qualities too;
  their unpriced steps and the life-path modules are rules.
- Faces (FACES IN THE CROWD): six sample characters, a level-2 section with `Metatype:` and its stat bands in the text:
  sample runners (importer/sr6/archetypes.py, as the core rulebook's archetypes); what they list from other books is
  reported unmatched. The book prints no contact or grunt stat blocks.
- The Shadowland BBS subscriptions (`SUBSCRIPTION AVAIL COST MINIMUM REP`): a rule table.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Smooth Operations-Core Face Rulebook-CAT28009.pdf>" --out "%TEMP%\so-check"

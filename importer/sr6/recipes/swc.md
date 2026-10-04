# SR6 Sixth World Companion (SWC): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `swc.py`): 210 pages, 750 × 939 pt, its fonts re-embedded as
Liberation Serif/Sans (no bold face name: labels come out unbolded). Printed page = PDF page − 1 (`PAGE_OFFSET`).

## What the converter needed (sr6-2)

- The two text columns sit about 2 pt apart (less than a word space): rows split where the content stream jumps.
- Bullets are a tiny raised glyph and the labels (`Contact Points:`) a point smaller than their values: rows cluster by
  baseline, a tiny glyph joining the row beside it.
- No header-band tables: the book's tables print as bold text lines, read by the recipe.

## Item shapes

- Life modules (BUILDING A SHADOW, Life Path): the three opening modules are level-5 items under "Starting down the life
  path", their grants in sentences. Adult modules are level-5 items under the level-4 "Choices Life Modules" and "Event
  Life Modules", their grants in bulleted labelled lines (`Choose one: +1 to A, B, or C`, `Resources:`, `Contact Points:`,
  `Contact Types:`, `Knowledge skill (choose N)`). A module heading with a bracket in another font isn't a heading: it is
  a `Name [ X only ]` line in the module before it. The first event's heading reads as a label of the group heading.
  The worked example's sidebar runs into the last event (reported as unread-line).
- Metavariants (TYPES AND SHADOWS, "Creating a Metavariant…"): the attribute-range tables as text, each table's columns
  in pieces: a header of abbreviations, `Name` rows, then number-only rows for the same names under a header of the rest;
  `Racial Traits:` lines (wrapped) under each row. The same tables print earlier in the chapter and in the table index
  (`END_PAGE`); only the summary is read. Karma costs (the development table) are creation settings, not catalog values:
  `metatypeKarma:swc.<id>` in `public/data/sr6/creation-defaults.xml`.
- Qualities (PEOPLE OF EXCEPTIONAL QUALITY, EXPRESS YOURSELF, DARKER ALTERATIONS): a `Cost: N Karma` (positive) or
  `Bonus: N Karma` (negative) line; a block holding several (metagenic qualities) names each by the short title line
  above it. Lifestyle qualities (WHAT YOU GET) cost lifestyle points: rules.
- Critter powers: level-5 items under "New Critter Powers", `Type:`/`Action:`/`Range:`/`Duration:` lines.
- Contacts ((META)HUMAN RESOURCES): `Typical Connection Rating: N`, and a stat band (`B A R S W L I C ESS` over its
  values) with `Active Skills:` as an NPC (group Contact).
- Everything else in the chapters is a rule section; PACKs (SUIT UP) are bundles of other books' gear: rules.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<the Companion PDF>" --out "%TEMP%\swc-check"

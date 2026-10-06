# SR6 Hack & Slash (HS): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `hs.py`): 186 pages, printed page = PDF page − 1
(`PAGE_OFFSET`); the back cover (`END_PAGE`) is left out. Chapter titles at 58–60 pt (the guess reads them), the
fiction's at 27 (`HEADING_LEVELS` makes it a chapter of its own, not read).

## Item shapes

- Matrix gear: tables under a lower-case title (`gizmos`, `commlink apps`, `tools`, `agents`) whose first header names
  the kind of item (`DATA TAP`, `TAG ABUSE`, `COMMLINK HACKS`, `CASE TYPE`, `*_CODEMODS`; `NAME_HEADERS`): regroup pairs
  each row with the level-4 heading of its name, else the recipe gives it the section's labelled line of its name
  (commlink apps) or a heading whose words hold its name (`Agent Box` under `Agent Box Hack`). The first header is the
  category. A row `Rating 1–6` is its header's item (`Agent (Rating 1–6)`); a `RATING` table under a title (`cyberhacks`,
  `cyberkit`) is one entry a rating (`Cyberhacks (Rating 1)`); a name priced at several ratings, a row each, is named
  with its rating. Two tables set side by side print a few rows twice: kept once. Devices (`DATA PROCESSING`,
  `ATTRIBUTES (D/F)`) are electronics, the rest gear; a cyberkit's `COST (RECHARGE)` is its cost and recharge.
- Complex forms (TECHNO TOOLS): level-4 headings with a `Fade Value Duration` line over the two values; the virtual life
  chapter's `Complex Form: …` boxes with `Fade Value:`/`Duration:` labels (two to a line).
- Echoes: the `New Echoes` section's labelled lines (`LABEL_SECTIONS`); cyberprograms the `Basic Cyberprograms` and
  `Hacking Cyberprograms` sections' (programs, typed basic or hacking; the book prints no price for them). Data
  structures, IC (its price table), hosts, foundations and resonance realms: rule sections, as in the core rulebook.
- Sprites (POINTS OF SPRITE): a level-3 section with its `A S D F INIT RES` band and bulleted `Skills:`/`Powers:`.
- Qualities (QUALITY HACKING and the virtual life qualities): `Cost:` or `Bonus:` lines; `(Positive Quality)` dropped.
- NPCs (KNOW YOUR enemy): a box with the stat bands under a `(Professional Rating N)` tag line, or under a heading
  `Name (Professional Rating N)` that reads as the section's tag line; the section is the group.
- The virtual life entities (`A S D F W L I C EDG SPK` bands) have no catalog kind: rule sections.

## Formula styles and issues (importer v2)

- Rows by rating band (`Matrix Relay` 1–3, 4–6, 7–9 and `(Rating 10+)`; modules 1–4, 5–8, `(Rating 9)`): one
  `tier()` rule for cost and avail on every row, the last band open (`10-:`).
- `Commlink cost plus rating x N¥` -> `B + R*N` (B: the commlink it is built from). `N¥ (+N¥ per additional dart)`
  -> `N + N*(Q - 1)`, unit dart. `N¥ per sensor type`, `N¥/pair`, `N¥/glove` -> `Q*N`. `N¥ + program's cost` -> `N + B`.
- Issues: hacks and programs with no avail or price printed (`missing`), rated rows with no range.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Hack & Slash-Core Matrix Rulebook-CAT28006.pdf>" --out "%TEMP%\hs-check"

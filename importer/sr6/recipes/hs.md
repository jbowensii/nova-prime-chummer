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
  `tier()` rule for cost and avail on every row, the last band open (`10+:`).
- `Commlink cost plus rating x N¥`, `N¥ + program's cost`: priced off an item the buyer picks: an `ambiguous` issue
  stating the rule (`base + R*N`). `N¥ (+N¥ per additional dart)` -> `N + N*(Q - 1)`, unit dart. `N¥ per sensor
  type`, `N¥/pair`, `N¥/glove` -> `Q*N`.
- Issues: hacks and programs with no avail or price printed (`missing`), rated rows with no range.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Table shapes and value styles (importer v2)

- **Interleaved two-line headers.** A vehicle table's `SPD` over `INT` and `TOP` over `SPD` come out of the
  converter letter by letter across (`S INP TD`, `T SO PDP`): regroup's `deinterleave` puts them back from the
  vocabulary of two-line headers (`TWO_LINE_HEADERS`).

## Sections read as kinds (importer v3, sections.py)

- **Shared classifier (A5):** the echoes (`### New Echoes`), the basic and hacking cyberprograms and the commlink apps
  (`## Commlink Apps`, type app) are run-ins sections.py reads; the recipe's LABEL_SECTIONS map is gone. The new sprite
  powers (`### Name` under `## New Sprite Powers`) are critter powers.
- **Matrix actions** under a section of another name (`### Movie Matrix Magic!`): a heading whose next heading is a
  Matrix test line (`(Illegal) Cracking + Logic vs. … (Major)`) is an action, its type from that line.
- **Actions:** `### Matrix Actions` (Game Information): each `#### Name`; `#### Edge Actions`: `##### Name (N Edge)`;
  `### AI and EI Actions`.
- **Mentor spirits (paragons):** `#### Name (The Title)` under `### Sample Paragons`; the `Paragon (Positive
  Quality)` heading is the quality, not a paragon.
- **Data structures:** the bold run-ins under `#### Types of Data Structures`.
- **Quality paths:** `## Quality Path: Cyberadept` (its steps: the headings under it).

## Commlink6 check (importer v4)

- Stat matching (cl6check): Commlink6 names a cable spool and a rail gun row their own way; their stats find them (2 renames).
- Section kinds (importer v4): VIRTUAL LIFE's `Inherent Virtual Life Form Qualities` headings are critter powers (a being's inherent qualities are its powers; their Type/Action/Range/Duration are in the prose, not read); POINTS OF SPRITE's `New Sprite Types` headings are sprites.
- Sprite commands (importer v4): POINTS OF SPRITE's `New Sprite Commands` run-ins (under each sprite's heading) are critter powers.
- Stat matching (cl6check): Commlink6 names the two drones one row prints together (`A / B Drone`) with their maker; each shares a word with its own part of the row: 2 renames.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Hack & Slash-Core Matrix Rulebook-CAT28006.pdf>" --out "%TEMP%\hs-check"

## Importer v5

- A heading `X (Positive Quality)` keeps its kind as a tag (`Paragon`): the sections reader makes it a quality (it was
  read as a mentor spirit under `Paragons`).

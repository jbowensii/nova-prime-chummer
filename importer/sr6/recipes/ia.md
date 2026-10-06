# SR6 Ingentis Athletes (IA): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `ia.py`): 17 pages, printed page = PDF page. Headings are set
in Njord, but the guess takes the body's Sabon for the heading font (the commentary is set in Amplitude), so the recipe
gives both (`HEADING_FONT`, `HEADING_LEVELS`): athletes' names at 15 pt, the game information's headings at 15 and 13.
`Game Information` (27 pt) is too close to the page numbers (26) to be a level: the recipe starts that chapter at
`Troll Variants`. Every page opens with the running head (`shadow stock`, `PAGE`, the title and page number): taken out
of the text.

## Item shapes

- Athletes: a Shadow Stock commentary under the athlete's name (15 pt), and the stat block printed as bold text lines,
  not a table: the athlete's name over a `metatype: Troll (…)` line, the `B A R S W L I C EDG [M] ESS` and `DR I/ID AC
  CM MOVE` header lines in bold over their values, then `Skills:`, `Qualities:`, `Augmentations:` or `Adept Powers:`,
  `Gear:` and `Weapons:` lines (wrapped). Read line by line: a block ends at a blank line, the next athlete's name, or
  a line after the weapons that opens no bracket (the commentary going on). NPCs, group Ingentis Athletes (the book
  prints no Professional Rating).
- A weapon in a stat block printed with its price (`N x name [Type, DV …, AR, Avail …, Cost …]`) is a weapons entry
  (`Name (N)`: the price of N).
- GAME INFORMATION (troll variants, their creation rules, the new qualities, which can't be bought): rule sections.
  The commentary isn't read.

## Formula styles and issues (importer v2)

- No formula styles: the book prints plain numbers. A field it leaves empty gets an `<issue>` (missing).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Ingentis Athletes-Supplement-none.pdf>" --out "%TEMP%\ia-check"

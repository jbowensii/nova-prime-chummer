# SR6 Lofwyr's Legions (LL): layout survey

Structure only, no book text. The owner's replaced, readable PDF (SHA-256 in `ll.py`): 25 pages, printed page = PDF
page. Chapter titles at 27 pt (the cover's at 72); the guess takes the running head (`LOFWYR'S LEGIONS` at 32 pt) and the
page number (26) for levels, so `HEADING_LEVELS` gives them. Every page opens with the running head (`shadow stock`,
`PAGE`, the title and page number): taken out of the text.

## Item shapes

- NPCs (THOSE WHO SERVE THE DRAGON): one a page, a level-3 heading with the agent's name, `Metatype:` and
  `Professional Rating N` lines, the bio and quotes, the `B A R S W L I C ESS` and `DR I/ID AC CM MOVE` bands as tables
  and the labelled lists (`Skills:`, `Augmentations:`, `Gear:`, `Weapons:`, `Martial Arts Maneuvers:`, …). The group is
  the chapter. A name hyphenated over two heading lines (`Saeder- Krupp`) is joined.
- Drake qualities (DRAKES, `Positive Qualities`): level-4 headings with `Cost:` and `Game Effect:`.
- Drake powers: the `Basic Drake Powers` and `Dracogenesis Powers` sections' bulleted labelled lines (critter powers,
  `LABEL_SECTIONS`); a label hyphenated over two bold runs (`Thermographic Vi-` / `sion):`) is joined.
- The martial art (NEW MARTIAL ART): a level-3 section closing on `Categories:` and `Signature Technique: <name>.
  <effect>` (the name before the first full stop). It prints no techniques of its own.
- The drake rules, the costs of being a drake and the initiatory group: rule sections. The opening fiction (SCALES)
  isn't read. The book prints no priced gear: the agents' gear and weapons stay their NPCs' lists.

## Formula styles and issues (importer v2)

- No formula styles: the book prints plain numbers. A field it leaves empty gets an `<issue>` (missing).
  (`<formula>` and `<issue>`: docs/sr6-data-format/formulas-and-issues.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Sections read as kinds (importer v3, sections.py)

- **Shared classifier (A5):** the drake powers (`### Basic Drake Powers`, `### Dracogenesis Powers`) are run-ins
  sections.py reads as critter powers; the recipe's LABEL_SECTIONS map is gone.

## Importer v5

- `### The Costs` under `# Drakes` (general, sections.py): its bold run-ins are drawbacks the drake takes, negative
  qualities at Karma 0, granted, category `Drake drawback` (`Memorable`, `Misshapen`, `Most Wanted`, `Mightiest of
  Slaves`); not `Metahuman Quality` (a requirement) nor `Unsteady Hands` (an existing quality it hands out).
- The style's `Signature Technique: Rake. Increase the Damage Value …` line defines the technique: a martial technique
  `Rake` of its own (recipe hint, prepare()).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Lofwyr's Legions.pdf>" --out "%TEMP%\ll-check"

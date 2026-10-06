# SR6 No Future (NF): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `nf.py`): 198 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). From PDF page 166 on: ads, then the Johnson run (an adventure with no stat blocks; `END_PAGE`, left
out). A setting book: its catalog is the GAME INFORMATION chapter; the book prints no NPC or contact with stats.

## Item shapes

- Gear (GAME INFORMATION, New Gear): level-4 headings with their text, priced in small tables under lower-case titles
  (`instruments`, `reporter gear`, `bioware` …), one entry a row. The first header names the table (INSTRUMENT,
  EXOTIC WEAPON, CLUB, BLADES, GRENADES, DEVICE, CLOTHING, TYPE, GROUNDCRAFT, AIRCRAFT, ID AND CREDIT, OPTICAL DEVICES,
  EQUIPMENT, BASIC BIOWARE, CYBEREYES, CYBEREARS, HEADWARE: `NAME_HEADERS`) and gives kind and category (`TABLES`).
- Weapons print Fifth Edition range columns (CLOSE NEAR MEDIUM FAR EXTREME): joined to ATTACK RATINGS; a grenade's
  IMPACT 2M 5M 10M columns to its DV. NOTES and an instrument's DICE POOL EFFECT go to the text; HANDL, SPD INT, TOP SPD
  and a clothing's ARMOR take the core rulebook's headers.
- Variant rows (`Hardened`, `Bladed`, `Monofilament`) are named with their item: the table's title (Rolling Blades),
  else the yo-yo (its table prints untitled, after the torch's text: `UNTITLED`), and take that item's description.
  Rows named by a rating (`Rating 5`) are named with their table (`Cybereyes (Rating 5)`); `Hacked (as above)` with the
  row above in its table and its rating range. The augmentation tables share one title (`bioware`): each is labelled
  by its first header, so only basic bioware is bioware.
- Qualities (New Qualities): level-3 headings with a `Cost:` or `Bonus:` line (`(positive quality)` reads as a caption
  and is dropped). `Bonus: 1 To 20 Karma` is 1 Karma a level up to 20.
- Rules: GAME INFORMATION's other sections (instruments of death, the life modules: Fifth Edition-style modules with
  karma costs, not the Companion's lifepath shape) and BLITZKRIEG BOPS's performing sections (`PERFORMING`: from
  Synthlinks to the Expression Point Exchange); the rest of the book is setting, left out.

## Errata

`No-Future-SR6-errata.pdf` (in the owner's folder) lists SR6 availabilities for the gear printed with Fifth Edition's:
plain values for named entries, applied as recipe data (`ERRATA`; `+1` / `+2` for the synth links, which add to the
instrument's). Not applied (rules, renames or removals, so the import keeps the book's print): the Molotov's Burning
status, the trenchcoat's concealability, the cybereyes and cyberears re-rated 6 and 7, the vision and audio
enhancements removed, autovoice and vocal expansion without ratings and hacked autovoice removed, Stolen Gear's new
rules (0 Karma), the Companion versions of the life modules, the page references.

## Formula styles and issues (importer v2)

- Rows by rating (the advanced cyberware rows) -> `tier()` rules for cost, avail, Essence, capacity. `x2` (twice
  the instrument's price): an `ambiguous` issue stating `base*2`. `Rating x N¥`, avail `(Rating x N)` -> `R*N`.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-No Future-Sourcebook-CAT27453.pdf>" --out "%TEMP%\nf-check"

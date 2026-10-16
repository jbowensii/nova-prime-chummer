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
  The Rolling Blades rows are then split (owner 2026-10-16, nf.json `split`): `Skateboard (Hardened)`, `Skateboard (Bladed)`, `Roller skates (Bladed)`,
  the errata's availabilities on each.
  Rows named by a rating (`Rating 5`) are named with their table (`Cybereyes (Rating 5)`); `Hacked (as above)` with the
  row above in its table and its rating range. The augmentation tables share one title (`bioware`): each is labelled
  by its first header, so only basic bioware is bioware.
- Qualities (New Qualities): level-3 headings with a `Cost:` or `Bonus:` line (`(positive quality)` reads as a caption
  and is dropped). `Bonus: 1 To 20 Karma` is 1 Karma a level up to 20.
- Rules: GAME INFORMATION's other sections (instruments of death, the life modules: Fifth Edition-style modules with
  karma costs, not the Companion's lifepath shape) and BLITZKRIEG BOPS's performing sections (`PERFORMING`: from
  Synthlinks to the Expression Point Exchange); the rest of the book is setting, left out.

## Errata

`No-Future-SR6-errata.pdf` (in the owner's folder) lists SR6 availabilities for the gear printed with Fifth Edition's.
The recipe keeps the book's print; the corpus pass (`importer/sr6/resolve.py`, run after every import) applies the
errata's value statements to this book's entries when the errata PDF is in the library and newer than the book:
- bullets under a heading naming a page (`<Group> p. N` over `● <Variant>: Availability N`): the entry on that page
  whose name holds the bullet's words (`<Group> (<Variant>)`);
- `adds +1 Availability` (the synth links): `+1`, added to the instrument's own;
- `Rating N <A> / <B>: Essence …, Capacity …, Availability …, Cost x¥ / y¥` (the cybersenses): one statement per
  name (`Rating N <B>` for the second), a `/` value pairwise, any other value for both.

The replaced value is kept in a `<found how="errata">` child. Owner decision 2026-10-15: the errata wins, also in the
per-book runs (where the corpus pass cannot see the errata PDF): `overrides/nf.json` carries its numbers as `"gen": "errata"`
rows (docs/sr6-data-format.md, Errata rows): the 6E availabilities, the Trenchcoat's Concealability +2, the cybereyes and
cyberears as ratings 6 and 7 (ids kept), AutoVoice and Vocal Expansion unrated at rating 1, the hacked AutoVoice and the
vision/audio enhancements removed. Stolen Gear's new rules are the engine's (its karma is 0 already; the creation
settings `stolenGearQuality`, `karmaToNuyenRateStolenGear`, `karmaToNuyenMaxStolenGear`, `stolenGearBuyOff`, owner
2026-10-16). The Molotov's Burning 4 (`Also applies Burning 4 status`) is an errata row's `<status name="Burning"
level="4">` (owner 2026-10-16). Not applied (rules): the Companion versions of the life modules, the page references.

## Formula styles and issues (importer v2)

- Rows by rating (the advanced cyberware rows) -> `tier()` rules for cost, avail, Essence, capacity. `x2` (twice
  the instrument's price): an `ambiguous` issue stating `base*2`. `Rating x N¥`, avail `(Rating x N)` -> `R*N`.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Importer v5

- The errata (corpus pass, `resolve.py`) applies its prose statements too: the advanced cybereyes and cyberears
  renumbered (`Rather than being rating 5 and 6 …, these are instead rating 6 and 7 cybereyes and cyberears`: names and
  tier bands, ids kept), `AutoVoice` and `Vocal Expansion` unrated (`no longer have ratings … as if they were rating
  1`: each formula's value at rating 1), and its two life modules in the companion's form (`Teen Diva`, `Event: You
  had Fifteen Minutes of Fame`) added to `nf/lifemodules.xml`.
- `AudioTune` keeps its heading's name `AutoVoice` as a search name (a one-word camel-case name is distinct enough).
- Left: `Replacement instrument` (priced in words in a section's prose), the skateboards and roller skates
  (Commlink6's names from a sentence), `Stolen Gear`'s errata Karma (prose): decisions-pending.md.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-No Future-Sourcebook-CAT27453.pdf>" --out "%TEMP%\nf-check"

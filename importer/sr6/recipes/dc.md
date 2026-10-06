# SR6 Double Clutch (DC): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `dc.py`): 186 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). From PDF page 183 on: the new gear and rules index (`END_PAGE`, left out).

## Item shapes

- Vehicles and drones (HOT RODS & COOL RIDES, ANGRY WATERS, RARE AIR; the drones are its last level-2 sections): a
  level-3 heading with the description (a drone's class on a level-5 tag line under it), then a level-5 box titled
  `<name> (<class>)`. The box prints its headers in pieces: a two-column speed table (`SPD INT | TOP SPD`, or its
  header split over the row: `SPD | TOP` + `INT | SPD`) and a bold header line over a value line; or one wide table
  with headers run together (`BODYARMPILOT`, `SEATAVAIL`) and two values in a cell (`110 22`); or values between bold
  headers (`**HAND** 3/5* **ACCEL** 15 …`). The values always come in one order (handling, accel, speed interval, top
  speed, body, armor, pilot, sensor, seats, avail, cost; a drone prints a dash for seats): read by position, the speed
  pair put back in its place. A box whose values don't come to eleven is reported (missing-value), never guessed.
- The category is the level-2 section (motorcycles, cars … ground/aerial/aquatic/anthroform drones); the aircraft have
  none, so their class in the box title (vtol, rotorcraft, fixed-wing …). A lower-case box title (`krime karrier`)
  reads as a table title, its box joins the box before it (its title lost): each value line after the box's first is
  such a box, named by the aircraft table's row with the same values (its class: the table's class row), else
  reported. A box printed with no title (GTI Revolution) is the level-3 section's own: named by it, its tag the class.
- The aircraft table (first header VEHICLE …, PDF pages 91-92) reprints the aircraft boxes: skipped, but a row no box
  gave (by values or name) is reported, so no aircraft is lost unreported. The DSEC's box has that table run into its
  text: a VEHICLE table is never a speed table, and is left out of the description.
- Vehicle modifications (MAKING IT YOURS): level-4 headings (or level-5 ones under them: hardpoints, tires; `Rating N`,
  `Level N`, `Version N` name a level of the modification above) priced by small tables in their text
  (`MOD SLOTS | RATING`, `AVAILABILITY | COST`; one entry a printed row). Gear, category the level-2 section (chassis,
  skin, powertrain, electronics mods, accessory equipment), with a `slots` attribute (added to the gear XSD for this
  book).
- Catalogs: trailers, weapon mounts, drone racks, expanded drone storage and the mechanical arm (gear; a first column
  that is a size names the row `<item> (<size>)`), the rigger headware (augmentations), the repair facilities (gear).
- Qualities (GEARHEAD ANATOMY): level-3 headings with `Cost:` / `Bonus:` lines in Karma.
- Sample contact (THE GREASE MONKEY WAY): a lower-case box with an attribute band: a contact and its NPC.
- Autosofts: the skills sold as autosofts (Skills Available in Autosoft Format, bulleted `**Skill** (specialization)`
  lines, the ratings in the prose) are programs of type autosoft, unpriced (the core rulebook prices autosofts by
  rating); Language and Knowledge, whose lines set their own ratings, stay in the rules. The e-softs (labelled lines
  run together with other items' text), chases, building a vehicle and repairs: rule sections.

## Table shapes and value styles (importer v2)

- **Stacked bands.** A modification's price tables print `MOD SLOTS | RATING` over `AVAILABILITY | COST`: joined
  into one band by regroup (`_stacked`), read as before.
- **Interleaved two-line headers.** The bold header lines print `S INP TD` / `T SO PDP` (SPD INT, TOP SPD
  interleaved); the boxes read by position, and `regroup.deinterleave` / `shapes.vehicle_band` name them when needed.

## Formula styles and issues (importer v2)

- `N¥ per CF` (trailers, the SPACE column giving the count range) -> `Q*N` with `unit="CF"` (the count range stays in the text: `qty` is the units one price buys). The
  section's sentence pricing open versions at half is an option on the trailers and sidecars (section_options):
  `(Q*N)*(1 - 0.5*opt.open)`.
- `N¥ x Rating`, slots `N x Rating`, `N per level`, `Adds N per level`, `N per Rating point` -> `R*N`. Seats `2/6`.
- Issues: tires and mods printing two prices (`800¥/1,600¥`) or slots `2 or 1 CF` are `ambiguous`; slots `1/3 body
  (rounded up)` and prices `Body x N¥` need the vehicle's Body (no grammar variable): `unreadable`.
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- A part the description prices beside a vehicle (`… the mini-outboard (costs 500¥)`) is an option on its cost:
  `3500 + 500*opt.mini-outboard`.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Double Clutch-Core Rigger Rulebook-CAT28004.pdf>" --out "%TEMP%\dc-check"

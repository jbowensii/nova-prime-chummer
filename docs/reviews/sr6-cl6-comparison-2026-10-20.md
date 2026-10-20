# SR6 ⇄ CommLink6 comparison — 2026-10-20 (live import, main edfc978b)

Analysis only: no code or data changed. Measured with `tools/cl6check` and `tools/cl6effects` against
`commlink6-1.14.0-complete.jar`. Report folders (not committed) are in the session scratchpad under `cmp/`.

## Bottom line

- **Nothing went backwards between 10-19 and 10-20.** Rebuilding the saved import runs (runs26) with the
  edfc978b code gives exactly the 10-19 numbers: 4,476/4,476 complete, 4,307/4,307 accurate with class b,
  class a 0, effects 1,079/1,079. No percentage moved.
- **This is the first time the live production import has been measured, and it scores a bit lower:**
  accuracy 4,301/4,307 (99.86%), 5 class-a records, effects **1,058/1,079 (98.1%)**. The gap does not come
  from a code change. It comes from steps that only a full production "Re-import all" runs (the
  cross-book fill, Current-Printing-only core rulebook, link resolution across books). The per-book runs
  never run those steps, and the gates only look at the runs, so they can't see the gap.
- We cover every English CommLink6 record. We also carry **833 entries from 25 books CommLink6 does not
  cover** (Wild Life alone has 262) and **1,022 more entries inside the books it does cover**. That adds
  up to 598 NPCs, 285 critters and 16 sample runners. CommLink6 has 14 NPC stat blocks and no sample
  runners.

## Numbers against the earlier reviews

| Measure | 10-12 | 10-13/16 | 10-17 | 10-19 (runs, t3final) | 10-20 replay (runs26 + edfc978b) | **10-20 live** |
|---|---|---|---|---|---|---|
| Completeness, English records | 4,226/4,410 (95.83%) | 4,476/4,476 | 100% | 4,476/4,476 | 4,476/4,476 | **4,476/4,476** |
| Accuracy, strict | 89.82% | 4,082/4,307 (94.78%) | 93.17% | 4,049/4,307 (94.01%) | 4,049/4,307 (94.01%) | **4,044/4,307 (93.89%)** |
| Accuracy, class b as printed | 92.0% | 4,304/4,307 (99.93%) | 98.28% | 4,307/4,307 (100%) | 4,307/4,307 (100%) | **4,301/4,307 (99.86%)** |
| Class a (importer error), records | 99 (overstated) | 1 | 80 → 37, all owner-accepted | 0 | 0 | **5** |
| Class b, field rows | – | 275 | 641 | 677 | 677 | 607 |
| Class c, field rows | – | 2 | 0 | 0 | 0 | 2 (1 record) |
| CommLink6-only fields left out | – | 444 | – | 364 | 364 | 295 |
| Class match | – | 2,353/2,353 | – | 2,353/2,353 | 2,353/2,353 | 2,353/2,353 |
| Family rows (structure differences) | – | – | – | 629 | 629 | 626 |
| Our extras in CommLink6's books | – | 1,000 | – | 1,020 | 1,020 | 1,022 |
| Effects parity (1,079 variables) | 0.9% (old metric) | left out | – | 1,079/1,079 | 1,079/1,079 (1,027 strict + 42 book-ruled + 10 placeholder) | **1,058/1,079** (1,007 + 41 + 10) |
| Per-effect modifiers reproduced (informational) | – | – | – | 763/1,575 (48.44%) | 763/1,575 | 768/1,575 (48.76%) |
| Book corrections (`gen="book"` rows) | – | – | – | 347 | 348 | 348 (same code) |

Book corrections, counted by parsing `importer/sr6/overrides/*.book.json` at each commit: fe98baae
(10-18) 378, before Tier 2 362, b4c74b6f (10-19) 347, edfc978b 348. Tier 3 removed 9 rows, added 10 and
changed 21. **The brief expected about 328-338. The files hold 348.** A plain grep gives the same 348.

## What the live import gets wrong that the runs don't (ranked)

1. **Effects: 21 CommLink6 variables lost in production (1,058 vs 1,079).**
   - 19 rows: effects that depend on structure an override adds. In `importer/sr6/run.py` `_read`,
     `effects.apply` runs (line 150) **before** `overrides.apply` (line 152). The rockets' `<variant
     name="Missile">` comes from a family row (`crb.json:600/605`). So when the effects are read on a fresh
     import, the Missile-variant rule (`effects.py:2863` reads `<variant>`) finds nothing.
     - Lost: the "Missile variant" +2 AR / +Rating dice on 6 CRB rockets and the Foamtek rocket (13 rows),
       Ballista HE bolt DV (1), Double Clutch Standard Armor accel/speed (2), No Future instruments and
       External synth (3).
     - I confirmed the cause for the rockets. The other 6 follow the same pattern (the structure arrives
       through an override) but I didn't trace them line by line.
     - The gate misses it because `tools/cl6effects/rebuild.py` re-runs `effects.apply` on saved runs
       that already hold the override's kids.
   - 2 rows: the Companion's "See X, p. NN, SR6" qualities link to **themselves** in production. Five
     have `ref="swc.<own id>"`: Dermal Deposits, Astral Beacon, Impaired, Low-Light Vision, Thermographic
     Vision. That means `copy_links` copies nothing, and Dermal Deposits and Astral Beacon end up with no
     effects. Likely cause: `effects.py:2900-2901` takes this book's own same-named id before the book
     the citation names. In the replay these links point to `crb.*`.
   - The External synth book-ruled key no longer fits (book-ruled 41, not 42).
2. **Class a, 5 records:** Double Clutch e-softs (Crash and Burn, Emergency Override, Reroute Signal,
   Run Silent Run Deep, Slim Jim). The production cross-book pass (`resolve.library`, `<found
   how="corpus" source="CRB" page="271">`) gives them `Rating x 500` / `Rating` but no rating range.
   cl6check counts a per-rating price with no range as class a (`arbitrate.py:195`). CommLink6 says
   1–9. The same pass fills 64 Hack & Slash / Double Clutch program prices that now equal CommLink6's.
   That's why class b fell 677 → 607 and the CommLink6-only fields fell 364 → 295. Owner call: store
   the range, or rule it.
3. **Wrong cross-book fill (class c):** Street Wyrd's *Climbing Gear* (p. 92, an alchemical
   preparation) takes availability `1` from the Core Rulebook's mundane Climbing gear (p. 279). That's
   the same name but a different item. Before this the book printed none (class b). CommLink6 has 6/L.
4. **Uzi IV has no skill/spec and no slots.** The family row is keyed to `uzi-v` (`crb.json:647`), the
   city-edition name. Live keeps only the Current Printing, which prints Uzi IV (with alias `crb.uzi-v`).
   The runs merge the older printings, so the gate never sees it. The Current Printing run already logs
   `override: 7 id rows found no entry (weapons.xml:uzi-v, …)`.
5. **Duplicate life module:** live No Future has both "You had Fifteen Minutes of Fame" and "Event: You
   had Fifteen Minutes of Fame" (both p. 3). The runs have one.
6. **Ritual Spellcasting** now has two Core entries in live (the focus `crb.foci.ritual-spellcasting`,
   p. 155, and the formula `crb.ritual-spellcasting`, p. 168). CommLink6's record now matches the
   formula, which has no effects. That's 1 family row.

Live is better than the runs in a few places. The Firing Squad errata gets applied: Ares Arms Vigorous AR
`1/9/11/9/6` (the runs had the misread `1/19/…`), Colt Secret Agent ammo `6(cy)`, Ares Scylla `7S(e)`.
Hydraulic jacks also gets a rating `1–6`.

## What we cover that CommLink6 does not

| | Count |
|---|---|
| Books CommLink6 has no data for | 25 books, 833 entries: Wild Life 262, 30 Nights 89, Explosive Decompression 82, Lethal Harvest 44, Johnson 'Dex 38, Scotophobia 38, CRB Hong Kong 33, The Third Parallel 33, Free Seattle 24, Risks & Rewards 22, State of the Art 2084 22, and 14 smaller |
| Those 833 by kind | NPCs 317, critters 211, weapons 63, contacts 60, gear 49, vehicles 29, critter powers 29, qualities 27, actions 24, armor 11, augmentations 11, other 2 |
| Extras inside CommLink6's 25 books | 1,022: NPCs 265, augmentations 132, life modules 93, gear 73, critters 71, contacts 64, qualities 62, spirits 52, weapons 40, quality paths 31, critter powers 29, vehicle design 25, other 85 |

## What CommLink6 has that we lack

- **No English book record is missing (100%).** What we leave out is CommLink6's own material:
  - German-rules duplicates (`lang="de"`, about 300 records).
  - 158 Companion life modules and 25 priority-table rows that have no English name in the jar.
  - 15 Astral Ways true elements with no English name.
  - 5 retired records.
  - 4 rule options, which we model as the app's rule presets.
- **Structure CommLink6 carries and we only partly match:**

  | Family | Match |
  |---|---|
  | variants | 210/241 (87%) |
  | choices | 236/249 (95%) |
  | modonly | 21/22 |
  | skill/spec | 322/325 (Uzi IV is one) |
  | whole-entry effects family | 187/756 (24.7%, the old strict metric; the 1,079-variable parity above is the one the owner tracks) |

## Sample runners, NPCs and critters (live)

| What | Ours (live) | CommLink6 |
|---|---|---|
| Sample runners | 16: Core 10 archetypes, Smooth Operations 6 | none |
| NPC grunts / contacts | 479 / 119 (598) | 12 NPCs (Core 11, Firing Squad 1) and 3 contacts |
| Critters | 285 | 2 (Core: Barghest, Basilisk) |
| Spirits / sprites | 62 / 10 | 10 spirit types / 15 sprite records (10 Hack & Slash + 5 Core, some repeated) |
| Total NPC/critter characters on the server | 955 | – |

The 955 NPC and critter characters by source: Wild Life 181, Astral Ways 72, Core 59 (+Hong Kong 8,
Seattle 4, Berlin 3), 30 Nights 55, Kechibi Code 50, Collapsing Now 45, Firing Squad 34, Slip Streams 34,
The Third Parallel 32, Body Shop 31, Tarnished Star 29, Companion 26, Free Seattle 24, and 22 more
sources with 22 or fewer. Every CommLink6 NPC, critter, spirit, sprite and contact record is matched.

## How it was measured (and its limits)

- **Live:** cl6check `--ours` on a scratch tree. Its `custom/sr6/imported` is a junction to the live
  copy, and its `library/sr6/<run>` points at runs26's `original.pdf` / `book.md` (the same PDFs, for the
  PDF check). The live export has no `texts/`, so I used runs26's (this only affects per-unit count
  ranges and modifier alignment). Live has 55 sources (54 plus the empty Character Conversion Guide) and
  6,448 entries, the same as runs26. Two per-source counts differ: CRB weapons 130 vs 131 (Uzi V) and NF
  life modules 3 vs 2 (the duplicate).
- **Live effects:** the cl6effects evaluator (`pairs.build` + `evaluate`) run directly on the live
  tree, with no rebuild.
- **Replay:** `python -m tools.cl6effects --tree <git archive edfc978b> --runs .extract/cl6check-runs26`.
  Then cl6check on the rebuilt runs, against the 10-19 baseline `.extract/cl6check-t3final`.

## Suggested next steps (owner's call)

1. Make the effects gate measure what production does. One option: run the dependent effect rules after
   `overrides.apply` (or re-read the entries an override gave a `<variant>`/structure). Another: have
   `rebuild.py` strip override-added kids first, so the gate reads 1,058 until that's fixed.
2. Stop `see_links` resolving a cited book's entry to this book's own id. A citation `SR6` should win
   over a same-named local id.
3. Rule on the 5 DC e-soft rating ranges and the Street Wyrd Climbing Gear fill.
4. Re-key the `uzi-v` family row (and the other 6 rows the Current Printing log reports) to the Current
   Printing ids, and drop the duplicate NF life module.
5. Add a periodic cl6check of the live export next to the runs check, because these production-only
   steps don't show up anywhere else.

## After this PR (fix/sr6-live-import-gaps)

A new gate reproduces the live import on this machine: `python -m tools.cl6check import --library` imports all 74
books into one library, in order, the way the server's Re-import all does (docs/cl6check.md, "The production import
gate"). On main (edfc978b) it gives exactly the live numbers above. On this branch (`.extract/cl6check-runs27`):

| Measure | Live / main, library import | This branch, library import |
|---|---|---|
| Effects parity | 1,058/1,079 (1,007 + 41 + 10) | **1,079/1,079** (1,027 strict + 42 book-ruled + 10 placeholder) |
| Completeness | 4,476/4,476 | 4,476/4,476 |
| Accuracy, strict | 4,044/4,307 (93.89%) | **4,050/4,307 (94.03%)** |
| Accuracy, class b as printed | 4,301/4,307 (99.86%) | **4,307/4,307 (100%)** |
| Class a | 5 | **0** |
| Class c | 1 record | **0** |
| Our extras | 1,022 | 1,021 |

The replay gate still gives 1,079/1,079 on main and on the branch, with 0 rows that differ.

What changed, item by item:

1. **Effects read on the override's structure** (`importer/sr6/run.py`, `read_effects`). The override rows now give each
   entry its structure first: a family row's variants and slots, a class row's class, renames. Then the effects are read.
   Then the rows' own effects and drops are applied. Entries an override adds are still read separately, after the
   others. This brings back all 19 rows: the Missile variants, the Ballista HE bolt, Double Clutch Standard Armor, and
   the No Future instruments and External synth. The External synth book-ruled key fits again.
2. **Citations of another book win** (`effects.py`). `See X, p. NN, SR6` links to `crb.x` even when this book has its
   own entry named X. Before, it linked to that entry, which is itself. All five Companion qualities now link to the core
   rulebook. Dermal Deposits and Astral Beacon get their effects copied.
3. **A per-rating price brings its rating range** (`resolve.py`, the cross-book fill). The Double Clutch e-softs get
   `1–9` from the Autosoft row along with `Rating x 500`. This clears the 5 class-a records.
4. **The fill no longer crosses kinds of thing** (`resolve.py`). It skips a same-named entry whose class TYPE is
   different. Street Wyrd's Climbing Gear (MAGICAL) no longer takes the core rulebook survival gear's availability.
   Only one other name-based fill exists in the live library: Deadly Arts' Buzzsaw from Body Shop. It is the same class
   and is still filled.
5. **Uzi IV**: `crb.json` has a family row for the Current Printing's id `uzi-iv` next to the City Editions' `uzi-v`. The
   Uzi now gets Firearms/Submachine Guns and its three slots. Of the other six rows the Current Printing log reports:
   - The two Sim module rows lose nothing. Their entries come from the older printings, which already carry them.
   - `foci.ritual-spellcasting` applies in a library: `same_ids` gives the Current Printing's focus that id.
   - `skillsofts` matches no entry in any printing.
   - `laser-sight` and `periscope` are ambiguous between kind files in every printing.

   None of these four is a live-only gap, so they are left as they are.
6. **No Future's duplicate life module**: an errata's module whose name, without its `Event:` kicker, is one the book
   already has is not added again (`resolve.py`).
   - **Not changed: Ritual Spellcasting.** The City Editions print a `Ritual Spellcasting | 3L | 1,000¥` row in the
     FORMULAE table on p. 169. The Current Printing drops it. Under the owner's rule (older printings fill what the
     latest lacks), the formula is correctly added beside the focus. Commlink6's "Ritual spellcasting focus" still
     matches the focus, so it counts as one extra, not a split. Owner's call if it should go.

Still open, and the same on main: the whole-entry effects family (the old strict metric) reads 182/756 here, as in the
replay. The library import on main read 187, because the 5 entries above had no effects to compare. Per-effect
modifiers read 763/1,575, the replay's number. The Cat mentor's book row logs an unmatched drop in every fresh import
of the core rulebook (main too; the replay doesn't show it). The result is the same either way.

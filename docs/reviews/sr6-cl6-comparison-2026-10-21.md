# SR6 ⇄ CommLink6 final data quality report — 2026-10-21 (production import, PR #137)

Measured with `tools/cl6check` and `tools/cl6effects` against `commlink6-1.14.0-complete.jar`, on a fresh
production import of all 78 books: the 74 of the earlier reviews plus Seoul Survivor, the Sixth World Missions
Guide, Adversary and Los Alamos: Cicada Whisper. The import ran with `python -m tools.cl6check import --library`,
the server's Re-import all, one library, with PR #137's code. The two lists are in
[sr6-cl6-final-analysis-2026-10-21.md](sr6-cl6-final-analysis-2026-10-21.md), regenerated on the same import.

## Bottom line

- **Every gate holds on the production import.** Completeness is **4,474/4,474**. Accuracy is **4,307/4,307**
  with class b as printed (4,050/4,307 strict, 94.03%). Class a (importer errors) is 0. Effects parity is
  **1,079/1,079** (1,027 strict + 42 book-ruled + 10 placeholders). Class match is 2,353/2,353. The replay gate,
  main against this branch, reads 1,079/1,079 on both with 0 rows differing.
- **CommLink6's 24 "Misc. (US)" records are now all ours.** 20 come from the books (Seoul Survivor 14, Missions
  Guide 4, Adversary 2), read by the general recipe under the books' own names, with CommLink6's names as search
  aliases. The 4 hitches are CommLink6-only entries (a forum post, no book). That takes list 1 of the final
  analysis from 915 to **891**. Nothing in it is a book item we leave out.
- **Cicada Whisper has no CommLink6 data.** We read its 26 stat blocks (25 NPCs, 1 critter). None of them is a
  reprint of a CommLink6 record. Three need a reader fix (see its section).
- **Owner fixes in this PR:** Samsung Jind-O (the book prints Jind-0), Type 81 availability 2 (the book prints
  2(F)), and official sources only for the readers (the hitches are carried as CommLink6-only entries).

## Numbers against the earlier reviews

| Measure | 10-17 | 10-19 (runs, t3final) | 10-20 live | 10-20 after #91 (library import) | **10-21 production import, #137** |
|---|---|---|---|---|---|
| Books imported | 74 | 74 | 74 | 74 | **78** |
| Completeness, English records | 100% | 4,474/4,474 | 4,474/4,474 | 4,474/4,474 | **4,474/4,474** |
| Accuracy, strict | 93.17% | 4,049/4,307 (94.01%) | 4,044/4,307 (93.89%) | 4,050/4,307 (94.03%) | **4,050/4,307 (94.03%)** |
| Accuracy, class b as printed | 98.28% | 4,307/4,307 (100%) | 4,301/4,307 (99.86%) | 4,307/4,307 (100%) | **4,307/4,307 (100%)** |
| Class a (importer error), records | 80 → 37, all owner-accepted | 0 | 5 | 0 | **0** |
| Class b, field rows | 641 | 677 | 607 | – | **608** |
| Class c, field rows | 0 | 0 | 2 (1 record) | 0 | **0** |
| CommLink6-only fields left out | – | 364 | 295 | – | **296** |
| Class match | – | 2,353/2,353 | 2,353/2,353 | – | **2,353/2,353** |
| Family rows (structure differences) | – | 629 | 626 | – | **629** |
| Our extras in CommLink6's books | – | 1,020 | 1,022 | 1,021 | **1,025** |
| Effects parity (1,079 variables) | – | 1,079/1,079 | 1,058/1,079 | 1,079/1,079 | **1,079/1,079** (1,027 strict + 42 book-ruled + 10 placeholders) |
| Per-effect modifiers reproduced (informational) | – | 763/1,575 (48.44%) | 768/1,575 (48.76%) | – | **763/1,575 (48.44%)** |
| Book corrections (`gen="book"` rows) | – | 347 | 348 | – | **348** |
| CommLink6-only entries (`gen="cl6only"` rows) | – | – | – | 19 | **23** (the 4 hitches added) |
| Final analysis, list 1 (CommLink6 records no book prints) | – | – | – | 915 | **891** |
| Final analysis, list 2 (our changes to CommLink6's data, each with its reason) | – | – | – | 516 | **516** |

Accuracy and class b count the same 4,307 matched records as before. The new books add no English CommLink6
record (their CommLink6 data is the Misc. (US) set, which the comparison leaves out), so the denominators do not
move. Class b is 608 field rows, one more than the 10-20 live count, and every one is a value the book prints.

## What changed in this PR

| Book | Records now read from the book | How |
|---|---|---|
| Seoul Survivor (SSV) | Major Dokkaebi, Minor Dokkaebi (metatypes, 9 ranges each, racial traits); Concealment (Self), Cosmetic Control (Dokkaebi) (critter powers); Bujeok; Faraday Pocket; Type 81 “Gwisin” and its version with suppressor; Samsung Jind-O and its Sporting breed; Kwonsham Dream Genie (avail and seats now read); Polymer Composite (ammo type, AR −2); Ghost in the Shell, Spirits, Be Gone | the general recipe's reading rules: bracketed stat lines, cost-first price lines, a development table set as text, a header gluing two columns, priced versions in prose, an ammo type under its heading |
| Sixth World Missions Guide (SRMG) | Grenade of ferrous metal, of gold, of silver, of wood | a price list set as text lines |
| Adversary (ADV) | Adversary (mentor spirit); the Turbobunny Special Ford Americar (already read) | a mentor spirit printed on its own |
| Double Clutch (CommLink6's forum post) | Hitches: Trailer Hitch, Universal Connector, Fifth Wheel, Construction Equipment | `gen="cl6only"` entries (official sources only for the readers) |
| every book | a re-import drops the book's own files the new reading no longer writes (stale NPC, critter, sample runner files stayed before) | `run._prune` |

Scotophobia's Mr Grey CWV gains its body 20 and armor 20 (the glued `BODARM` column, read by the same rule).
The before/after run of the reader changes over all 67 PDFs of the Shadowrun 6e folder found no other book
changed. The override rows added after it (the Type 81 fix, the hitches, the aliases) touch only Seoul Survivor,
the Missions Guide, Adversary and Double Clutch.

## What we cover that CommLink6 does not

| | Count |
|---|---|
| Books CommLink6 has no comparable data for | 28 books, 873 entries: Wild Life 262, 30 Nights 89, Explosive Decompression 82, Lethal Harvest 44, Johnson 'Dex 38, Scotophobia 38, CRB Hong Kong 33, The Third Parallel 33, Cicada Whisper 26, Free Seattle 24, Risks & Rewards 22, State of the Art 2084 22, and 16 smaller (Seoul Survivor 18, Missions Guide 4 and Adversary 2 among them: CommLink6 has those in its Misc. (US) set, which the final analysis matches, 24/24) |
| Those 873 by kind | NPCs 332, critters 216, weapons 65, contacts 60, gear 55, vehicles 33, critter powers 31, qualities 29, actions 24, armor 11, augmentations 11, metatypes 2 |
| Extras inside CommLink6's 25 books | 1,025 |

## What CommLink6 has that we lack

- **No English book record is missing (100%).** List 1 of the final analysis is CommLink6's own material:
  German-only books, German-rules copies, records with no English name, retired records, rule settings (our rule
  presets) and its own inventions (the optional package, option rows, table cells). The Misc. (US) group, 24
  records on 10-20, is now empty.
- **Structure CommLink6 carries and we partly match** (unchanged from 10-20):

  | Family | Match |
  |---|---|
  | variants | 210/241 (87%) |
  | choices | 236/249 (95%) |
  | modonly | 21/22 |
  | skill/spec | 323/325 |
  | whole-entry effects family | 182/756 (24.1%, the old strict metric; the 1,079-variable parity above is the one tracked) |

## Sample runners, NPCs and critters (production import)

| What | Ours | CommLink6 |
|---|---|---|
| Sample runners | 16: Core 10 archetypes, Smooth Operations 6 | none |
| NPC grunts / contacts | 494 / 119 (613) | 12 NPCs and 3 contacts |
| Critters | 290 | 2 |
| Spirits / sprites | 62 / 10 | 10 spirit types / 15 sprite records |

Against 10-20 live (479 / 119 grunts and contacts, 285 critters): the 5 more critters are Cicada Whisper's 1 and
Seoul Survivor's 4. Cicada Whisper adds 25 NPCs; the grunt count is 15 higher, so the other books' grunts are 10
lower than on 10-20 live, from reader changes merged since then (not traced here).

## Cicada Whisper (Los Alamos: Cicada Whisper, LACW) against CommLink6

- CommLink6 datasets for this book: none (the jar's English books: 23).
- Our import: 197 entries, 171 of them rule sections; catalog entries 26: npcs 25, critters 1.
- 0 of the 26 catalog entries carry the name of a CommLink6 record from another book (a reprint); the rest are this book's own, which CommLink6 does not have.

Entries CommLink6 has no record for: Patrolling Earth Spirit (critters, p. 11); OFFICE CLERK (npcs, p. 7); Los Alamos Security Spider (npcs, p. 7); Los Alamos Police Officer (npcs, p. 15); Mateo “Teo” Vigil (npcs, p. 22); Rafaela “Rafi” Vigil (npcs, p. 22); Tomas “Bent Stick” Lomaquaha (npcs, p. 22); Koshari Polecat Enforcer (npcs, p. 22); Koshari Trail Guide, “Stone Spur” (npcs, p. 23); Koshari Outrider, “Switchback” (npcs, p. 23); Koshari Horse (npcs, p. 23); Los Alamos Security Patrol Sergeant (npcs, p. 23); Los Alamos Security Patrol Rider (npcs, p. 23); Los Alamos Security Cyber-Horse (npcs, p. 24); Totavi Checkpoint Gate Guard (npcs, p. 24); Los Alamos Security Awakened Shaman (npcs, p. 24); Los Alamos Security Decker (npcs, p. 24); Los Alamos Security Rigger (npcs, p. 25); Elena “Manitas” Córdova (npcs, p. 25); “Mamba” (npcs, p. 25); Mamba’s Trained Hell Hound (npcs, p. 26); “Cutter” (npcs, p. 26); Rinat “Foreman” Valeev (npcs, p. 26); Vera “Spindle” Kovalyova (npcs, p. 26); Maksim “Sledge” Orlov (npcs, p. 27); Alsu “Tack” Sagitova (npcs, p. 27).

`lacw compare: 26 catalog entries, 0 with a CommLink6 record, 0 CommLink6 datasets`

What this comparison found for a reader fix (not done in this PR):
- **Koshari Horse**, **Los Alamos Security Cyber-Horse** and **Mamba’s Trained Hell Hound** are animals read as
  NPCs. Each block prints a `Gear:` line (the cyber-horse also `Augmentations:`), and the general recipe files a
  block with gear or augmentations as an NPC even when it prints `Powers:` (the horse and the hell hound do).
- **OFFICE CLERK** keeps the book's capitals: the reader capitalises a box title printed in lower case, and leaves
  one printed in capitals as it is.

## Open items for the owner (final analysis)

The final analysis lists **100** open items. 76 are the 10-20 ones, unchanged. The 24 new ones are one row per
Misc. (US) record, all of the "a book of ours prints it by name: confirm" kind. They are the records this PR
reads from Seoul Survivor, the Missions Guide and Adversary, plus the 4 hitches, as the owner directed on
2026-10-21. Confirming them needs nothing but a yes.

## How it was measured (and its limits)

- **Production import:** `python -m tools.cl6check import --library books78.txt .extract/cl6check-runs29 --md-from
  .extract/cl6check-runs26`. All 78 books exit 0. Then the four books whose override rows gained CommLink6's names
  as aliases (Seoul Survivor, Missions Guide, Adversary, Double Clutch) were re-imported into the same library with
  `python -m importer sr6 run … --reuse`, as the server's single-book re-import does.
- **Measures:** `python -m tools.cl6effects --fresh .extract/cl6check-runs29`; `python -m tools.cl6check --ours
  .extract/cl6check-runs29 --out .extract/cl6check-runs29-report` (with the PDF check);
  `python -m tools.cl6check.final_analysis --ours .extract/cl6check-runs29 --printings .extract/cl6check-runs26
  --doc docs/reviews/sr6-cl6-final-analysis-2026-10-21.md`, then `--check` (counts reconcile: ok).
- **Replay gate:** `python -m tools.cl6effects --tree . --base <git archive of main 63b6c894> --runs
  .extract/cl6check-runs26`: 1,079/1,079 on both, 0 rows differ, 0 unmatched drops.
- **Cicada Whisper:** `lacw_compare.py` (in the owner's claude-scripts) matches every entry we read, by
  normalised name, against every English CommLink6 record in the jar.
- The final analysis now matches a Misc. (US) record by an entry's aliases as well as its name (CommLink6's names
  are aliases of the books' entries), so the books' own names can stay.
- **Limit:** the live server has not been re-imported with this code. That is the deploy after the merge.

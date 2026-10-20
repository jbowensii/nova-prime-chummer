# SR6 ⇄ CommLink6: the final analysis — 2026-10-20

The owner asked for this last. It holds two lists and a plan:

1. everything in CommLink6 that none of our 74 source books prints;
2. every change we made to CommLink6's data, with the reason for each one;
3. a plan for a CommLink6 data module.

The overrides were made because the books print them, not to reach 100%. List 2 shows where each one comes from.

The lists and every count below come from `python -m tools.cl6check.final_analysis`. It reads the CommLink6 jar
(`commlink6-1.14.0-complete.jar`), the production import of all 74 books (`.extract/cl6check-runs28`: main 538d4915,
`cl6check import --library`), the per-book runs for the older core rulebook printings (`.extract/cl6check-runs26`), and
the owner's files (`tools/cl6check/value_keep.json`, `relocated.json`, `optional_package.json`, `class_accept.json`,
`tools/cl6effects/bookruled.json`, `cl6placeholder.json`, `importer/sr6/overrides/*.json`). To rebuild it:

```
python -m tools.cl6check.final_analysis --ours .extract/cl6check-runs28 --printings .extract/cl6check-runs26
python -m tools.cl6check.final_analysis --ours .extract/cl6check-runs28 --printings .extract/cl6check-runs26 --check
```

`--check` recomputes every count and prints `counts reconcile: ok` when they match the totals table below. It takes
about a minute.

## In plain English

- **CommLink6 has 915 records that none of our books prints.** None of them is a book item we left out. Here is what
  they are:
  - **300** come from 10 German-only books (State of the Art 2081–2083, Berlin 2080, Feuerläufer, Alpen and others).
    These have no English edition.
  - **311** are German-rules copies of records we already have from the English books.
  - **201** have no English name at all: 158 Companion life modules, 25 priority-table rows, 15 Astral Ways true
    elements and 3 others. We read these from the English books themselves.
  - **5** are records CommLink6 retired itself ("Depreciated").
  - **4** are CommLink6's rule settings. The app has them as its rule presets.
  - **70** are CommLink6's own inventions:
    - 21 constructs (the optional package);
    - 16 option rows priced at 0 or marked not for sale;
    - 33 table cells it turned into records (`SS(1-2)`, `16 km`, `Pilot 5`).
  - **24** come from CommLink6's "Miscellaneous (US)" dataset: Seoul Survivor 14, Shadowrun Missions Guide 4, SR6 forum
    posts 4, Adversary 2.
- **CommLink6 also has 296 field values that no book prints** (list 1b). Most are powers' action, range, duration
  and type (151) and availabilities (89).
- **We changed CommLink6's data in 516 places.** Each one has a reason:
  - **312 field values** where the book prints ours:
    - 266 the printed page shows;
    - 40 the owner ruled on (2026-10-17), each with its page;
    - 5 where the Current Printing differs from the City Edition CommLink6 follows;
    - 1 erratum.
  - **49 structure differences** the owner kept as ours (variants, social rating, prerequisites).
  - **50 effects**: 40 book-ruled and 10 CommLink6 placeholders.
  - **3 classes.**
  - **101 relocations**: the record is in our data under the book's own name, or in the book that prints it.
  - **1 retired record kept** (the latest Firing Squad still prints it).
- **The data module (section 3):** offer the 21 constructs, and move the 19 option rows and German-named ammo out of the
  book catalog into the module. Ask whether the owner owns Seoul Survivor, the Missions Guide or Adversary. If he
  does, import them as books. If not, put their 20 records in the module. Leave out everything else: the German
  books, the German copies, the records with no English name, the retired records and the table cells.
- **Things only the owner can settle** are listed at the end: 76 open items, plus 4 findings about the tools.

## How the lists are built

- **List 1** comes from three places:
  - every jar record that `tools/cl6check/reader.py` leaves out (German-rules copies, no English name, retired);
  - the jar's books the reader skips (the German-only `de_*` books and `other_us`). A `other_us` record that one of our
    books prints under the same name is listed for the owner to confirm, not in list 1 (Age of Rust's Buzzard Transit);
  - every English record the comparison matches only through the optional package, a `gen="cl6only"` row, a rule
    preset, or as a table cell.

  Every other English record (4,397 of the jar's 4,474) is matched to an entry of ours from a book.
- **List 1b** holds the field differences that cl6check leaves out as CommLink6-only: the book prints neither value.
- **List 2** holds every class-b field difference cl6check finds on the production import, and every row of the owner's
  files that makes ours differ from CommLink6. Each row gets one class:
  - **owner ruling**: a `value_keep.json` verdict (2026-10-17, with its page and reason), an effects ruling
    (2026-10-18), an owner relocation, or an owner structure keep;
  - **errata**: the value came from an errata (`<found how="errata">` or a `gen="errata"` row);
  - **latest printing**: an older core rulebook printing's own import agrees with CommLink6 on that field, and the
    Current Printing prints ours;
  - **book prints ours**: the page prints our value. Either the owner checked the page text (value_keep.json `keep`,
    2026-10-14) or cl6check's PDF check reads it on the page.
- **Override rows that bring ours to CommLink6's data are not changes to CommLink6.** There are 2,009 family rows,
  751 class rows, 88 value rows, 53 effect rows and 30 owner rows. They are counted in the table at the end of the
  generated part.

## 3. The CommLink6 data module: plan (a recommendation, no code)

### What to offer

| Content | Records | Offer? | Why |
|---|---:|---|---|
| Optional-package constructs: the drake types, Krime Rave Complete, Reduce Seating, Machinist console, Matrix Signal Scanner, Cougar Polearm ×2, Transgenic hearing, Nissan Spurs, Ritual formula, Nartaki 2, the fuel/gas ammo ×3, Krime Spare Drum, Inu with better suit, MEMS Scabbard, AAA zone | 21 | **Yes** | They are items a builder can use. The owner already decided to ship them as `commlink6-sr6-optional` (2026-10-13, docs/sr6-cl6-optional-package.md). |
| Option rows we now carry **in the book catalog** as `gen="cl6only"`: Adapters ×4, Crew Served ×3, Uses N Energy ×6, M-TOC Fob, AR Interface, Mil-Spec Weapon Mount | 16 | **Yes, and move them** | No book prints them as items, but today they sit under CRB/DA as if a book did. |
| German-named Dealers of Death ammo (`Pfeile`, `Druckluftkartusche`, `Kalte Munition`), also `gen="cl6only"` in the book catalog | 3 | **Move them; offer with English names only if the owner wants** | Same as the row above, and no English book names them. |
| Misc. (US): Seoul Survivor 14, Missions Guide 4, Adversary 2 | 20 | **Import as books if the owner owns them; else offer** | These are published products. A book import is the normal, accurate path. |
| Misc. (US): SR6 forum "items forgotten in Double Clutch" (hitches) | 4 | **Offer, flagged house content** | Forum posts, not a book. |
| CommLink6's values for fields no book prints (list 1b) | 296 values | **Later, as an opt-in fill layer** | It only fills an empty field and never replaces a printed one. This needs a loader feature (see step 7). |
| German-only books | 300 | No | No English edition, German names, not among the owner's books. |
| German-rules copies | 311 | No | Copies of records we have from the English books. |
| No English name (life modules, priority rows, true elements) | 201 | No | German-only text of content we import from the English books. |
| Retired records | 5 | No | CommLink6 itself replaced them. |
| Table cells made records | 33 | No | They are values on our rows already. |
| Rule options | 4 | No | They are the app's rule presets already. |

### How it would ship

- **One optional pack, outside the book import.** It goes in its own folder (for example
  `custom/sr6/modules/commlink6/`) with its own `index.xml` and `sources.xml`. It is never part of
  `custom/sr6/imported/`. cl6check and cl6effects read only `imported/`, so the SR6 accuracy numbers can't move. A test
  should keep it that way.
- **Built from the owner's jar, never committed.** The repo holds no CommLink6 data (docs/cl6check.md). The pack is
  generated on the owner's machine from the jar, the way cl6check reads it on every run. A new tool
  (`python -m tools.cl6check module --out <folder>`) would read the record list (`optional_package.json`, extended with
  the moved rows) and write the pack. It is deployed to tower04 with the rest of `custom/`.
- **Format: the normal SR6 catalog XML** (docs/sr6-data-format.md: `sr6:data` per kind, the same schemas). It has one
  source, `CL6`, with `canon="false"` and publisher "CommLink6 (Genesis data)". The app already treats a non-canon source
  as house content (compendium.ts, the export's `canon`). Each entry keeps the book and page CommLink6 cites in an
  optional `cites` attribute (for example `DA p47`). That attribute needs a one-line `common.xsd` addition. Names are
  English only.
- **Flagged and off by default.** A Table setup switch (`cl6Extras`, default off) loads the pack after `imported/` and
  before `edits/`. A runner who takes a CL6 item records source `CL6`, so the sheet and the export show it as
  non-book.

### Steps

1. The owner approves the table above, and answers the Misc. (US) question.
2. Extend `optional_package.json` with the 16 option rows and the 3 German-named ammo rows. Then remove their
   `gen="cl6only"` rows from `importer/sr6/overrides/{crb,da,dod}.json`. Before removing them, check that no family or
   effect row points at those ids. cl6check keeps counting them as matched through the package, so completeness stays
   the same.
3. Add the `cites` attribute to `common.xsd`, and a `CL6` source with `canon="false"`.
4. Write the generator from the jar to the pack folder, with a test on an invented jar, as `test_cl6check.py` does.
5. Add the loader and the Table setup switch, with a test that cl6check's `ours.load` never reads the module folder.
6. Generate the pack, deploy it to tower04 and check it in the builder.
7. Later, only if the owner wants it: a fill layer for the list 1b values. This is a new `<fill kind id field value/>`
   overlay that the loader applies only to an empty field.

The 30 `gen="owner"` rows took CommLink6's rating ranges where the book prints none (2026-10-17). They are list 1b
values that already sit in the book catalog. If the owner wants the book catalog to hold only what the books print, they
move to the fill layer in step 7. Today they are owner rulings, and they are not changed here.

## Open items and findings for the owner

The generated table at the end lists the 76 open items:
- 7 hold rows: 5 still differ, 2 no longer do and can go;
- 68 `keep` rows that no longer settle any difference (harmless, can be pruned);
- 1 Misc. (US) record to confirm (Buzzard Transit = Age of Rust's).

Findings about the tools:

1. **Fixed in this PR: cl6check counted two records twice.** The jar has 4,474 English records, but earlier reports
   read 4,476. The Cougar Polearm (Small) and (Large) were in both `optional_package.json` (`optional`) and
   `relocated.json`, and `compare()` made a result for each.
   - The pair now stays only in the optional package. CommLink6 composed each record from several of the book's rows
     (docs/cl6check.md, `match.bundled`), and the relocation pointed at one of them, `da.knife`.
   - `compare()` now refuses a record that is in both lists.
   - Re-measured on runs28: completeness 4,474/4,474, owned pages 4,422/4,422, accuracy 4,050/4,307 strict and
     4,307/4,307 with class b, class a 0. Effects stay at 1,079/1,079.

   Items 2–4 are not fixed here; each is an owner call.
2. **The `latest printing` class rests on the per-book runs of 2026-10-19** (runs26, made before PRs #91/#92). The 5
   rows it finds are the Control Rig price, Ultrasound sensor price, Mirrored Persona duration, and Fairlight Excalibur
   and Shiawase Cyber-6 availability. In each one the Berlin City Edition prints CommLink6's value. They are worth a
   look by eye.
3. **The effects class is read from each ruling's own note.** A note that names the owner or the effects review counts
   as an owner ruling; any other note counts as "book prints ours".
4. **Of the 266 field rows classed "book prints ours", 265 rest on the owner's 2026-10-14 check of the page text**
   (value_keep.json `keep`). One rests only on cl6check's automatic PDF check. The `why` column says which is which.

The generated part follows.

<!-- final_analysis: generated from here -->

Generated by `python -m tools.cl6check.final_analysis` from `commlink6-1.14.0-complete.jar` and the import `cl6check-runs28`, the older core rulebook printings from `cl6check-runs26`. Do not edit by hand: re-run it.

### Totals

| count | n |
|---|---:|
| `list 1: Commlink6-invented or house content` | 70 |
| `list 1: German-only books` | 300 |
| `list 1: German-rules duplicates` | 311 |
| `list 1: no English name` | 201 |
| `list 1: other` | 24 |
| `list 1: retired or legacy` | 5 |
| `list 1: rule options` | 4 |
| `list 1: total` | 915 |
| `list 1b: total` | 296 |
| `list 2 by class: book prints ours` | 380 |
| `list 2 by class: errata` | 1 |
| `list 2 by class: latest printing` | 6 |
| `list 2 by class: owner ruling` | 129 |
| `list 2: classes` | 3 |
| `list 2: effects` | 50 |
| `list 2: field values` | 312 |
| `list 2: kept records` | 1 |
| `list 2: relocations` | 101 |
| `list 2: structure kept as ours` | 49 |
| `list 2: total` | 516 |
| `open items` | 76 |

### List 1: Commlink6 records in none of our books

#### German-only books (300)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| de_alpen | item | `ares_murmeltier` | Ares Victory Murmeltier | 28 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `avalance_airbag` | Lawinenrucksack | 28 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `hiking_gear_base` | Wanderausrüstung, Einfach | 26 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `hiking_gear_complete` | Wanderausrüstung, Vollständig | 26 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `ski_base` | Ski | 28 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `ski_smart` | Victorinox SmartSki | 28 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `snow_googles` | Schneebrille | 27 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `snow_shoes` | Schneeschuhe | 28 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `spin_alpin` | Spin Alpin NotFaltGleiter | 26 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | item | `thermo_clothing` | Thermokleidung | 27 | a German-only book (de_alpen); no English edition among our books |
| de_alpen | mentorspirit | `bergsteiger` | Bergsteiger | 20 | a German-only book (de_alpen); no English edition among our books |
| de_berlin2080 | item | `altmayr_sp` | Altmayr SP | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `altmayr_white_star` | Altmayr White Star | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `baer_e_sperber` | BÆR E-Sperber | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `baer_schlachtkreuzer` | BÆR Schlachtkreuzer | 178 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `barzani_ak_47m1` | Barzani AK-47M1 | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `bessere_dreckskarre` | Bessere Dreckskarre | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `drecks_van` | Drecks-Van | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `dreckskarre` | Dreckskarre | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `e-rikscha` | E-Rikscha | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `haka_mp2` | HaKa MP2 | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `haka_skorpion` | HaKa Skorpion | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `junkdog` | Junkdog | 180 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `kuznechik` | Kuznechik | 181 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `rattenbike` | Rattenbike | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `ruhrmetall_selket` | Ruhrmetall Selket | 182 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `samopal_vz88v` | Samopal vz/88V | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `sorokin_g9` | Sorokin G9 | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `sorokin_predator_i` | Sorokin Predator I | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `tuk_tuk` | Tuk-Tuk | 177 | a German-only book (de_berlin2080); no English edition among our books |
| de_berlin2080 | item | `volkskomm` | Volkskomm | 176 | a German-only book (de_berlin2080); no English edition among our books |
| de_feuerlaeufer | item | `fire_als694` | Feuerwehr Airbus ALS-694 | 22 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_axe` | Feuerwehraxt | 14 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_breather` | Feuerwehr Atemschutzausrüstung | 15 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_c1100` | Feuerwehr Lockheed C-1100 | 22 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_cityprotector` | Feuerwehr Trikon Cityprotector | 18 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_dachshund` | Feuerwehr Ruhrmetall Dachshund | 21 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_drachenodem` | Feuerwehr Drachenodem | 26 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_eisvogel` | Feuerwehr Trikon Eisvogel | 23 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_ex_grenade` | Feuerwehr Löschgranate | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_extinguisher` | Löschkanone | 23 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_fighter_suit` | Feuerwehr-Einsatzkleidung | 14 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_flf_muc` | Feuerwehr FLF MUC 1BX | 20 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_hellhound` | Feuerwehr VW Höllenhund | 18 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_helmet` | Feuerwehr-Schutzhelm | 14 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_leopard` | Feuerwehr Löschpanzer Leopard III LPZ | 21 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_octocopter` | Feuerwehr Octocopter | 24 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_protector` | Feuerwehr Protector | 25 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rescue_battery` | Feuerwehr Ersatzakku für Rettungsgerät | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rescue_cutter` | Feuerwehr Rettungsschere/-schneider | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rescue_cylinder` | Feuerwehr Rettungszylinder | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rescue_sp20` | Feuerwehr Sprungpolster SP20 | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rescue_sp80` | Feuerwehr Sprungpolster SP80 | 16 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_rover` | Feuerwehr Rover R1 | 24 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_ruhrort_fire` | Feuerwehr Ruhrort Fire II | 22 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_sintro` | Feuerwehr Sintro 3000 DLAK 30/12 | 19 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_stairs` | Spezialgerät (Drehleiter) | 19 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_unimog` | Feuerwehr Unimog 442 | 20 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_feuerlaeufer | item | `fire_x_rescue5` | Feuerwehr Versatile-X Rescue-5 | 24 | a German-only book (de_feuerlaeufer); no English edition among our books |
| de_other | item | `altmayr_black_moon` | Altmayr Black Moon | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `ammo_bolt_hunting` | Bolzen, Jagd | 29 | a German-only book (de_other); no English edition among our books |
| de_other | item | `ammo_bolt_shattering` | Bolzen, Carbon-Splitter | 29 | a German-only book (de_other); no English edition among our books |
| de_other | item | `animal_whistle` | Scientek Tierabwehrpfeife | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bedna` | Bedna-Sensor | 29 | a German-only book (de_other); no English edition among our books |
| de_other | item | `best_friend` | Der beste Freund (Hundedrohne) | 8 | a German-only book (de_other); no English edition among our books |
| de_other | item | `black_mamba_drone` | Black Mamba | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_a550` | BMW A550 Greifenklaue | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_biber` | BMW Biber | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_blitzen_2080` | BMW Blitzen 2080 | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_ggx` | BMW GGX Sandleopard | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_t2000g` | BMW T 200 G Schneemobil | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_t2000gs` | BMW T 200 G(S) Schneemobil | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_wasserschwein` | BMW Wasserschwein | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `bmw_x_infinity` | BMW X Infinity | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `cmt_clip_mini_z3` | CMT Clip Mini Z3 | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `crossbow_hunting` | Jagdarmbrust | 29 | a German-only book (de_other); no English edition among our books |
| de_other | item | `cuddle_cat` | Kuschelkatze | 8 | a German-only book (de_other); no English edition among our books |
| de_other | item | `distance_alert` | Microtronics Engineering Abstandswarner | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `drink_boom` | Boom Promo-Edition | 4 | a German-only book (de_other); no English edition among our books |
| de_other | item | `drink_ipsum` | Ipsum Energy | 4 | a German-only book (de_other); no English edition among our books |
| de_other | item | `drink_vitmoe` | Vitmoe | 5 | a German-only book (de_other); no English edition among our books |
| de_other | item | `duct_tape` | Homehelper verstärktes Allzweckband | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `duffle_bag` | Shiawase Sports Duffelbag | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `duffle_bag_deluxe` | Shiawase Sports Duffelbag Deluxe | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `emc_2073_catcher` | EMC 2073 Catcher | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `enso_instaward` | Enso Instaward | 8 | a German-only book (de_other); no English edition among our books |
| de_other | item | `flackermann_frosty` | Flackermann Frosty Eisspray | 18 | a German-only book (de_other); no English edition among our books |
| de_other | item | `freeze_bag` | Happy Shopper E-Freeze Shopping Bag | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `gm_bumblebee` | GM-Nissan Bumblebee | 12 | a German-only book (de_other); no English edition among our books |
| de_other | item | `grendel_cleaner` | Grendel Vollwaschmittel mit Bleiche | 21 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hanseat` | HK G13 A1M Hanseat | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_223bw` | HK 223BW | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_223bw-t` | HK 223BW-T | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_223c` | HK 223C | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_223cplus` | HK 223C "Commando" | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_223la` | HK 223 "Long Assault" | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_g12a4` | HK G12A4 | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_mp75` | HK MP75 | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hk_mr223` | HK MR223 "Hunter" | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `hyperion` | C-360 Hyperion | 7 | a German-only book (de_other); no English edition among our books |
| de_other | item | `isdn2` | Alice (Kabelmatrix Emulator) | 17 | a German-only book (de_other); no English edition among our books |
| de_other | item | `kaercher_pressure_cleaner` | Kärcher Hochdruckreiniger | 21 | a German-only book (de_other); no English edition among our books |
| de_other | item | `karls_heli` | Karls Kombat Helikopter | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `katydid` | Messerschmitt-Kawasaki Katydid VI | 5 | a German-only book (de_other); no English edition among our books |
| de_other | item | `kawei` | KawEi | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `kkm` | Karl Kombatmage Kanonen Kumpel App | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `leuna_c4k` | Leuna Typ C4K | 7 | a German-only book (de_other); no English edition among our books |
| de_other | item | `leuna_h2a` | Leuna Typ H2A | 9 | a German-only book (de_other); no English edition among our books |
| de_other | item | `m-k-revolution` | Messerschmitt-Kawasaki R/Evolution | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `magic_glitter_rx2000` | RX2000 Lackiersystem | 6 | a German-only book (de_other); no English edition among our books |
| de_other | item | `magic_glitter_scent` | Magic Glitter Scent | 6 | a German-only book (de_other); no English edition among our books |
| de_other | item | `mercedes_multimog-d1` | Mercedes Multimog-D1 | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `mercedes_multimog-k4` | Mercedes Multimog-K4 "Greif" | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `merlin` | Enfield Merlin Mk II | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `meta_link_lumio_now` | Meta Link Lumio Now | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `microtronics_electronics` | Microtronics Precision Tool | 10 | a German-only book (de_other); no English edition among our books |
| de_other | item | `microtronics_engineering` | Microtronics Engineering Multitool | 10 | a German-only book (de_other); no English edition among our books |
| de_other | item | `mixcoatl_ii` | Hawker-Siddeley Mixcoatl II | 5 | a German-only book (de_other); no English edition among our books |
| de_other | item | `mk_jagdhund_ii` | Messerschmitt-Kawasaki Jagdhund II | 3 | a German-only book (de_other); no English edition among our books |
| de_other | item | `monobe_hpi4` | Monobe HPI-4 | 9 | a German-only book (de_other); no English edition among our books |
| de_other | item | `mt-barrakuda` | Marine Technologies Barrakuda | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `multi_purpose_grease` | Flackermann Organisches Allzweckfett | 21 | a German-only book (de_other); no English edition among our books |
| de_other | item | `nano_stain_remover` | Putzfix Nano Fleckenentferner | 21 | a German-only book (de_other); no English edition among our books |
| de_other | item | `odorax` | Odorax Multiload | 8 | a German-only book (de_other); no English edition among our books |
| de_other | item | `onotari_ks_x` | Onotari Arms Pressure KS-X | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `pet_playing_ball` | Haustierfreund Spielzeugball | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `pipe_free` | Grünfrosch Rohrfrei | 21 | a German-only book (de_other); no English edition among our books |
| de_other | item | `plastic_drone` | Plastikdrohne | 18 | a German-only book (de_other); no English edition among our books |
| de_other | item | `prolife_mask` | Prolife Filtermaske | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `qore_intensiv` | Qore Micro Intensiv Deo | 18 | a German-only book (de_other); no English edition among our books |
| de_other | item | `quadzilla` | Quadzilla | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `rain_hoodie` | Très Chic Citéline Regenhoodie | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `renraku_fastload` | Renraku Fastload 1600 | 10 | a German-only book (de_other); no English edition among our books |
| de_other | item | `renraku_rush` | Renraku Ultimate 400 Rush | 7 | a German-only book (de_other); no English edition among our books |
| de_other | item | `rheingold_elegance` | Rheingold Elegance | 12 | a German-only book (de_other); no English edition among our books |
| de_other | item | `ruhrmetall_murmillo` | Ruhrmetall Murmillo | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `ruhrmetall_thraex` | Ruhrmetall Thraex | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `ryoko_kohai` | Shiawase Ryoko-Kohai | 12 | a German-only book (de_other); no English edition among our books |
| de_other | item | `shiawase_kagizume_s79` | Shiawase Kagizume S79 | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sleeper_tag` | Geheimdienst-Schläfer-RFID | 16 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sony_cyclops` | Sony Cyclops | 20 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sony_serviceable` | Renraku/Sony Serviceable | 13 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sony_x_eco4` | Sony Economically-4 | 3 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sony_x_reliable4` | Sony Reliable-4 | 3 | a German-only book (de_other); no English edition among our books |
| de_other | item | `sony_x_reliable4_police` | Sony Reliable-4 Polizeiversion | 3 | a German-only book (de_other); no English edition among our books |
| de_other | item | `steyr_ucrp_with_bayonet` | Steyr UCRP mit Bajonett | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `steyr_ucrp_with_shotgun` | Steyr UCRP mit Schrotflinte | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `steyr_ucrp_with_taser` | Steyr UCRP mit Taser | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `suzuki-watersport` | Suzuki Watersport | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `trading_card` | Captain Corporate Trading Cards | 22 | a German-only book (de_other); no English edition among our books |
| de_other | item | `tusk_musk` | Tusk Musk | 6 | a German-only book (de_other); no English edition among our books |
| de_other | item | `walter_p118` | Walter P118 | 2 | a German-only book (de_other); no English edition among our books |
| de_other | item | `walter_secura_superkompakt` | Walter Secura Superkompakt | 1 | a German-only book (de_other); no English edition among our books |
| de_other | item | `wifi_briquette` | Flackermann Funkbriketts | 19 | a German-only book (de_other); no English edition among our books |
| de_other | item | `wirtz_sw64t` | Wirtz SW64-T Atlas | 1 | a German-only book (de_other); no English edition among our books |
| de_other | quality | `route_to_fame` | Chance zum Ruhm | 27 | a German-only book (de_other); no English edition among our books |
| de_other | quality | `spotlight` | Ein Magnet fürs Rampenlicht | 27 | a German-only book (de_other); no English edition among our books |
| de_piraten | item | `dreizack` | Saeder-Krupp Dreizack | 23 | a German-only book (de_piraten); no English edition among our books |
| de_piraten | item | `lkb_t3` | Ruhrmetall Luftkissen-Landungsboot LKB-T3 | 22 | a German-only book (de_piraten); no English edition among our books |
| de_piraten | item | `lz74` | Luftschiffbau Zeppelin LZ-74/M8-Auto | 23 | a German-only book (de_piraten); no English edition among our books |
| de_piraten | item | `scx_hunt` | Yamaha SCX Hunter | 23 | a German-only book (de_piraten); no English edition among our books |
| de_piraten | item | `selkie` | Kalmaar Selkie | 22 | a German-only book (de_piraten); no English edition among our books |
| de_piraten | item | `umea` | Saab Umeå-Klasse | 2 | a German-only book (de_piraten); no English edition among our books |
| de_revierbericht | item | `dassault_paynalion` | Dassault Paynalion | 163 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `golf_gti_basic` | VW Golf GTI 2080 (Basis) | 163 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `golf_gti_duel` | VW Golf GTI 2080 (Autoduellist) | 163 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `krim_ultra` | Krime Ultra Kombat | 161 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `man_wyvern` | MAN Wyvern's Sprawl (Link-Bus) | 178 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `myrmidon` | Saeder-Krupp Myrmidon | 165 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `myrmidon_helmet` | Saeder-Krupp Myrmidon Helm | 165 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `rabotti` | Rabotti-Overall | 161 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `underground_helmet` | Grubenhelm | 162 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `wirtz_sw11` | Wirtz SW11 BaseControl | 161 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `wirtz_sw31` | Wirtz SW31 DemoControl | 161 | a German-only book (de_revierbericht); no English edition among our books |
| de_revierbericht | item | `wirtz_sw64` | Wirtz SW64 CritterControl | 161 | a German-only book (de_revierbericht); no English edition among our books |
| de_sota2081 | item | `altmayr_mtr_3` | Altmayr MTR 3 | 5 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `altmayr_spx_2` | Altmayr SPX2 | 6 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `chrysler-nissan_packer_m` | Chrysler-Nissan Packer M | 22 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `donnerbuechse` | Donnerbüchse | 10 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `glock_drachentoeter_ii` | Glock Drachentöter II | 7 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `hoch_tief_geomatik` | Hoch-Tief Geomatik | 27 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `mercedes_clk_170t` | Mercedes CLK 170 T (Normale Sitze) | 20 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `mercedes_clk_170tt` | Mercedes CLK 170 T (Trollsitze) | 20 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `mercedes_wsr290` | Mercedes W-SR 290 "Wesir“ | 21 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `messerschmitt-kawasaki_mantikor` | Messerschmitt-Kawasaki Mantikor | 19 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `messerschmitt_kawasaki_heuschrecke_2` | Messerschmitt-Kawasaki Heuschrecke 2 | 29 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `messerschmitt_kawasaki_hugin` | Messerschmitt-Kawasaki Hugin | 26 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `messerschmitt_kawasaki_hugin_echt` | Messerschmitt Kawasaki Hugin (Lebensnah) | 26 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `messerschmitt_kawasaki_katzenhai` | Messerschmitt-Kawasaki Katzenhai | 23 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `mitsuhama_fed_ii` | Mitsuhama Fed II | 30 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `monochrom_mulatschak` | Monochrom Mulatschak | 24 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_mammutbuechse` | PJSS Mammutbüchse | 11 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_mammutbuechse_bipod` | PJSS Mammut Zweibein | 11 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_mammutbuechse_clip` | PJSS Mammut Ersatzmagazin | 11 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_mammutbuechse_imaging_scope` | PJSS Mammut Zielfernrohr | 11 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_mammutbuechse_laser_sight` | PJSS Mammut Lasermarkierer | 11 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_modell_75` | PJSS Modell 75 | 12 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `pjss_modell_75_iii` | PJSS Modell 75 III | 12 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_sfm_11m_smart` | Ruhrmetall SFM-11M (Smart) | 15 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_sfn_11m_laser` | Ruhrmetall SFM-11M (Laser) | 15 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_sfp_9m_laser` | Ruhrmetall SFP-9M (Laser) | 9 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_sfp_9m_smart` | Ruhrmetall SFP-9M (Smart) | 9 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_skarabaeus` | Ruhrmetall Skarabäus | 25 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `ruhrmetall_smk_252` | Ruhrmetall SMK 252 | 16 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `shiawase_kurina_162` | Shiawase Kurina 162 | 28 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `steyr_ucr` | Steyr UCR ohne Unterlauf-Schrotflinte | 13 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `steyr_ucr_with_shotgun` | Steyr UCR mit Unterlauf-Schrotflinte | 13 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `walther_secura_ii` | Walther Secura II | 8 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | item | `walther_securion` | Walther Securion | 14 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `autobahn` | Autobahn | 31 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `badger` | Dachs | 31 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `elektromarder` | Elektromarder | 31 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `fuchs` | Fuchs | 31 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `gezeiten` | Gezeiten | 32 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `heinzelmaennchen` | Heinzelmännchen | 32 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `moewe` | Möwe | 33 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `murmeltier` | Murmeltier | 33 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `myst_waechter` | Mystischer Wächter | 33 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `robbe` | Robbe | 33 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `rotkaeppchen` | Rotkäppchen (SOTA 2081) | 34 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `steinbock` | Steinbock | 34 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2081 | mentorspirit | `storch` | Storch | 34 | a German-only book (de_sota2081); no English edition among our books |
| de_sota2082 | item | `altmayr_black_moon1` | Altmayr Black Moon 2082 | 14 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `altmayr_black_moon2` | Altmayr Black Moon 2 | 14 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `altmayr_sp_classic` | Altmayr SP 2082 | 16 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `altmayr_spx` | Altmayr SPX | 16 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `altmayr_spx_4` | Altmayr SPX4 | 16 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `bmw_sparkler` | BMW Sparkler | 17 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `emc_pepper` | EMC Pepper R | 19 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `hk_urban_assault` | HK Urban Assault | 9 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `hk_urban_enforcer` | HK Urban Enforcer | 7 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `hk_urban_fighter` | HK Urban Fighter | 6 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `hk_urban_fighter_ccs` | HK Urban Fighter mit CCS | 6 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `hk_urban_striker` | HK Urban Striker | 8 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `jena_mewero` | Jena Robotik MeWeRo | 24 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `kanalboot` | Kanalboot | 20 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `krupp_AD1` | Krupp AD1 Netz | 12 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `krupp_AD2` | Krupp AD2 Netz | 12 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `krupp_AD3` | Krupp AD3 Netz | 12 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `krupp_ad` | Krupp Netz | 12 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `krupp_kd447` | Krupp Munitions KD447 | 12 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `messerschmitt_kawasaki_aevian` | Messerschmitt-Kawasaki Aevian | 25 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `messerschmitt_kawasaki_aevian_echt` | Messerschmitt-Kawasaki Aevian-R | 25 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `messerschmitt_kawasaki_jagdschrecke` | Messerschmitt-Kawasaki Jagdschrecke | 26 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `mk_jagdhund` | Messerschmitt-Kawasaki Jagdhund | 27 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `onotari_pressure_ksx` | Onotari Arms Pressure KS-X 2082 | 15 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `onotari_sdbc_3P` | Onotari SDBV-3P | 10 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `onotari_sdbc_3S` | Onotari SDBV-3S | 10 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `ruhrmetall_flugscheibe` | Ruhrmetall Flugscheibe | 22 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `ruhrmetall_hovawart` | Ruhrmetall Hovawart | 23 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `ruhrmetall_wolfsspinne` | Ruhrmetall Wolfsspinne | 28 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `vw_impuls5` | Volkswagen Impuls 5 | 18 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `walther_esg1` | Walther ESG-1 | 13 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `walther_esg_battery` | Walther ESG-1 Ladebatterie (100x) | 13 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `walther_esg_taser` | Walther ESG-1 Taser Munition (10x) | 13 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `walther_mpk5` | Walther MPK5 | 11 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | item | `walther_mpk5+` | – | – | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `architect` | Architekt | 29 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `dobermann` | Dobermann | 29 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `grosser_bruder` | Grosser Bruder | 29 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `hahn` | Hahn | 29 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `hecht` | Hecht | 29 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `jaeger` | Jäger | 30 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `luchs` | Luchs | 30 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2082 | mentorspirit | `wilde_jagd` | Wilde Jagd | 30 | a German-only book (de_sota2082); no English edition among our books |
| de_sota2083 | item | `ammo_sfw_30` | Spezialmunition SFW-30 (10x) | 7 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `aquadyne_lateralis` | Aquadyne Lateralis | 11 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `blaser_conqueror` | Blaser R11 Conqueror | 6 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `bmw_ggx_civil` | BMW GGX Sandleopard (Zivil) | 15 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `bmw_vt5` | BMW VT5 | 12 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `der_otto` | Der Otto | 16 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore` | EMC Kommodore | 17 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_drone` | Drohne (1 Mittel) | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_freight` | Fracht | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_living_low` | Wohnen (Standard) | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_living_squat` | Wohnen (Einfach) | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_long_distance` | Langstrecke | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_passengers` | Fahrgäste (4 Normal) | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_solar` | Solar | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_trolls` | Fahrgäste (2 Trolle) | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `emc_kommodore_module_valkyrie` | Valkyrie-Modul | 18 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `eurocopter_commuter` | Eurocopter Flying Commuter | 17 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `glock_giftzwerg_2` | Glock Giftzwerg II | 5 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `greifenauge` | Swarovski Greifenauge III | 10 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `man_grf668` | MAN GRF 668 | 13 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `messerschmitt_maikaefer` | Messerschmitt-Kawasaki Maikäfer | 14 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `onotario_arms_slingshot` | Ontario Arms Sling-Shot | 8 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `plex_cab` | Plex-Cab | 16 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `porsche_aqua503` | Porsche-Dornier Aqua 503 | 14 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `proteus_beachskipper` | Proteus Beachskipper | 13 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `proteus_explorer` | Proteus Explorer | 14 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `ruhrmetall_blizzard` | Ruhrmetall Blizzard | 5 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `ruhrmetall_sfw_30` | Ruhrmetall SFW-30 | 7 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `slingshot_capsule` | Sling-Shot Kapseln (10x) | 9 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `swarovski_hartschier` | Swarovski-Joop Hartschier | 11 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | item | `walther_supernova` | Walther Supernova | 8 | a German-only book (de_sota2083); no English edition among our books |
| de_sota2083 | itemenhancement | `hk_tyr` | H&K Tyr | 9 | a German-only book (de_sota2083); no English edition among our books |
| de_westphalen | item | `cnh_g12` | CNH Harvesting Supporter G12 "Geodezist" | 31 | a German-only book (de_westphalen); no English edition among our books |
| de_westphalen | item | `cnh_k12` | CNH Harvester K12 "Kombinat" | 30 | a German-only book (de_westphalen); no English edition among our books |
| de_westphalen | item | `cnh_t12` | CNH Crop Transport T12 | 31 | a German-only book (de_westphalen); no English edition among our books |

#### German-rules duplicates (311)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| crb | action | `disarm_data_bomb` | Disarm Data Bomb | 181 | lang=de: the German edition's copy of a record its English book has |
| crb | action | `erase_matrix_signature` | Erase Matrix Signature | 181 | lang=de: the German edition's copy of a record its English book has |
| crb | action | `hash_check` | Hash Check | 182 | lang=de: the German edition's copy of a record its English book has |
| crb | action | `set_data_bomb` | Set Data Bomb | 183 | lang=de: the German edition's copy of a record its English book has |
| crb | action | `trace_icon` | Trace Icon | 184 | lang=de: the German edition's copy of a record its English book has |
| crb | interpretation | `core_de` | German rules | – | lang=de: the German edition's copy of a record its English book has |
| crb | item | `chem_patch` | Chem patch | 282 | lang=de: the German edition's copy of a record its English book has |
| crb | item | `disarm` | Disarm | 184 | lang=de: the German edition's copy of a record its English book has |
| crb | item | `periscope` | Periscope | 260 | lang=de: the German edition's copy of a record its English book has |
| crb | item | `skilljack` | Skilljack | 284 | lang=de: the German edition's copy of a record its English book has |
| crb | quality | `impaired` | Impaired | 76 | lang=de: the German edition's copy of a record its English book has |
| da | item | `microdeck_ranger` | Microdeck Ranger | 68 | lang=de: the German edition's copy of a record its English book has |
| da | item | `mortar_m1330` | Mortar M1330 | 60 | lang=de: the German edition's copy of a record its English book has |
| da | item | `mortar_m2330` | Mortar M2330 | 59 | lang=de: the German edition's copy of a record its English book has |
| da | item | `nurse_maid_troll` | Ares Nurse Maid Troll | 176 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `aero_screamer` | Aerodesign Systems Screamer | 104 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `aerodesign_condor` | Aerodesign Systems LDSD-64 Condor | 108 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ai_jetpack` | Advanced Industries Personal Propulsion Systems | 66 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ai_jetpack_glider` | Advanced Industries Personal Propulsion Systems with PFS | 66 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_TR_ATK` | Ares TR-73-ATK | 69 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_TR_cargo` | Ares TR-55 Cargo | 69 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_army_master` | Ares Army-Master | 36 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_dakota` | Ares Dakota | 68 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_gunrunner` | Ares Gunrunner GR-02 | 100 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_gunslinger` | Ares Gunslinger GS-01 | 96 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_regulator` | Ares Arms Regulator | 95 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ares_responder` | Ares-DocWagon First Responder | 96 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `aztech_aguilar` | Aztechnology Aguilar | 69 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `aztech_aguilar_3AT` | Aztechnology Aguilar-3AT | 69 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `bae_ajax` | BAE Ajax | 101 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `bae_centurion` | BAE Centurion II | 37 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `bmw_super_bug` | BMW Super-Bug | 42 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `boeing_unicorn` | Federated-Boeing Unicorn | 110 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `boing_sky_commander` | Federated-Boeing Sky Commander | 106 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `cessna_airrider` | Cessna AirRider | 70 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `cyberspace_dragonfly` | Cyberspace Designs Dragonfly-Alpha | 105 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `cyberspace_halo` | Cyberspace Designs Halo | 105 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `dassault_peregrine` | Dassault Peregrine | 109 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `docwagon_crt` | DocWagon CRT Air Unit | 71 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `docwagon_osprey` | DocWagon Osprey II | 72 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `dsec_i` | DSEC I | 88 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `easy_assembly` | Easy Assembly/Disassembly | 123 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `enhanced_sensors` | Enhanced Sensors | 142 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `esprit_foxhound` | Esprit Foxhound | 97 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `esprit_scorpion` | Esprit Iron Scorpion | 101 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `essy_interceptor` | ESSY Motors Red Interceptor | 102 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `euro_tiger` | Eurocopter Tiger | 72 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `evo_splatter` | EVO “Splatter”-Series Drones | 104 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `extreme_environment` | Extreme Environmental Mods | 123 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ferrari_appaloosa` | Ferrari Appaloosa | 37 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ford_dasher` | Ford Dasher | 28 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ford_lifeline` | Ford Lifeline | 31 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gd_flyer` | General Dynamics Flyer 90 | 38 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gd_macarthur` | GD/CAS MacArthur | 38 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gmc_chariot` | GMC Chariot | 39 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gmc_gryphon` | GMC Gryphon | 74 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gmc_patroller` | GMC Patroller | 36 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gmc_trooper` | GMC Trooper GPMV | 40 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gmc_vacationer` | GMC Vacationer III | 36 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_benevolent` | GTI Benevolent / Raphael | 75 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_devotee` | GTI Devotee MK.1 | 77 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_devout` | GTI Devout | 78 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_evocative` | GTI Evocative Executive Transport | 79 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_malevolent` | GTI Malevolent / Azrael | 75 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `gti_revolution` | GTI Revolution | 79 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `hawker_bat` | Hawker-Siddley Bat | 106 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `hawker_harrier` | Hawker-Siddley Harrier | 108 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `hawker_rescue` | Hawker-Siddley Rescue Harrier | 110 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `hawker_thunderbolt` | Hawker-Siddley Thunderbolt | 111 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `honda_diamondback` | Honda-GM Diamondback | 40 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `kanyuk_interceptor` | WA Kanyuk Interceptor | 87 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `krime_jetpack` | Krime Karrier | 66 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `maersk_wavecutter` | Maersk Shipyards Wavecutter MPAC | 51 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `marine_sea_snake` | Marine Technologies Sea Snake | 112 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `marine_silent_hunter` | Marine Technologies Silent Hunter | 114 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `mitsubishi_waterbug` | Mitsubushi Waterbug | 45 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `mitsubishi_waveskipper` | Mitsubushi Waveskipper | 45 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `mk_sperber` | Messerschmitt-Kawasaki Sperber | 83 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `mostrans_wavecutter` | MosTrans Wavecutter | 115 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `northrup_hornet` | Northrup Hornet | 84 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `northrup_yellowjacket` | Northrup Yellowjacket | 84 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `omnistar_valkyrie2_1` | OmniStar Valkyrie II Mk. 1 | 85 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `omnistar_valkyrie2_2` | OmniStar Valkyrie II Mk. 2 | 85 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `omnistar_valkyrie4` | OmniStar Valkyrie IV | 85 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `proteus_devil_ray` | Proteus Devil Ray | 113 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `proteus_krake` | Proteus Krake | 113 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `ranger_battlecruiser` | Ranger Class Battlecruiser | 57 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `roller_bomb` | Roller-Bombs | 92 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `saeder_blitz` | Saeder-Krupp Aerospace Blitz Mk II | 112 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `sea_ray_cottonmouth` | Sea Ray Cottonmouth | 47 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `shiawase_BD_man_at_arms` | Shiawase Bi-Drone Man-At-Arms | 117 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `shiawase_vendX` | Shiawase Advanced Robotics Vend-X | 98 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `smart_rig` | Smartsoft | 146 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `spinrad_street_rocket` | Spinrad Global Street Rocket EX | 43 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `sukhoi_fixer` | Sukhoi Su-41 Fixer | 87 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `suzuki_transit` | Suzuki Transit | 23 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `swarm_rig` | Swarm | 146 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `thundercloud_morgan_v1` | Thundercloud Morgan V1 | 41 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `thundercloud_morgan_v2` | Thundercloud Morgan V2 | 41 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `toyota_adventure` | Toyota Adventure | 33 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `toyota_daytripper` | Toyota Daytripper | 26 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `tunnel_rat` | Cyberspace Designs Tunnel Rat | 92 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `volkswagen_krime` | Volkswagen Krime IV+ | 34 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `volkswagen_superkombi` | Volkswagen Superkombi IV | 34 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `vulcan_hollenfaust` | Vulcan-Krupp Hollenfaust | 103 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `vulcan_jump_master` | Vulcan Systems Jump Master | 109 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `vulcan_opossum_I` | Vulcan Systems Opossum Mk I | 99 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `vulcan_opossum_II` | Vulcan Systems Opossum Mk II | 99 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `weapon_turret_heavy` | Weapon mount-Turret-Heavy | 142 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `whispering_death` | Whispering Death | 107 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `zeppelin_2079` | Luftschiffbau Zeppelin 2079 | 82 | lang=de: the German edition's copy of a record its English book has |
| dc | item | `zodiac_whisper_mil` | Zodiac Whisper Military | 46 | lang=de: the German edition's copy of a record its English book has |
| dod | item | `hk_urban_stinger` | H&K Urban Stinger | - | lang=de: the German edition's copy of a record its English book has |
| dod | item | `makarov22` | Makarov V22.2 | - | lang=de: the German edition's copy of a record its English book has |
| dod | item | `pjss_superb` | PJSS Superb | - | lang=de: the German edition's copy of a record its English book has |
| dod | item | `pjss_superb_silencer` | PJSS Superb Schalldämpfer | - | lang=de: the German edition's copy of a record its English book has |
| dod | item | `stilett_asl` | Stilett ASL 2.0 | - | lang=de: the German edition's copy of a record its English book has |
| dod | power | `adept_spell` | Adeptenzauber | - | lang=de: the German edition's copy of a record its English book has |
| dod | power | `delayed_damage` | Verzögerter Schaden | - | lang=de: the German edition's copy of a record its English book has |
| dod | quality | `numb` | Abgestumpft | - | lang=de: the German edition's copy of a record its English book has |
| dod | weapons | `hk_urban_stinger_air` | H&K Urban Stinger Druckluftkartusche (50x) | - | named in German; no English book prints it (carried as a Commlink6-only entry of ours, gen="cl6only") |
| dod | weapons | `hk_urban_stinger_bolts` | H&K Urban Stinger Pfeile (10x) | - | named in German; no English book prints it (carried as a Commlink6-only entry of ours, gen="cl6only") |
| dod | weapons | `makarov22_ammo` | Makarov V22.2 Kalte Munition (10x) | - | named in German; no English book prints it (carried as a Commlink6-only entry of ours, gen="cl6only") |
| fs | item | `concealbale_quickdraw_holster` | Concealable Quick Draw Holster | 70 | lang=de: the German edition's copy of a record its English book has |
| fs | item | `iron_eagle` | Iron Eagle | 41 | lang=de: the German edition's copy of a record its English book has |
| fs | item | `manriki_chain` | Manriki Chain | 15 | lang=de: the German edition's copy of a record its English book has |
| hs | action | `calibration` | Calibration | 28 | lang=de: the German edition's copy of a record its English book has |
| hs | action | `denial_of_service` | Denial of Service | 28 | lang=de: the German edition's copy of a record its English book has |
| hs | action | `modify_icon` | Modify Icon | 30 | lang=de: the German edition's copy of a record its English book has |
| hs | action | `squelch` | Squelch | 30 | lang=de: the German edition's copy of a record its English book has |
| hs | action | `subvert_infra` | Subvert Infrastructure | 30 | lang=de: the German edition's copy of a record its English book has |
| hs | item | `comhack_securelink_upgrade` | Securelink Upgrade | 44 | lang=de: the German edition's copy of a record its English book has |
| kk | item | `krime_loudener` | Krime Loudener | 22 | lang=de: the German edition's copy of a record its English book has |
| kk | item | `krime_prowler` | Krime Prowler | 34 | lang=de: the German edition's copy of a record its English book has |
| kk | item | `krime_stun_bayonet` | Krime Stun Bayonet | 22 | lang=de: the German edition's copy of a record its English book has |
| kk | item | `krime_sv-2` | Krime SV-2 Crashtest | 32 | lang=de: the German edition's copy of a record its English book has |
| other_us | metatype | `dokkaebi_major` | Dokkaebi, Major | 21 | lang=de: the German edition's copy of a record |
| other_us | metatype | `dokkaebi_minor` | Dokkaebi, Minor | 21 | lang=de: the German edition's copy of a record |
| so | item | `elitist_business_suit` | Rheingold Elitist Geschäftsanzug | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `elitist_evening_suit` | Rheingold Elitist Abendanzug | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `elitist_freya` | Rheingold Freya Abendkleid | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `elitist_venus` | Rheingold Venus Abendkleid | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `franzinger_blazer` | Franzinger Jackett/Blazer | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `franzinger_shirt` | Franzinger Bluse/Hemd | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `franzinger_suit` | Franzinger Kleid/Anzug | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `franzinger_trouser` | Franzinger Rock/Hose | 183 | lang=de: the German edition's copy of a record its English book has |
| so | item | `gothic_business` | Rheingold Gothic Geschäftsanzug | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `gothic_casual` | Rheingold Gothic Freizeitoutfit | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `gothic_evening` | Rheingold Gothic Abendgarderobe | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `gothic_frockcoat` | Rheingold Gothic Gehrock | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `party83_avenger` | SceneDeity Party83 Stadträcher Mantel | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `party83_night` | SceneDeity Party83 Nachtschwärmer Overall | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `party83_star` | SceneDeity Party83 Szenestern Jacke | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `pixel_tags` | Pixel Tags | 123 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_eternity` | Swarovski-Joop Celebrity Eternity | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_eternity_bag` | Swarovski-Joop Celebrity Handtasche | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_eternity_belt` | Swarovski-Joop Celebrity Gürtel | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_eternity_necklace` | Swarovski-Joop Celebrity Statement-Kette | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_eternity_ring` | Swarovski-Joop Celebrity Siegelring | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_grey` | Swarovski-Joop Celebrity Grey | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_kombatmage` | Swarovski-Joop Celebrity Kombatmage | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `swarovski_mercurial` | Swarovski-Joop Celebrity Mercurial | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `tailored_blazer` | Maßgeschneidert Jackett/Blazer | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `tailored_shirt` | Maßgeschneidert Bluse/Hemd | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `tailored_suit` | Maßgeschneiderte Abendgarderobe | 184 | lang=de: the German edition's copy of a record its English book has |
| so | item | `tailored_trouser` | Maßgeschneidert Hose/Rock | 184 | lang=de: the German edition's copy of a record its English book has |
| so | mentorspirit | `erlkoenig` | Erlkönig | 181 | lang=de: the German edition's copy of a record its English book has |
| so | mentorspirit | `loreley` | Loreley | 182 | lang=de: the German edition's copy of a record its English book has |
| so | mentorspirit | `schwindler` | Schwindler | 182 | lang=de: the German edition's copy of a record its English book has |
| so | mentorspirit | `wasserfrau` | Wasserfrau | 182 | lang=de: the German edition's copy of a record its English book has |
| so | mentorspirit | `winselmutter` | Winselmutter | 182 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `big_mama` | Big Mama | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `connoisseur` | Connoisseur | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `dachshund` | Dachshund | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `jester` | Jester | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `klabautermann` | Kobold | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `magpie` | Magpie | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `panthier` | Panthier | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `rotkaeppchen_wyrd` | Red Riding Hood | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `shepherd_dog` | Shepherd Dog | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `squirrel` | Squirrel | 0 | lang=de: the German edition's copy of a record its English book has |
| sw | mentorspirit | `vigilant` | Vigilante | 0 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `augmented_for_firearms` | Augemented for Firearms Pack | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `close_combat` | Close Combat Adept | 50 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `cybered_covered` | Cybered Covered Operative | 52 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `cyborg` | Full Conversion Cyborg | 52 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `decker` | Decker | 52 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `dirt_poor` | Dirt Poor | 50 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `drone_rigger` | Drone Rigger | 55 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `face` | Face | 50 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `full_magician` | Full Magician | 50 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `gunslinger` | Gunslinger Adept | 51 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `max_decker` | Max Hardware Decker | 54 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_arm_firearm` | Cyberarm Firearm | 64 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_augm_helmet` | Armor-Helmet Augmented Vision | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_autosoft_combat3` | Autosofts-Combat 3 | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_autosoft_combat4` | Autosofts-Combat 4 | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_autosoft_combat5` | Autosofts-Combat 5 | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_autosoft_combat6` | Autosofts-Combat 6 | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cross_heavy` | Crossbow-Heavy | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cross_light` | Crossbow-Light | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cross_standard` | Crossbow-Standard | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cyberear_b` | Cyberears Pack B | 61 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cybereye_d` | Cybereyes Pack D | 61 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cybereye_e` | Cybereyes Pack E | 61 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_cyberprograms` | Cyberprogram Everything Pack | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_fullbodyarmor` | Armor-Full Body Armor | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_glasses_shades` | Sensor-Glasses: Smart Shades | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_goggles_super` | Sensor-Goggles: Super Smartgoggles | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_a` | Hacker Pack A | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_b` | Hacker Pack B | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_c` | Hacker Pack C | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_d` | Hacker Pack D | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_e` | Hacker Pack E | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_hacker_f` | Hacker Pack F | 60 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_heavy_predator1` | Heavy Pistol-Ares Predator VI | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_heavy_predator2` | Heavy Pistol-Ares Predator VI Silent | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_heavy_viper` | Heavy Pistol-Ares Viper Slivergun | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_heavy_warhawk1` | Heavy Pistol-Ruger Super Warhawk Smart | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_heavy_warhawk2` | Heavy Pistol-Ruger Super Warhawk | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_holdout_needler` | Holdout-Fichetti Tiffani Needler | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_holdout_palm` | Holdout-Walther Palm Pistol | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_holdout_streetline` | Holdout-Streetline Special | 56 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_id_solid` | Fake ID-Solid | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_interceptor` | Launchers-Aztechnology StrikerOnotari Interceptor | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_jacket` | Armor-Armor Jacket | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_leg_springjack` | Cyberleg Springheel Jack | 64 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_leg_springjugger` | Cyberleg Springheel Juggernaut | 64 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_light_beretta` | Light Pistol-Beretta 201T | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_light_fire75` | Light Pistol-Ares Light Fire 75 | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_light_redhawk` | Light Pistol-Ruger Redhawk | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_m202` | Machine Guns-Stoner-Ares M202Ingram Valiant | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_magical_targeting` | Sensor-Magical Targeting Kit | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_mgl12` | Launchers-ArmTech MGL-12 | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_mgl6` | Launchers-ArmTech MGL-6 | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_mp_crusader` | Machine Pistol-Ares Crusader II | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_mp_tmp` | Machine Pistol-Steyr TMP | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_prk` | Machine Guns-RPK HMG | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_raiden` | Rifle-Yamaha Raiden | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_rcc_basic` | RCCs-Basic | 70 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_rcc_elite` | RCCs-Elite | 70 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_rcc_professional` | RCCs-Professional | 70 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_rifle_ak97` | Rifle-AK-97 | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_rifle_alpha` | Rifle-Ares Alpha | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_shot_defiance1` | Shotgun-Defiance T-250 | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_shot_defiance2` | Shotgun-Defiance T-250 Smart | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_shot_mossberg1` | Shotgun-Mossberg CMDT | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_shot_mossberg2` | Shotgun-Mossberg CMDT Smart | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_shot_roomsweeper` | Shotgun-Remington Roomsweeper | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_skill_a` | Skill Rig Pack A | 62 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_skill_b` | Skill Rig Pack B | 62 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_skill_c` | Skill Rig | 62 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_smg_hk227` | Submachine Gun-HK-227 | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_smg_praetor` | Submachine Gun-FN P93 Praetor | 57 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_smg_uzi` | Submachine Gun-Uzi IV | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_surveillance` | Surveillance Kit | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_ultra_contacts` | Sensor-Ultrasound Contacts | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_ultra_glasses` | Sensor-Ultrasound Glasses | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_ultra_googles` | Sensor-Ultrasound Goggles | 59 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_upgrade_baby` | Upgrades-Rigger's Baby | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_upgrade_biker` | Upgrades-Combat Biker | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_upgrade_dirty` | Upgrades-Dirty Tricks | 71 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_valiant` | Machine Guns-Ingram Valiant | 58 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_blackhawk` | Drones, Medium-Airstrike | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_blacksky` | Drones, Large-Elite Airstrike | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_bulldog` | Vans-Armed GMC Bulldog | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_crawler` | Drones, Small-Armed Walker | 67 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_dalmatian` | Drones, Large-Sky Patrol Dalmatian | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_delfin` | Subs-Armed YMC Delfin | 67 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_doberman_loud` | Drones, Medium-Wheeled Loud | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_growler` | Bikes-Armed Yamaha Growler | 64 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_lynx_budget` | Drones, Large-Budget Heavy Combat | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_lynx_crowd` | Drones, Large-Crowd Control Steel Lynx | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_lynx_ultimate` | Drones, Large-Ultimate Combat | 69 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_mirage` | Bikes-Armed Suzuki Mirage | 65 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_nightrunner` | Boats-Armed Aztechnology Nightrunner | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_nissan_oni` | Drones, Large-Anthro | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_otter` | Boats-Armed Samuvani Criscraft Otter | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_pursuit` | Drones, Small-Armed Wheeled | 67 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_quadrotor` | Drones, Small-Armed Rotor | 67 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_riverine` | Boats-Armed GMC Riverine | 67 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_roadmaster` | Vans-Armed Ares Roadmaster | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_roto_assault` | Drones, Medium-Roto Assault | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_roto_grenade` | Drones, Medium-Roto Grenade Barrage | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_roto_rocket` | Drones, Medium-Roto Rocket Launcher | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_roto_support` | Drones, Medium-Roto Fire Support | 68 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_rover` | Vans-Armed Range Rover | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_shin_hyung` | Cars-Armed Hyundai Shin-Hyung | 65 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `pack_veh_westwind` | Cars-Armed Eurocar Westwind | 66 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `samurai` | Street Samurai | 53 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `starterpack` | Shadowrunner Starter Pack | 49 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `transport_rigger` | Transport Rigger | 55 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `vat_job` | Vat Job Bioware-Augmented Combat Specialist | 53 | lang=de: the German edition's copy of a record its English book has |
| swc | item | `weapons_specialist` | Weapons Specialist | 54 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `dalakitnon` | Dalakitnon | 78 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `gnome` | Gnome | 75 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `hobgoblin` | Hobgoblin | 82 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `menehune` | Menehune | 77 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `ogre` | Ogre | 83 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `oni` | Oni | 83 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `pixie` | Pixie | 89 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `sasquatch` | Sasquatch | 90 | lang=de: the German edition's copy of a record its English book has |
| swc | metatype | `satyr` | Satyr | 83 | lang=de: the German edition's copy of a record its English book has |
| swc | quality | `impaired_metagenetic` | Impaired | 128 | lang=de: the German edition's copy of a record its English book has |
| ts | item | `chrysler_patrol6` | Chrysler Nissan Patrol-6 | 154 | lang=de: the German edition's copy of a record its English book has |
| ts | item | `k-10` | K-10 | 157 | lang=de: the German edition's copy of a record its English book has |
| ts | item | `nissan_johnny` | Nissan Johnny Patroller | 157 | lang=de: the German edition's copy of a record its English book has |
| ts | quality | `belobigung` | Belobigung | 185 | lang=de: the German edition's copy of a record its English book has |
| ts | quality | `bestechlich` | Bestechlich | 185 | lang=de: the German edition's copy of a record its English book has |
| ts | quality | `gesetz` | Ich bin das Gesetz | 185 | lang=de: the German edition's copy of a record its English book has |
| ts | quality | `sakrosant` | Sakrosant | 185 | lang=de: the German edition's copy of a record its English book has |

#### no English name (201)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| aw | trueelement | `animated_air` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `animated_fire` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `dangerous_fire` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `dangerous_water` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `disruptive_air` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `elemental_mastery_air` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `elemental_mastery_earth` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `elemental_mastery_fire` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `elemental_mastery_water` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `familiar_earth` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `familiar_fire` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `protective_earth` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `protective_water` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `secretive_air` | – | – | no English name in the jar (no English book names it; a German-only text) |
| aw | trueelement | `secretive_water` | – | – | no English name in the jar (no English book names it; a German-only text) |
| bs | quality | `doesn't_quite_fit` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `attribA` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `attribB` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `attribC` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `attribD` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `attribE` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `magicA` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `magicB` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `magicC` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `magicD` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `magicE` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `metaA` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `metaB` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `metaC` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `metaD` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `metaE` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `resourceA` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `resourceB` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `resourceC` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `resourceD` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `resourceE` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `skillA` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `skillB` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `skillC` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `skillD` | – | – | no English name in the jar (no English book names it; a German-only text) |
| crb | priotableentry | `skillE` | – | – | no English name in the jar (no English book names it; a German-only text) |
| dc | item | `aztechnology_nightrunner` | – | – | no English name in the jar (no English book names it; a German-only text) |
| dc | item | `aztechnology_sunrunner` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Adeptenausbildung (Nur Adepten)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Adeptenausbildung_(Nur_Adepten)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Astraler Kundschafter (Nur Erwachte)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Athletin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `IT-Spezialistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Technische Ausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `Technische_Ausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `adeptenausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `adeptenausbildung_(nur_adepten)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `aerztin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `aerztin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `agent` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `agent` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `aktivistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `aktivistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `alchemist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `alchemist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `an_eine_menge_geld_gekommen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `angestellte_bei_stuffer_shack` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `angestellte_bei_stuffer_shack` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `anwalt` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `anwalt` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `arbeiterin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `arbeiterin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `artefaktjaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `artefaktjaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `astraler_kundschafter_(nur_erwachte)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `astraler_kundschafter_(nur_erwachte)` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `athletin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `athletin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `barista_slash_barkeeper` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `barista_slash_barkeeper` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `bedienstete` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `bedienstete` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `begonnen_dich_fuer_ungewoehnliches_zu_interessieren` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `bodyguard` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `bodyguard` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `boersenmaklerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `boersenmaklerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `cyberabwehr_spezialist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `cyberabwehr_spezialist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `datenbefreierin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `datenbefreierin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `drohnentechniker` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `drohnentechniker` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `entertainerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `entertainerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `ermittler` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `ermittler` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `forscherin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `forscherin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `führer` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `führer` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `gangmitglied` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `gangmitglied` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `geschaeftsinhaber` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `geschaeftsinhaber` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hackerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hackerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `haettest_etwas_schlimmes_verhindern_können` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `harte_arbeit_hat_sich_bezahlt_gemacht` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `harte_wahrheit_ueber_die_welt_erfahren` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hausmeister` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hausmeister` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hellseherin_nur_erwachte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `hellseherin_nur_erwachte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `ingenieur` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `ingenieur` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `it-spezialistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `it-spezialistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `jaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `jaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `journalistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `journalistin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kampfkunstausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kampfkunstausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `koechin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `koechin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `koerper_an_seine_grenzen_gebracht` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kopfgeldjaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kopfgeldjaeger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `krankenpflegerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `krankenpflegerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kriminalist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kriminalist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kuenstlerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kuenstlerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kurier` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `kurier` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `landwirtin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `landwirtin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `lebensgefaehrliche_situation_ueberlebt` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `lehrmeister` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `lehrmeister` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `leitende_angestellte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `leitende_angestellte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `magische_studien` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `magische_studien` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `matrix_sicherheit` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `matrix_sicherheit` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `matrix_vandale` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `matrix_vandale` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `mechanikerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `mechanikerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `militaerakademie` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `militaerakademie` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `militaerkarriere` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `militaerkarriere` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `mit_einem_diebstahl_davongekommen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `neoanarchist_des_schwarzen_sterns` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `neoanarchist_des_schwarzen_sterns` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `oeffentlicher_personennahverkehr` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `oeffentlicher_personennahverkehr` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `organisiertes_verbrechen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `organisiertes_verbrechen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `politikerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `politikerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `praktikant` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `praktikant` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `professorin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `professorin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `promi` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `promi` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `reisende` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `reisende` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `rigger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `rigger` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `scharlatanin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `scharlatanin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `schieber` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `schieber` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `schmugglerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `schmugglerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `schwere_zeiten_durchgemacht` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `shadowrunner` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `shadowrunner` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sicherheitsdienst` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sicherheitsdienst` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sicherheitsmagier` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sicherheitsmagier` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `spezialistin_fuer_verdeckte_operationen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `spezialistin_fuer_verdeckte_operationen` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sprengstoffexperte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `sprengstoffexperte` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `strassenschamanin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `strassenschamanin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `streifenpolizist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `streifenpolizist` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `studium` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `taliskraemerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `technische_ausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `technische_ausbildung` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `technomancerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `thinktank` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `tieraerztin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `trainer` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `unternehmerin` | – | – | no English name in the jar (no English book names it; a German-only text) |
| swc | lifemod | `verkaeufer` | – | – | no English name in the jar (no English book names it; a German-only text) |

#### retired or legacy (5)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| crb | item | `full_body_armor_with_helmet` | Depreciated (replace by full body armor and separate helmet) | 265 | Commlink6 marks it Depreciated (replaced by another record of its own) |
| crb | item | `smart_firing_platform` | Depreciated (Smart firing platform) buy new | 260 | Commlink6 marks it Depreciated (replaced by another record of its own) |
| fs | item | `wss_ap_spikes` | Depreciated WSS spikes, replace with new modification | 65 | Commlink6 marks it Depreciated (replaced by another record of its own) |
| fs | item | `wss_rfid_tracker` | Depreciated WSS tracker, replace with new modification | 65 | Commlink6 marks it Depreciated (replaced by another record of its own) |
| fs | item | `wss_taser_shock` | Depreciated WSS shock, replace with new modification | 65 | Commlink6 marks it Depreciated (replaced by another record of its own) |

#### Commlink6-invented or house content (70)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| bs | augmentations | `transgen_hearing_expansion` | Transgenic hearing expansion | 102 | in the optional package: geneware (transgenic bioware); CommLink6 splits it out, the book (p102) has no such row |
| crb | electronics | `matrix_signal_scanner` | Matrix Signal Scanner | 18 | in the optional package: electronics (sensor function); CommLink6 cites the core rulebook p18, the name is in the Krime Katalog p18 as a Standard Upgrade of the Krime Escalation, with no stat line of its own |
| crb | gear | `formula_ritual` | Ritual formula | 294 | in the optional package: magical supply; CommLink6 construct (p294), not printed as an item |
| crb | gear | `smart_firing_platform_adapter` | Adapter (see drones for Smart firing platform) | 260 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| crb | lifestyles | `aaa_zone` | AAA zone | 57 | in the optional package: lifestyles (p57); printed in the Sixth World Companion p180 |
| crb | vehicles | `shiawase_inu_better_suit` | Shiawase Inu w/better suit | 299 | in the optional package: vehicles (p299); the 500 nuyen better-suit option is prose in the Inu entry, no stat line of its own |
| crb | weapons | `spurs_samurai_oni` | Nissan Spurs | 300 | in the optional package: drone weapon; CommLink6 construct, not printed as an item (p300) |
| da | electronics | `mtoc_fob` | M-TOC Fob | 68 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `ar_interface` | AR Interface | 58 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `crew_served_2` | Crew Served (2) | 153 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `crew_served_3` | Crew Served (3) | 153 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `crew_served_4` | Crew Served (4) | 153 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_0_5` | Uses 0.5 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_1` | Uses 1 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_10` | Uses 10 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_2` | Uses 2 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_4` | Uses 4 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `energy_5` | Uses 5 Energy per shot | 65 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `missile_pilot_3` | Pilot 3 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.standard-missile's column |
| da | gear | `missile_pilot_5` | Pilot 5 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.vespae-sam's column |
| da | gear | `missile_pilot_7` | Pilot 7 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.loral-vaught-pit-viper's column |
| da | gear | `missile_pilot_8` | Pilot 8 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.saab-saaker-aim-11v's column |
| da | gear | `missile_sensor_2` | Sensor 2 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.pilum-atm's column |
| da | gear | `missile_sensor_3` | 3 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.standard-missile's column |
| da | gear | `missile_sensor_5` | Sensor 5 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.loral-vaught-pit-viper's column |
| da | gear | `missile_sensor_7` | Sensor 7 | 157 | a table cell Commlink6 made a record of; the book prints it only in da.saab-saaker-aim-11v's column |
| da | gear | `range_10` | 10 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.m8330's column |
| da | gear | `range_14` | 14 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.dauntless's column |
| da | gear | `range_16` | 16 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.relampago's column |
| da | gear | `range_160` | 160 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.krupp-bombard's column |
| da | gear | `range_1_5` | 1.5 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.standard-rocket's column |
| da | gear | `range_2` | 2 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.bushmaster-m25's column |
| da | gear | `range_20` | 20 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.bae-lg105's column |
| da | gear | `range_24` | 24 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.mixcoatl's column |
| da | gear | `range_25` | 25 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.vaporizer's column |
| da | gear | `range_3` | 3 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.m1330's column |
| da | gear | `range_30` | 30 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.svetlyak's column |
| da | gear | `range_32` | 32 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.ruhrmetall-oerlikon-90's column |
| da | gear | `range_4` | 4 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.black-mamba-m40's column |
| da | gear | `range_40` | 40 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.kazan-ho's column |
| da | gear | `range_5` | 5 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.pilum-mpat's column |
| da | gear | `range_7` | 7 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.m60's column |
| da | gear | `range_9` | 9 km | 154 | a table cell Commlink6 made a record of; the book prints it only in da.xicohtencatl's column |
| da | gear | `slow_rof_bf4` | BF(4) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.irm-sabretooth's column |
| da | gear | `slow_rof_fa10` | FA(10) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.ares-vigilant's column |
| da | gear | `slow_rof_sa2` | SA(2) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.ferrus-maximus's column |
| da | gear | `slow_rof_ss1` | SS(1) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.ynt-colossus's column |
| da | gear | `slow_rof_ss1_2` | SS(1-2) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.gdc-120's column |
| da | gear | `slow_rof_ss1_3` | SS(1-3) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.carl-gustaf's column |
| da | gear | `slow_rof_ss1_4` | SS(1-4) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.gdc-140's column |
| da | gear | `slow_rof_ss1_6` | SS(1-6) | 152 | a table cell Commlink6 made a record of; the book prints it only in da.s-k-kali-vajra-particle-cannon-experimental's column |
| da | gear | `smart_firing_reinforced_adapter` | Adapter (see drones for Reinforced Smart Firing Platform) | 64 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `tripod_powered_adapter` | Adapter (see drones for Powered Heavy Tripod) | 64 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `tripod_wheeled_adapter` | Adapter (see drones for Wheeled Heavy Tripod) | 64 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | gear | `weapon_mount_military` | Mil-Spec Weapon Mount | 151 | an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a Commlink6-only entry of ours, gen="cl6only") |
| da | weapons | `cougar_polearm_large` | Cougar Polearm (Large) | 47 | in the optional package: weapons; CommLink6 has the Cougar Polearm as two items, the book (p47) prints the collapsible polearm as four rows (Knife, One-hand, Spear, Pike), which carry the brand as an alias |
| da | weapons | `cougar_polearm_small` | Cougar Polearm (Small) | 47 | in the optional package: weapons; CommLink6 has the Cougar Polearm as two items, the book (p47) prints the collapsible polearm as four rows (Knife, One-hand, Spear, Pike), which carry the brand as an alias |
| dc | gear | `reduce_seating` | Reduce Seating | 126 | in the optional package: gear; not in the book text (p126); the nearest is Increased Seating, which we have |
| dc | vehicles | `shiawase_inu_better_suit` | Shiawase Inu w/better suit | – | in the optional package: CommLink6 also files this variant under Double Clutch with no page; same record as the Core Rulebook p299 entry in this package. |
| fs | gear | `mems_scabbard` | MEMS Scabbard | – | in the optional package: armor accessory; CommLink6 construct, no page cited |
| fs | weapons | `ammo_blazer` | Fuel for Blazer (5x) | 35 | in the optional package: ammunition (p35); CommLink6 construct |
| fs | weapons | `ammo_hell_turtle` | Fuel for Hell Turtle (15x) | 43 | in the optional package: ammunition (p43); CommLink6 construct |
| fs | weapons | `ammo_hornet_gas` | Gas for Hornet (10x) | 34 | in the optional package: ammunition (p34); CommLink6 construct |
| hs | electronics | `machinist_console` | Machinist Command Console | 131 | in the optional package: electronics; the book (p131) describes an aspect peripheral but names no such item |
| kk | gear | `krime_drum` | Krime Spare Drum | 23 | in the optional package: weapon accessory (p23); no standalone row or price in the book |
| ll | metatypes | `feathered` | Feathered Drake | 16 | in the optional package: metatypes; as Western Drake |
| ll | metatypes | `seadrake` | Sea Drake | 16 | in the optional package: metatypes; as Western Drake |
| ll | metatypes | `western` | Western Drake | 16 | in the optional package: metatypes; CommLink6 has the drake types, the book (p16) does not print them as items |
| so | armor | `krime_rave_complete` | Krime Rave Clothing Complete | 116 | in the optional package: armor; the book describes +4 Social Rating for the complete suit in prose (p116), its table lists the pieces |
| swc | metatypes | `nartaki2` | Nartaki 2 | 81 | in the optional package: metatype; CommLink6 splits the single printed Nartaki row in two (p81) |

#### rule options (4)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| crb | ruleoptions | `core` | Standard | – | a rule setting of the app, no book item; ours is the rule preset creation.preset.core |
| crb | ruleoptions | `core_seattle` | Standard (Seattle) | – | a rule setting of the app, no book item; ours is the rule preset creation.preset.core_seattle |
| crb | ruleoptions | `houserules` | Configurable | – | a rule setting of the app, no book item; ours is the rule preset creation.preset.houserules |
| crb | ruleoptions | `srm` | Shadowrun Missions | – | a rule setting of the app, no book item; ours is the rule preset creation.preset.srm |

#### other (24)

| Commlink6 source | type | id | name | page | why it is not in our books |
|---|---|---|---|---|---|
| other_us | ammotype | `polymer` | Ammo Polymer Composite | 17 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | critterpower | `concealment_dokkaebi` | Concealment (Self) | 20 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | critterpower | `cosmetic_control_dokkaebi` | Cosmetic (Dokkaebi) | 21 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `bujeok` | Bujeok | 18 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `faraday_pocket` | Faraday Pocket | 16 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `grenade_ferrous` | Grenade with ferrous dust | 48 | Commlink6's Misc. (US) dataset, from SRM Guide; none of our books prints it |
| other_us | item | `grenade_gold` | Grenade with gold dust | 48 | Commlink6's Misc. (US) dataset, from SRM Guide; none of our books prints it |
| other_us | item | `grenade_silver` | Grenade with silver dust | 48 | Commlink6's Misc. (US) dataset, from SRM Guide; none of our books prints it |
| other_us | item | `grenade_wood` | Grenade with wood dust | 48 | Commlink6's Misc. (US) dataset, from SRM Guide; none of our books prints it |
| other_us | item | `hitch_connector` | Hitches: Universal Connector | 1 | Commlink6's Misc. (US) dataset, from SR6 Forum; none of our books prints it |
| other_us | item | `hitch_construction` | Hitches: Construction Equipment | 1 | Commlink6's Misc. (US) dataset, from SR6 Forum; none of our books prints it |
| other_us | item | `hitch_fith_wheel` | Hitches: Fith Wheel | 1 | Commlink6's Misc. (US) dataset, from SR6 Forum; none of our books prints it |
| other_us | item | `hitch_trailer` | Hitches: Trailer Hitch | 1 | Commlink6's Misc. (US) dataset, from SR6 Forum; none of our books prints it |
| other_us | item | `kwonsham_dream_genie` | Kwonsham Dream Genie | 17 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `samsung_jind_o` | Samsung Jind-O | 17 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `samsung_jind_o_sporting` | Samsung Jind-O Sporting | 17 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `turbobunny_americar` | Turbobunny Special Ford Americar | 5 | Commlink6's Misc. (US) dataset, from Adversary; none of our books prints it |
| other_us | item | `type_81_gwisin` | Type 81 Gwisin | 16 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | item | `type_81_gwisin_silenced` | Type 81 Gwisin with suppressor | 16 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | mentorspirit | `adversary` | Adversary | 5 | Commlink6's Misc. (US) dataset, from Adversary; none of our books prints it |
| other_us | metatype | `dokkaebi_major` | Dokkaebi, Major | 21 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | metatype | `dokkaebi_minor` | Dokkaebi, Minor | 21 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | quality | `ghost_in_the_shell` | Ghost in the Shell | 18 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |
| other_us | quality | `spirits_be_gone` | Spirits, Be Gone | 18 | Commlink6's Misc. (US) dataset, from Seoul Survivor; none of our books prints it |

### List 1b: Commlink6 field values no book prints (296)

Commlink6 has the value; our entry's book prints neither it nor another one (cl6check leaves these out of accuracy).

#### avail (89)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| bs | `frog_tongue` | Frog Tongue | bs.frog-tongue | 3 | 65 |
| bs | `tail` | Tail | bs.tail | 6 | 60 |
| cln | `allergy_grenade` | Grenade, Hyperallergenic | cln.hyperallergenic | 4 | 38 |
| crb | `long_haul` | Long Haul | crb.long-haul | 1 | 125 |
| da | `xcw_hardened` | Hardened | da.meat-grinder | 2 | 44 |
| da | `xcw_starting` | Extreme Cyberweapon | da.four-thousand-newtons | 2 | 44 |
| dc | `condor_ballon` | LDSD-64 Condor Replacement Ballon | dc.aerodesign-systems-ldsd-64-condor-replacement-balloon | 3 | 108 |
| dc | `condor_solar_panel` | LDSD-64 Condor Replacement Solar Panel | dc.aerodesign-systems-ldsd-64-condor-replacement-solar-panel | 3 | 108 |
| dc | `oil_slick_refill` | Oli Slick Sprayer Refill | dc.oil-slick-sprayer-refill | 1 | 120 |
| dc | `rcc_headware` | Rigger Command Console | dc.rcc-headware | 4 | 145 |
| dc | `smart_rig` | Smartsoft | dc.smartsoft | 4 | 146 |
| dc | `swarm_rig` | Swarm | dc.swarm | 4 | 146 |
| dod | `deathrattle` | Deathrattle Venom | dod.deathrattle-venom | 6 | 16 |
| fs | `colt_agent_special_laser_sight` | Colt Agent Special laser sight | fs.colt-agent-special-proprietary-laser-sight | 1 | 17 |
| hs | `eparkour` | eParkour | hs.eparkour | 2 | 56 |
| hs | `mannequin` | Mannequin | hs.mannequin | 2 | 56 |
| hs | `simshare` | SimShare | hs.simshare | 2 | 56 |
| kk | `krime_tripod_pitons` | Krime Tripod Replacement Pitons | kk.krime-explosive-securing-tripod-replacement-piton | 6 | 23 |
| nf | `bowler` | Bowler | nf.bowler | 1 | 158 |
| nf | `fedora` | Fedora | nf.fedora | 1 | 158 |
| nf | `homburg` | Homburg | nf.homburg | 1 | 158 |
| nf | `ink_black` | Black ink (per 500) | nf.black-ink-per-500 | 1 | 160 |
| nf | `ink_color` | Color ink (per 500) | nf.color-ink-per-500 | 1 | 160 |
| nf | `instrument_replacement` | Replacement instrument | nf.replacement-instrument | 1 | 155 |
| nf | `torch_weapon` | Torch | nf.torch | 1 | 156 |
| nf | `trenchcoat` | Trenchcoat | nf.trenchcoat | 1 | 157 |
| nf | `trilby` | Tribly | nf.trilby | 1 | 158 |
| sif-no | `flashlight_uv` | UV Flashlight | sif-no.uv-light-uv-flashlight | 2 | 28 |
| so | `cold_shower_in_a_bottle` | Cold Shower in a Bottle | so.cold-shower-in-a-bottle | 6 | 113 |
| so | `pixel_tags_sprayer_mounted` | Drone-Mounted Tag Sprayer | so.drone-mounted-sprayer | 3 | 124 |
| sw | `acid_on_demand` | Acid On Demand | sw.acid-on-demand | 6 | 90 |
| sw | `acid_wash` | Acid Wash | sw.acid-wash | 6 | 90 |
| sw | `arcane_taser` | Arcan Taser | sw.arcane-taser | 6 | 90 |
| sw | `arcane_taser_plus` | Arcane Taser Plus | sw.arcane-taser-plus | 6 | 90 |
| sw | `aura_obscura` | Aura Obscura | sw.aura-obscura | 6 | 90 |
| sw | `bench_clearer` | Bench Clearer | sw.the-bench-clearer | 6 | 90 |
| sw | `boost_pill` | Boost Pill | sw.boost-pills | 6 | 91 |
| sw | `bruce_lee_keychain` | Bruce Lee Keychain | sw.bruce-lee-keychain | 6 | 91 |
| sw | `climbing_gear_prep` | Climbing Gear | sw.climbing-gear | 6 | 92 |
| sw | `disco_distraction` | Disco Distraction | sw.disco-distraction | 6 | 92 |
| sw | `doctors_right_hand` | Doctor's Right Hand | sw.the-doctors-right-hand | 6 | 92 |
| sw | `door_what_door` | Door? What Door? | sw.door-what-door | 6 | 92 |
| sw | `duvall_special` | Duvall Special | sw.duvall-special | 6 | 93 |
| sw | `finger_of_death` | Finger Of Death | sw.finger-of-death | 6 | 93 |
| sw | `firestick` | Firestick | sw.firestick | 6 | 93 |
| sw | `float_switch` | Float Switch | sw.float-switch | 6 | 94 |
| sw | `frigid_lance` | Frigid Lance | sw.frigid-lance | 6 | 94 |
| sw | `frigid_rain` | Frigid Rain | sw.frigid-rain | 6 | 94 |
| sw | `gap_in_their_shields` | Gap In Their Shields | sw.gap-in-their-shields | 6 | 94 |
| sw | `get_into_rythm` | Get Into The Rythm | sw.get-into-the-rhythm | 6 | 94 |
| sw | `go_juice` | Go Juice! | sw.go-juice | 6 | 94 |
| sw | `i_am_that_good` | I Am That Good | sw.i-am-that-good | 6 | 95 |
| sw | `infostick` | Infostick | sw.infostick | 6 | 95 |
| sw | `instant_decorator` | Instant Decorator | sw.instant-decorator | 6 | 95 |
| sw | `instant_garden` | Instant Garden | sw.instant-garden | 6 | 95 |
| sw | `instant_ice_rink` | Instant Ice Rink | sw.instant-ice-rink | 6 | 95 |
| sw | `instant_shield` | Instant Shield | sw.instant-shield | 6 | 96 |
| sw | `instant_wall` | Instant Wall | sw.instant-wall | 6 | 96 |
| sw | `its_not_paranoia` | It's Not Paranoia If It's Real | sw.its-not-paranoia-if-its-real | 6 | 96 |
| sw | `lie_detector` | Lie Detector | sw.lie-detector | 6 | 97 |
| sw | `long_range_headphones` | Long-Range Headphones | sw.long-range-headphones | 6 | 97 |
| sw | `long_range_legerdemain` | Long-Range Legerdemain | sw.long-range-legerdemain | 6 | 97 |
| sw | `long_range_lenses` | Long-Range Lenses | sw.long-range-lenses | 6 | 97 |
| sw | `magic_window` | Magic Window | sw.the-magic-window | 6 | 98 |
| sw | `magiczap_marble` | MagicZap Marble | sw.magiczap-marble | 6 | 98 |
| sw | `magiczap_marble_plus` | MagicZap Marble Plus | sw.magiczap-marble-plus | 6 | 98 |
| sw | `mana_bread` | Mana Bread | sw.mana-bread | 6 | 98 |
| sw | `manabenzoate` | Manabenzoate | sw.manabenzoate | 6 | 98 |
| sw | `mojo_scanner` | Mojo Scanner | sw.mojo-scanner | 6 | 99 |
| sw | `no_job_to_big` | No Job To Big | sw.no-job-too-big | 6 | 99 |
| sw | `no_job_to_small` | No Job To Small | sw.no-job-too-small | 6 | 99 |
| sw | `pain_stick` | Pain Stick | sw.pain-stick | 6 | 100 |
| sw | `pay_no_attention` | Pay No Attention | sw.pay-no-attention | 6 | 100 |
| sw | `plant_superfood` | Plant Superfood | sw.plant-superfood | 6 | 100 |
| sw | `privacy_pill` | Privacy Pill | sw.privacy-pill | 6 | 100 |
| sw | `private_eye` | Private Eye On The Sly | sw.private-eye-on-the-sly | 6 | 100 |
| sw | `private_property` | Private Property | sw.private-property | 6 | 100 |
| sw | `private_property_no_pets` | No Pets Allowed | sw.no-pets-allowed | 6 | 100 |
| sw | `remodeling_ring` | Remodeling Ring | sw.remodeling-ring | 6 | 101 |
| sw | `satans_nut` | Satan's Left Nut | sw.satans-left-nut | 6 | 101 |
| sw | `sizzler` | Sizzler | sw.the-sizzler | 6 | 101 |
| sw | `sleeping_powder` | Sleeping Powder | sw.sleeping-powder | 6 | 102 |
| sw | `slowing_competition` | Slowing The Competiton | sw.slowing-the-competition | 6 | 102 |
| sw | `spell_shield` | Spell Shield | sw.spell-shield | 6 | 102 |
| sw | `stump_remover` | Stump Remover | sw.stump-remover | 6 | 102 |
| sw | `sway_the_masses` | Sway The Moody Masses | sw.sway-the-moody-masses | 6 | 103 |
| sw | `uv_cleanstick` | UV Cleanstick | sw.uv-cleanstick | 6 | 103 |
| sw | `wizarding_wall` | Wizarding Wall | sw.wizarding-wall | 6 | 103 |
| ts | `ammo_battery_zapgun` | Battery Zapgun | ts.parashield-zapgun-battery-pack-magazine | 4 | 147 |

#### power type (38)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| crb | `camouflage` | Camouflage | crb.camouflage | RESONANCE | 194 |
| crb | `cookie` | Cookie | crb.cookie | RESONANCE | 194 |
| crb | `diagnostics` | Diagnostics | crb.diagnostics | RESONANCE | 194 |
| crb | `electron_storm` | Electron Storm | crb.electron-storm | RESONANCE | 194 |
| crb | `hash` | Hash | crb.hash | RESONANCE | 194 |
| crb | `override` | Override | crb.override | RESONANCE | 194 |
| crb | `phantom` | Phantom | crb.phantom | RESONANCE | 194 |
| crb | `stability` | Stability | crb.stability | RESONANCE | 194 |
| crb | `suppression` | Suppression | crb.suppression | RESONANCE | 194 |
| crb | `trap` | Trap | crb.trap | RESONANCE | 194 |
| crb | `watermark` | Watermark | crb.watermark | RESONANCE | 195 |
| hs | `authority` | Authority | hs.authority | RESONANCE | 114 |
| hs | `captivate` | Captivate Audience | hs.captivate-audience | RESONANCE | 73 |
| hs | `cybercombat_boost` | Cybercombat Boost | hs.cybercombat-boost | RESONANCE | 75 |
| hs | `death_mark` | Death Mark | hs.death-mark | RESONANCE | 74 |
| hs | `device_ken` | Device Ken | hs.device-ken | RESONANCE | 75 |
| hs | `digital_scream` | Digital Scream | hs.digital-scream | RESONANCE | 74 |
| hs | `entropic_conversion` | Entropic Conversion | hs.entropic-conversion | RESONANCE | 114 |
| hs | `file_ken` | File Ken | hs.file-ken | RESONANCE | 75 |
| hs | `fnord` | Fnord | hs.fnord | RESONANCE | 114 |
| hs | `fractal_dream` | Fractal Dream | hs.fractal-dream | RESONANCE | 74 |
| hs | `harmonize` | Harmonize | hs.harmonize | RESONANCE | 74 |
| hs | `host_ken` | Host Ken | hs.host-ken | RESONANCE | 75 |
| hs | `hyperthreading` | Hyperthreading | hs.hyperthreading | RESONANCE | 75 |
| hs | `malleable_icon` | Malleable Icon | hs.malleable-icon | RESONANCE | 114 |
| hs | `munge` | Munge | hs.munge | RESONANCE | 114 |
| hs | `munge_spark` | Munge Spark | hs.munge-spark | RESONANCE | 115 |
| hs | `noiseless` | Noiseless | hs.noiseless | RESONANCE | 115 |
| hs | `noisestorm` | Noisestorm | hs.special-protosapient-attack-noisestorm | RESONANCE | 116 |
| hs | `primal_rage` | Primal Rage | hs.primal-rage | RESONANCE | 116 |
| hs | `psychotropic_biofeedback` | Psychotropic Biofeedback | hs.special-null-attack-psychotropic-biofeedback | RESONANCE | 116 |
| hs | `shield` | Shield | hs.shield | RESONANCE | 74 |
| hs | `signal_boost` | Signal Boost | hs.signal-boost | RESONANCE | 75 |
| hs | `virtual_processing` | Virtual Processing | hs.virtual-processing | RESONANCE | 116 |
| ll | `drake_armor` | Armor (drake) | ll.armor | PHYSICAL | 19 |
| ll | `underwater_adaption` | Underwater Adaption | ll.underwater-adaptation | PHYSICAL | 19 |
| ll | `vestigial_wings` | Vestigial Wings | ll.vestigial-wings | PHYSICAL | 20 |
| sw | `skill` | Skill | sw.skill | PHYSICAL | 56 |

#### range (38)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| crb | `camouflage` | Camouflage | crb.camouflage | LINE_OF_SIGHT | 194 |
| crb | `cookie` | Cookie | crb.cookie | LINE_OF_SIGHT | 194 |
| crb | `diagnostics` | Diagnostics | crb.diagnostics | LINE_OF_SIGHT | 194 |
| crb | `electron_storm` | Electron Storm | crb.electron-storm | LINE_OF_SIGHT | 194 |
| crb | `hash` | Hash | crb.hash | LINE_OF_SIGHT | 194 |
| crb | `override` | Override | crb.override | LINE_OF_SIGHT | 194 |
| crb | `phantom` | Phantom | crb.phantom | LINE_OF_SIGHT | 194 |
| crb | `stability` | Stability | crb.stability | LINE_OF_SIGHT | 194 |
| crb | `suppression` | Suppression | crb.suppression | LINE_OF_SIGHT | 194 |
| crb | `trap` | Trap | crb.trap | LINE_OF_SIGHT | 194 |
| crb | `watermark` | Watermark | crb.watermark | LINE_OF_SIGHT | 195 |
| hs | `authority` | Authority | hs.authority | SELF | 114 |
| hs | `captivate` | Captivate Audience | hs.captivate-audience | SELF | 73 |
| hs | `cybercombat_boost` | Cybercombat Boost | hs.cybercombat-boost | SELF | 75 |
| hs | `death_mark` | Death Mark | hs.death-mark | LINE_OF_SIGHT | 74 |
| hs | `device_ken` | Device Ken | hs.device-ken | SELF | 75 |
| hs | `digital_scream` | Digital Scream | hs.digital-scream | SELF | 74 |
| hs | `entropic_conversion` | Entropic Conversion | hs.entropic-conversion | SELF | 114 |
| hs | `file_ken` | File Ken | hs.file-ken | SELF | 75 |
| hs | `fnord` | Fnord | hs.fnord | SELF | 114 |
| hs | `fractal_dream` | Fractal Dream | hs.fractal-dream | LINE_OF_SIGHT | 74 |
| hs | `harmonize` | Harmonize | hs.harmonize | SELF | 74 |
| hs | `host_ken` | Host Ken | hs.host-ken | SELF | 75 |
| hs | `hyperthreading` | Hyperthreading | hs.hyperthreading | SELF | 75 |
| hs | `malleable_icon` | Malleable Icon | hs.malleable-icon | SELF | 114 |
| hs | `munge` | Munge | hs.munge | TOUCH | 114 |
| hs | `munge_spark` | Munge Spark | hs.munge-spark | TOUCH | 115 |
| hs | `noiseless` | Noiseless | hs.noiseless | SELF | 115 |
| hs | `noisestorm` | Noisestorm | hs.special-protosapient-attack-noisestorm | LINE_OF_SIGHT | 116 |
| hs | `primal_rage` | Primal Rage | hs.primal-rage | SELF | 116 |
| hs | `psychotropic_biofeedback` | Psychotropic Biofeedback | hs.special-null-attack-psychotropic-biofeedback | LINE_OF_SIGHT | 116 |
| hs | `shield` | Shield | hs.shield | SELF | 74 |
| hs | `signal_boost` | Signal Boost | hs.signal-boost | SELF | 75 |
| hs | `virtual_processing` | Virtual Processing | hs.virtual-processing | SELF | 116 |
| ll | `drake_armor` | Armor (drake) | ll.armor | SELF | 19 |
| ll | `underwater_adaption` | Underwater Adaption | ll.underwater-adaptation | SELF | 19 |
| ll | `vestigial_wings` | Vestigial Wings | ll.vestigial-wings | SELF | 20 |
| sw | `skill` | Skill | sw.skill | SELF | 56 |

#### duration (38)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| crb | `camouflage` | Camouflage | crb.camouflage | INSTANTANEOUS | 194 |
| crb | `cookie` | Cookie | crb.cookie | INSTANTANEOUS | 194 |
| crb | `diagnostics` | Diagnostics | crb.diagnostics | INSTANTANEOUS | 194 |
| crb | `electron_storm` | Electron Storm | crb.electron-storm | INSTANTANEOUS | 194 |
| crb | `hash` | Hash | crb.hash | INSTANTANEOUS | 194 |
| crb | `override` | Override | crb.override | INSTANTANEOUS | 194 |
| crb | `phantom` | Phantom | crb.phantom | INSTANTANEOUS | 194 |
| crb | `stability` | Stability | crb.stability | INSTANTANEOUS | 194 |
| crb | `suppression` | Suppression | crb.suppression | INSTANTANEOUS | 194 |
| crb | `trap` | Trap | crb.trap | INSTANTANEOUS | 194 |
| crb | `watermark` | Watermark | crb.watermark | INSTANTANEOUS | 195 |
| hs | `authority` | Authority | hs.authority | ALWAYS | 114 |
| hs | `captivate` | Captivate Audience | hs.captivate-audience | SUSTAINED | 73 |
| hs | `cybercombat_boost` | Cybercombat Boost | hs.cybercombat-boost | INSTANTANEOUS | 75 |
| hs | `death_mark` | Death Mark | hs.death-mark | SUSTAINED | 74 |
| hs | `device_ken` | Device Ken | hs.device-ken | INSTANTANEOUS | 75 |
| hs | `digital_scream` | Digital Scream | hs.digital-scream | INSTANTANEOUS | 74 |
| hs | `entropic_conversion` | Entropic Conversion | hs.entropic-conversion | INSTANTANEOUS | 114 |
| hs | `file_ken` | File Ken | hs.file-ken | INSTANTANEOUS | 75 |
| hs | `fnord` | Fnord | hs.fnord | INSTANTANEOUS | 114 |
| hs | `fractal_dream` | Fractal Dream | hs.fractal-dream | INSTANTANEOUS | 74 |
| hs | `harmonize` | Harmonize | hs.harmonize | SUSTAINED | 74 |
| hs | `host_ken` | Host Ken | hs.host-ken | INSTANTANEOUS | 75 |
| hs | `hyperthreading` | Hyperthreading | hs.hyperthreading | INSTANTANEOUS | 75 |
| hs | `malleable_icon` | Malleable Icon | hs.malleable-icon | ALWAYS | 114 |
| hs | `munge` | Munge | hs.munge | PERMANENT | 114 |
| hs | `munge_spark` | Munge Spark | hs.munge-spark | INSTANTANEOUS | 115 |
| hs | `noiseless` | Noiseless | hs.noiseless | ALWAYS | 115 |
| hs | `noisestorm` | Noisestorm | hs.special-protosapient-attack-noisestorm | INSTANTANEOUS | 116 |
| hs | `primal_rage` | Primal Rage | hs.primal-rage | ALWAYS | 116 |
| hs | `psychotropic_biofeedback` | Psychotropic Biofeedback | hs.special-null-attack-psychotropic-biofeedback | INSTANTANEOUS | 116 |
| hs | `shield` | Shield | hs.shield | SUSTAINED | 74 |
| hs | `signal_boost` | Signal Boost | hs.signal-boost | INSTANTANEOUS | 75 |
| hs | `virtual_processing` | Virtual Processing | hs.virtual-processing | ALWAYS | 116 |
| ll | `drake_armor` | Armor (drake) | ll.armor | ALWAYS | 19 |
| ll | `underwater_adaption` | Underwater Adaption | ll.underwater-adaptation | ALWAYS | 19 |
| ll | `vestigial_wings` | Vestigial Wings | ll.vestigial-wings | ALWAYS | 20 |
| sw | `skill` | Skill | sw.skill | ALWAYS | 56 |

#### action (37)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| crb | `camouflage` | Camouflage | crb.camouflage | MAJOR | 194 |
| crb | `cookie` | Cookie | crb.cookie | MAJOR | 194 |
| crb | `diagnostics` | Diagnostics | crb.diagnostics | MAJOR | 194 |
| crb | `electron_storm` | Electron Storm | crb.electron-storm | MAJOR | 194 |
| crb | `hash` | Hash | crb.hash | MAJOR | 194 |
| crb | `override` | Override | crb.override | MAJOR | 194 |
| crb | `phantom` | Phantom | crb.phantom | MAJOR | 194 |
| crb | `stability` | Stability | crb.stability | MAJOR | 194 |
| crb | `suppression` | Suppression | crb.suppression | MAJOR | 194 |
| crb | `trap` | Trap | crb.trap | MAJOR | 194 |
| crb | `watermark` | Watermark | crb.watermark | MAJOR | 195 |
| hs | `authority` | Authority | hs.authority | AUTO | 114 |
| hs | `captivate` | Captivate Audience | hs.captivate-audience | MAJOR | 73 |
| hs | `cybercombat_boost` | Cybercombat Boost | hs.cybercombat-boost | AUTO | 75 |
| hs | `death_mark` | Death Mark | hs.death-mark | MAJOR | 74 |
| hs | `device_ken` | Device Ken | hs.device-ken | AUTO | 75 |
| hs | `digital_scream` | Digital Scream | hs.digital-scream | MINOR | 74 |
| hs | `entropic_conversion` | Entropic Conversion | hs.entropic-conversion | MAJOR | 114 |
| hs | `file_ken` | File Ken | hs.file-ken | AUTO | 75 |
| hs | `fnord` | Fnord | hs.fnord | AUTO | 114 |
| hs | `fractal_dream` | Fractal Dream | hs.fractal-dream | MAJOR | 74 |
| hs | `harmonize` | Harmonize | hs.harmonize | MINOR | 74 |
| hs | `host_ken` | Host Ken | hs.host-ken | AUTO | 75 |
| hs | `hyperthreading` | Hyperthreading | hs.hyperthreading | AUTO | 75 |
| hs | `malleable_icon` | Malleable Icon | hs.malleable-icon | AUTO | 114 |
| hs | `munge` | Munge | hs.munge | MAJOR | 114 |
| hs | `munge_spark` | Munge Spark | hs.munge-spark | MINOR | 115 |
| hs | `noiseless` | Noiseless | hs.noiseless | AUTO | 115 |
| hs | `primal_rage` | Primal Rage | hs.primal-rage | AUTO | 116 |
| hs | `psychotropic_biofeedback` | Psychotropic Biofeedback | hs.special-null-attack-psychotropic-biofeedback | MAJOR | 116 |
| hs | `shield` | Shield | hs.shield | MAJOR | 74 |
| hs | `signal_boost` | Signal Boost | hs.signal-boost | AUTO | 75 |
| hs | `virtual_processing` | Virtual Processing | hs.virtual-processing | AUTO | 116 |
| ll | `drake_armor` | Armor (drake) | ll.armor | AUTO | 19 |
| ll | `underwater_adaption` | Underwater Adaption | ll.underwater-adaptation | AUTO | 19 |
| ll | `vestigial_wings` | Vestigial Wings | ll.vestigial-wings | AUTO | 20 |
| sw | `skill` | Skill | sw.skill | AUTO | 56 |

#### rating (18)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| aw | `raptor_skull` | Raptor Skull | aw.raptor-skull | 1–10 | 139 |
| bn | `shiawase_buoy` | Shiawase Aquatic Operations Buoy | bn.shiawase-aquatic-operations-buoy | 1–4 | 36 |
| bs | `biosculpt_minor` | Minor modification | bs.minor-modification | 1–20 | 56 |
| bs | `biosculpt_moderate` | Moderate modification | bs.moderate-modification | 1–5 | 56 |
| bs | `deprivation` | Deprivation | bs.deprivation | 1–6 | 125 |
| bs | `electrochromatic_hair` | Electrochromic Hair | bs.electrochromic-hair | 1–10 | 33 |
| bs | `pacifier` | Pacifier | bs.pacifier | 1–6 | 126 |
| bs | `pantophobia` | Pantophobia | bs.pantophobia | 1–6 | 126 |
| bs | `rave` | Rave | bs.rave | 1–6 | 126 |
| bs | `rigor_mortis` | Rigor Mortis | bs.rigor-mortis | 1–6 | 126 |
| bs | `vomit_comet` | Vomit Comet | bs.vomit-comet | 1–6 | 126 |
| crb | `docwagon_contract` | DocWagon Contract | crb.docwagon-contract-basic-basic-year | 1–6 | 281 |
| crb | `formula_focus` | Focus formula | crb.focus-formula | 1–9 | – |
| crb | `magical_lodge_materials` | Magical Lodge Materials | crb.magical-lodge-materials | 1–9 | 294 |
| dc | `electromag_shielding` | Electromagnetic Shielding | dc.electromagnetic-shielding | 1–99 | 130 |
| dc | `network_sharing` | Network Sharing Enhancement | dc.network-sharing-enhancement | 1–9 | 141 |
| hs | `dart_launcher` | Dart Launcher | hs.dart-launcher | 1–10 | 37 |
| sw | `athame` | Athame Blood Focus | sw.athame | 1–10 | 157 |

#### cost (12)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| bs | `frog_tongue` | Frog Tongue | bs.frog-tongue | 2000 | 65 |
| bs | `increased_myelination` | Increased Myelination | bs.genotype-enhancement-increased-myelination | 13000 | 95 |
| cln | `allergy_grenade` | Grenade, Hyperallergenic | cln.hyperallergenic | 50 | 38 |
| cln | `spore_grenade` | Grenade, Asphyxia Spores | cln.asphyxia-spores | 50 | 38 |
| dc | `rcc_headware` | Rigger Command Console | dc.rcc-headware | 4000 | 145 |
| dc | `smart_rig` | Smartsoft | dc.smartsoft | 250 | 146 |
| dc | `swarm_rig` | Swarm | dc.swarm | 250 | 146 |
| dc | `vulcan_utility_one` | Vulcan Systems Utility-One | dc.vulcan-systems-utility-one | 8500 | 95 |
| dod | `deathrattle` | Deathrattle Venom | dod.deathrattle-venom | 400 | 16 |
| hs | `eparkour` | eParkour | hs.eparkour | 100 | 56 |
| hs | `mannequin` | Mannequin | hs.mannequin | 100 | 56 |
| hs | `simshare` | SimShare | hs.simshare | 100 | 56 |

#### modes (9)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| aw | `ballistra_heavy` | Ballista, Heavy | aw.ballista-heavy | SS | 128 |
| aw | `ballistra_light` | Ballista, Light | aw.ballista-light | SS | 128 |
| aw | `ballistra_standard` | Ballista, Standard | aw.ballista-standard | SS | 128 |
| aw | `cannon_heavy` | Cannon, Heavy | aw.cannon-heavy | SS | 128 |
| aw | `cannon_light` | Cannon, Light | aw.cannon-light | SS | 128 |
| aw | `cannon_standard` | Cannon, Standard | aw.cannon-standard | SS | 128 |
| crb | `crossbow_heavy` | Crossbow, heavy | crb.crossbow-heavy | SS | 250 |
| crb | `crossbow_light` | Crossbow, light | crb.crossbow-light | SS | 250 |
| crb | `crossbow_standard` | Crossbow, standard | crb.crossbow-standard | SS | 250 |

#### ammo (6)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| aw | `ballistra_heavy` | Ballista, Heavy | aw.ballista-heavy | 1(m) | 128 |
| aw | `ballistra_light` | Ballista, Light | aw.ballista-light | 1(m) | 128 |
| aw | `ballistra_standard` | Ballista, Standard | aw.ballista-standard | 1(m) | 128 |
| aw | `cannon_heavy` | Cannon, Heavy | aw.cannon-heavy | 1(m) | 128 |
| aw | `cannon_light` | Cannon, Light | aw.cannon-light | 1(m) | 128 |
| aw | `cannon_standard` | Cannon, Standard | aw.cannon-standard | 1(m) | 128 |

#### karma (6)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| bn | `shifter_natural_venom` | Natural Venom | bn.natural-venom-shifter-add-on | 9 | 16 |
| shc | `getting_help` | Getting Help | shc.getting-help | 5 | 129 |
| swc | `favored_weapon_attachment` | Unhealthy Attachment | swc.unhealthy-attachment | 5 | 141 |
| swc | `natural_venom` | Natural Venom | swc.natural-venom | 9 | 119 |
| swc | `obsession_fulfilled` | Fulfilled | swc.fulfilled | 15 | 140 |
| swc | `sinners_path_shadows` | Into the Shadows | swc.into-the-shadows | 18 | 142 |

#### essence (3)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| bs | `cleaner_leech` | Cleaner Leech | bs.leech-symbionts-cleaner | 0.1 | 73 |
| bs | `frog_tongue` | Frog Tongue | bs.frog-tongue | 0.1 | 65 |
| bs | `increased_myelination` | Increased Myelination | bs.genotype-enhancement-increased-myelination | 0.01 | 95 |

#### capacity (2)

| book | id | name | our entry | Commlink6's value | page |
|---|---|---|---|---|---|
| bs | `modular_mount` | Modular Mount | bs.modular-mount | 4 | 46 |
| dc | `rcc_headware` | Rigger Command Console | dc.rcc-headware | 3 | 145 |

### List 2: every change we made relative to Commlink6

#### field values (312)

By book: aw 1, bn 4, bs 40, cln 1, crb 65, crb-ber 1, crb-sea 3, da 36, dc 14, emc 4, fs 45, hs 7, pwp 3, shc 1, sif-no 2, so 25, sw 45, swc 7, tkc 7, ts 1.

By class: book prints ours 266, errata 1, latest printing 5, owner ruling 40.

##### field values: aw

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| vehicles | `buzzard` | Buzzard | aw.buzzard | seats | 5 | 2 | book prints ours | AW p128: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: bn

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `shifter_barding_heavy` | Shifter Barding, heavy | bn.heavy-barding | cost | R1 1000, R2 2000, R3 3000, R4 4000, R5 5000, R6 6000, R7 7000, R8 8000, R9 9000, R10 10000, R11 11000, R12 12000, R13 13000, R14 14000, R15 15000, R16 16000, R17 17000, R18 18000, R19 19000, R20 20000 | Rating x 500 | book prints ours | BN p33: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `shifter_barding_light` | Shifter Barding, light | bn.light-barding | cost | R1 500, R2 1000, R3 1500, R4 2000, R5 2500, R6 3000, R7 3500, R8 4000, R9 4500, R10 5000, R11 5500, R12 6000, R13 6500, R14 7000, R15 7500, R16 8000, R17 8500, R18 9000, R19 9500, R20 10000 | Rating x 1000 | book prints ours | BN p33: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `smart_clothes` | Smart Clothes | bn.smart-clothes | cost | 1500 | 1500 + (Rating x 250) | book prints ours | BN p34: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `shifter_might` | Shifter Might | bn.shifter-might-shifter-add-on | karma | 5 | 8 | book prints ours | BN p17: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: bs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| augmentations | `biosprayer` | Biosprayer | bs.biosprayer-dazed | avail | 5 | 6 | book prints ours | BS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `bulk_modification` | Bulk Modification | bs.bulk-modification | cost | 500 | (Rating) x 500 | book prints ours | BS p44: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `cognitive_shield` | Cognitive Shield | bs.cognitive-shield | cost | 25000 | Rating x 25000 | book prints ours | BS p67: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `corrosive_spit` | Corrosive Spit | bs.corrosive-spit | cost | 5000 | Rating x 5000 | book prints ours | BS p71: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `electrosense` | Electrosense Organs | bs.electrosense-organs | essence | 0.2 | 0.1 | book prints ours | BS p68: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `eye_light_system` | Eye-Light System | bs.light-emitters | capacity | 1 | 2 | book prints ours | BS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `eye_light_system` | Eye-Light System | bs.light-emitters | essence | 0.2 | 0.1 | book prints ours | BS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `fangs` | Fangs | bs.fangs | cost | 1000 | 500 + 2 doses toxin | book prints ours | BS p48: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `fangs` | Fangs | bs.fangs | legality | (legal) | 3(L) | book prints ours | BS p48: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `foot_anchor` | Foot Anchor | bs.foot-anchor | avail | 6 | 5(L) | book prints ours | BS p41: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `foot_anchor` | Foot Anchor | bs.foot-anchor | cost | 50000 | 2000 | book prints ours | BS p41: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `foot_anchor` | Foot Anchor | bs.foot-anchor | essence | 2 | 0.25 | book prints ours | BS p41: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `generic_regeneration` | Genetic Regeneration | bs.augmented-healing-genetic-regeneration-with-implants | avail | 3 | 4 | book prints ours | BS p93: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hair_growth` | Hair Growth | bs.hair-growth | avail | 2 | 3 | book prints ours | BS p56: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hair_growth` | Hair Growth | bs.hair-growth | cost | 500 | 200 | book prints ours | BS p56: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hyper_glucagon` | Hyper-Glucagon | bs.genotype-enhancement-hyper-glucagon | avail | 6 | 5(L) | book prints ours | BS p97: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hyper_glucagon` | Hyper-Glucagon | bs.genotype-enhancement-hyper-glucagon | legality | I | 5(L) | book prints ours | BS p97: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `infrasound_emitter` | Infrasound Emitter | bs.infrasound-emitter | legality | (legal) | Rating(I) | book prints ours | BS p38: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `kill_switch` | Kill Switch | bs.kill-switch | cost | 750 | 300 | book prints ours | BS p30: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `kill_switch` | Kill Switch | bs.kill-switch | legality | I | 4(L) | book prints ours | BS p30: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `manasense_organ` | Manasense | bs.manasense | avail | 4 | 6 | book prints ours | BS p69: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `matrix_visualizer` | Matrix Visualizer | bs.matrix-visualizer | cost | 2500 | 2000 | book prints ours | BS p39: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `nde` | NDE | bs.genotype-enhancement-ndi | avail | 4 | 6(I) | book prints ours | BS p97: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `neuro_retention_amplification` | Neuro-Retention Amplification | bs.neuro-retention-amplification | avail | 4 | 3 | book prints ours | BS p66: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `perfect_pitch` | Perfect Pitch | bs.perfect-pitch | avail | 1 | 2 | book prints ours | BS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `perfect_pitch` | Perfect Pitch | bs.perfect-pitch | essence | 0.2 | 0.1 | book prints ours | BS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `physical_vigor` | Physical Vigor | bs.age-rejuvenation-physical-vigor | essence | 0.2 | 0.3 | book prints ours | BS p93: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `skin_pigmentation` | Skin Pigmentation | bs.skin-pigmentation | cost | 100 | 200 | book prints ours | BS p57: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `thermosense_organs` | Thermosense Organs | bs.thermosense-organs | avail | 4 | 6 | book prints ours | BS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `thermosense_organs` | Thermosense Organs | bs.thermosense-organs | cost | 2500 | 5000 | book prints ours | BS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `thorns_skin` | Thorns | bs.thorns | cost | 2000 | 2500 | book prints ours | BS p64: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `tough_gut` | Tough Gut | bs.tough-gut | essence | 0 | 0.15 | book prints ours | BS p66: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `trolls_eyes` | Troll Eyes | bs.troll-eyes | avail | 6 | 4 | book prints ours | BS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `trolls_eyes` | Troll Eyes | bs.troll-eyes | cost | 6000 | 4000 | book prints ours | BS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `nanospy_refill` | Nanospy Refill | bs.nanospy-refill | cost | 300 | 1200 | book prints ours | BS p89: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `nanspy_kit` | Nanospy | bs.nanospy-kit | cost | 1400 | 9500 | book prints ours | BS p89: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `neurochemical_regulator` | Neurochemical Regulator | bs.bioamplifier-nanites-neurochemical-regulator-colony | avail | 3 | 6(I) | book prints ours | BS p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `neurochemical_regulator` | Neurochemical Regulator | bs.bioamplifier-nanites-neurochemical-regulator-colony | cost | 5500 | 45000 | owner ruling | BS p88 (owner 2026-10-17): the colonies & nanites table prints the colony template at 45,000¥ (pre-built 4,500¥); Commlink6's 5,500¥ is the Neocortical Neural Amplifier row above it (owner rule 2026-10-17: a printed table wins) |
| gear | `soothsayer` | Soothsayer | bs.soothsayer | avail | 8 | 6I | book prints ours | BS p118: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `essence_regrowth` | Essence Regrowth | bs.essence-regrowth | karma | 5 | 10 | book prints ours | BS p16: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: cln

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `spore_grenade` | Grenade, Asphyxia Spores | cln.asphyxia-spores | avail | 4 | – | owner ruling | CLN p38 (owner 2026-10-17): the stat block prints no AVAIL; Commlink6's 4 is the gas grenade's 4(I) without its (I) (3D) |

##### field values: crb

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `armor_vest` | Armor vest | crb.armor-vest | avail | 4 | 2 | book prints ours | CRB p265: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `lined_coat` | Lined coat | crb.lined-coat | avail | 4 | 2 | book prints ours | CRB p265: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `control_rig` | Control Rig | crb.control-rig | cost | R1 30000, R2 60000, R3 90000 | Rating^2 x 30000 | latest printing | CRB p283: the Current Printing prints ours; sixth-world-core-rulebook-berlin-city-edition-ca prints Commlink6's |
| augmentations | `cyber_shotgun` | Implanted Shotgun | crb.shotgun | cost | 4800 | 8500 | book prints ours | CRB p290: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hydraulic_jacks` | Hydraulic jacks | crb.hydraulic-jacks | cost | 2500 | Rating x 2500 | book prints ours | CRB p290: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `hydraulic_jacks` | Hydraulic jacks | crb.hydraulic-jacks | rating | 1–8 | 1–6 | owner ruling | CRB p290 (owner 2026-10-17): owner 2026-10-19: 1–6 (the range Body Shop p.148 prints for its critter hydraulic jacks; the core rulebook prints none), not Commlink6's 1–8; set by an owner row in crb.json |
| augmentations | `spurs` | Spurs | crb.spurs | avail | 3 | 4(I) | book prints ours | CRB p291: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `ultrasound_sensor` | Ultrasound sensor | crb.ultrasound-sensor | cost | 3600 | 36000 | latest printing | CRB p284: the Current Printing prints ours; sixth-world-core-rulebook-berlin-city-edition-ca prints Commlink6's |
| complexforms | `mirrored_persona` | Mirrored Persona | crb.mirrored-persona | duration | SUSTAINED | I | latest printing | CRB p190: the Current Printing prints ours; sixth-world-core-rulebook-berlin-city-edition-ca prints Commlink6's |
| critterpowers | `binding` | Binding | crb.binding | range | LINE_OF_SIGHT | Varies | book prints ours | CRB p222: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `concealment` | Concealment | crb.concealment | action | AUTO | Major | book prints ours | CRB p222: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `confusion` | Confusion | crb.confusion | action | AUTO | Major | book prints ours | CRB p222: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `elemental_attack` | Elemental Attack | crb.elemental-attack | action | AUTO | Major | book prints ours | CRB p223: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `energy_aura` | Energy Aura | crb.energy-aura | range | LINE_OF_SIGHT | Self | book prints ours | CRB p223: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `enhanced_sense` | Enhanced Senses | crb.enhanced-senses | duration | INSTANTANEOUS | Always | book prints ours | CRB p223: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `enhanced_sense` | Enhanced Senses | crb.enhanced-senses | range | LINE_OF_SIGHT | Self | book prints ours | CRB p223: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `influence` | Influence | crb.influence | action | AUTO | Major | book prints ours | CRB p225: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `innate_spell` | Innate Spell | crb.innate-spell | duration | INSTANTANEOUS | As spell | book prints ours | CRB p225: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `innate_spell` | Innate Spell | crb.innate-spell | power type | MANA | As spell | book prints ours | CRB p225: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| critterpowers | `innate_spell` | Innate Spell | crb.innate-spell | range | LINE_OF_SIGHT | As spell | book prints ours | CRB p225: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `binoculars` | Binoculars | crb.binoculars | cost | 50 | Capacity x 50 | book prints ours | CRB p274: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `camera_function` | Camera | crb.camera | cost | 0 | Capacity x 100 | book prints ours | CRB p274: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `directional_microphone_function` | Directional microphone | crb.directional-microphone | cost | 0 | Capacity x 50 | book prints ours | CRB p275: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `fairlight_excalibur` | Fairlight Excalibur | crb.fairlight-excalibur | avail | 6 | 8(I) | latest printing | CRB p267: the Current Printing prints ours; sixth-world-core-rulebook-berlin-city-edition-ca prints Commlink6's |
| electronics | `laser_microphone_function` | Laser microphone | crb.laser-microphone | cost | 0 | Capacity x 100 | book prints ours | CRB p276: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `omni_directional_microphone_function` | Omnidirectional microphone | crb.omnidirectional-microphone | cost | 0 | Capacity x 50 | book prints ours | CRB p276: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `shiawase_cyber6` | Shiawase Cyber-6 | crb.shiawase-cyber-6 | avail | 5 | 6(I) | latest printing | CRB p267: the Current Printing prints ours; sixth-world-core-rulebook-berlin-city-edition-ca prints Commlink6's |
| electronics | `single_sensor` | Single sensor | crb.single-sensor | avail | 3 | 2 | book prints ours | CRB p276: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `ammo_cannon` | Assault Cannon (10x) | crb.assault-cannon | avail | 2 | 4(I) | book prints ours | CRB p262: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `ammo_cannon` | Assault Cannon (10x) | crb.assault-cannon | cost | 15 | 50 | book prints ours | CRB p262: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `ammo_cannon` | Assault Cannon (10x) | crb.assault-cannon | legality | L | 4(I) | book prints ours | CRB p262: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `datasoft` | Datasoft | crb.datasoft | cost | 150 | 120 | book prints ours | CRB p271: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `lockpick_set` | Lockpick kit | crb.lockpick-set | legality | L | 2 | book prints ours | CRB p278: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `magical_lodge_materials` | Magical Lodge Materials | crb.magical-lodge-materials | legality | (legal) | (Force) L | book prints ours | CRB p295: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `power_focus` | Power focus | crb.power-focus | avail | 3 | (Force +3) L | book prints ours | CRB p294: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `power_focus` | Power focus | crb.power-focus | legality | (legal) | (Force +3) L | book prints ours | CRB p294: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `sim_module` | SIM module | crb.sim-module | avail | 2 | — | book prints ours | CRB p268: the PDF prints ours (cl6check's PDF check) |
| gear | `standard_rope` | Standard rope | crb.standard-rope | cost | 20 | 50 | book prints ours | CRB p281: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `tutorsoft` | Tutorsoft | crb.tutorsoft | avail | R1 0, R2 0, R3 1, R4 1, R5 1, R6 2 | Rating / 3 | book prints ours | CRB p272: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `vision_enhancement` | Vision enhancement | crb.vision-enhancement | capacity | 1 | 2 | book prints ours | CRB p275: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `weapon_focus` | Weapon focus | crb.weapon-focus | avail | 3 | (Force +3) L | book prints ours | CRB p294: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `weapon_focus` | Weapon focus | crb.weapon-focus | legality | (legal) | (Force +3) L | book prints ours | CRB p294: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `chaos` | Chaos | crb.chaos | spell type | MANA | P | book prints ours | CRB p137: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `fling` | Fling | crb.fling | range | T | LOS | book prints ours | CRB p140: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ammo_arrow` | Arrow | crb.arrow | avail | R1 0, R2 0, R3 1, R4 1, R5 1, R6 2, R7 2, R8 2, R9 3, R10 3, R11 3, R12 4, R13 4, R14 4 | (Rating/3) | book prints ours | CRB p250: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_viper_slivergun` | Ares Viper Slivergun | crb.ares-viper-slivergun | dv | 3P | 4P(fl) | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `aztechnology_striker` | Aztechnology Striker | crb.aztechnology-striker | ar | ,4,10,9,5 | —/4/10/9/6 | book prints ours | CRB p259: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_cobra_tz100` | Colt Cobra TZ100 | crb.colt-cobra-tz-100 | modes | SA/FA | SA/BF | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_cobra_tz110` | Colt Cobra TZ110 | crb.colt-cobra-tz-110 | modes | SA/FA | SA/BF | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_cobra_tz120` | Colt Cobra TZ120 | crb.colt-cobra-tz-120 | ar | 10,10,7,, | 10/11/8/—/— | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_cobra_tz120` | Colt Cobra TZ120 | crb.colt-cobra-tz-120 | modes | SA/FA | SA/BF | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_m23` | Colt M23 | crb.colt-m23 | cost | 1500 | 5100 | book prints ours | CRB p256: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_manhunter` | Colt Manhunter | crb.colt-government-manhunter | ar | 11,9,7,, | 10/8/6/—/— | book prints ours | CRB p254: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `defiance_t250_shortbarrel` | Defiance T-250 (Short barrel) | crb.defiance-t-250 | ar | 8,8,4,, | 7/10/6/—/— | book prints ours | CRB p255: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `defiance_t250_shortbarrel` | Defiance T-250 (Short barrel) | crb.defiance-t-250 | dv | 3P | 4P | book prints ours | CRB p255: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `extendable_baton` | Extendable baton | crb.extendable-baton | cost | 50 | 52 | book prints ours | CRB p248: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `fichetti_security_600` | Fichetti Security 600 | crb.fichetti-security-600 | avail | 2 | 3(L) | book prints ours | CRB p252: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `knucks` | Knucks | crb.knucks | ar | 5,,,, | 6/—/—/—/— | book prints ours | CRB p249: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `parashield_dart_pistol` | Parashield DART Pistol | crb.parashield-dart-pistol | cost | 600 | 510 | book prints ours | CRB p258: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `parashield_dart_rifle` | Parashield DART Rifle | crb.parashield-dart-rifle | cost | 1200 | 710 | book prints ours | CRB p258: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `pjss_model_55` | PJSS Model 55 | crb.pjss-model-55 | cost | 825 | 325 | book prints ours | CRB p255: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `smartgun_system` | Smartgun system | crb.smartgun-system-internal | avail | 2 | 1(L) | book prints ours | CRB p260: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `streetline_special` | Streetline Special | crb.streetline-special | cost | 325 | 200 | book prints ours | CRB p251: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `throwing_stars` | Throwing Stars | crb.throwing-stars | ar | 9,11,4,, | 9/11/5/—/— | book prints ours | CRB p250: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `walther_palm_pistol` | Walther Palm Pistol | crb.walther-palm-pistol | cost | 325 | 345 | book prints ours | CRB p251: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: crb-ber

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `off_the_grid` | Off the Grid | crb-ber.off-the-grid | karma | 9 | 8 | book prints ours | CRB-BER p331: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: crb-sea

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `tres_chick_cloak` | Trés Chic cloak | crb-sea.tres-chic-cloak | avail | 2 | 4 | book prints ours | CRB-SEA p335: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `water_repellent_coating` | Water-Repellent Coating | crb-sea.water-repellent-coating | avail | 1 | – | owner ruling | CRB-SEA p335 (owner 2026-10-17): a prose-only coating, no AVAIL; Commlink6's 1 is the Disposable Cloak row beside it (3E) |
| qualities | `what_doesnt_kill_you` | What Doesn't Kill You | crb-sea.what-doesnt-kill-you | positive | true | negative | book prints ours | CRB-SEA p328: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: da

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| adeptpowers | `motion_sense` | Motion Sense | da.motion-sense | activation | MAJOR_ACTION | Passive / Major Action | book prints ours | DA p171: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| adeptpowers | `multi_targeting` | Multi-Targeting | da.multi-targeting | activation | PASSIVE | Minor Action | book prints ours | DA p171: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `paraplate` | ParaPlate | da.paraplate | cost | 3000 | Rating x 3000 | book prints ours | DA p176: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hardened` | Hardened | da.meat-grinder | capacity | 2 | 8 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hardened` | Hardened | da.meat-grinder | essence | 0.1 | 0.5 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker1` | The Hurt Locker Rating 1 | da.the-hurt-locker-rating-1 | avail | 2 | – | owner ruling | DA p45 (owner 2026-10-17): hotmods are not sold in stores (p44); the p45 table has no AVAIL column (3C) |
| augmentations | `xcw_hurt_locker1` | The Hurt Locker Rating 1 | da.the-hurt-locker-rating-1 | capacity | 3 | 1 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker1` | The Hurt Locker Rating 1 | da.the-hurt-locker-rating-1 | cost | 800 | 300 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker1` | The Hurt Locker Rating 1 | da.the-hurt-locker-rating-1 | essence | 0.3 | 0.2 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker2` | The Hurt Locker Rating 2 | da.the-hurt-locker-rating-2 | avail | 2 | – | owner ruling | DA p45 (owner 2026-10-17): hotmods are not sold in stores (p44); the p45 table has no AVAIL column (3C) |
| augmentations | `xcw_hurt_locker2` | The Hurt Locker Rating 2 | da.the-hurt-locker-rating-2 | capacity | 3 | 1 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker2` | The Hurt Locker Rating 2 | da.the-hurt-locker-rating-2 | cost | 1000 | 500 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_hurt_locker2` | The Hurt Locker Rating 2 | da.the-hurt-locker-rating-2 | essence | 0.3 | 0.2 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_starting` | Extreme Cyberweapon | da.four-thousand-newtons | capacity | 2 | 6 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| augmentations | `xcw_starting` | Extreme Cyberweapon | da.four-thousand-newtons | essence | 0.1 | 0.5 | book prints ours | DA p45: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `mortar_mb80` | Mortar Bomb M80 | da.m80 | cost | 1200 | 1600 | book prints ours | DA p60: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| vehicles | `sukhoi_evo` | Sukhoi-Evo SU-74 Sokol | da.sukhoi-evo-su-74-sokol | seats | 2 | 1 | book prints ours | DA p138: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `al_assad` | al-Assad | da.al-assad | ammo | 4(ml) | 2(ml) per tube (c) | book prints ours | DA p58: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `al_assad_rocket` | al-Assad | da.al-assad | cost | 2000 | 13500 | book prints ours | DA p58: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_firebird` | Ares Firebird | da.firebird | ammo | 20(belt) | Energy | book prints ours | DA p63: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_firebolt` | Ares Firebolt | da.firebolt | ammo | 10(c) | Energy | book prints ours | DA p63: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_firebrand` | Ares Firebrand | da.firebrand | ammo | 5(c)/20(d) | Energy | book prints ours | DA p63: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_fireserpent` | Ares Fireserpent | da.fire-serpent | modes | SA | SS/SA(2) | book prints ours | DA p142: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `aztech_relampago` | Aztech Relampago | da.relampago | dv | 11P | 18P | book prints ours | DA p142: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `aztech_xicohtencatl` | Aztech Xicohtencatl | da.xicohtencatl | ar | ,4,7,12,11 | —/4/7/12/12 (9km) | book prints ours | DA p142: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ballista_ii_rocket` | Ballista II | da.ballista-ii | cost | 2000 | 11900 | book prints ours | DA p58: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `carl_gustaf_shell` | Carl Gustaf | da.carl-gustaf | cost | 1800 | 6500 | book prints ours | DA p58: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `chakram` | Chakram | da.chakram | ar | 10,9,3,, | 10/—/—/—/— | book prints ours | DA p42: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `chakri` | Chakri | da.chakri | ar | 5,4,1,, | 5/—/—/—/— | book prints ours | DA p47: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ergonomic_optimization` | Ergonomic Optimization | da.ergonomic-optimization | cost | 350 | 325 | book prints ours | DA p32: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `krime_gloves` | Krime Gloves | da.krime-gloves | ar | 5,,,, | 6/—/—/—/— | book prints ours | DA p31: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `krime_gloves` | Krime Gloves | da.krime-gloves | dv | 4S(e) | 3P | book prints ours | DA p31: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `mortar_m1330` | Mortar M1330 | da.m1330 | ammo | 1(ml) | 1(z) | book prints ours | DA p60: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `mortar_m8330` | Mortar M8330 | da.m8330 | ammo | 1(ml) | 1(z-2) | book prints ours | DA p60: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `rhipsalis` | Rhipsalis SMG | da.rhipsalis | dv | 3P | 5P(fl) | book prints ours | DA p51: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `tripod_powered` | Powered Heavy Tripod | da.powered-heavy-tripod | avail | 3 | 5(L) | book prints ours | DA p64: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: dc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `armor_standard` | Armor (Standard) | dc.standard-armor | rating | 1–80 | Up to 2 x Body | book prints ours | DC p133: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `expanded_ammo` | Expanded Ammo Bins | dc.expanded-ammo-bins | cost | 400 | 400 x Rating | book prints ours | DC p143: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `grey_mana_integration` | Grey Mana Integration | dc.grey-mana-integration | cost | R1 2500, R2 5000, R3 7500, R4 10000, R5 12500, R6 15000 | Rating x 2500/4000 | book prints ours | DC p134: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `increase_seating` | Increase Seating | dc.increased-seating-cf-mod | rating | 1–99 | 1 | book prints ours | DC p128: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `increased_integrity` | Increased Structural Integrity | dc.increased-structural-integrity | rating | 1–60 | Up to ½ Body | owner ruling | DC p125 (owner 2026-10-17): owner 2026-10-19: book range |
| gear | `living_space` | Living Space | dc.living-space-cf-mod | avail | 2 | Rating + 1 | book prints ours | DC p128: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `network_sharing` | Network Sharing Enhancement | dc.network-sharing-enhancement | cost | R1 86000, R2 87000, R3 88000, R4 89000, R5 90000, R6 91000, R7 92000, R8 93000, R9 94000 | 85000 | book prints ours | DC p141: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `portable_facility` | Portable Facility - Facility | dc.portable-facility-cf-mod | cost | 50000 | 75000 | book prints ours | DC p129: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `weapon_turret_standard` | Weapon mount-Turret-Standard | dc.standard-weapon-mount | avail | 6 | 4(I) | book prints ours | DC p142: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `weapon_turret_standard` | Weapon mount-Turret-Standard | dc.standard-weapon-mount | cost | 8500 | 2500 | book prints ours | DC p142: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `winch` | Winch with Hook | dc.winch | avail | 2 | Rating x 2 | book prints ours | DC p144: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| vehicles | `ford_bison` | Ford Bison III | dc.ford-bison-iii | seats | 6 | 2/10 | book prints ours | DC p31: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| vehicles | `ford_lifeline` | Ford Lifeline | dc.ford-lifeline | seats | 10 | Special | book prints ours | DC p32: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| vehicles | `yamaha_nodachi` | Yamaha Nodachi | dc.yamaha-nodachi | interval | 30 | 300 | book prints ours | DC p24: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: emc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `good_ol_folks` | Good Ol’ Folks | emc.good-ol-folks | karma | 7 | 5 | book prints ours | EMC p168: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `the_briar_patch` | The Briar Patch | emc.the-briar-patch | karma | 5 | 3 | book prints ours | EMC p140: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `what_doesnt_kill_you` | What Doesn’t Kill You | emc.what-doesnt-kill-you | karma | 3 | 4 | book prints ours | EMC p140: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `what_doesnt_kill_you` | What Doesn’t Kill You | emc.what-doesnt-kill-you | positive | true | negative | book prints ours | EMC p140: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: fs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `av_wild_hunt` | AV Wild Hunt | fs.wild-hunt | avail | 2 | 3 | book prints ours | FS p51: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `av_wild_hunt` | AV Wild Hunt | fs.wild-hunt | cost | 500 | 3000 | book prints ours | FS p51: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `basic_duty_utilities` | Basic Duty Utilities | fs.basic-duty-utilities | defense | 1 | 2 | book prints ours | FS p47: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `mystic_weave` | Mystic Weave | fs.mystic-weave | cost | R1 5000, R2 10000, R3 15000, R4 20000 | Rating x 10000 | book prints ours | FS p55: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `reactive_armor_plates` | Reactive Armor Plates | fs.reactive-armor-plates | cost | 2500 | Rating x 2500 | book prints ours | FS p55: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `vi_ace_of_clubs` | VI Ace of Clubs | fs.vashon-island-ace-of-clubs | avail | 4 | 5 | book prints ours | FS p52: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `vi_ace_of_diamonds` | VI Ace of Diamonds | fs.vashon-island-ace-of-diamonds | avail | 4 | 6 | book prints ours | FS p52: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `vi_ace_of_hearts` | VI Ace of Hearts | fs.vashon-island-ace-of-hearts | avail | 4 | 5 | book prints ours | FS p52: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `vi_actioneer_buisness` | VI Actioneer Business Clothing | fs.vashon-island-actioneeer-business-clothing | avail | 4 | 2 | book prints ours | FS p55: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ares_arms_vigorous` | Ares Arms Vigorous | fs.ares-arms-vigorous | ar | 1,9,11,9,5 | 1/9/11/9/6 | errata | errata FS p31 |
| weapons | `ares_gunfighter_scabbard` | Ares Gunfighter Scabbard | fs.ares-gunfighter-scabbard | avail | 4 | 5(L) | book prints ours | FS p68: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `cavalier_parashield_emergency_responder` | Cavalier Arms-Parashield Emergency Responder | fs.cavalier-parashield-emergency-responder | modes | BF/FA | SA/BF | book prints ours | FS p20: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `colt_ms-27` | Colt MS-27 | fs.colt-ms-27 | ammo | 12(c)/32(d) | 12(c) | book prints ours | FS p20: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `concealbale_quickdraw_holster` | Concealable Quick Draw Holster | fs.concealable-quick-draw-holster | legality | (legal) | 2(L) | book prints ours | FS p70: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `directional_mine_modification` | Directional Mine Modification | fs.directional-mine-modification | legality | (legal) | +2(L) | book prints ours | FS p38: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `flashlight_low-light` | Flashlight, Low-Light | fs.flashlight-low-light | avail | 3 | 1 | book prints ours | FS p71: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `flashlight_low-light` | Flashlight, Low-Light | fs.flashlight-low-light | cost | 75 | 100 | book prints ours | FS p71: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `flashlight_low-light` | Flashlight, Low-Light | fs.flashlight-low-light | legality | I | 1 | book prints ours | FS p71: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `foregrip` | Foregrip | fs.foregrip | cost | 250 | 140 | book prints ours | FS p59: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `gecko_grip_modification` | Gecko Grip Modification | fs.gecko-grip-modification | legality | (legal) | +2(L) | book prints ours | FS p38: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `hell_turtle` | Hell Turtle | fs.hell-turtle | dv | 3P | 3–5P | book prints ours | FS p43: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `horizon_flynn_dcom_taser` | Defense-Com Taser | fs.horizon-flynn-defense-com-weapons-taser-stun-gun | legality | L | 3 | book prints ours | FS p33: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ingram_black_knight` | Ingram Black Knight | fs.ingram-black-knight | ammo | 50(c)/100(belt) | 10(m) | book prints ours | FS p29: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ingram_white_knight` | Ingram White Knight | fs.ingram-white-knight-mod-2 | cost | 7500 | 750 | book prints ours | FS p30: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `iron_bear_combat_axe` | Iron Bear Combat Axe | fs.iron-bear-combat-axe | dv | 5P | 5P/5S | book prints ours | FS p39: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `land_mine_modification` | Landmine Modification | fs.landmine-modification | legality | (legal) | +2(L) | book prints ours | FS p38: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `pulse` | Pulse | fs.pulse | dv | 1S | (1–10) S | book prints ours | FS p43: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ranger_arms_aa16_warhammer` | Ranger Arms AA-16 | fs.ranger-arms-aa-16 | ammo | 12(c)/32(d) | 12(c) | book prints ours | FS p22: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ranger_arms_eagle_eye` | Ranger Arms “Eagle Eye” Targeting Sensor Suite | fs.ranger-arms-eagle-eye-targeting-sensor-suite | avail | 2 | 5(L) | book prints ours | FS p74: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ranger_arms_eagle_eye` | Ranger Arms “Eagle Eye” Targeting Sensor Suite | fs.ranger-arms-eagle-eye-targeting-sensor-suite | cost | 115 | 550 | book prints ours | FS p74: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ranger_arms_eagle_eye` | Ranger Arms “Eagle Eye” Targeting Sensor Suite | fs.ranger-arms-eagle-eye-targeting-sensor-suite | legality | (legal) | 5(L) | book prints ours | FS p74: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ruthenium_coating` | Ruthenium Rifle Sheath | fs.ruthenium-rifle-sheath | legality | I | 4 | book prints ours | FS p74: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `smart_materials_melee` | Smart Materials (Melee weapons) | fs.smart-materials | avail | 2 | 3 | book prints ours | FS p63: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `smart_materials_melee` | Smart Materials (Melee weapons) | fs.smart-materials | cost | 65 | 900 | book prints ours | FS p63: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `tactical_hammer` | Tactical Hammer | fs.tactical-hammer-short | dv | 2S | 2P | book prints ours | FS p14: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `tonfa_zoe_heritage` | Tonfa (Zoé Heritage) | fs.zoe-heritage-tonfa | avail | 1 | 3 (L) | book prints ours | FS p16: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `tonfa_zoe_heritage` | Tonfa (Zoé Heritage) | fs.zoe-heritage-tonfa | legality | (legal) | 3 (L) | book prints ours | FS p16: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `trench_knife` | Trench Knife | fs.trench-knife | dv | 3P | 3P/S | book prints ours | FS p12: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `trigger_removal` | Trigger Removal | fs.trigger-removal | legality | L | 3(I) | book prints ours | FS p64: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ultimax_71` | Ultimax 71 | fs.ultimax-71 | avail | 4 | 3(L) | book prints ours | FS p19: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `ultimax_71` | Ultimax 71 | fs.ultimax-71 | cost | 720 | 550 | book prints ours | FS p19: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `urban_tribe_tomahawk_mkii` | Urban Tribe Tomahawk Mk II | fs.urban-tribe-tomahawk-mk-ii | avail | 1 | 3 | book prints ours | FS p15: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `urban_tribe_tomahawk_mkii` | Urban Tribe Tomahawk Mk II | fs.urban-tribe-tomahawk-mk-ii | cost | 75 | 150 | book prints ours | FS p15: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `weapon_security_system` | Weapon Security System | fs.weapon-security-system | avail | 2 | 3(L) | book prints ours | FS p65: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `weapon_security_system` | Weapon Security System | fs.weapon-security-system | legality | (legal) | 3(L) | owner ruling | FS p65 (owner 2026-10-17): the book prints AVAIL 3(L): legality L; Commlink6 has avail 2, no letter (Group 4) |

##### field values: hs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| complexforms | `unravel_encryption` | Unravel Encryption | hs.unravel-encryption | fade | RATING | Encryption Rating | book prints ours | HS p67: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| electronics | `fairlight_falchion` | Fairlight Falchion | hs.fairlight-falchion | cost | 380350 | 380250 | book prints ours | HS p53: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `breadbox_case` | Breadbox Case | hs.breadbox-case | capacity | 99 | Unlimited/Unlimited | book prints ours | HS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `dart_launcher` | Dart Launcher | hs.dart-launcher | avail | 2 | 5(I) | book prints ours | HS p37: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `gonzo_case` | Gonzo Case | hs.gonzo-case-cyberdeck | capacity | 2 | 2/2 | book prints ours | HS p36: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `matrix_relay` | Matrix Relay | hs.matrix-relay-2 | rating | 1–12 | 4–6 | book prints ours | HS p44: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `rfid_spy_tags` | Spy Tag | hs.spy-tags | rating | 1–6 | 2 | book prints ours | HS p43: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: pwp

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `dog_on_a_leash` | Dog on a Leash | pwp.dog-on-a-leash | positive | false | positive | book prints ours | PWP p146: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `shinto_summoner` | Shinto Summoner | pwp.shinto-summoner | karma | 6 | 2 | book prints ours | PWP p146: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `social_outcast` | Social Outcast | pwp.social-outcast | karma | 6 | 5 | book prints ours | PWP p158: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: shc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `force_recon` | Force Recon | shc.force-recon | positive | true | negative | book prints ours | SHC p93: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: sif-no

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `uv_floodlight` | UV Floodlight | sif-no.uv-light-uv-floodlight | cost | 100 | 1000 | book prints ours | SIF-NO p28: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| vehicles | `surfstar_marine_seacop` | Surfstar Marine Seacop | sif-no.surfstar-marine-seacop-powerboat | avail | 62 | 6 | book prints ours | SIF-NO p30: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: so

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `power_suit` | Power Suit | so.power-suit | avail | 1 | Rating/2 | book prints ours | SO p116: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `scavanged_rags` | Scavenged Rags | so.scavenged-rags | avail | 1 | — | book prints ours | SO p116: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `tres_chic` | Très Chic | so.tres-chic | avail | 1 | Rating/2 | book prints ours | SO p116: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| armor | `tres_chic` | Très Chic | so.tres-chic | cost | R1 500, R2 1000, R3 1500, R4 2000, R5 2500, R6 3000, R7 3500, R8 4000, R9 4500, R10 5000, R11 5500, R12 6000 | Rating x 1000 | book prints ours | SO p116: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `explosive_nail_polish_remover` | Explosive Cosmetics Nail Polish Remover | so.explosive-cosmetics-nail-polish-remover | avail | 6 | 4 | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `explosive_nail_polish_remover` | Explosive Cosmetics Nail Polish Remover | so.explosive-cosmetics-nail-polish-remover | legality | I | 4 | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `fear_of_god` | Fear of God! | so.fear-of-god | avail | 6 | – | owner ruling | SO p113 (owner 2026-10-17): Smooth Operations preparations use Street Wyrd's three-stat set (p113), no AVAIL; Commlink6 invents 6 (3B) |
| gear | `love_potion_10` | Love Potion #10 | so.love-potion-10 | avail | 6 | – | owner ruling | SO p113 (owner 2026-10-17): Smooth Operations preparations use Street Wyrd's three-stat set (p113), no AVAIL; Commlink6 invents 6 (3B) |
| gear | `no_means_no` | No Means NO! | so.no-means-no | avail | 6 | – | owner ruling | SO p113 (owner 2026-10-17): Smooth Operations preparations use Street Wyrd's three-stat set (p113), no AVAIL; Commlink6 invents 6 (3B) |
| gear | `pixel_tags_ctrl_prof` | Pixel Tag Controller (Professional) | so.professional-controller | avail | 3 | 4 | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `pixel_tags_ctrl_prof` | Pixel Tag Controller (Professional) | so.professional-controller | cost | 750 | 5000 | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_ebony` | Swindler Stick (Ebony) | so.swindler-stick-ebony | avail | 5 | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_ebony` | Swindler Stick (Ebony) | so.swindler-stick-ebony | legality | (legal) | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_gold` | Swindler Stick (Gold) | so.swindler-stick-gold | avail | 2 | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_gold` | Swindler Stick (Gold) | so.swindler-stick-gold | legality | (legal) | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_platin` | Swindler Stick (Platin) | so.swindler-stick-platinum | avail | 3 | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_platin` | Swindler Stick (Platin) | so.swindler-stick-platinum | legality | (legal) | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_silver` | Swindler Stick (Silver) | so.swindler-stick-silver | avail | 1 | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_silver` | Swindler Stick (Silver) | so.swindler-stick-silver | legality | (legal) | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_standard` | Swindler Stick (Standard) | so.swindler-stick-standard | avail | 1 | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `swindler_credstick_standard` | Swindler Stick (Standard) | so.swindler-stick-standard | legality | (legal) | 4(I) | book prints ours | SO p126: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `area_thought_recognition` | Area Thought Recognition | so.area-thought-recognition | range | LOS(A) | Touch | book prints ours | SO p109: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `clear_thoughts` | Clear Thoughts | so.clear-thoughts | spell category | ILLUSION | health | book prints ours | SO p108: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `cold_shower` | Cold Shower | so.cold-shower | spell category | ILLUSION | health | book prints ours | SO p108: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `thought_recognition` | Thought Recognition | so.thought-recognition | range | LOS | Touch | book prints ours | SO p109: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: sw

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| adeptpowers | `commanding_voice` | Commanding Voice | sw.commanding-voice | activation | PASSIVE | Major Action | book prints ours | SW p78: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `bean_counter_bean` | Bean Counter Bean | sw.bean-counter-bean | avail | 6 | – | owner ruling | SW p90 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `cold_as_ice` | Cold As Ice | sw.cold-as-ice | avail | 6 | – | owner ruling | SW p92 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `deep_breath_disc` | Deep Breath Disc | sw.deep-breath-disk | avail | 6 | – | owner ruling | SW p92 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `dream_weaver` | Dream Weaver | sw.dreamweaver | avail | 6 | – | owner ruling | SW p93 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `drop_it` | Drop It Like It's Hot | sw.drop-it-like-its-hot | avail | 6 | – | owner ruling | SW p93 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `emergency_exit` | Emergency Exit | sw.emergency-exit | avail | 6 | – | owner ruling | SW p93 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `free_dive_deep_breath_mask` | Free Dive Deep Breath Mask | sw.free-dive-deep-breath-mask | avail | 6 | 4 | book prints ours | SW p92: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `free_dive_deep_breath_mask` | Free Dive Deep Breath Mask | sw.free-dive-deep-breath-mask | legality | L | 4 | book prints ours | SW p92: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `instant_makeover` | Instant Makeover | sw.instant-makeover | avail | 6 | – | owner ruling | SW p96 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `instant_outfit` | Instant Outfit | sw.instant-outfit | avail | 6 | – | owner ruling | SW p96 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `instant_rejuvenation` | Instant Rejuvenation | sw.instant-rejuvenation | avail | 6 | – | owner ruling | SW p96 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `instant_window` | Instant Window | sw.instant-window | avail | 6 | – | owner ruling | SW p96 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `louisville_slumberer` | Louisville Slumberer | sw.louisville-slumberer | avail | 6 | – | owner ruling | SW p97 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `magic_nozzle_hose` | Magic Nozzle, Hose | sw.the-magic-nozzle | avail | 6 | – | owner ruling | SW p97 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `magic_nozzle_tsunami` | Magic Nozzle, Tsunami | sw.the-magic-nozzle-tsunami | avail | 6 | – | owner ruling | SW p97 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `magiczap_marble_plus` | MagicZap Marble Plus | sw.magiczap-marble-plus | cost | 460 | 450 | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_MB_10` | Manadyne MB-10 | sw.manadyne-mb-10 | avail | 6 | – | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_MB_100` | Manadyne MB-100 | sw.manadyne-mb-100 | avail | 6 | – | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_MB_100` | Manadyne MB-100 | sw.manadyne-mb-100 | cost | 550 | 500 | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_PB_10` | Manadyne PB-10 | sw.manadyne-pb-10 | avail | 6 | – | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_PB_100` | Manadyne PB-100 | sw.manadyne-pb-100 | avail | 6 | – | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `manadyne_PB_100` | Manadyne PB-100 | sw.manadyne-pb-100 | cost | 550 | 500 | book prints ours | SW p98: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| gear | `one_less_in_the_world` | One Less In The World | sw.one-less-in-the-world | avail | 6 | – | owner ruling | SW p99 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `petspy` | Pet Spy | sw.petspy | avail | 6 | – | owner ruling | SW p100 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `remote_slapping_blast` | Remote Slapping Glove, Blast | sw.remote-slapping-glove-blast | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `remote_slapping_clout` | Remote Slapping Glove, Clout | sw.remote-slapping-glove | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `runflat` | Runflat, My Hoop | sw.runflat-my-hoop | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `runflat_four` | On Four Bald Tires | sw.on-four-bald-tires | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `secret_handshake` | Secret Handshake, Babble | sw.secret-handshake | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `secret_handshake_cant` | Secret Handshake, Cant | sw.secret-handshake-thieves-cant | avail | 6 | – | owner ruling | SW p101 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `snack_stoppers` | Stuffer Shack Snack Stoppers | sw.stuffer-shack-snack-stoppers | avail | 6 | – | owner ruling | SW p102 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `strain_breaker` | Strain Breaker | sw.strain-breaker | avail | 6 | – | owner ruling | SW p102 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `super_epipen` | Super-Epipen | sw.super-epipen | avail | 6 | – | owner ruling | SW p102 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `superbinder` | Superbinder | sw.superbinder | avail | 6 | – | owner ruling | SW p102 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `trade_in_tonic` | Trade In Topic | sw.trade-in-tonic | avail | 6 | – | owner ruling | SW p103 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `translation_lenses` | Translation Lenses | sw.translation-lenses | avail | 6 | – | owner ruling | SW p103 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| gear | `twinsies` | Twinsies! | sw.twinsies | avail | 6 | – | owner ruling | SW p103 (owner 2026-10-17): Street Wyrd preparations print Cost, Usability and Shelf-Life (p87), no AVAIL; Commlink6 invents 6 (3A) |
| spells | `disrupt` | Disrupt | sw.disrupt | spell type | PHYSICAL | M | book prints ours | SW p25: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `ectomagic_pulse` | Ectomagic Pulse | sw.ectomagic-pulse | spell type | PHYSICAL | M | book prints ours | SW p25: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `glue` | Glue | sw.glue | drain | -2 | Special | book prints ours | SW p39: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `looking_glass` | Looking Glass | sw.looking-glass | drain | -2 | Special | book prints ours | SW p40: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `mob_mind` | Mob Mind | sw.mob-mind | spell type | PHYSICAL | M | book prints ours | SW p42: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `mob_mood` | Mob Mood | sw.mob-mood | spell type | PHYSICAL | M | book prints ours | SW p42: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| spells | `rosebush` | Rosebush | sw.rosebush | range | LOS | LOS(A) | book prints ours | SW p38: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: swc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| packs | `pack_smg_praetor` | Submachine Gun-FN P93 Praetor | swc.fn-p93-praetor | cost | 1850 | 2000 | book prints ours | SWC p57: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `feathers` | Feathers | swc.feathers | karma | 5 | 4 | book prints ours | SWC p129: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `hairless` | Hairless | swc.hairless | karma | 5 | 4 | book prints ours | SWC p129: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `metahuman_traits` | Metahuman Traits | swc.metahuman-traits | karma | 6 | 8 | book prints ours | SWC p120: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `obsession_consumed` | Consumed | swc.consumed | karma | 0 | 15 | book prints ours | SWC p140: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `obsession_misfortune` | Momentous Misfortune | swc.momentous-misfortune | karma | 0 | 25 | book prints ours | SWC p138: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| qualities | `pachy` | Pachy | swc.pachy-rhino-elephant-hippo | karma | 4 | 5 | book prints ours | SWC p127: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: tkc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| weapons | `guizhen_1_flash_scope` | Guizhen 1 Flash Scope | tkc.flash-scope | modes | SS/SA | SA | book prints ours | TKC p86: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_1_mob_light` | Guizhen 1 Mob Light | tkc.mob-light | modes | SS/SA | SA | book prints ours | TKC p86: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_2_hall_of_tears` | Guizhen 2 Hall of Tears | tkc.hall-of-tears | dv | 10S | (8–10)S | book prints ours | TKC p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_2_hall_of_tears` | Guizhen 2 Hall of Tears | tkc.hall-of-tears | modes | SS | SS/SUS | book prints ours | TKC p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_2_pulse_hammer` | Guizhen 2 Pulse Hammer | tkc.pulse-hammer | dv | 10S | (6–10)S | book prints ours | TKC p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_2_pulse_hammer` | Guizhen 2 Pulse Hammer | tkc.pulse-hammer | modes | SS/SA | SS/SA/SUS | book prints ours | TKC p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |
| weapons | `guizhen_2_storm_shield` | Guizhen 2 Storm Shield | tkc.storm-shield | dv | 10S | (6–10)S | book prints ours | TKC p87: the page's text prints ours (owner check 2026-10-14, value_keep.json) |

##### field values: ts

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `ammo_foam_carbine` | Foamtek Refill Carbine | ts.foamtek-carbine-tank-refill | avail | 4 | – | owner ruling | TS p147 (owner 2026-10-17): the refill is priced in the carbine's notes, no AVAIL; Commlink6's 4 is the carbine's 4(L) (3F) |

#### structure kept as ours (49)

By book: bs 1, cln 2, crb 16, da 12, fs 3, hs 3, so 10, swc 1, ts 1.

By class: book prints ours 3, owner ruling 46.

##### structure kept as ours: bs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| augmentations | `electrosense` | Electrosense Organs | bs.electrosense-organs | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: cln

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| weapons | `allergy_grenade` | Grenade, Hyperallergenic | cln.hyperallergenic | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `spore_grenade` | Grenade, Asphyxia Spores | cln.asphyxia-spores | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: crb

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| augmentations | `cyberdeck` | Cyberdeck | crb.cyberdeck | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| electronics | `simrig` | Simrig | crb.simrig | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| gear | `ares_lf_silencer` | Ares Light Fire Series Silencer | crb.silencer-suppressor | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| gear | `gyro_mount` | Gyro mount | crb.gyro-mount | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| gear | `laser_sight` | Laser sight | crb.laser-sight | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| gear | `periscope` | Periscope | crb.periscope | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `armor` | Armor | crb.armor | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `blackout` | Blackout | crb.blackout | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `overclock` | Overclock | crb.overclock | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `stealth` | Stealth | crb.stealth | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ammo_cannon` | Assault Cannon (10x) | crb.assault-cannon | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ammo_heavy_smg` | Heavy Pistol/SMG (10x) | crb.heavy-pistol-smg | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ammo_holdout_light_machine` | Holdout/L.Pistol/Mach. Pistol (10x) | crb.holdout-light-pistol-machine-pistol | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ammo_machine_gun` | Machine Gun (10x) | crb.machine-gun | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ammo_rifles` | Rifles (10x) | crb.rifles | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `ares_lf_silencer` | Ares Light Fire Series Silencer | crb.silencer-suppressor | requires | (Commlink6's structure) | (ours) | owner ruling | an accepted structural difference: ours is the book's own prerequisite (value_keep.json `keep`, 2026-10-16; docs/cl6check.md) |

##### structure kept as ours: da

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| weapons | `artillery_a105` | Artillery Shell A105 | da.artillery-shells-a105 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `artillery_a155` | Artillery Shell A155 | da.artillery-shells-a155 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `artillery_a203` | Artillery Shell A203 | da.artillery-shells-a203 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `cannon_105` | Cannon Shell C105 | da.smoothbore-cannon-shells-c105 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `cannon_120` | Cannon Shell C120 | da.smoothbore-cannon-shells-c120 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `cannon_130` | Cannon Shell C130 | da.smoothbore-cannon-shells-c130 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `cannon_140` | Cannon Shell C140 | da.smoothbore-cannon-shells-c140 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `mortar_m40` | Mortar Bomb m40 | da.m40 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `mortar_mb120` | Mortar Bomb M120 | da.mortar-bombs-m120 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `mortar_mb160` | Mortar Bomb M160 | da.mortar-bombs-m160 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `mortar_mb80` | Mortar Bomb M80 | da.m80 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `range_7` | 7 km | da.m60 | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: fs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `concealable_ammo_pouch` | Concealable ammo pouch | fs.concealable-ammo-pouch | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `mems_medkit_pouch` | Medkit Pouch | fs.modular-equipment-mounting-system-mems-mems-medkit-pouch | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| weapons | `machine_gun_blast_shield` | Machine Gun Blast Shield | fs.machine-gun-blast-shields | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: hs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| electronics | `wearable_case` | Wearable Case | hs.wearable-case | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `attribute_augmentation` | Attribute Augmentation | hs.attribute-augmentation | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| programs | `attribute_overclocking` | Attribute Overclocking | hs.attribute-overclocking | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: so

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `blue_collar` | Blue Collar Clothing | so.blue-collar | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `business_casual` | Business Casual | so.business-casual | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `casual_wear` | Casual Wear | so.casual-wear | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `cheap_clothes` | Cheap Clothes | so.cheap-clothes | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `fashion_accessory_tres_chic` | Fashion Accessory (Très Chic) | so.tres-chic | social | (Commlink6's structure) | (ours) | book prints ours | the book prints the Social rating as `Rating` (value_keep.json `keep`) |
| armor | `fashion_accessory_tres_chic` | Fashion Accessory (Très Chic) | so.tres-chic | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `power_suit` | Power Suit | so.power-suit | social | (Commlink6's structure) | (ours) | book prints ours | the book prints the Social rating as `Rating` (value_keep.json `keep`) |
| armor | `power_suit` | Power Suit | so.power-suit | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |
| armor | `uniform` | Uniform | so.uniform | social | (Commlink6's structure) | (ours) | book prints ours | the book prints the Social rating as `Rating` (value_keep.json `keep`) |
| armor | `uniform` | Uniform | so.uniform | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

##### structure kept as ours: swc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `astral_hazing_awakened` | Astral Hazing | swc.astral-hazing | requires | (Commlink6's structure) | (ours) | owner ruling | an accepted structural difference: ours is the book's own prerequisite (value_keep.json `keep`, 2026-10-16; docs/cl6check.md) |

##### structure kept as ours: ts

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| electronics | `security_scanner` | Security scanner | ts.full-body-scanner-booth | variants | (Commlink6's structure) | (ours) | owner ruling | one item of ours where Commlink6 gives variant tags (an install option, a warhead option): the owner's one-item rule (value_keep.json `keep`) |

#### effects (50)

By book: bn 2, bs 6, crb 9, crb-ber 1, dc 10, dod 1, fs 4, hs 2, nf 3, sif-no 3, so 2, sw 1, swc 6.

By class: book prints ours 15, owner ruling 35.

##### effects: bn

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| metaecho | `augmentation_integration` | Augmentation Integration | – | valmod ATTRIBUTE ESSENCE_HOLE | 100 | derived:essence-hole add R*0.25 | book prints ours | 1b: the book prints 0.25 Essence per level |
| metaecho | `savage_rend` | Savage Rend | – | valmod ITEM_ATTRIBUTE ATTACK_RATING apply=ANIMAL | 0.5 | derived:unarmed-ar add R | owner ruling | owner-flag: the book adds +1 AR per level (and +1 DV per two); Commlink6 has half a point |

##### effects: bs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| item | `neural_pattern_reinforcement` | Neural Pattern Reinforcement | – | checkmod ATTRIBUTE LOGIC what=DICE | 1 | – | owner ruling | owner-flag: the book gives +1 on skill tests linked to Agility; Commlink6 says Logic |
| item | `pulmonary_arcane_arrester` | Pulmonary Arcane Arrester | – | checkmod ATTRIBUTE DEFENSE_POOL_MATRIX what=EDGE_ONLY_TEST | 1 | – | owner ruling | owner-flag: Commlink6 puts the Edge on the Matrix defense pool; the book gives it on Magic Resistance tests |
| item | `spider_eyes` | Spider Eyes | – | checkmod SKILL perception what=EDGE_BOOST | 1 | skill:perception edge 1 | owner ruling | owner-flag: the book lowers the Surprise threshold and Edge boost costs, and gives wireless Edge on visual Perception; Commlink6 has an Edge boost on Perception |
| item | `vocal_modification` | Vocal Modification | – | checkmod SKILL con what=EDGE_ONLY_TEST | 1 | – | owner ruling | owner-flag: the book gives the Growler Edge on Intimidation tests (Influence); Commlink6 puts it on Con |
| quality | `drug_tolerant` | Drug Tolerant | – | checkmod ATTRIBUTE RESIST_TOXIN what=EDGE apply=CHARACTER | 1 | – | owner ruling | owner-flag: the book gives a point of Edge on Addiction tests; Commlink6 puts it on toxin resistance |
| quality | `sensitive_nose` | Sensitive Nose | – | checkmod ATTRIBUTE RESIST_TOXIN what=DICE | 2 | – | owner ruling | owner-flag: the book gives -2 on physical-attribute tests when exposed to an inhaled toxin; Commlink6 has +2 toxin resistance |

##### effects: crb

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| ammotype | `flechette` | Ammo Flechette | – | valmod ITEM_ATTRIBUTE ATTACK_RATING | -1,-1,-1,-1,-1 | item:ar add 1,1,1,1,1 | book prints ours | 1b: the book prints +1 AR |
| focus | `sustaining_focus` | Sustaining focus | – | checkmod SKILL sorcery | $LEVEL | – | owner ruling | owner default: the book lets the focus sustain the spell for you and states no dice; Commlink6 has Sorcery dice equal to the Force |
| item | `balance_augmenter` | Balance Augmenter | – | checkmod SKILL athletics what=EDGE | 1 | skill:athletics add 1 | book prints ours | 1e: the book gives a die |
| item | `bone_lacing` | Bone lacing | – | valmod ITEM_ATTRIBUTE DAMAGE apply=UNARMED | 2 | derived:unarmed-dv add 1 | book prints ours | 1b: the book prints +1 for aluminium |
| item | `cyberarm` | Cyberarm | – | valmod ATTRIBUTE PHYSICAL_MONITOR set=AUGMENTED apply=CHARACTER | 0.5 | derived:physical-monitor add 1 | book prints ours | 1b: a partial cyberlimb gives a whole box in the book |
| item | `cyberears` | Cyberears | – | checkmod SKILL perception what=EDGE | 1 | – | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| item | `cyberleg` | Cyberleg | – | valmod ATTRIBUTE PHYSICAL_MONITOR | 0.5 | derived:physical-monitor add 1 | book prints ours | 1b: a partial cyberlimb gives a whole box in the book |
| item | `encryption_rcc` | Encryption | – | valmod ITEM_ATTRIBUTE FIREWALL apply=PERSONA | 2 | matrix:firewall add 1 | owner ruling | owner ruling: the book gives the rigger program +1 Firewall; Commlink6 has 2 |
| quality | `will_to_live` | Will To Live | – | valmod ATTRIBUTE DAMAGE_OVERFLOW | 1 | derived:overflow add R*2 | book prints ours | 1b: the book prints 2 per level |

##### effects: crb-ber

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| quality | `exotic_style` | Exotic Style | – | checkmod SKILL stealth what=EDGE_ONLY_TEST apply=CHARACTER | 1 | – | owner ruling | owner-flag: the book gives three ornamental modifications and no benefit; Commlink6 has Edge on Stealth |

##### effects: dc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| designmod | `economy_engines` | Economy Engines | – | valmod ITEM_ATTRIBUTE ACCELERATION | +3/+3 | item:acceleration add -3 | owner ruling | owner-flag: the book decreases Acceleration by 3; Commlink6 prints +3 |
| item | `armor_ceramic` | Armor (Ceramic) | – | checkmod ITEM_ATTRIBUTE DEFENSE_PHYSICAL what=DICE | $$ARMOR/4 | – | owner ruling | owner-flag: the book adds dice to Body for damage resistance tests; Commlink6 puts them on the physical defense of the item |
| item | `soft_knowledge` | Knowledge | – | valmod SKILL LANGUAGE | 3 | – | owner ruling | owner-flag: Commlink6 gives the Knowledge autosoft a Language skill of 3; the book gives Edge when searching with the knowledge skill |
| quality | `dead_stick` | Dead Stick | – | valmod SKILL piloting | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| quality | `driving_style_getaway_driver` | Driving Style: Getaway Driver | – | checkmod ACTION double_down what=EDGE_BOOST | 1 | – | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| quality | `driving_style_getaway_driver` | Driving Style: Getaway Driver | – | checkmod ACTION escape what=EDGE_BOOST | 2 | action:escape edge-cost-set 1 | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| quality | `driving_style_getaway_driver` | Driving Style: Getaway Driver | – | checkmod ACTION evade_pursuit what=EDGE_BOOST | 2 | action:evade-pursuit edge-cost-set 1 | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| quality | `driving_style_getaway_driver` | Driving Style: Getaway Driver | – | checkmod ACTION evasive_action what=EDGE_BOOST | 2 | action:evasive-action edge-cost-set 1 | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| quality | `driving_style_interceptor` | Driving Style: Interceptor | – | checkmod ACTION redline what=EDGE_BOOST | 2 | action:redline edge-cost -1 | owner ruling | effects review 2026-10-18: the printed text rules (Getaway Driver and Interceptor halve the Edge costs, round up: owner default; cyber-ears' Edge is against a target whose hearing is interfered with, not a Hearing Perception bonus) |
| quality | `easy_mark` | Easy Mark (Stealth) | – | valmod SKILL stealth | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |

##### effects: dod

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| power | `precise_throw` | Precise Throw | – | valmod ITEM_ATTRIBUTE ATTACK_RATING | 1,1,1,0,0 | item:ar add R | owner ruling | owner-flag: the book adds +1 AR per level with no bands; Commlink6 lists the bands |

##### effects: fs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| item | `detachable_drum_magazine` | Detachable Drum Magazine | – | valmod ITEM_ATTRIBUTE AMMUNITION | -98 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| item | `melee_hidden_arm_slide` | Hidden Melee Arm Slide | – | valmod ITEM_ATTRIBUTE CONCEALABILITY | 1 | item:concealability add -1 | owner ruling | owner-flag: the book decreases the Concealability threshold by 1, which is a negative modifier; Commlink6 has +1 |
| item | `ranger_arms_eagle_eye` | Ranger Arms “Eagle Eye” Targeting Sensor Suite | – | valmod ITEM_ATTRIBUTE ATTACK_RATING | -4,-5,+4,+3,+2 | item:ar add -4,-5,-4,3,2 | book prints ours | 1b: the book prints band 3 as -4 |
| itemenhancement | `weapon_commlink` | Weapon Commlink | – | valmod ITEM_ATTRIBUTE FIREWALL apply=PERSONA | 1 | matrix:firewall add 2 | book prints ours | 1b: the book prints Firewall 2 |

##### effects: hs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| datastructure | `master_key` | Master Key | – | checkmod ACTION known_exploit what=DICE | $LEVEL | – | owner ruling | owner-flag: the book names Brute Force, Probe and Backdoor Entry; Commlink6 adds Known Exploit |
| item | `mefeed` | MeFeed | – | checkmod ACTION matrix_perception what=EDGE_ONLY_TEST | 1 | – | owner ruling | owner-flag: the book gives the Edge on Matrix searches; Commlink6 puts it on Matrix Perception |

##### effects: nf

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| item | `external_synth` | External synth link | – | valmod SKILL con | 1 | skill:con add 2 | owner ruling | owner-flag: the book prints a dice pool effect of 2; Commlink6 has 1 |
| item | `instrument_professional` | Instrument 2 (professional) | – | valmod SKILL con | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| item | `instrument_rising_star` | Instrument 3 (rising star) | – | valmod SKILL con | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |

##### effects: sif-no

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| quality | `bayou_born` | Bayou Born | – | checkmod SKILL outdoors what=EDGE_ONLY_TEST | 1 | skill:outdoors edge-cost -1 | book prints ours | 1e: the book gives a cheaper Edge boost, not Edge |
| quality | `bayou_born` | Bayou Born | – | checkmod SKILL perception what=EDGE_ONLY_TEST | 1 | skill:perception edge-cost -1 | book prints ours | 1e: the book gives a cheaper Edge boost, not Edge |
| quality | `bayou_born` | Bayou Born | – | checkmod SKILL stealth what=EDGE_ONLY_TEST | 1 | skill:stealth edge-cost -1 | book prints ours | 1e: the book gives a cheaper Edge boost, not Edge |

##### effects: so

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| quality | `poker_face` | Poker Face | – | checkmod ATTRIBUTE COMPOSURE what=EDGE apply=CHARACTER | 1 | derived:composure add rank:con; derived:composure edge-cost 1 | book prints ours | 1e: the book reading wins |
| quality | `practiced_paranoia` | Practiced Paranoia | – | checkmod ATTRIBUTE JUDGE_INTENTIONS what=EDGE apply=CHARACTER | 1 | derived:judge-intentions add rank:con; derived:judge-intentions wild-die 1 | book prints ours | 1e: the book reading wins |

##### effects: sw

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| power | `countermagic` | Countermagic | – | valmod ATTRIBUTE DEFENSE_POOL_COMBAT_DIRECT | 1 | – | owner ruling | owner-flag: the book adds a die per level to tests to resist spells (test:magic-resistance); Commlink6 puts it on the direct-spell pool, which would count it twice |

##### effects: swc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| quality | `bark` | Bark | – | checkmod ATTRIBUTE DEFENSE_RATING_PHYSICAL what=EDGE apply=CHARACTER | 1 | derived:defense add 2 | book prints ours | 1e: the book gives +2 Defense Rating |
| quality | `relentless_tracker` | Relentless Tracker | – | checkmod SKILL outdoors what=EDGE | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| quality | `soothing_static` | Soothing Static | – | checkmod SKILL cracking what=EDGE_COST_MALUS | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| quality | `soothing_static` | Soothing Static | – | checkmod SKILL electronics what=EDGE_COST_MALUS | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| quality | `trust_issues` | Trust Issues | – | checkmod SKILL con what=NOT_EARN_EDGE | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |
| quality | `trust_issues` | Trust Issues | – | checkmod SKILL con what=NOT_SPEND_EDGE | 0 | (no effect) | owner ruling | owner ruling 2026-10-18: a CL6 placeholder (0 or -98), no real effect; write none |

#### classes (3)

By book: bs 1, crb-sea 1, dc 1.

By class: book prints ours 3.

##### classes: bs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| augmentations | `fangs` | Fangs | bs.fangs | class | BIOWARE/BIOWARE_WEAPON | (ours) | book prints ours | Body Shop prints the Fangs as a cyberware implant weapon (p48: cyberware, Essence 0.1, capacity [3]); Commlink6 also has a bioware Fangs (p71, BIOWARE/BIOWARE_WEAPON) that we don't catalogue. Ours keeps CYBERWARE/CYBER_IMPLANT_WEAPON (cyberweapon_fangs). |

##### classes: crb-sea

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `ballistic_hood` | Ballistic Hood | crb-sea.ballistic-hood | class | ACCESSORY/ARMOR_BODY | (ours) | book prints ours | Commlink6 has two records for the Seattle Ballistic Hood: this one classed ACCESSORY/ARMOR_BODY and ballistic_hood_armor (ARMOR/ARMOR_HELMET, a mod-only part); our one entry is the helmet-class armor (p335). |

##### classes: dc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `suncell_electr` | Suncell | dc.suncell | class | MOD_ELEC/MOD_COAT | (ours) | book prints ours | Double Clutch p135-136 prints one Suncell, under Efficiency and Fuel Mods, 'may use either Powertrain or Electronic mod slots'; Commlink6 has two records (suncell_power MOD_POWER/MOD_EFFICIENCY p135, suncell_electr MOD_ELEC/MOD_COAT p138). Ours keeps the power one. |

#### relocations (101)

By book: bn 1, bs 1, crb 14, crb-sea 1, da 10, dc 30, fs 10, hs 8, kk 3, nf 5, pwp 1, shc 1, sif-no 2, so 1, swc 6, tkc 2, ts 5.

By class: book prints ours 93, owner ruling 8.

##### relocations: bn

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| ammotypes | `metal_bullets_gold` | Ammo, Gold | bn.silver-bullets-gold | source/name | bn: Ammo, Gold | bn.silver-bullets-gold | book prints ours | Ammo, Gold: already have under another name (A1) |

##### relocations: bs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| weapons | `ammo_flametosser` | Fuel for Flametosser (5x) | bs.fuel-per-5-shots | source/name | bs: Fuel for Flametosser (5x) | bs.fuel-per-5-shots | book prints ours | Fuel for Flametosser (5x): already have under another name (A1) |

##### relocations: crb

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| actions | `register_sprite` | Register Sprite | crb.registering-a-sprite | source/name | crb: Register Sprite | crb.registering-a-sprite | book prints ours | Register Sprite: already have (C); also crb.registered-sprite-tasks |
| actions | `running_silent` | Toggle Silent Running | crb.running-silent | source/name | crb: Toggle Silent Running | crb.running-silent | book prints ours | Toggle Silent Running: already have under another name (A1) |
| adeptpowers | `improved_ability_combat` | Improved Combat Ability | crb.improved-ability-skill | source/name | crb: Improved Combat Ability | crb.improved-ability-skill | book prints ours | Improved Combat Ability: already have under another name (A1) |
| echoes | `attack_upgrade` | Attack Upgrade | crb.matrix-attribute-upgrade | source/name | crb: Attack Upgrade | crb.matrix-attribute-upgrade | book prints ours | Attack Upgrade: already have under another name (A1) |
| echoes | `data_processing_upgrade` | Data Processing Upgrade | crb.matrix-attribute-upgrade | source/name | crb: Data Processing Upgrade | crb.matrix-attribute-upgrade | book prints ours | Data Processing Upgrade: already have under another name (A1) |
| echoes | `firewall_upgrade` | Firewall Upgrade | crb.matrix-attribute-upgrade | source/name | crb: Firewall Upgrade | crb.matrix-attribute-upgrade | book prints ours | Firewall Upgrade: already have under another name (A1) |
| echoes | `sleaze_upgrade` | Sleaze Upgrade | crb.matrix-attribute-upgrade | source/name | crb: Sleaze Upgrade | crb.matrix-attribute-upgrade | book prints ours | Sleaze Upgrade: already have under another name (A1) |
| gear | `ares_lf_silencer` | Ares Light Fire Series Silencer | crb.silencer-suppressor | source/name | crb: Ares Light Fire Series Silencer | crb.silencer-suppressor | book prints ours | Ares Light Fire Series Silencer: already have under another name (A1) |
| gear | `armor_increase` | Armor increase | crb.attribute-increase | source/name | crb: Armor increase | crb.attribute-increase | book prints ours | Armor increase: variant of other item (C); also crb.armor |
| gear | `spare_clip_predator` | Spare clip for weapons with variable ammunition system. | crb.ares-predator-vi-spare-magazine | source/name | crb: Spare clip for weapons with variable ammunition system. | crb.ares-predator-vi-spare-magazine | book prints ours | Spare clip for weapons with variable ammunition system.: already have under another name (A1) |
| npcs | `blademaster` | Blademaster | crb.yakuza-blademaster-adept | source/name | crb: Blademaster | crb.yakuza-blademaster-adept | book prints ours | Blademaster: in CRB (B) |
| npcs | `combat_mage` | Combat Mage | crb.lone-star-combat-mage | source/name | crb: Combat Mage | crb.lone-star-combat-mage | book prints ours | Combat Mage: in CRB (B) |
| npcs | `securityrigger` | Securityrigger | crb.minuteman-security-rigger | source/name | crb: Securityrigger | crb.minuteman-security-rigger | book prints ours | Securityrigger: in CRB (B) |
| npcs | `soldato` | Soldato | crb.mafia-soldato | source/name | crb: Soldato | crb.mafia-soldato | book prints ours | Soldato: in CRB (B) |

##### relocations: crb-sea

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `ballistic_hood_armor` | Ballistic Hood | crb-sea.ballistic-hood | source/name | crb-sea: Ballistic Hood | crb-sea.ballistic-hood | book prints ours | Ballistic Hood: our Seattle rain-gear row (p335) |

##### relocations: da

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `pag` | Pneumatic Anti-Shock Garments (PAG) | da.pag | source/name | da: Pneumatic Anti-Shock Garments (PAG) | da.pag | book prints ours | Pneumatic Anti-Shock Garments (PAG): catalogued under another name (D) |
| gear | `ceramic_plate_airframe` | Airframe Ceramic Plate | da.airframe-ceramic-plate | source/name | da: Airframe Ceramic Plate | da.airframe-ceramic-plate | book prints ours | Airframe Ceramic Plate: our vehicle design option (p150) |
| gear | `milspec_frame` | Mil-Spec Frame | da.mil-spec-frame | source/name | da: Mil-Spec Frame | da.mil-spec-frame | book prints ours | Mil-Spec Frame: our vehicle design option (p150) |
| gear | `milspec_hardpoint` | Mil-Spec Hardpoint | da.mil-spec-hardpoints | source/name | da: Mil-Spec Hardpoint | da.mil-spec-hardpoints | book prints ours | Mil-Spec Hardpoints: our vehicle design option (p150) |
| gear | `milspec_plate_heavy` | Heavy Mil-Spec Plate | da.heavy-mil-spec-plate | source/name | da: Heavy Mil-Spec Plate | da.heavy-mil-spec-plate | book prints ours | Heavy Mil-Spec Plate: our vehicle design option (p150) |
| vehicles | `ares_shadowstrider` | Ares Shadowstrider | da.ares-model-502-shadow-strider-cvw | source/name | da: Ares Shadowstrider | da.ares-model-502-shadow-strider-cvw | book prints ours | Ares Shadowstrider: already have under another name (A1) |
| vehicles | `sk_cyclops` | Saeder-Krupp Cyclops | da.s-k-cyclops | source/name | da: Saeder-Krupp Cyclops | da.s-k-cyclops | book prints ours | Saeder-Krupp Cyclops: our vehicle (p139) |
| weapons | `ammo_inferno` | Fuel for Inferno (10x) | da.ares-inferno-when-link-fired | source/name | da: Fuel for Inferno (10x) | da.ares-inferno-when-link-fired | book prints ours | Fuel for Inferno (10x): already have under another name (A1) |
| weapons | `garotte` | Garotte | da.garrote | source/name | da: Garotte | da.garrote | book prints ours | Garotte: already have under another name (A1) |
| weapons | `urumi` | Urumi | da.urumi-sword | source/name | da: Urumi | da.urumi-sword | book prints ours | Urumi: already have (C) |

##### relocations: dc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `weapon_turret_small` | Weapon mount-Turret-Small | dc.small-turreted-weapon-mount | source/name | dc: Weapon mount-Turret-Small | dc.small-turreted-weapon-mount | book prints ours | Weapon mount-Turret-Small: already have under another name (A1) |
| vehicles | `ares_black_sky` | Ares Black Sky | crb.ares-black-sky | source/name | dc: Ares Black Sky | crb.ares-black-sky | book prints ours | Ares Black Sky: in CRB (B) |
| vehicles | `ares_packmule` | Ares Packmule | crb.ares-packmule | source/name | dc: Ares Packmule | crb.ares-packmule | book prints ours | Ares Packmule: in CRB (B) |
| vehicles | `ares_venture` | Ares Venture | crb.ares-venture | source/name | dc: Ares Venture | crb.ares-venture | book prints ours | Ares Venture: in CRB (B) |
| vehicles | `artemis_industries_nightwing` | Artemis Industries Nightwing | crb.artemis-industries-nightwing | source/name | dc: Artemis Industries Nightwing | crb.artemis-industries-nightwing | book prints ours | Artemis Industries Nightwing: in CRB (B) |
| vehicles | `chrysler-nissan_pursuit_v` | Chrysler-Nissan Pursuit V | crb.chrysler-nissan-pursuit-v | source/name | dc: Chrysler-Nissan Pursuit V | crb.chrysler-nissan-pursuit-v | book prints ours | Chrysler-Nissan Pursuit V: in CRB (B) |
| vehicles | `cyberspace_designs_dalmatian` | Cyberspace Designs Dalmatian | crb.cyberspace-designs-dalmatian | source/name | dc: Cyberspace Designs Dalmatian | crb.cyberspace-designs-dalmatian | book prints ours | Cyberspace Designs Dalmatian: in CRB (B) |
| vehicles | `dodge_scoot` | Dodge Scoot | crb.dodge-scoot | source/name | dc: Dodge Scoot | crb.dodge-scoot | book prints ours | Dodge Scoot: in CRB (B) |
| vehicles | `eurocar_westwind_x80` | Eurocar Westwind X80 | crb.eurocar-westwind-x80 | source/name | dc: Eurocar Westwind X80 | crb.eurocar-westwind-x80 | book prints ours | Eurocar Westwind X80: in CRB (B) |
| vehicles | `federated-boeing_blackhawk` | Federated Boeing Blackhawk | crb.federated-boeing-blackhawk | source/name | dc: Federated Boeing Blackhawk | crb.federated-boeing-blackhawk | book prints ours | Federated Boeing Blackhawk: in CRB (B) |
| vehicles | `federated_boeing_osprey_x` | Federated Boeing Osprey X | crb.federated-boeing-osprey-x | source/name | dc: Federated Boeing Osprey X | crb.federated-boeing-osprey-x | book prints ours | Federated Boeing Osprey X: in CRB (B) |
| vehicles | `gmc_banshee` | GMC Banshee | crb.gmc-banshee | source/name | dc: GMC Banshee | crb.gmc-banshee | book prints ours | GMC Banshee: in CRB (B) |
| vehicles | `gmc_bulldog` | GMC Bulldog Step-Van | tkc.gmc-bulldog-stepvan | source/name | dc: GMC Bulldog Step-Van | tkc.gmc-bulldog-stepvan | book prints ours | GMC Bulldog Step-Van: in TKC (B) |
| vehicles | `harley-davidson_scorpion` | Harley-Davidson Scorpion | crb.harley-davidson-scorpion | source/name | dc: Harley-Davidson Scorpion | crb.harley-davidson-scorpion | book prints ours | Harley-Davidson Scorpion: in CRB (B) |
| vehicles | `hyundai_shin-hyung` | Hyundai Shin-Hyung | crb.hyundai-shin-hyung | source/name | dc: Hyundai Shin-Hyung | crb.hyundai-shin-hyung | book prints ours | Hyundai Shin-Hyung: in CRB (B) |
| vehicles | `lockheed_optic_x2` | Lockheed Optic-X2 | crb.lockheed-optic-x2 | source/name | dc: Lockheed Optic-X2 | crb.lockheed-optic-x2 | book prints ours | Lockheed Optic-X2: in CRB (B) |
| vehicles | `mct-nissan_roto_drone` | MCT-Nissan Roto-Drone | ml2083-03.mct-nissan-roto-drone | source/name | dc: MCT-Nissan Roto-Drone | ml2083-03.mct-nissan-roto-drone | book prints ours | MCT-Nissan Roto-Drone: in ML2083-03 (B) |
| vehicles | `mct-nissan_roto_drone` | MCT-Nissan Roto-Drone | ml2083-03.mct-nissan-roto-drone | source/name | dc: MCT-Nissan Roto-Drone | ml2083-03.mct-nissan-roto-drone | owner ruling | already in our data (owner decision: counts as complete) |
| vehicles | `mct-sikorsky-bell_seahawk` | MCT-Sikorsky-Bell Seahawk | crb.mct-sikorsky-bell-seahawk | source/name | dc: MCT-Sikorsky-Bell Seahawk | crb.mct-sikorsky-bell-seahawk | book prints ours | MCT-Sikorsky-Bell Seahawk: in CRB (B) |
| vehicles | `mct-sikorsky-bell_wolfhound` | MCT-Sikorsky-Bell Wolfhound | crb.mct-sikorsky-bell-wolfhound | source/name | dc: MCT-Sikorsky-Bell Wolfhound | crb.mct-sikorsky-bell-wolfhound | book prints ours | MCT-Sikorsky-Bell Wolfhound: in CRB (B) |
| vehicles | `mct_gnat` | MCT Gnat | crb.mct-gnat | source/name | dc: MCT Gnat | crb.mct-gnat | book prints ours | MCT Gnat: in CRB (B) |
| vehicles | `mct_hornet` | MCT Hornet | crb.mct-hornet | source/name | dc: MCT Hornet | crb.mct-hornet | book prints ours | MCT Hornet: in CRB (B) |
| vehicles | `mitsubishi_nightsky` | Mitsubishi Nightsky | crb.mitsubishi-nightsky | source/name | dc: Mitsubishi Nightsky | crb.mitsubishi-nightsky | book prints ours | Mitsubishi Nightsky: in CRB (B) |
| vehicles | `nissan_oni` | Nissan Oni | crb.nissan-oni | source/name | dc: Nissan Oni | crb.nissan-oni | book prints ours | Nissan Oni: in CRB (B) |
| vehicles | `nissan_samurai` | Nissan Samurai | crb.nissan-samurai | source/name | dc: Nissan Samurai | crb.nissan-samurai | book prints ours | Nissan Samurai: in CRB (B) |
| vehicles | `saeder-krupp-bentley_concordat` | Saeder-Krupp-Bentley Concordat | crb.saeder-krupp-bentley-concordat | source/name | dc: Saeder-Krupp-Bentley Concordat | crb.saeder-krupp-bentley-concordat | book prints ours | Saeder-Krupp-Bentley Concordat: in CRB (B) |
| vehicles | `shiawase_inu` | Shiawase Inu | crb.shiawase-inu | source/name | dc: Shiawase Inu | crb.shiawase-inu | book prints ours | Shiawase Inu: in CRB (B) |
| vehicles | `shiawase_kanmushi` | Shiawase Kanmushi | crb.shiawase-kanmushi | source/name | dc: Shiawase Kanmushi | crb.shiawase-kanmushi | book prints ours | Shiawase Kanmushi: in CRB (B) |
| vehicles | `steel_lynx_combat_drone` | Steel Lynx Combat Drone | ml2083-03.steel-lynx-combat-drone | source/name | dc: Steel Lynx Combat Drone | ml2083-03.steel-lynx-combat-drone | book prints ours | Steel Lynx Combat Drone: in ML2083-03 (B) |
| vehicles | `suzuki_mirage` | Suzuki Mirage | crb.suzuki-mirage | source/name | dc: Suzuki Mirage | crb.suzuki-mirage | book prints ours | Suzuki Mirage: in CRB (B) |

##### relocations: fs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `av_rapid_transit` | AV Rapid Transit | fs.rapid-transit-basic | source/name | fs: AV Rapid Transit | fs.rapid-transit-basic | book prints ours | AV Rapid Transit: catalogued under another name (D); also fs.rapid-transit-elite, fs.rapid-transit-platinum, fs.rapid-transit-diamond |
| gear | `mems_basic_harness` | MEMS Basic Harness | fs.modular-equipment-mounting-system-mems-mems-harness | source/name | fs: MEMS Basic Harness | fs.modular-equipment-mounting-system-mems-mems-harness | book prints ours | MEMS Basic Harness: catalogued under another name (D) |
| gear | `metahuman_adaption_close` | Metahuman Adaptation Close Combat Weapon | fs.metahuman-adaptation | source/name | fs: Metahuman Adaptation Close Combat Weapon | fs.metahuman-adaptation | book prints ours | Metahuman Adaptation Close Combat Weapon: already have under another name (A1) |
| weapons | `ammo_battery_laser` | Battery for laser weapons | fs.pulse-battery | source/name | fs: Battery for laser weapons | fs.pulse-battery | book prints ours | Battery for laser weapons: already have under another name (A1); also fs.crimson-wasp-battery, fs.red-fox-battery |
| weapons | `franchi_spas-25` | Franchi SPAS-25 | fs.franchi-spas-24 | source/name | fs: Franchi SPAS-25 | fs.franchi-spas-24 | book prints ours | Franchi SPAS-25: catalogued under another name (D) |
| weapons | `horizon_flynn_dcom_garotte` | Defense-Com Garotte | fs.horizon-flynn-defense-com-weapons-garrote | source/name | fs: Defense-Com Garotte | fs.horizon-flynn-defense-com-weapons-garrote | book prints ours | Defense-Com Garotte: already have under another name (A1) |
| weapons | `kami` | Kama | fs.kami-standard | source/name | fs: Kama | fs.kami-standard | book prints ours | Kama: already have under another name (A1); also fs.kami-folding |
| weapons | `long_tooth` | Cougar Weapons 'Long Tooth' | fs.cougar-collapsible-staff-spear | source/name | fs: Cougar Weapons 'Long Tooth' | fs.cougar-collapsible-staff-spear | book prints ours | Cougar Weapons 'Long Tooth': already have (C) |
| weapons | `shiawase_arms_tactical_model_71a` | Shiawase Arms Tactical Model 71A | fs.shiawase-arms-tactical-model-72 | source/name | fs: Shiawase Arms Tactical Model 71A | fs.shiawase-arms-tactical-model-72 | book prints ours | Shiawase Arms Tactical Model 71A: catalogued under another name (D) |
| weapons | `steel_falcon_crossbow_bolt` | rEVO Crowssbow Bolts | fs.steel-falcon-crossbow-bolt | source/name | fs: rEVO Crowssbow Bolts | fs.steel-falcon-crossbow-bolt | book prints ours | rEVO Crowssbow Bolts: already have under another name (A1) |

##### relocations: hs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| electronics | `grapple_tapper_cable` | Grapple Tapper Cable (50m) | hs.50m-cable-spool | source/name | hs: Grapple Tapper Cable (50m) | hs.50m-cable-spool | book prints ours | Grapple Tapper Cable (50m): already have under another name (A2); also hs.grapple-tapper |
| sprites | `courier` | Courier Sprite | crb.courier-sprite | source/name | hs: Courier Sprite | crb.courier-sprite | owner ruling | already in our data (owner decision: counts as complete) |
| sprites | `crack` | Crack Sprite | crb.crack-sprite | source/name | hs: Crack Sprite | crb.crack-sprite | owner ruling | already in our data (owner decision: counts as complete) |
| sprites | `data` | Data Sprite | crb.data-sprite | source/name | hs: Data Sprite | crb.data-sprite | owner ruling | already in our data (owner decision: counts as complete) |
| sprites | `fault` | Fault Sprite | crb.fault-sprite | source/name | hs: Fault Sprite | crb.fault-sprite | owner ruling | already in our data (owner decision: counts as complete) |
| sprites | `machine` | Machine Sprite | crb.machine-sprite | source/name | hs: Machine Sprite | crb.machine-sprite | owner ruling | already in our data (owner decision: counts as complete) |
| vehicles | `malakim_drone` | Dominion Malakim | hs.malakim-ophanim-drone-large-rotor-drone | source/name | hs: Dominion Malakim | hs.malakim-ophanim-drone-large-rotor-drone | book prints ours | Dominion Malakim: already have under another name (A2) |
| vehicles | `ophanim_drone` | Dominion Ophanim | hs.malakim-ophanim-drone-large-rotor-drone | source/name | hs: Dominion Ophanim | hs.malakim-ophanim-drone-large-rotor-drone | book prints ours | Dominion Ophanim: already have under another name (A2) |

##### relocations: kk

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| ammotypes | `krime_heat` | Krime Shotgun Crackle Heat Slugs | kk.krime-crackle-fin-stabilized-heat-slugs | source/name | kk: Krime Shotgun Crackle Heat Slugs | kk.krime-crackle-fin-stabilized-heat-slugs | owner ruling | already in our data (owner decision: counts as complete) |
| ammotypes | `krime_penetrator` | Krime Shotgun Penetrator | kk.krime-penetrators-buckshot-shells | source/name | kk: Krime Shotgun Penetrator | kk.krime-penetrators-buckshot-shells | owner ruling | already in our data (owner decision: counts as complete) |
| weapons | `krime_akm_97` | Krime AKM-97 | kk.akm-97-carbine | source/name | kk: Krime AKM-97 | kk.akm-97-carbine | book prints ours | Krime AKM-97: already have (C); also kk.akm-97-assault-rifle |

##### relocations: nf

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| electronics | `instrument_death_professional` | Instrument of death 2(professional) | nf.instruments-of-death | source/name | nf: Instrument of death 2(professional) | nf.instruments-of-death | book prints ours | Instrument of death 2(professional): already have under another name (A2); also nf.professional |
| electronics | `instrument_death_rising_star` | Instrument of death 3 (rising star) | nf.instruments-of-death | source/name | nf: Instrument of death 3 (rising star) | nf.instruments-of-death | book prints ours | Instrument of death 3 (rising star): already have under another name (A2); also nf.rising-star |
| electronics | `instrument_death_simple` | Instrument of death 1 (simple) | nf.instruments-of-death | source/name | nf: Instrument of death 1 (simple) | nf.instruments-of-death | book prints ours | Instrument of death 1 (simple): already have under another name (A2); also nf.simple |
| electronics | `procam_with_smart` | ProCam with internal SmartCam | nf.procam | source/name | nf: ProCam with internal SmartCam | nf.procam | book prints ours | ProCam with internal SmartCam: already have under another name (A2); also nf.smartcam-internal |
| gear | `smartcam_internal` | SmartCam internal | nf.smartcam-internal | source/name | nf: SmartCam internal | nf.smartcam-internal | book prints ours | SmartCam Internal: our gear row (p159) |

##### relocations: pwp

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualities | `evo-insider` | Evo-Insider | pwp.evo-in | source/name | pwp: Evo-Insider | pwp.evo-in | book prints ours | Evo-Insider: already have under another name (A2) |

##### relocations: shc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| qualitypaths | `private_investigator` | Private Investigator | shc.the-bad-beat | source/name | shc: Private Investigator | shc.the-bad-beat | book prints ours | Private Investigator: catalogued under another name (D) |

##### relocations: sif-no

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `hunters_alloy_orichalcum` | Orichalcum Hunter's Alloy | sif-no.hunters-alloy-orichalcum | source/name | sif-no: Orichalcum Hunter's Alloy | sif-no.hunters-alloy-orichalcum | book prints ours | Orichalcum Hunter's Alloy: Hunter's Alloy (Orichalcum) (G8) |
| gear | `hunters_alloy_regular` | Hunter's Alloy | sif-no.hunters-alloy-regular | source/name | sif-no: Hunter's Alloy | sif-no.hunters-alloy-regular | book prints ours | Hunter's Alloy: now read as Hunter's Alloy (Regular) from the modifications table (G8) |

##### relocations: so

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `fashion_accessory_tres_chic` | Fashion Accessory (Très Chic) | so.tres-chic | source/name | so: Fashion Accessory (Très Chic) | so.tres-chic | book prints ours | Fashion Accessory (Très Chic): already have under another name (A2); also so.standard |

##### relocations: swc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| packs | `pack_desert2` | Rifle-Ares Desert Strike Silent | swc.ares-desert-strike-suppressor | source/name | swc: Rifle-Ares Desert Strike Silent | swc.ares-desert-strike-suppressor | book prints ours | Rifle-Ares Desert Strike Silent: already have under another name (A2) |
| packs | `pack_fn_har1` | Rifles-FN-HAR Smart | swc.fn-har | source/name | swc: Rifles-FN-HAR Smart | swc.fn-har | book prints ours | Rifles-FN-HAR Smart: already have under another name (A2); also swc.fn-har-throwback |
| packs | `pack_heavy_manhunter2` | Heavy Pistol-Colt Manhunter Silent | swc.colt-manhunter-concealable-holster | source/name | swc: Heavy Pistol-Colt Manhunter Silent | swc.colt-manhunter-concealable-holster | book prints ours | Heavy Pistol-Colt Manhunter Silent: already have under another name (A2) |
| packs | `pack_upgrade_gunports` | Upgrades-Gunports | swc.gun-ports-vehicle | source/name | swc: Upgrades-Gunports | swc.gun-ports-vehicle | book prints ours | Upgrades-Gunports: already have under another name (A2) |
| packs | `pack_veh_nissan_samurai` | Drones, Medium-Anthro | swc.light-anthro-drone | source/name | swc: Drones, Medium-Anthro | swc.light-anthro-drone | book prints ours | Drones, Medium-Anthro: already have under another name (A2) |
| qualities | `cephalopod` | Cephalod Skull | swc.cephalopod | source/name | swc: Cephalod Skull | swc.cephalopod | book prints ours | Cephalod Skull: already have under another name (A2) |

##### relocations: tkc

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `guizhen_shield_glasses` | Guizhen 1 Shield Glasses | tkc.glasses-full-wrap | source/name | tkc: Guizhen 1 Shield Glasses | tkc.glasses-full-wrap | book prints ours | Guizhen 1 Shield Glasses: already have under another name (A2) |
| gear | `guizhen_shield_visor` | Guizhen 1 Shield Visor | tkc.visor-for-helmets | source/name | tkc: Guizhen 1 Shield Visor | tkc.visor-for-helmets | book prints ours | Guizhen 1 Shield Visor: already have under another name (A2) |

##### relocations: ts

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| armor | `ares_rampart_mk1` | Ares Rampart Shield Mk1 | ts.mk1-tactical-shield | source/name | ts: Ares Rampart Shield Mk1 | ts.mk1-tactical-shield | book prints ours | Ares Rampart Shield Mk1: already have under another name (A2) |
| armor | `ares_rampart_mk2` | Ares Rampart Shield Mk2 | ts.mk2-riot-shield | source/name | ts: Ares Rampart Shield Mk2 | ts.mk2-riot-shield | book prints ours | Ares Rampart Shield Mk2: already have under another name (A2) |
| armor | `ares_rampart_mk3` | Ares Rampart Shield Mk3 | ts.mk3-deployable-barrier-shield | source/name | ts: Ares Rampart Shield Mk3 | ts.mk3-deployable-barrier-shield | book prints ours | Ares Rampart Shield Mk3: already have under another name (A2) |
| armor | `ares_rampart_mk4` | Ares Rampart Shield Mk4 | ts.mk4-folding-shield | source/name | ts: Ares Rampart Shield Mk4 | ts.mk4-folding-shield | book prints ours | Ares Rampart Shield Mk4: already have under another name (A2) |
| gear | `foamtek_solvent` | Foamtek Solvent Spray | ts.shadowmarket-solvent-spray | source/name | ts: Foamtek Solvent Spray | ts.shadowmarket-solvent-spray | book prints ours | Foamtek Solvent Spray: already have under another name (A2) |

#### kept records (1)

By book: fs 1.

By class: latest printing 1.

##### kept records: fs

| kind | Commlink6 id | name | our entry | field | Commlink6 | ours | class | why |
|---|---|---|---|---|---|---|---|---|
| gear | `wss_explosive` | Depreciated WSS explosive, replace with new modification | – | retired | Depreciated | kept | latest printing | the latest Firing Squad still prints it (owner 2026-10-14) |

### Override rows by kind

The override rows mostly bring our entries to Commlink6's data. The ones that make ours differ from it are in the lists above.

| gen | rows | what they do |
|---|---|---|
| (none) | 655 | structure fixes of our reader: renames, aliases, splits, kinds, removals, entries it missed |
| book | 348 | effect corrections the book's text rules (those that differ from Commlink6: `effects` above) |
| cl6 | 53 | effects taken from Commlink6 |
| cl6only | 19 | Commlink6-only entries (list 1) |
| class | 751 | Commlink6's TYPE/SUBTYPE given to our entry |
| errata | 29 | errata values (those that still differ from Commlink6: list 2) |
| family | 2009 | Commlink6's structure (skill, slots, variants, ...) given to our entry |
| owner | 30 | Commlink6's value where the book prints none, owner-accepted |
| value | 88 | Commlink6's value where the book prints it (an importer fix) |

### Open items for the owner (76)

| what | book | our entry | field | note | still a difference |
|---|---|---|---|---|---|
| hold | crb | crb.arrow | rating | per-rating/variant by design? owner to decide | no |
| hold | bs | bs.transgenic-chameleon-skin | avail | two Commlink6 records match this entry and disagree | no |
| hold | crb | crb.omnidirectional-microphone | cost | two Commlink6 records match this entry and disagree | yes |
| hold | da | da.al-assad | cost | two Commlink6 records match this entry and disagree | yes |
| hold | da | da.ballista-ii | cost | two Commlink6 records match this entry and disagree | yes |
| hold | da | da.carl-gustaf | cost | two Commlink6 records match this entry and disagree | yes |
| hold | swc | swc.momentous-misfortune | karma | two Commlink6 records match this entry and disagree | yes |
| keep row with no difference left | bs | bs.fangs | avail | augmentations | no |
| keep row with no difference left | bs | bs.fangs | capacity | augmentations | no |
| keep row with no difference left | crb | crb.wired-reflexes-1 | avail | augmentations | no |
| keep row with no difference left | crb | crb.wired-reflexes-1 | cost | augmentations | no |
| keep row with no difference left | crb | crb.wired-reflexes-1 | rating | augmentations | no |
| keep row with no difference left | crb | crb.sim-module | cost | gear | no |
| keep row with no difference left | crb | crb.sim-module-w-hot-sim | cost | gear | no |
| keep row with no difference left | crb | crb.ares-viper-slivergun | ar | weapons | no |
| keep row with no difference left | crb | crb.colt-cobra-tz-100 | ar | weapons | no |
| keep row with no difference left | crb | crb.colt-cobra-tz-110 | ar | weapons | no |
| keep row with no difference left | crb | crb.colt-government-2076 | ar | weapons | no |
| keep row with no difference left | crb | crb.colt-m23 | ar | weapons | no |
| keep row with no difference left | da | da.ares-inferno | ammo | weapons | no |
| keep row with no difference left | da | da.ares-victory | ammo | weapons | no |
| keep row with no difference left | da | da.ares-vigilant | ammo | weapons | no |
| keep row with no difference left | da | da.carl-gustaf | ammo | weapons | no |
| keep row with no difference left | da | da.fire-blossom-mb | ammo | weapons | no |
| keep row with no difference left | da | da.fire-serpent | ammo | weapons | no |
| keep row with no difference left | da | da.firelance-ii | ammo | weapons | no |
| keep row with no difference left | da | da.firestorm | ammo | weapons | no |
| keep row with no difference left | da | da.irm-sabretooth | ammo | weapons | no |
| keep row with no difference left | da | da.launch-drop-rack | ammo | weapons | no |
| keep row with no difference left | da | da.launch-drop-rack | ar | weapons | no |
| keep row with no difference left | da | da.mgl-24 | legality | weapons | no |
| keep row with no difference left | da | da.mgl-48 | ammo | weapons | no |
| keep row with no difference left | da | da.unguided-launcher | ammo | weapons | no |
| keep row with no difference left | da | da.vls-cells-cold | ammo | weapons | no |
| keep row with no difference left | da | da.vls-cells-cold | ar | weapons | no |
| keep row with no difference left | da | da.vls-cells-hot | ammo | weapons | no |
| keep row with no difference left | da | da.vls-cells-hot | ar | weapons | no |
| keep row with no difference left | da | da.ynt-colossus | ammo | weapons | no |
| keep row with no difference left | da | da.ynt-nashorn | ammo | weapons | no |
| keep row with no difference left | dc | dc.dsec | cost | vehicles | no |
| keep row with no difference left | dc | dc.factory-ship | cost | vehicles | no |
| keep row with no difference left | dc | dc.gti-devotee-mk-1 | cost | vehicles | no |
| keep row with no difference left | dc | dc.japanese-imperial-navy-shio-class-ssi | cost | vehicles | no |
| keep row with no difference left | dod | dod.tiffani-elegance-dart-bracelet | ammo | weapons | no |
| keep row with no difference left | dod | dod.tiffani-stinger-dart-bracelet | ammo | weapons | no |
| keep row with no difference left | fs | fs.laser-sight-low-power | cost | gear | no |
| keep row with no difference left | fs | fs.ares-arms-charybdis | ammo | weapons | no |
| keep row with no difference left | fs | fs.ares-scylla | ammo | weapons | no |
| keep row with no difference left | fs | fs.ares-scylla | dv | weapons | no |
| keep row with no difference left | fs | fs.colt-secret-agent | ammo | weapons | no |
| keep row with no difference left | fs | fs.psg-enforcer-ii | ammo | weapons | no |
| keep row with no difference left | hs | hs.attack-module | rating | electronics | no |
| keep row with no difference left | hs | hs.sleaze-module | rating | electronics | no |
| keep row with no difference left | nf | nf.bowler | avail | armor | no |
| keep row with no difference left | nf | nf.fedora | avail | armor | no |
| keep row with no difference left | nf | nf.homburg | avail | armor | no |
| keep row with no difference left | nf | nf.trenchcoat | avail | armor | no |
| keep row with no difference left | nf | nf.trilby | avail | armor | no |
| keep row with no difference left | nf | nf.replacement-instrument | avail | electronics | no |
| keep row with no difference left | nf | nf.black-ink-per-500 | avail | gear | no |
| keep row with no difference left | nf | nf.color-ink-per-500 | avail | gear | no |
| keep row with no difference left | nf | nf.torch | avail | weapons | no |
| keep row with no difference left | sw | sw.manadyne-mb-10 | cost | gear | no |
| keep row with no difference left | sw | sw.manadyne-pb-10 | cost | gear | no |
| keep row with no difference left | swc | swc.mutaqua | karma | qualities | no |
| keep row with no difference left | swc | swc.nosferatu | karma | qualities | no |
| keep row with no difference left | swc | swc.wendigo | karma | qualities | no |
| keep row with no difference left | tkc | tkc.flash-scope | ammo | weapons | no |
| keep row with no difference left | tkc | tkc.hall-of-tears | ammo | weapons | no |
| keep row with no difference left | tkc | tkc.handheld | ammo | weapons | no |
| keep row with no difference left | tkc | tkc.mob-light | ammo | weapons | no |
| keep row with no difference left | tkc | tkc.pulse-hammer | ammo | weapons | no |
| keep row with no difference left | tkc | tkc.storm-shield | ammo | weapons | no |
| keep row with no difference left | ts | ts.foamtek-cannon | ammo | weapons | no |
| keep row with no difference left | ts | ts.foamtek-carbine | ammo | weapons | no |
| Misc. (US) record one of our books prints by name (not in list 1) | other_us | buzzard_transit | – | Buzzard Transit (Age of Rust): ours aor.buzzard-transit | no |

<!-- final_analysis: generated up to here -->

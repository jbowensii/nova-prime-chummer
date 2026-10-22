# commlink6-sr6-optional: the contents list

`commlink6-sr6-optional` is the one optional data package for CommLink6 differences of any type (metatypes, armor, gear,
electronics, ...): records CommLink6 has that no book prints as an item of its own, or that the book prints in another
form. They are not in the core data this importer builds; the owner decided (2026-10-13) to ship them as this package.
The CommLink6-only module below carries them; `python -m tools.cl6check` counts them as matched ("matched via
optional package") and shows them on a line of their own. This list will grow. The machine-readable list is `tools/cl6check/optional_package.json` (its
`package` field names the package; a test keeps this file and the JSON in step). Rule data only: no descriptions. Values
are CommLink6's (jar 1.14.0), as read with `tools/cl6check/reader.py`.

## The CommLink6-only module (owner ruling 2026-10-21)

The CommLink6 records that are in none of our books are a separate, optional data set: the **CommLink6-only module**. It
is never mixed into the book data. The app loads it only when the admin switches it on, and every entry in it says where
it comes from.

**What is in it.** Every record of the final analysis's list 1 (docs/reviews/sr6-cl6-final-analysis-2026-10-21.md) that
fits one of the app's catalog kinds, plus the 23 entries the book overrides used to add (`"gen": "cl6only"`, listed
below). With CommLink6 1.14.0 that is 863 entries:

| list-1 group | entries |
|---|---|
| German-only books (`de_*`) | 300 |
| German-rules duplicates (`lang="de"` copies, the three German-named ammunition rows among them) | 308 |
| no English name (the Companion's life modules, Astral Ways' true elements, ...) | 176 |
| CommLink6-invented or house content (the optional package below, the option rows, the table cells) | 70 |
| retired or legacy (`Depreciated ...`) | 5 |
| other: the four SR6 forum hitches (CommLink6's Misc. (US) dataset) | 4 |

By kind: vehicles 212, gear 131, life modules 158, packs 112, weapons 103, mentor spirits 38, armor 34, electronics 16,
true elements 15, metatypes 13, actions 10, qualities 10, programs 5, adept powers 2, augmentations 2, lifestyles 1,
vehicle design 1.

**What is left out, and why.**
- Seoul Survivor, the Sixth World Missions Guide, Adversary and Age of Rust: books we import now, so their records are
  book data. (Age of Rust prints Buzzard Transit's stat line on p. 15; it stays the book's `aor.buzzard-transit`.)
- The 25 priority-table cells of the core rulebook (`priotableentry`): the priority table is no catalog kind.
- The 4 rule options and the German edition's rule interpretation (`interpretation`): rule settings, which the app has as
  its rule presets.

**How each record becomes an entry.** The same XML as an imported book's (`custom/sr6/imported/<book>/<kind>.xml`), so
the app reads it unchanged, and valid against the kind's schema (the generator checks). The id is `cl6.<book>.<id>`, so
it never collides with a book's. The source is a CommLink6-only one named for the book CommLink6 claims: `CL6-DA` is
"CommLink6 only: Shadowrun: Deadly Arts", `CL6-DE-ALPEN` "CommLink6 only: de_alpen (German only)"; every one is
`canon="false"`, so Game data and the pickers mark it Non-canon. The name is CommLink6's English one, else the one it
prints (German). Values are CommLink6's, in our files' words (`Rating x 1000`, `4(L)`, a `tier()` formula for a
per-rating table), and the item structure (slots, fits, flags) as `familymap` writes it. A record with no page in
CommLink6 gets page 1 (the schema needs one).

**Generate it** (on the PC with CommLink6; no jar: "skipped"):

```
python -m tools.cl6check module <data folder>
```

It writes `<data folder>/custom/sr6/cl6only/`: `index.xml` naming the files, `sources.xml`, and one file per kind. It
prints what it could not map, the counts by group and by kind, then `module: <n> entries, <n> sources -> <folder>`.
Never commit its output: it is CommLink6's data.

**Put it on a server and switch it on.**
1. Generate it into a scratch folder: `python -m tools.cl6check module C:\temp\cl6module`.
2. Copy `C:\temp\cl6module\custom\sr6\cl6only` into the server's data folder as `custom/sr6/cl6only` (on tower04:
   `/mnt/user/appdata/nova-prime-chummer/custom/sr6/cl6only`). The server already serves everything under
   `custom/sr6/`; a Re-import all does not touch it, and a backup includes it.
3. In the app: Shadowrun 6 → Table setup → Optional rules → "Optional data set: records no book prints" → on, and save.
   The catalog reloads with the module's entries. Off (the default), nothing from it loads; switched on with no
   module on the server, Game data reports `custom/sr6/cl6only/index.xml` as missing.

To update it after a CommLink6 update, generate it again and replace the folder.

**How cl6check counts it.** The 23 former `gen="cl6only"` records are matched "via optional package"
(`tools/cl6check/optional.py` `load()` adds the module's rows), so completeness keeps them; accuracy compares book
records only. The module's own rows are `tools/cl6check/cl6only_module.json` (the rows that used to add these entries
to the book data and the rows that gave them their structure, moved unchanged; `src` is the book table, `cl6_book` and
`cl6_id` the CommLink6 record):

- CL6 id `smart_firing_platform_adapter`: Adapter (see drones for Smart firing platform) (crb p. 260, Commlink6 book `core`): gear, availability 5, cost 0.
- CL6 id `tripod_powered_adapter`: Adapter (see drones for Powered Heavy Tripod) (da p. 64, Commlink6 book `deadly_arts`): gear, availability 3(L), cost 0.
- CL6 id `smart_firing_reinforced_adapter`: Adapter (see drones for Reinforced Smart Firing Platform) (da p. 64, Commlink6 book `deadly_arts`): gear, availability 6(L), cost 0.
- CL6 id `tripod_wheeled_adapter`: Adapter (see drones for Wheeled Heavy Tripod) (da p. 64, Commlink6 book `deadly_arts`): gear, availability 5(L), cost 0.
- CL6 id `mtoc_fob`: M-TOC Fob (da p. 68, Commlink6 book `deadly_arts`): electronics, availability 99(I), cost 0.
- CL6 id `ar_interface`: AR Interface (da p. 58, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `weapon_mount_military`: Mil-Spec Weapon Mount (da p. 151, Commlink6 book `deadly_arts`): vehicledesign, availability 99(I), cost 0.
- CL6 id `crew_served_2`: Crew Served (2) (da p. 153, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `crew_served_3`: Crew Served (3) (da p. 153, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `crew_served_4`: Crew Served (4) (da p. 153, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_0_5`: Uses 0.5 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_1`: Uses 1 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_2`: Uses 2 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_4`: Uses 4 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_5`: Uses 5 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `energy_10`: Uses 10 Energy per shot (da p. 65, Commlink6 book `deadly_arts`): gear, availability 99, cost 0.
- CL6 id `hitch_trailer`: Hitches: Trailer Hitch (dc p. 1, Commlink6 book `other_us`): gear, availability 2, cost 400.
- CL6 id `hitch_connector`: Hitches: Universal Connector (dc p. 1, Commlink6 book `other_us`): gear, availability 2, cost 600.
- CL6 id `hitch_fith_wheel`: Hitches: Fifth Wheel (dc p. 1, Commlink6 book `other_us`): gear, availability 3, cost 900.
- CL6 id `hitch_construction`: Hitches: Construction Equipment (dc p. 1, Commlink6 book `other_us`): gear, availability 5, cost 2000.
- CL6 id `hk_urban_stinger_bolts`: H&K Urban Stinger Pfeile (10x) (dod p. 1, Commlink6 book `dealers_of_death`): gear, availability 6(I), cost 10.
- CL6 id `hk_urban_stinger_air`: H&K Urban Stinger Druckluftkartusche (50x) (dod p. 1, Commlink6 book `dealers_of_death`): gear, availability 4, cost 5.
- CL6 id `makarov22_ammo`: Makarov V22.2 Kalte Munition (10x) (dod p. 1, Commlink6 book `dealers_of_death`): gear, availability 6(I), cost 150.

## Lofwyr's Legions (ll), p. 16: drake types (kind metatypes)

CommLink6 has three drake types, each a set of choices a drake picks from. All three allow the dracoform attribute
increases listed, and give the same critter powers (Dual-natured, Elemental Attack with the fire choice, Drake Armor,
Natural Weapon, Vestigial Wings), the same qualities for drakes (Unsteady Hands, Memorable, Misshapen) and the quality
Most Wanted for the character.

- CL6 id `western`: Western Drake (p. 16). Dracoform attributes: Body, Strength, Willpower, Charisma. Metaecho: Heavy Scales.
- CL6 id `feathered`: Feathered Drake (p. 16). Dracoform attributes: Body, Strength, Agility, Willpower. Metaecho: Tail Stinger.
- CL6 id `seadrake`: Sea Drake (p. 16). Dracoform attributes: Body, Strength, Reaction, Intuition. Critter power Underwater
  Adaption (in place of Vestigial Wings), metaecho: Adaptive Coloration. Vestigial Wings is not in its list.

## Smooth Operations (so), p. 116: armor

- CL6 id `krime_rave_complete`: Krime Rave Clothing Complete. Armor rating 0, Social Rating +4, availability 2, cost 1,050.
  The book describes the +4 Social Rating of the complete suit in prose; its table lists the pieces.

## Double Clutch (dc), p. 126: gear

- CL6 id `reduce_seating`: Reduce Seating. Chassis modification (cargo), availability 0, cost 0; rating chosen up to 99;
  needs a vehicle; uses 0 CF slots; lowers the vehicle's Seats by the rating and adds 1 CF. Not in the book text; the
  nearest item is Increased Seating, which we have.

## Hack & Slash (hs), p. 131: electronics

- CL6 id `machinist_console`: Machinist Command Console. Rigger command console type; software types RCC and autosoft;
  concurrent programs = Charisma; device rating = Resonance; noise reduction = Willpower; a Matrix device. The book
  describes an aspect peripheral but names no such item.

## Core Rulebook (crb), p. 18: electronics

- CL6 id `matrix_signal_scanner`: Matrix Signal Scanner. Electronics, sensor function (a sensor function is a capacity-1
  slot item); cost 0, no availability. CommLink6 cites the core rulebook p. 18; the name is found only in the Krime
  Katalog (kk) p. 18, as a "Standard Upgrade" of the Krime Escalation rocket launcher, with no stat line of its own.

## Deadly Arts (da), p. 47: weapons

- CL6 id `cougar_polearm_small`: Cougar Polearm (Small). Close combat, blades; availability 4(L), cost 900; DV 3P, attack
  rating 8 (one-hand 9, big 10/6).
- CL6 id `cougar_polearm_large`: Cougar Polearm (Large). Close combat, blades; availability 5(I), cost 1,000; DV 3P/4P,
  attack rating 8, big 10/6 and 11/7.
  The book prints the Armsman Collapsible Polearm as four rows (`da.knife`, `da.one-hand`, `da.spear`, `da.pike`); each
  carries the CommLink6 brand as an alias (`importer/sr6/overrides/da.json`), its printed name unchanged.

## Further CommLink6 constructs and variants (any book)

Rule data as CommLink6 gives it; none has a stat line of its own in the book (page as CommLink6 cites it).

- CL6 id `transgen_hearing_expansion`: Transgenic hearing expansion (bs p102). Geneware, transgenic bioware; availability 4, cost 2,800; implanted, 0.15 Essence; an augmentation.
- CL6 id `spurs_samurai_oni`: Nissan Spurs (crb p300). Close-combat blade, vehicle accessory (hardpoint 1); DV 3P, attack rating 6.
- CL6 id `formula_ritual`: Ritual formula (crb p294). Magical supply bought by count; availability 3(L), cost 1,000; a text choice (the ritual's name).
- CL6 id `nartaki2`: Nartaki 2 (swc p81). Metatype, a variant of human; size 175, weight 86, Karma 10; quality Shiva Arms 2 (natural), quality Striking Skin. CommLink6 splits the single printed Nartaki row in two.
- CL6 id `ammo_hornet_gas`: Gas for Hornet (10x) (fs p34). Special ammunition by count; availability 2, cost 20; requires the Hornet.
- CL6 id `ammo_blazer`: Fuel for Blazer (5x) (fs p35). Special ammunition by count; availability 3(L), cost 60; requires the Blazer.
- CL6 id `ammo_hell_turtle`: Fuel for Hell Turtle (15x) (fs p43). Special ammunition by count; availability 3(L), cost 60; requires the Hell Turtle.
- CL6 id `krime_drum`: Krime Spare Drum (kk p23). Weapon accessory (external), by count; availability 2, cost 5; requires a Krime Chatter, Tradition or KAR-97.
- CL6 id `shiawase_inu_better_suit`: Shiawase Inu w/better suit (crb p299). Minidrone; handling 2/3, accel 6, interval 8, top speed 24, body 1, armor 0, pilot 2, sensor 2; availability 2, cost 1,600 (the base Inu at 1,100 plus the 500 suit). The override that created it was removed.
- CL6 id `mems_scabbard`: MEMS Scabbard (fs). Armor accessory by count; availability 2, cost 100; takes 2 MEMS slots.
- CL6 id `aaa_zone`: AAA zone (crb p57; printed in the Sixth World Companion p180). Lifestyle; cost 100,000, 7 lifestyle points.

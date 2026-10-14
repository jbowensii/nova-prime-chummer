# commlink6-sr6-optional: the contents list

`commlink6-sr6-optional` is the one optional data package for CommLink6 differences of any type (metatypes, armor, gear,
electronics, ...): records CommLink6 has that no book prints as an item of its own, or that the book prints in another
form. They are not in the core data this importer builds; the owner decided (2026-10-13) to ship them as this package.
Until it exists, `python -m tools.cl6check` counts them as matched ("matched via optional package") and shows them on a
line of their own. This list will grow. The machine-readable list is `tools/cl6check/optional_package.json` (its
`package` field names the package; a test keeps this file and the JSON in step). Rule data only: no descriptions. Values
are CommLink6's (jar 1.14.0), as read with `tools/cl6check/reader.py`.

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

## Commlink6 records with no item of their own (rule presets, adapters, option rows)

The owner (2026-10-13) wants Commlink6's other Commlink6-only records kept. Each is in this package unless our data already holds it (those are in `tools/cl6check/relocated.json`). Prices are all 0 and availability 99 where Commlink6 marks an option row not for sale.

### Rule presets (core)

- CL6 id `core`: Standard (crb). The Standard preset: initiation allowed; Sum-to-Ten elite 12; no adjustment on lowered maximum; no Karma for spells; at most 5 Karma and 5,000 nuyen left over; Strength not added to melee Attack Rating; maximum Availability 6. Our creation-defaults.xml holds these as settings.
- CL6 id `core_seattle`: Standard (Seattle) (crb). The Standard preset with Strength added to melee Attack Rating (ADD_STRENGTH_TO_MELEE_AR true); otherwise as Standard. Our creation-defaults.xml has no Seattle toggle for it.
- CL6 id `srm`: Shadowrun Missions (crb). Preset restricting creation to priority, sum-to-ten and point buy; initiation allowed, at most 1 initiation, 2 submersion and 1 transhuman grade; Sum-to-Ten elite 12; no adjustment on lowered maximum; 5 Karma and 5,000 nuyen left over; maximum Availability 7; expanded specializations on.
- CL6 id `houserules`: Configurable (crb). An empty preset: every rule is set by the player (our Table setup page does this).

### Adapters (any book)

- CL6 id `smart_firing_platform_adapter`: Adapter (see drones for Smart firing platform) (crb p260). A weapon accessory (embedded under) the Smart firing platform needs, availability 5, price 0; CL6 points to the drones for its stats
- CL6 id `tripod_powered_adapter`: Adapter (see drones for Powered Heavy Tripod) (da p64). A weapon accessory (embedded under) the mount needs, availability 3(L), price 0; CL6 points to the drones for its stats
- CL6 id `smart_firing_reinforced_adapter`: Adapter (see drones for Reinforced Smart Firing Platform) (da p64). A weapon accessory (embedded under) the mount needs, availability 6(L), price 0; CL6 points to the drones for its stats
- CL6 id `tripod_wheeled_adapter`: Adapter (see drones for Wheeled Heavy Tripod) (da p64). A weapon accessory (embedded under) the mount needs, availability 5(L), price 0; CL6 points to the drones for its stats

### Deadly Arts items

- CL6 id `mtoc_fob`: M-TOC Fob (da p68). A tactical-network electronics item (mod only), availability 99(I), price 0; the book prints it only as a section heading and in vehicle notes (p68-69)
- CL6 id `ar_interface`: AR Interface (da p58). A weapon accessory (embedded, internal; mod only), availability 99, price 0; the book names it in the notes of guided launchers (p58)
- CL6 id `weapon_mount_military`: Mil-Spec Weapon Mount (da p151). A hard-point mod (military weapon mount, 5 hard points, needs a Mil-Spec Hardpoint), availability 99(I), price 0

### Deadly Arts option rows

- CL6 id `crew_served_2`: Crew Served (2) (da p153). An option row (availability 99, price 0) for a launcher's crew-served reload rule: 2 crew members; our weapons print it only in their note text
- CL6 id `crew_served_3`: Crew Served (3) (da p153). An option row (availability 99, price 0) for a launcher's crew-served reload rule: 3 crew members; our weapons print it only in their note text
- CL6 id `crew_served_4`: Crew Served (4) (da p153). An option row (availability 99, price 0) for a launcher's crew-served reload rule: 4 crew members; our weapons print it only in their note text
- CL6 id `missile_pilot_3`: Pilot 3 (da p157). An option row (availability 99, price 0): a missile guidance rating, Pilot 3; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_pilot_5`: Pilot 5 (da p157). An option row (availability 99, price 0): a missile guidance rating, Pilot 5; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_pilot_7`: Pilot 7 (da p157). An option row (availability 99, price 0): a missile guidance rating, Pilot 7; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_pilot_8`: Pilot 8 (da p157). An option row (availability 99, price 0): a missile guidance rating, Pilot 8; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_sensor_2`: Sensor 2 (da p157). An option row (availability 99, price 0): a missile guidance rating, Sensor 2; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_sensor_3`: 3 (da p157). An option row (availability 99, price 0): a missile guidance rating, 3; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_sensor_5`: Sensor 5 (da p157). An option row (availability 99, price 0): a missile guidance rating, Sensor 5; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `missile_sensor_7`: Sensor 7 (da p157). An option row (availability 99, price 0): a missile guidance rating, Sensor 7; the rocket and missile table (p58) prints it but our gear rows keep only capacity, availability and price
- CL6 id `range_1_5`: 1.5 km (da p154). An option row (availability 99, price 0): a rocket or missile range, 1.5 km; the same table prints it in the range column our rows drop
- CL6 id `range_7`: 7 km (da p154). An option row (availability 99, price 0): a rocket or missile range, 7 km; the same table prints it in the range column our rows drop
- CL6 id `range_160`: 160 km (da p154). An option row (availability 99, price 0): a rocket or missile range, 160 km; the same table prints it in the range column our rows drop
- CL6 id `energy_0_5`: Uses 0.5 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 0.5 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw
- CL6 id `energy_1`: Uses 1 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 1 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw
- CL6 id `energy_2`: Uses 2 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 2 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw
- CL6 id `energy_4`: Uses 4 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 4 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw
- CL6 id `energy_5`: Uses 5 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 5 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw
- CL6 id `energy_10`: Uses 10 Energy per shot (da p65). An option row (availability 99, price 0): an energy weapon's draw, uses 10 energy per shot; our power-supply rows carry the pack's energy, not a weapon's draw

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

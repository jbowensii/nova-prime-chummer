# SR6 fit, Stage 0 findings: how Commlink6 really adds hooks (decompiled)

Status: evidence only (2026-10-29). Nothing in the importer or the app changed. This page belongs to
[sr6-item-classification-fit.md](sr6-item-classification-fit.md) (Stage 0). Where it disagrees with that plan's
**[bytecode-strings]** guesses, this page is the one to trust: those guesses came from reading constant pools, and these
findings come from decompiled code.

## Bottom line

- Commlink6 adds hooks in code through **four rule families**, not two. They are: standard hooks by class (S),
  vehicle capacities (V), fashion capacity on armor (F), and synthesized weapon usages for vehicle mounts (W) and
  cyber-implants (I). There is also one size rule (Z) that feeds W and I.
- **Two of the plan's guesses were wrong.** WEAPON_SPECIAL gets FIREARMS_EXTERNAL, not MELEE_EXTERNAL. ELECTRONIC_ACCESSORY
  goes only to 7 matrix-device subtypes, not to every ELECTRONICS item.
- **The cost of a fitted item is its usage `value`.** If there is no value, the add check assumes 0.5 and the
  used-capacity sum counts 1. Built-in (included) parts cost nothing. A capacity of 99 or more is never checked.
- **CL6 enforces fewer requirements at embed time than §6 of the plan assumed** (see "Requirement gate" below). This
  matters for the open requirement-severity ruling. Nothing for it was built here.
- `tools/cl6check/hookmap.py` reproduces the plan's measured numbers (TOP 154, 0 augmentation usages on a vehicle
  hook). It also prints a census against any import (`--ours <runs>`).

## How this was done

- Runtime: the Java 17 runtime that ships with the Commlink6 updater (`%LOCALAPPDATA%\Commlink6 Updater\runtime`).
  Nothing was installed.
- Decompiler: CFR 0.152, the official release from the author's site (benf.org, Lee Benfield). It lives in
  `C:\dev\_scratch\cfr\` with output in `C:\dev\_scratch\cfr\out\`. **No decompiled code is in the repo.** The rules
  below are written in our own words.
- Classes read: `AddMissingStandardSlots`, `CalculateVehicleSlots`, `CalculateProgramSlots`, `ItemTemplate` (its
  `validate*` methods), `ItemHook`, `WeaponSize`, `AvailableSlot`, `AAvailableSlot`, `ItemUtil`, `SR6GearTool` (the
  processor order), `SR6ResolveFormulasStep` (usage value → SIZE), `CommonEquipmentController` (`canBeEmbedded`),
  `Requirement`, `Usage` and `Shadowrun6Rules` (one rule default).

## The code-added rules, in plain words

**Order.** When an item is built, the steps run in this order: mode details → read the data's modifications → resolve
formulas (the usage value becomes the item's SIZE, or its Essence when it is implanted) → ammunition → **vehicle
slots (V)** → **standard slots (S)** → stock modifications → templates. The load-time rules (Z, W, I, F, plus the
vehicle base numbers) run once, when the data file is read.

**S, standard hooks.** S adds a hook only when the item doesn't already offer it:

| Item class | Hook added | Capacity |
|---|---|---|
| WEAPON_FIREARMS, WEAPON_SPECIAL | FIREARMS_EXTERNAL | unbounded |
| WEAPON_CLOSE_COMBAT | MELEE_EXTERNAL | unbounded |
| WEAPON_RANGED | RANGED_EXTERNAL | unbounded |
| VEHICLES of subtype BIKES, ATVS, CARS, TRUCKS, VANS or BUS | VEHICLE_TIRES | 1 |
| Subtype CYBERDECK, COMMLINK, DATATERM, CYBERTERM, COMMNODE, RIGGER_CONSOLE or TAC_NET | SOFTWARE (any type); ELECTRONIC_ACCESSORY (type ELECTRONICS only) | unbounded |

Tyres go to VEHICLES only. Drones never get a tyre hook from code, even ground drones. SPECIAL_VEHICLES get none either.

**V, CalculateVehicleSlots, in words.**

1. At load, every vehicle and drone gets base mod slots: **chassis = Body, electronics = Body, powertrain = Body**
   (powertrain is 0 for trailers). Every vehicle and drone also gets VEHICLE_ACCESSORY, unbounded.
2. When the item is built, the owner's slot shifts move points between the three families in a ring (chassis →
   electronics → powertrain → chassis). Each point taken from one family adds half a point, rounded down, to the
   next. This is the 2:1 transfer.
3. A family that comes out at 0 has its hook removed.
4. **Cargo Factor** (any item with Seats): CF = Seats × 1.5, rounded half up (bikes × 1.25). Trucks add 4. A table
   rule, "CF without seats", is off by default. When it is on, the factors become 0.5 and 0.25.
5. **Hardpoints** (needs a Body above 0):
   - VEHICLES, DRONE_LARGE and DRONE_MEDIUM get Body ÷ 3, rounded down.
   - DRONE_SMALL gets 0.5, but only when its Body is over 3, with a maximum item size of 0.5.
   - DRONE_MINI and DRONE_MICRO get none from code. The two minis that have hardpoints declare them in data, so they
     get **no** size cap. The cap-setting line in the code that names minis is never reached.
6. **Autosofts**: a vehicle or drone with no SOFTWARE hook in its data gets SOFTWARE = Pilot ÷ 2, rounded half up.
   It gets none when Pilot is 0.
7. A capacity the code computes is a **base**. HOOK valmods in the data add to it, and a valmod can be negative
   (zodiac's chassis −3).

**F, fashion.** Body armor, clothes and social armor that have a Social rating get a FASHION hook. Its capacity is 1
when Social is negative, 3 when it is positive and 2 when it is 0.

**Z, size.** A firearm or special weapon that has no WEAPON_SIZE gets one from its subtype:

| Size | Subtypes |
|---|---|
| TINY | tasers, hold-outs, light pistols |
| SMALL | machine pistols, heavy pistols, DMSO, darts |
| MEDIUM | SMGs |
| LARGE | shotguns, assault rifles |
| BIG | launchers, hunting and sniper rifles, LMG, MMG, HMG, assault cannons, throwers, ballistas, cannons |
| MILITARY | vehicle military weapons |

**W, vehicle weapon mounts.** These are usages the code synthesizes:
- A sized firearm, special or vehicle weapon fits mounts by its size:
  - TINY, SMALL or MEDIUM: SMALL, standard or LARGE mounts.
  - LARGE: standard or LARGE.
  - BIG: LARGE only.
  - MILITARY: MILITARY only.
  - BUILDING: none.
- An unsized weapon (melee, bows, crossbows) fits by subtype. Blades, whips, clubs, bows and crossbows go to a LARGE
  mount.

**I, implant weapons.** A firearm or special weapon whose own embedded usage is not already an implant hook gets an
implant usage by subtype:
- Blades, whips, clubs: IMPLANT_MELEE.
- Bows, crossbows: IMPLANT_RANGED.
- Tasers, hold-outs: IMPLANT_HOLDOUT.
- Light, machine and heavy pistols, SMGs and shotguns each get their own implant hook.
- Rifles, MGs, launchers, assault cannons and throwers: IMPLANT_HEAVY.
- OTHER_SPECIAL goes by its size (TINY → light pistol … LARGE → shotgun).

**Default usage.** An item that declares no usage is CARRIED.

**Hook units.** Every hook either counts capacity or takes one item. The hook list fixes which: the externals,
sensors, armor, fashion, every cyber implant hook, every VEHICLE_* except tyres, SOFTWARE and the deck slots count
capacity. TOP, BARREL, UNDER, STOCK, SIDE, INTERNAL, IMPLANT_*, GLAND, MEDKIT, COMMLINK, RCC, VEHICLE_TIRES and similar
hooks take one item. This settles the units table in §3.1 of the plan, with two exceptions: VEHICLE_TIRES takes **one**
item, and the VEHICLE_WEAPON* hooks **count capacity** (they are not one-each).

## The embed check (confirms §6.3 of the plan, with corrections)

The checks run in this order:

1. Is the item embeddable in this hook, given its requirements?
2. Is a variant chosen?
3. Do its requirements hold?
4. Can it be built, with no decisions missing?
5. Nuyen (a warning only).
6. Does the host offer the hook (`noSuchSlot`)?
7. Is the item over the hook's maximum size (`tooLarge`)?
8. For a capacity hook under 99: is there enough room (`notEnoughCapacity`)? For a one-item hook: is it already
   taken (`slotOccupied`)?

**Book availability is not a gate.** The list of embeddable items takes every item in the catalog.

**Requirement gate: what CL6 actually checks.** At embed time CL6 evaluates only tests marked `apply="DATA_ITEM"`, plus
`<selreq>` groups. Any other test passes automatically, and that includes the members of a selreq group that carry no
`apply`. As decompiled, then, the silencer's subtype list (no `apply`) does **not** block any host. A test type CL6 does
not know **fails**.

Measured across 2,389 distinct items there are 431 tests:

| `apply` value | Tests | What CL6 does with them |
|---|---|---|
| DATA_ITEM | 181 | Evaluated. Mostly SOFTWARE_TYPES (101) and AMMUNITION_CLASS (55). |
| none | 206 (138 of them inside selreq) | Passed unless a loader fills in a default, which we have not confirmed |
| CHARACTER | 37 | Character gates, not fit |
| PARENT | 7 | Not evaluated by this check |

This is input for the owner's open requirement-severity ruling. Nothing was built for it.

## Census

Counts are over Commlink6's `<item>` records, deduplicated by id: 2,389 of them. The plan's 2,421 counts
reprintings twice, so some totals here are slightly lower, for example usages 1,298 against the plan's 1,329.

Command: `python -m tools.cl6check.hookmap --ours C:\dev\_scratch\validation-audit\recon-current`.

**Caveat:** that catalog was built on 2026-10-27, before the 0.29.x–0.32 vehicle-slot work. The vehicle rows below are
therefore an upper bound on the gap. Re-run against a fresh import before Stage 2.

**Hooks offered, by source (Commlink6):**

| Source | Count |
|---|---|
| Data (`itemmod`/`valmod HOOK`) | 822, 73 of them on variants |
| `remove="true"` | 18 |
| Code V | 2,091 |
| Code S | 375 |
| Code F | 58 |
| Hardpoints with a size cap | 10 |

**Usages:**

| Kind | Count |
|---|---|
| Data | 1,298 (EMBEDDED with a cost 453, IMPLANTED with an Essence value 455) |
| Code CARRIED default | 1,526 |
| Code W | 473 |
| Code I | 178 |
| Augmentation usages on a VEHICLE_* hook | **0** |

**Requirements:** 431 tests on 271 items. 33 items carry 33 selreq groups holding 152 tests, and 10 tests are
negated.

**Ours against Commlink6** (2,269 matched item pairs, compared by hook id):

| Commlink6 source | Commlink6 count | Ours has it |
|---|---|---|
| Data hooks (item) | 717 | 717 (100%) |
| Data hooks (variant) | 73 | 73 (ids only; see R7) |
| Code S | 362 | 53 (15%) |
| Code V | 2,065 | 1,029 (50%) |
| Code F | 57 | 0 |
| Data usages (fits) | 532 / 141 variant | 530 / 140 |
| Code W usages | 461 | 0 |
| Code I usages | 175 | 0 |

Our slots that Commlink6 never offers: `vehicle-tires` 169 (we give tyres to ground drones and SPECIAL_VEHICLES,
which code never does), `vehicle-cf` 68, `vehicle-powertrain` 8, `vehicle-electronics` 8, `vehicle-chassis` 6,
`vehicle-hardpoint` 4 and `audio` 3.

## Gap list

| # | Gap, measured |
|---|---|
| R1 | Code hooks missing from our import: FIREARMS_EXTERNAL 185 (special weapons included), MELEE_EXTERNAL 67, RANGED_EXTERNAL 18, ELECTRONIC_ACCESSORY 9, SOFTWARE on matrix devices 4, VEHICLE_TIRES 26. Vehicle (V): SOFTWARE/autosofts 293, hardpoints 285, accessory 105, electronics 103, chassis 102, powertrain 90 and CF 58. Every F (57), W (461) and I (175) is missing. Plus the extra slots listed above. |
| R3 | Usage cost is dropped on all 453 EMBEDDED usages that carry one. 287 EMBEDDED usages carry no value; CL6 treats those as 0.5 at the add check and 1 in the used total. Built-ins are free. |
| R6 | Usage mode is dropped: CARRIED 1,577 (1,526 of them by code default), IMPLANTED 502, VIRTUAL 3. We keep EMBEDDED only. |
| R7 | 17 items give the same hook a different capacity on different variants (cyberarm: 8 / 15 / 5 / 10 / 2 / 4). We keep one capacity per hook, from the first variant (`familymap.structure`). |
| R10 | 33 items carry selreq groups (152 tests) and 10 tests are negated. `familymap` flattens both. Note that most selreq tests have no `apply`, so CL6 itself does not enforce them at embed time. |
| R12 | A size cap appears only on DRONE_SMALL hardpoints with Body over 3 (10 items, cap 0.5). The cost read against the cap is the usage value (SIZE). WEAPON_SIZE is in the data on 90 weapons; rule Z sizes 165 more. |

## Settled by the Stage 1–4 decompile (2026-10-29)

Classes read: `GetModificationsStep`, `ApplyStockModificationsStep`, `CopyRequirementsStep`, `Requirement`,
`DataItemModification`, plus a byte search of every class in the jar.

- **`remove="true"` wins.** The data's HOOK modifications are not applied while they are read: they are queued and
  applied by the stock-modifications step, which runs **after** the vehicle (V) and standard (S) steps. There a remove
  deletes the hook outright. So zodiac's VEHICLE_ELECTRONICS/HARDPOINT/CF are gone for good. `hookmap.final_hooks` was
  right.
- **A HOOK valmod adds to a computed base.** When the hook already exists (V or S made it), a valmod becomes a
  modification on that hook's capacity (it adds; a negative value subtracts). Only when the hook does not exist yet does
  the valmod create it with its value. An `itemmod` HOOK (no value) on an existing capacity hook adds **1**.
- **`itemhookmod` does nothing in 1.14.0.** No class in the jar names the element (the modification list that parses
  `valmod`, `itemmod`, … does not list it), so the 6 rows are dropped at load. The computed base stands (hyundai
  shin-hyung keeps powertrain = Body 7, not 4). The importer therefore ignores `itemhookmod` too.
- **No default `apply`.** No loader fills one in. When an item is built, requirements with no `apply`, `CHARACTER` or
  `DATA_ITEM` are kept; `PARENT` and others are dropped. At embed time only `DATA_ITEM` tests and `selreq` groups are
  evaluated (above). Our app mirrors exactly that: it evaluates `apply="DATA_ITEM"` tests and selreq groups against the
  host, and treats the rest as not a fit gate.

## Category-only accessories (owner ruling 2026-10-29, Q2: keep the exact category match)

After Stages 1-4, 94 entries declare no usage (`<fits>`) and fit a host only through their category record's
`fits` naming the host's exact category (`categories.ts fitsHost`). No hook was synthesized for them. **85 of them
lost the old kind-word match** (`KIND_WORDS`, removed: `Weapon` no longer fits every weapon, `Vehicle` every
vehicle). Those now fit only a host whose own category is literally that name. Fix them one at a time as they turn up
(a Commlink6 usage, or a corrected category record). Measured on the fresh import of 2026-10-29 (78 books).

| Entry | Kind | Name | Category | Category fits | Lost kind-word match |
|---|---|---|---|---|---|
| `bn.silver-bullets-copper` | ammotypes | Silver Bullets (copper) | Ammunition accessory | Ammunition | yes |
| `bn.silver-bullets-silver` | ammotypes | Silver Bullets (silver) | Ammunition accessory | Ammunition | yes |
| `bn.silver-bullets-gold` | ammotypes | Silver Bullets (gold) | Ammunition accessory | Ammunition | yes |
| `bs.enhanced-movement` | augmentations | Enhanced Movement | Critter cyberlimb accessory | Critter cyberlimb |  |
| `bs.gecko-pads` | augmentations | Gecko Pads | Critter cyberlimb accessory | Critter cyberlimb |  |
| `bs.agility-increase` | augmentations | Agility Increase | Critter cyberlimb accessory | Critter cyberlimb |  |
| `bs.armor-increase` | augmentations | Armor Increase | Critter cyberlimb accessory | Critter cyberlimb |  |
| `bs.strength-increase` | augmentations | Strength Increase | Critter cyberlimb accessory | Critter cyberlimb |  |
| `bs.hydraulic-jacks` | augmentations | Hydraulic Jacks | Critter cyberlimb accessory | Critter cyberlimb |  |
| `crb.gyromount` | augmentations | Gyromount | Cyberlimb accessory | Cyberlimb |  |
| `crb.cyberlimb-accessories.smuggling-compartment` | augmentations | Smuggling compartment | Cyberlimb accessory | Cyberlimb |  |
| `crb.armor` | augmentations | Armor | Cyberlimb accessory | Cyberlimb |  |
| `crb.manual-operation` | gear | Manual operation | Vehicle modification | Vehicle | yes |
| `crb.smart-firing-platform` | weapons | Smart firing platform | Weapon accessory | Weapon | yes |
| `da.weapon-power-supplies-power-clip` | gear | Weapon Power Supplies (Power Clip) | New weapon mod | Weapon | yes |
| `da.weapon-power-supplies-satchel-power-pack` | gear | Weapon Power Supplies (Satchel Power Pack) | New weapon mod | Weapon | yes |
| `da.weapon-power-supplies-power-backpack` | gear | Weapon Power Supplies (Power Backpack) | New weapon mod | Weapon | yes |
| `da.weapon-power-supplies-power-bank` | gear | Weapon Power Supplies (Power Bank) | New weapon mod | Weapon | yes |
| `da.ergonomic-optimization` | weapons | Ergonomic Optimization | Weapon mod | Weapon | yes |
| `da.powered-heavy-tripod` | weapons | Powered Heavy Tripod | Weapon mod | Weapon | yes |
| `da.reinforced-smart-firing-platform` | weapons | Reinforced Smart Firing Platform | Weapon mod | Weapon | yes |
| `da.wheeled-heavy-tripod` | weapons | Wheeled Heavy Tripod | Weapon mod | Weapon | yes |
| `dc.interior-finish-amenities-squatter` | gear | Interior Finish/Amenities (Squatter) | Chassis mod | Vehicle | yes |
| `dc.interior-finish-amenities-low` | gear | Interior Finish/Amenities (Low) | Chassis mod | Vehicle | yes |
| `dc.interior-finish-amenities-middle` | gear | Interior Finish/Amenities (Middle) | Chassis mod | Vehicle | yes |
| `dc.interior-finish-amenities-high` | gear | Interior Finish/Amenities (High) | Chassis mod | Vehicle | yes |
| `dc.interior-finish-amenities-luxury` | gear | Interior Finish/Amenities (Luxury) | Chassis mod | Vehicle | yes |
| `dc.gecko-tips-size-class-2` | gear | Gecko Tips (Size Class 2) | Powertrain mod | Vehicle | yes |
| `dc.gecko-tips-size-class-3` | gear | Gecko Tips (Size Class 3) | Powertrain mod | Vehicle | yes |
| `dc.gecko-tips-size-class-4` | gear | Gecko Tips (Size Class 4) | Powertrain mod | Vehicle | yes |
| `dc.secondary-propulsion-system-amphibious-surface` | gear | Amphibious, Surface | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-glide-package` | gear | Glide Package | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-hovercraft` | gear | Hovercraft | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-rocket-booster` | gear | Rocket Booster: | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-rotor` | gear | Rotor | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-tracked` | gear | Tracked | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-vector-thrust-lav` | gear | Vector Thrust (LAV) | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-walker` | gear | Walker: | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-wheeled` | gear | Wheeled | Secondary propulsion system | Vehicle | yes |
| `dc.secondary-propulsion-system-winged` | gear | Winged | Secondary propulsion system | Vehicle | yes |
| `dc.rigger-interface` | gear | Rigger Interface | Electronics mod | Vehicle | yes |
| `dc.expanded-drone-storage-small` | gear | Expanded Drone Storage (Small) | Expanded drone storage | Vehicle | yes |
| `dc.expanded-drone-storage-medium` | gear | Expanded Drone Storage (Medium) | Expanded drone storage | Vehicle | yes |
| `dc.expanded-drone-storage-large` | gear | Expanded Drone Storage (Large) | Expanded drone storage | Vehicle | yes |
| `dc.pop-out-concealment-standard` | gear | Pop-Out Concealment (Standard) | Electronics mod | Vehicle | yes |
| `dc.pop-out-concealment-large` | gear | Pop-Out Concealment (Large) | Electronics mod | Vehicle | yes |
| `dc.pop-out-concealment-huge` | gear | Pop-Out Concealment (Huge) | Electronics mod | Vehicle | yes |
| `fs.modular-equipment-mounting-system-mems-mems-harness` | armor | MEMS Harness | Armor modification | Armor | yes |
| `fs.modular-equipment-mounting-system-mems-mems-ammo-pouch-large` | armor | MEMS Ammo Pouch (large) | Armor modification | Armor | yes |
| `fs.modular-equipment-mounting-system-mems-mems-medkit-pouch` | armor | MEMS Medkit Pouch (rank 1-3) | Armor modification | Armor | yes |
| `fs.quick-draw-holster` | armor | Quick-Draw Holster | Armor modification | Armor | yes |
| `fs.accessory-rails` | weapons | Accessory Rails | Weapon modification | Weapon | yes |
| `fs.barrel-extension` | weapons | Barrel Extension | Weapon modification | Weapon | yes |
| `fs.biometric-gun-lock` | weapons | Biometric Gun Lock | Weapon modification | Weapon | yes |
| `fs.collapsible-stock` | weapons | Collapsible Stock | Weapon modification | Weapon | yes |
| `fs.custom-style` | weapons | Custom Style | Weapon modification | Weapon | yes |
| `fs.dikote` | weapons | Dikote | Weapon modification | Weapon | yes |
| `fs.easy-breakdown` | weapons | Easy Breakdown | Weapon modification | Weapon | yes |
| `fs.folding-stock` | weapons | Folding Stock | Weapon modification | Weapon | yes |
| `fs.foregrip` | weapons | Foregrip | Weapon modification | Weapon | yes |
| `fs.gas-vent-improved` | weapons | Gas Vent (improved) | Weapon modification | Weapon | yes |
| `fs.gecko-grip` | weapons | Gecko Grip | Weapon modification | Weapon | yes |
| `fs.gyro-mount-ii` | weapons | Gyro Mount II | Weapon modification | Weapon | yes |
| `fs.heavyweight` | weapons | Heavyweight | Weapon modification | Weapon | yes |
| `fs.lightweight` | weapons | Lightweight | Weapon modification | Weapon | yes |
| `fs.melee-hardening` | weapons | Melee Hardening | Weapon modification | Weapon | yes |
| `fs.metahuman-adaptation` | weapons | Metahuman Adaptation | Weapon modification | Weapon | yes |
| `fs.nanoconstruction` | weapons | Nanoconstruction | Weapon modification | Weapon | yes |
| `fs.no-stock` | weapons | No Stock | Weapon modification | Weapon | yes |
| `fs.personalized-grip` | weapons | Personalized Grip | Weapon modification | Weapon | yes |
| `fs.revolution-arms-collapsible-stock` | weapons | rEVOlution Arms Collapsible Stock | Weapon modification | Weapon | yes |
| `fs.rigid-stock` | weapons | Rigid Stock | Weapon modification | Weapon | yes |
| `fs.safe-firing-iff-system` | weapons | Safe Firing IFF System | Weapon modification | Weapon | yes |
| `fs.short-barrel` | weapons | Short Barrel | Weapon modification | Weapon | yes |
| `fs.side-ammo-mount` | weapons | Side Ammo Mount | Weapon modification | Weapon | yes |
| `fs.smart-materials` | weapons | Smart Materials | Weapon modification | Weapon | yes |
| `fs.stock` | weapons | Stock | Weapon modification | Weapon | yes |
| `fs.trigger-removal` | weapons | Trigger Removal | Weapon modification | Weapon | yes |
| `fs.underbarrel-weapon-attachment-mount` | weapons | Underbarrel Weapon Attachment Mount | Weapon modification | Weapon | yes |
| `fs.underbarrel-weight-heavy-barrel` | weapons | Underbarrel weight/heavy barrel | Weapon modification | Weapon | yes |
| `fs.weapon-security-system` | weapons | Weapon Security System | Weapon modification | Weapon | yes |
| `fs.ap-spikes` | weapons | Weapon security system (AP Spikes) | Weapon modification | Weapon | yes |
| `fs.taser-shock` | weapons | Weapon security system (Taser-Shock) | Weapon modification | Weapon | yes |
| `fs.rfid-tracker` | weapons | Weapon security system (RFID Tracker) | Weapon modification | Weapon | yes |
| `fs.weapon-commlink` | weapons | Weapon Commlink | Weapon modification | Weapon | yes |
| `fs.flashing-blade` | weapons | Flashing Blade | Melee weapon modification | Weapon | yes |
| `fs.spikes` | weapons | Spikes | Melee weapon modification | Weapon | yes |
| `fs.spikes-retractable` | weapons | Spikes, retractable | Melee weapon modification | Weapon | yes |
| `fs.zapper-coating` | weapons | Zapper Coating | Melee weapon modification | Weapon | yes |
| `fs.glowcoat` | weapons | Glowcoat | Melee weapon modification | Weapon | yes |
| `fs.dynamic-tension-system` | weapons | Dynamic Tension System | Melee weapon modification | Weapon | yes |
| `fs.ruthenium-rifle-sheath` | weapons | Ruthenium Rifle Sheath | Weapon accessory | Weapon | yes |
| `sif-no.flashlight-uv` | gear | Flashlight, UV | Weapon modification | Weapon | yes |
| `ts.trauma-response-system-trauma-response-system-advanced` | gear | Trauma Response System (Advanced) | Armor modification | Armor | yes |

## Requirement scope (owner ruling 2026-10-29)

The app tests what Commlink6 tests at embed time: `apply="DATA_ITEM"` tests, and a `<selreq>` group only when
every member has `apply="DATA_ITEM"` (a member with no `apply` holds by itself, so such a group never fails). The
one exception is ruling 6: a holster (by name) has its gun-type group tested whatever its `apply`. The owner's
`WEAPON_TYPE` silencer exclusions are no longer tested. Catalog entries with any host test in force: 233 before, 146
after.

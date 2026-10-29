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

## Not settled by this stage

- Does a data `remove="true"` HOOK survive the vehicle step? Removal is applied while the data's modifications are
  read, and the vehicle step runs later and re-adds the hook if its computed size is not 0. `hookmap.final_hooks`
  assumes removal wins, as the data's intent says. Confirming it means decompiling the modifications step.
- What `itemhookmod CAPACITY` does to a computed base (6 rows): replace it or add to it. Not decompiled. `hookmap`
  reports it as its own source.
- Whether a loader gives requirements a default `apply` (see "Requirement gate" above).

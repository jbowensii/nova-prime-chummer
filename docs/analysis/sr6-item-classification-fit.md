# SR6 item classification and fit: what goes where

Status: plan only (2026-10-28). No code has been changed. This document is a design for a later change.

## Bottom line

Commlink6 (CL6) does not decide "what fits where" with categories or names. It uses one vocabulary of **hooks**
(`ItemHook`, 78 named slot kinds). Each host **offers** hooks with a capacity. Each fitted item **declares usages**:
the hook it goes into, how it is carried (`mode`) and what it costs (`value`). Hosts get their hooks from three
places:

1. **Hooks written in the data.** The item's XML declares them (`<itemmod type="HOOK">`, plus `<valmod type="HOOK" value>`
   for capacity).
2. **Standard hooks the code adds by item type.** `AddMissingStandardSlots`: every firearm gets `FIREARMS_EXTERNAL`,
   every vehicle gets `VEHICLE_TIRES`, and so on.
3. **Vehicle capacities the code computes.** `CalculateVehicleSlots` works out chassis, powertrain and electronics
   slots, Cargo Factor, accessory capacity and hardpoints from Body and Seats.

Our importer only reads source 1 (`tools/cl6check/familymap.py:94-101`). We rebuilt sources 2 and 3 by hand, in part,
in two places: Python (`importer/sr6/classes.py:91-168`) and TypeScript (`vehiclemods.ts`). Fit is then decided by
**two models side by side**: matching category words (`hostsOf`/`KIND_WORDS`) and matching slot ids (`fits`). Four
enforcement points check fit, and each one sees different inputs. The 0.29.x bugs came straight out of that.

The fix is to adopt CL6's hook model completely: one hook vocabulary, capacity counted per hook, every standard hook
derived by a rule (no exception tables), and one fit function used by the picker, the add-time guard and Review alike.
Six stages follow, each checked against CL6.

**Follow-up (§6):** fit is not hooks alone. CL6 adds a second layer. The fitted item's `<requires>` tests the host's
type, subtype, WEAPON_SIZE, AMMUNITION_CLASS and SOFTWARE_TYPES, and in some cases requires one specific host item.
This is how CL6 encodes "hold type". We import those requirements but never apply them, and we flatten their OR
groups (R9 and R10).

## Goal (owner, 2026-10-28)

Every item in the catalog must end up **fully flagged** — its class/type, hooks, usage (fits + mode + cost), host
capacity, size, ammunition class, hold-type (host requirements) and `modonly` all set — with **100% certainty that
each item is flagged**, and with **Commlink6 as the single standard we measure against** (the §7 flag-parity gate).

Order of preference for how each flag is set, highest first:

1. **Derive it from the text / importer.** Pull the flag from the jar (the matched CL6 record's attrs, hooks and
   `<requires>`) or compute it with a rule that mirrors CL6's code (`AddMissingStandardSlots`, `CalculateVehicleSlots`,
   the `WeaponSize`→`VEHICLE_WEAPON_*` map, the class table for book-only items). This is the goal for **100% of the
   missing information** — no hand-maintained lists where a rule can do it.
2. **Fall back to a hard-coded override only where derivation cannot reach the item** (a book-only item CL6 never had,
   or a case no rule covers). An override is the exception, is listed in the import report, and is justified against
   CL6; it never stands in for a rule we could write. This narrows the owner's standing "no exception tables" rule to:
   rules first, overrides only as a last resort, and every override visible.

Done means: the §7 comparison reaches its parity targets against CL6, and **no item leaves the importer unflagged** —
any item a rule cannot flag is either overridden (and reported) or surfaced for an owner ruling, never shipped blank.

---

## 0. Acceptance gates for this document

| # | Gate | Result |
|---|---|---|
| G1 | Every section is complete: CL6 model, our model, taxonomy plus fit matrix, gaps, plan | met (§1–§5) |
| G2 | Every CL6 count was measured from the jar in this session, not estimated | met. Every number in §1 comes from `tools.cl6check.reader` runs on `commlink6-1.14.0-complete.jar` (commands in Appendix A). Statements about Java *behaviour* are marked **[bytecode-strings]**: they are inferred from class-file constant pools, not from decompiled code |
| G3 | Every claim about our current code cites file:line | met (§2) |
| G4 | The fit matrix covers cyberware, weapons, drones, vehicles and gear | met (§3.2) |
| G5 | The root causes are tied to the 0.29.x bugs | met (§4, table R1–R8) |
| G6 | The plan is staged, and every stage says how it will be verified | met (§5) |
| G7 | The only file created is this one. No changes under src/ or importer/ | met (`git status` shows this file only) |

---

## 1. How Commlink6 models fit (measured)

The jar holds 4,474 records. 2,421 of them are `<item>`.

### 1.1 Classification axes

- **`type`** (33 values) and **`subtype`** are on every item. By count: VEHICLES 246, ELECTRONICS 196, ACCESSORY 192,
  PACK 177, CYBERWARE 146, WEAPON_FIREARMS 139, AMMUNITION 133, BIOWARE 119, … , MOD_CHASSIS 42, DRONE_LARGE 34,
  DRONE_MEDIUM 33, DRONE_SMALL 24, MOD_ELEC 18, MOD_HARD 17, DRONE_MINI 16, MOD_POWER 12, MOD_SKIN 10, DRONE_MICRO 8.
  Drones are separate *types* by size, not a subtype of VEHICLES. Vehicle mods are their own types
  (`MOD_CHASSIS/ELEC/HARD/POWER/SKIN`).
- **`modonly="true"`** is set on 63 items: 46 ACCESSORY/WEAPON_ACCESSORY (spare clips and similar), 3 MOD_CORE,
  2 AUTOSOFT, and others. A modonly item exists only inside a host.
- **`WEAPON_SIZE`** is an attrdef on 96 items. Its enum `WeaponSize` is TINY, SMALL, MEDIUM, LARGE, BIG, MILITARY, BUILDING
  (WEAPON_VEHICLE has MILITARY ×42). This is the data CL6 uses to decide whether a weapon fits a mount.

### 1.2 Host side: hooks offered

- **Explicit `<itemmod type="HOOK" ref>`**: 510 in all (492 plain, 18 `remove="true"`). The main ones: TOP 154,
  BARREL 125, UNDER 90, STOCK 68 (almost all on WEAPON_FIREARMS), CUSTOM_CYBERDECK 11, UNDER_WEAPON_MOUNT 10,
  VEHICLE_HARDPOINT 8 (DRONE_SMALL 4, DRONE_MINI 2, VEHICLES 2), CYBERHACK 6, SIDE_L/SIDE_R 4 each, VEHICLE_TIRES 4,
  and implant-weapon hooks on cyberware (IMPLANT_HOLDOUT 2, IMPLANT_PISTOL_LIGHT/HEAVY/MACHINE, IMPLANT_SMG,
  IMPLANT_SHOTGUN, IMPLANT_HEAVY 1 each), GLAND, TRANSGEN_GLAND, MEDKIT, COMMLINK, CYBERDECK, RCC.
  - `remove="true"` takes away a hook the code would otherwise add. Example: `zodiac_whisper` (a boat) removes
    VEHICLE_ELECTRONICS, VEHICLE_HARDPOINT and VEHICLE_CF. This tells us those hooks exist **by default** on vehicles.
- **Capacity through `<valmod type="HOOK" ref value>`**: ARMOR 78, SOFTWARE 50, ELECTRONIC_ACCESSORY 39,
  CYBERLIMB_IMPLANT 26, VEHICLE_CF 23, OPTICAL 18, CASE_MODS 12, HELMET_ACCESSORY 10, VEHICLE_CHASSIS 9,
  VEHICLE_HARDPOINT 8, … , and VEHICLE_WEAPON 3, VEHICLE_WEAPON_LARGE 3, VEHICLE_WEAPON_SMALL 2,
  VEHICLE_WEAPON_MILITARY 1. Capacity often sits on a **variant**. `cyberarm` has CYBERLIMB_IMPLANT 8 on
  `fullarm_synthetic` and 15 on `fullarm_obvious`. A valmod can also be negative, as an adjustment (zodiac:
  VEHICLE_CHASSIS −3).
- **`<itemhookmod hook attr="CAPACITY" value>`**: only 6 rows (VEHICLE_CHASSIS 3, VEHICLE_POWERTRAIN 2, VEHICLE_CF 1)
  on 5 vehicles and drones. Example: `gmc_bulldog` VEHICLE_CHASSIS CAPACITY 4.
- **Standard hooks added by code [bytecode-strings]** (`AddMissingStandardSlots`): WEAPON_FIREARMS gets
  FIREARMS_EXTERNAL; WEAPON_SPECIAL and WEAPON_CLOSE_COMBAT get MELEE_EXTERNAL; WEAPON_RANGED gets RANGED_EXTERNAL;
  VEHICLES (switch on subtype) get VEHICLE_TIRES; ELECTRONICS get ELECTRONIC_ACCESSORY.
- **Vehicle capacities computed by code [bytecode-strings]** (`CalculateVehicleSlots`):
  - VEHICLE_CHASSIS, VEHICLE_ELECTRONICS and VEHICLE_POWERTRAIN come from `VEHICLE_MODSLOTS` and `MODSLOTS_*`, with
    "Transfer points" (the 2:1 shift).
  - VEHICLE_CF comes from `calculateCargoFactor`, using SEATS, BIKES, TRUCKS and the rule `CARGOFACTOR_IS_WITHOUT_SEATS`.
  - VEHICLE_ACCESSORY is also set here.
  - VEHICLE_HARDPOINT comes from BODY (`createUnmodifiedHardpointsSlotForVehicle`), with `setMaxSizePerItem` for
    DRONE_SMALL and DRONE_MINI.
- **Load-time usage synthesis [bytecode-strings]** (`ItemTemplate`): `validateWeaponSize`,
  `validateVehicleWeaponMountSlots`, `validateFashionSlots`, `validateAutosoftsForVehicles` and
  `validateModificationSlots`. Usages are created in code, so weapons need no written usage to go into vehicle
  mounts. The data agrees: none of the 45 WEAPON_VEHICLE items carries a `<usage>`, yet stock vehicles embed weapons
  into VEHICLE_WEAPON 24 times, VEHICLE_WEAPON_LARGE 37 times and VEHICLE_WEAPON_MILITARY 20 times.

### 1.3 Accessory side: usages declared

`<usage mode slot value>` appears 1,329 times. `mode` is EMBEDDED 771, IMPLANTED 502, CARRIED 51 or VIRTUAL 3.
`value` is the **cost** in the host's capacity, or Essence for IMPLANTED usages without a slot.

| Usage slot | Who declares it (type/subtype: n) | carries a value? |
|---|---|---|
| CYBERLIMB_IMPLANT | CYBER_IMPLANT_WEAPON 72, CYBER_BODYWARE 27, COSMETIC 9, CYBER_LIMB_ACCESSORY 3, … | value ×119 (capacity points) |
| CYBEREYE / CYBEREAR / HEADWARE_IMPLANT | CYBER_EYEWARE, CYBER_EARWARE, CYBER_HEADWARE, VISION/AUDIO_ENHANCEMENT | value ×14 / 15 / 16 |
| TOP, BARREL, UNDER, STOCK | ACCESSORY/WEAPON_ACCESSORY 13 / 11 / 22 / 3 | no value: one item per mount |
| INTERNAL | WEAPON_ACCESSORY 47 (+ 3 weapons) | no value |
| FIREARMS_EXTERNAL, RANGED_EXTERNAL, MELEE_EXTERNAL | WEAPON_ACCESSORY 22 / 8 / 4 | no value |
| UNDER_WEAPON_MOUNT | 9 rifles, 6 accessories | no value (a weapon mounted under a weapon) |
| VEHICLE_CHASSIS / POWERTRAIN / ELECTRONICS / CF | MOD_* (+ a few drones) | value ×61 / 26 / 23 / 15 (mod slots) |
| VEHICLE_HARDPOINT | MOD_HARD 25, drones 15, 4 weapons | value ×43 (hardpoint units) |
| VEHICLE_ACCESSORY, VEHICLE_TIRES | ACCESSORY/VEHICLE_ACCESSORY 9, TIRES 2 | value |
| SOFTWARE | every SOFTWARE subtype (AUTOSOFT 18 …) | value on 11 of 98 |
| ARMOR / ARMOR_MEMS / ARMOR_REACTIVE / FASHION | ACCESSORY/ARMOR_BODY | value |
| ELECTRONIC_ACCESSORY, SENSOR_*, OPTICAL, AUDIO, HELMET_ACCESSORY | electronics and accessories | mixed |
| NANITES, GLAND, TRANSGEN_GLAND, MEDKIT | nanoware, bioware, biotech | mixed |

- **Alternatives.** 568 items declare one usage slot, 31 declare 2, 13 declare 3, 1 declares 4 and 1 declares 7.
  Several usages mean "any one of these". `smartgun_system` takes TOP or UNDER, and its `internal` variant takes INTERNAL.
- **Interchangeability is the hook, nothing else.** An item fits a host only when the host offers one of the item's
  usage slots. The proof that cyberware never fits a drone: **0** usages on CYBERWARE, BIOWARE, GENEWARE or NANOWARE
  name a VEHICLE_* slot (measured).
- `<requires>` (a prerequisite) appears on 33 ACCESSORY items. One example is the smartgun mode needing an active
  smartlink. It is a second, independent gate on top of the hook.
- **Built-in parts** are `<embed type="GEAR" ref intoType="HOOK" intoRef>`, 2,760 in all, `included` on 451. The most
  common targets are VEHICLE_CHASSIS 378, INTERNAL 342, VEHICLE_HARDPOINT 326, VEHICLE_ELECTRONICS 297 and VEHICLE_CF 187.
  An embed **names the hook it occupies**.

### 1.4 The mount chain (weapon into vehicle or drone)

```
vehicle/drone ──offers──▶ VEHICLE_HARDPOINT (capacity from Body / drone size; explicit HOOK on some drones)
weapon_mount_standard ──usage EMBEDDED VEHICLE_HARDPOINT value 1──▶ takes 1 hardpoint
weapon_mount_standard ──valmod HOOK VEHICLE_WEAPON value 1──▶ offers 1 weapon slot
weapon (WEAPON_SIZE) ──code-synthesised usage [bytecode-strings]──▶ VEHICLE_WEAPON{,_SMALL,_LARGE,_MILITARY}
```

The same pattern is used for cyberware: a cyberlimb offers CYBERLIMB_IMPLANT points, a `cyberfinger` (finger_gun
variant) uses 1 point and offers IMPLANT_HOLDOUT, and a hold-out pistol goes into that hook. A host is itself
something that gets fitted, and its accessories can be hosts in turn. **Fit is a tree of (host hook ← usage) edges.**

---

## 2. How we track it today (cited)

### 2.1 Data production (importer)

- `tools/cl6check/familymap.py:94-99`: a CL6 `valmod/itemmod type=HOOK` becomes our `<slot id value>`. The value comes
  from `slot_value` (`:64`).
- `familymap.py:100-101`: only `usage mode="EMBEDDED"` with a slot becomes `<fits slot>`. **The usage `value` (the
  cost) and the `mode` are dropped.** IMPLANTED and CARRIED usages with a slot are ignored.
- `tools/cl6check/slotmap.py:1-14,28-59`: generates `gen:"slot"` override rows with the vehicle-* HOOK values for each
  matched vehicle. Its docstring (`:12-14`) says classes.py "no longer emits the generic value-less vehicle category/tyre
  slots". **This contradicts `importer/sr6/classes.py:149-155`, which still emits them.** Flagged for the owner, not
  fixed.
- `importer/sr6/classes.py:91`: `HOST_SLOTS` is a hard-coded class-to-slot map, covering eyeware and earware only.
- `classes.py:95-107`: `VEHICLE_MOD_SLOTS` (six families, with no value) and `TIRE_SUBTYPES`, a hand copy of what
  CL6's code does.
- `classes.py:156-162`: a cyberlimb gets `cyberlimb-implant`, or `headware-implant` when its name contains "skull"
  (`:161`). The capacity is the printed bare-integer `capacity`. A `ponytail:` comment at `:144-147` notes the ceiling.
- `classes.py:163-165`: every WEAPON_FIREARMS gets `firearms-external`. No `melee-external`, `ranged-external` or
  `electronic-accessory` exists, though CL6 adds those too.
- `classes.py:166-168`: a weapon accessory's `<fits>` comes from the printed MOUNT column (`MOUNTS`, `:116-122`).
- `importer/sr6/overrides/rules.py:22-24,87`: `slot` and `fits` are allowed kid tags, and `gen:"slot"` rows are allowed.

### 2.2 Data representation

- `src/sr6/catalog/domain/structure.ts:5-38`: `ItemStructure.slots {id, value?}`, `fits: string[]`, `modOnly`, `size`.
  There is no cost, no mode and no unit on a slot.
- `structure.ts:48-85`: `mountSlots` treats `slot.value` as a **count of units**. Each fitted accessory takes one unit
  (`:56`), placed by augmenting-path matching across alternatives. A `cyberlimb-implant` value of 15 therefore means
  "15 items", where in CL6 it means 15 capacity points.
- `src/sr6/catalog/domain/categories.ts:79-83`: `hostsOf` reads the category record's `fits` text.
- `categories.ts:85-95`: `fitsHost`. If the accessory declares slot fits, the host must carry a matching slot id. If
  not, the category words are matched against the host's category, or the host's kind through `KIND_WORDS`
  (`:37-56`; for example `drone→vehicles`, `implant→augmentations`). The result is null when nothing is declared.
- `categories.ts:102-117`: `offeredOn` is the picker's rule. It adds the `modOnly` exclusion (`:113`) and a fallback
  by `filter` for entries that have no category.
- `categories.ts:120-136`: `capacityOf` and `capacityUsed` read the **printed** `attrs.capacity` (`8`, `[2]`). This
  number is separate from the slot value.
- `src/sr6/formats/domain/character.ts:138-149`: `SlotKind` / `SLOT_KINDS` (six vehicle families) and `SlotShift`.
  `:189` `removedBuiltins`, `:193` `addedSlots` (a GM per-instance `<slot id value>`).

### 2.3 Domain logic

- `src/sr6/runner-builder/domain/creation/purchases.ts:248`: `isMount` is a slot `vehicle-weapon*` **or the name
  regex** `/weapon mount/`.
- `purchases.ts:252-256`: `hardpointOf` reads `attrs.hardpoint`, else regex on the name.
- `purchases.ts:261-270`: `modKind` is a regex on class or printed category.
- `purchases.ts:242`: `isDrone` is a class regex or a category regex.
- `purchases.ts:206-213`: `augmentationSlot` gives the body-part limit by name.
- `src/sr6/runner-builder/domain/assets/vehiclemods.ts`:
  - `:19` `DECLARED_ONLY` (cf, accessory and tires are metered only when CL6 declares them).
  - `:102-111` `weaponSize`, a **category regex** where CL6 has `WEAPON_SIZE`.
  - `:113` `mountHolds`, a regex on the name.
  - `:158-218` `modsOf`: core slots are the declared capacity, else Body plus built-ins. Each fitted mod costs its
    printed `slots`.
  - `:234-256` hardpoints computed from Body and drone size. `:257-262` CRB mounts as Body/3.
  - `:264-271` autosofts as Pilot/2. `:275-290` the weapon must sit in a mount and not be too big for it.
- `src/sr6/runner-builder/domain/creation/actions.ts:1203-1222`: `accessoryProblem`, the add-time guard. It checks
  capacity first. It runs `mountSlots` only when the host has no capacity and is no vehicle, **passing
  `host.addedSlots`** (`:1214`). Vehicles go to `modsOf`.
- `src/sr6/runner-builder/ui/Picker.tsx:432`: `mountSlots(he, items, …)` **without `addedSlots`**. `:437` uses
  `offeredOn`.
- `src/sr6/runner-builder/domain/review/rules.ts:1623-1646`: `catalog.accessoryHost` checks
  `fitsHost(...) === false`. `:1629-1630` skips vehicles: this is the 0.29.2 fix. **It ignores `addedSlots`.**
  `:1648-1665` `catalog.capacity` uses the printed capacity. `:1667-1673` `vehicle.mods` wraps the `modsOf`
  warnings.

### 2.4 The model in one picture

```
CL6 explicit HOOK ──familymap──▶ <slot id value>         ┐
CL6 EMBEDDED usage slot ─────▶ <fits slot>  (cost lost)  ├─▶ fitsHost (slot path)      ─▶ catalog.accessoryHost
classes.py hand rules ───────▶ more <slot>/<fits>        │   mountSlots (count units)  ─▶ add guard, Picker
slotmap gen:"slot" ──────────▶ vehicle-* slot values     ┘   modsOf (Body rules)        ─▶ vehicle.mods
book category text ──────────▶ categories.xml fits=…  ───▶ fitsHost (word path, KIND_WORDS)
book printed capacity ───────▶ attrs.capacity ────────────▶ capacityOf/Used ─▶ catalog.capacity, add guard
names / regex ───────────────▶ isMount, hardpointOf, weaponSize, modKind, isDrone, skull
```

---

## 3. The taxonomy and fit matrix

### 3.1 Classes (the CL6 axes, kept verbatim)

An item's **class** is its CL6 `type/subtype`, which we already carry as `attrs.class` through `classes.py`. Every
item plays up to three **roles**:

- **Host**: it offers hooks `{hook, capacity, unit}`.
- **Fittable**: it declares usages `{hook, mode, cost}`, one or more as alternatives.
- **Standalone**: it has no usage, or a CARRIED one, and is bought on its own. `modonly` items are never standalone.

One item can be all three. A weapon mount is fitted into a hardpoint and is a host for a weapon. A cyberfinger is
fitted into a limb and hosts a hold-out pistol.

**Capacity units.** A hook counts in one unit:

| Unit | Hooks | Cost read from |
|---|---|---|
| `points` | CYBERLIMB/CYBEREYE/CYBEREAR/HEADWARE_IMPLANT, ARMOR*, FASHION, HELMET_ACCESSORY, OPTICAL, AUDIO, SENSOR_*, ELECTRONIC_ACCESSORY, CASE_MODS, CORE_SLOTS, NANITES | the usage `value`, which matches the printed `[n]` |
| `slots` | VEHICLE_CHASSIS/POWERTRAIN/ELECTRONICS/CF/ACCESSORY/TIRES | the usage `value`, which matches the printed mod slots |
| `hardpoints` | VEHICLE_HARDPOINT | the usage `value` (small 0.5, standard 1, large 2, huge 3: DC p. 124) |
| `one` (one item per hook instance) | TOP, BARREL, UNDER, STOCK, SIDE_L/R, INTERNAL, UNDER_WEAPON_MOUNT, IMPLANT_*, VEHICLE_WEAPON*, GLAND, MEDKIT, COMMLINK, RCC, CYBERDECK | none: 1 |
| `unbounded` | FIREARMS/RANGED/MELEE_EXTERNAL, SOFTWARE (when bounded by a rule instead, such as autosofts at Pilot/2) | none |

Per-hook units are proposed from the CL6 data: whether usages on that hook carry a `value` (§1.3). Stage 0
re-measures this before anything is locked.

### 3.2 Fit matrix (host class × fittable class → hook, unit)

| Host ↓ / Fittable → | Weapon accessory | Weapon | Cyberware / bioware | Vehicle mod (MOD_*) | Vehicle accessory / tyres | Software | Electronics accessory | Drone |
|---|---|---|---|---|---|---|---|---|
| **Firearm** | TOP/BARREL/UNDER/STOCK/SIDE (one); INTERNAL (one); FIREARMS_EXTERNAL (carry gear, unbounded) | UNDER_WEAPON_MOUNT (one; underbarrel weapon) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Melee / special / bow** | MELEE_EXTERNAL / RANGED_EXTERNAL (+ TOP/UNDER where declared) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Cyberlimb** | IMPLANTWEAPON_ACCESSORY (on an implant weapon) | CYBERLIMB_IMPLANT (points; CYBER_IMPLANT_WEAPON) | CYBERLIMB_IMPLANT (points) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Cybereye / ear / skull** | ✗ | HEADWARE_IMPLANT (2 implant weapons) | CYBEREYE/EAR/HEADWARE_IMPLANT (points) | ✗ | ✗ | ✗ | (sensor items declaring the hook) | ✗ |
| **Implant host (cyberfinger etc.)** | ✗ | IMPLANT_HOLDOUT/PISTOL_*/SMG/SHOTGUN/HEAVY (one) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Vehicle** | ✗ | VEHICLE_WEAPON* via a mount only (one, size-gated) | **✗ never (0 usages)** | CHASSIS/POWERTRAIN/ELECTRONICS/CF (slots); HARDPOINT (hardpoints) | VEHICLE_ACCESSORY, VEHICLE_TIRES (wheeled only) | SOFTWARE (autosofts) | VEHICLE_ELECTRONICS (sensors, imaging) | VEHICLE_HARDPOINT (15 drones declare it: drone racks) |
| **Drone** | same as Vehicle; hardpoint size capped by drone size (`setMaxSizePerItem`) | same | **✗ never** | same; micro gets none | same | SOFTWARE (Pilot/2 rule) | same | via a rack only |
| **Weapon mount (MOD_HARD/MOD_MOUNT)** | ✗ | VEHICLE_WEAPON{_SMALL,_LARGE,_MILITARY} (one, by WEAPON_SIZE) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Armor / helmet** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ARMOR/ARMOR_MEMS/REACTIVE/FASHION/HELMET_ACCESSORY (points) | ✗ |
| **Electronics (commlink/deck/RCC)** | ✗ | ✗ | ✗ | ✗ | ✗ | SOFTWARE (program slots) | ELECTRONIC_ACCESSORY; CASE_MODS/CORE_SLOTS (decks) | ✗ |
| **Gear (other)** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | only where a HOOK is declared (INSTRUMENT_SLOT, PROCAM_SLOT, SENSOR_HOUSING) | ✗ |

✗ means no hook pairs the two classes, so the fit is invalid. Every ✓ cell is one hook. There is no word matching
anywhere in the matrix.

### 3.3 Interchangeability rules

1. **I1, hook equality.** A fittable item fits a host only when one of its usage hooks is among the host's offered
   hooks, counting the host's own, its variant's, its standard hooks, its computed hooks and any GM-added hooks.
2. **I2, alternatives.** Several usages mean "any one of these", placed by matching. `mountSlots` already does the
   matching (`structure.ts:59-77`), but per unit only.
3. **I3, capacity.** For each hook, the sum of the costs of what is fitted must not exceed its capacity, in that
   hook's unit.
4. **I4, mode.** IMPLANTED costs Essence and takes the host's grade (CRB p. 282, already in `purchases.ts:36-38`).
   EMBEDDED takes the host's hook. CARRIED is standalone gear that *may* sit on an external hook (holsters, slings:
   the owner's 0.27.0 ruling that they are standalone).
5. **I5, chained hosts.** A fitted item that offers hooks becomes a host. A weapon reaches a vehicle only through a
   mount, and an implant weapon reaches a limb only through its own usage (points) or an implant hook.
6. **I6, size gate.** A VEHICLE_WEAPON* hook accepts weapons by WEAPON_SIZE, and a drone's hardpoint accepts devices
   up to its maximum size.
7. **I7, prerequisites.** `<requires>` is checked separately from fit (33 accessories).
8. **I8, removal.** A `remove="true"` HOOK (18 rows) deletes a standard hook. Our `removedBuiltins` is the
   per-instance equivalent for built-ins.

---

## 4. Gap analysis (root causes)

| # | Root cause | Evidence | Bugs it produced |
|---|---|---|---|
| R1 | **We import only one of CL6's three hook sources.** The standard hooks and the computed vehicle hooks are rebuilt by hand, and only partly | `familymap.py:94-101` reads explicit HOOKs only. Hand copies: `classes.py:91-168`, `vehiclemods.ts:19,158-256`. MELEE_EXTERNAL, RANGED_EXTERNAL and ELECTRONIC_ACCESSORY are missing | The 26 `catalog.accessoryHost` survivors (sibling note 2026-10-27): limbs without slots, common cars with no slots, carry gear on firearms-external. The 0.29.0 slot remodel (type-aware tyres, Body-derived slots) was this gap being filled piece by piece |
| R2 | **Two fit models side by side.** Category-word matching and slot-id matching | `categories.ts:37-56,85-95` (`KIND_WORDS` maps "drone" to every vehicle). `offeredOn` fallback `:116` | Weapon accessories offered on cyberears (`categories.ts:98-99` comment). Any entry without slot fits falls back to word matching, which is broader than CL6 |
| R3 | **Usage cost and mode are thrown away**, so capacity is counted from a different source than fit | `familymap.py:100-101` drops `value` and `mode`. `capacityUsed` reads printed `[n]` (`categories.ts:131-135`). `mountSlots` counts units (`structure.ts:51-56`) | `catalog.capacity` (3 genuine) and slot fit can disagree about the same host. The add guard has to pick one (`actions.ts:1209-1213` comment). A limb's slot value 15 means 15 items to `mountSlots` |
| R4 | **No single fit function. Four checkers see four sets of inputs** | Guard passes `addedSlots` (`actions.ts:1214`). Picker does not (`Picker.tsx:432`). Review's `fitsHost` does not (`rules.ts:1635`). Vehicles go through `modsOf`. Review skips vehicles by kind (`rules.ts:1629-1630`) | **0.29.2:** an autosoft or mod on a drone tripped `catalog.accessoryHost` because a generic checker ran where a specialised one governs. A GM-added slot passes the guard and then still errors in Review (latent) |
| R5 | **Classification by name and regex where CL6 has data** | `isMount` `purchases.ts:248`, `hardpointOf` `:252-256`, `modKind` `:261-270`, `isDrone` `:242`, `weaponSize` `vehiclemods.ts:102-111` (CL6 has `WEAPON_SIZE`), `mountHolds` `:113`, skull `classes.py:161` | The 0.29.0 weapon-mount hook work. Any renamed or new mount or weapon is misclassified without warning |
| R6 | **Usage mode is not modelled** (CARRIED vs EMBEDDED) | `familymap.py:100` keeps EMBEDDED only. `classes.py:163-165` gives every firearm a carry slot by owner ruling | The carry-gear bucket (9 of 26): slings and holsters nested on weapons by the sample builder |
| R7 | **Variant-level hooks are flattened.** Host capacity is re-derived from printed text | `classes.py:156-162` uses the bare-integer capacity and the "skull" name. CL6 puts CYBERLIMB_IMPLANT on each variant | Obvious and partial limbs got no slot (bucket 1 of the 26) |
| R8 | **Docs and code contradict each other** about who emits vehicle slots | `slotmap.py:12-14` vs `classes.py:149-155` | Not a bug yet. It is a risk of double or missing slots after the next change. **Owner to rule** which source is authoritative |

Underneath all of these: **fit is decided by inference spread through the code, not by a hook graph imported as
data.** Every patch so far added one more inference.

---

## 5. The plan (staged, verifiable)

The owner's standing rule applies: fix the extraction rule to match CL6, add no exception tables. Every importer
stage runs the CL6 gates in `docs/cl6check.md` (replay 1079/1079 and 0 diffs, plus a fresh import with completeness
4,474 and accuracy 4,288) and the 18-runner reconstruction harness (`C:\dev\_scratch\validation-audit\recon.test.ts`)
as a regression check.

### Stage 0: confirm CL6 behaviour (evidence only, no product change)

- Add `tools/cl6check/hookmap.py`. It prints, from the jar, for each hook: hosts and capacities (explicit, variant,
  itemhookmod, remove), fittables and costs by mode, and whether costs are present. That fixes §3.1's units by
  measurement.
- Confirm the code-synthesized rules (`AddMissingStandardSlots`, `CalculateVehicleSlots`, the `ItemTemplate.validate*`
  methods, `WeaponSize` to VEHICLE_WEAPON_* mapping) by **decompiling those 5 classes**. **Owner decision needed:**
  this needs a JDK `javap` or a decompiler such as CFR, neither of which is on this PC. The fallback is to infer the
  rules from CL6 behaviour on sample items.
- **Verify:** hookmap counts reproduce §1's measured numbers exactly (TOP 154, CYBERLIMB_IMPLANT usages 119 with
  value, augmentation→VEHICLE usages 0). There is a written rule table for every synthesized hook.

### Stage 1: data format (docs + schema only)

- `<slot id value unit>`: `id` is the CL6 hook normalized to kebab-case, which is today's vocabulary. `unit` is one
  of points, slots, hardpoints, one or unbounded.
- `<fits slot cost mode>` (cost is optional; mode is embedded, implanted or carried).
- Add `size` (WEAPON_SIZE) as data on weapons, and a hook `maxSize` on drone hardpoints and weapon mounts.
- Update `docs/sr6-data-format/*`. Old catalogs stay readable: a missing `unit` defaults to today's count behaviour.
- **Verify:** schema tests pass. An old catalog loads and gives identical Review output on the 18 runners.

### Stage 2: importer, one hook graph from CL6 (CL6 gates required)

1. `familymap.structure` also keeps the usage `value`, the `mode`, IMPLANTED and CARRIED slots, and `remove` HOOKs.
2. Replace `classes.py` `HOST_SLOTS`, `VEHICLE_MOD_SLOTS`, the firearm carry slot and the skull regex with one
   deterministic **standard-hooks pass by class**, mirroring `AddMissingStandardSlots`: firearms, melee and special,
   ranged, vehicles by subtype, electronics. Honour `remove`.
3. Port the vehicle computations from `CalculateVehicleSlots` (Body, Seats/CF, hardpoints, drone `maxSize`) into the
   **importer**, so the catalog carries the numbers. `slotmap.py` explicit values override them. This settles R8: one
   emitter.
4. Cyberlimb capacity comes from the variant HOOK value. The printed capacity becomes a cross-check only, and a
   mismatch is reported, not patched.
5. Weapons get `size` from WEAPON_SIZE. Book-only weapons map their category to a size by rule, and the rule's
   output is recorded in the import report.
- **Verify:** CL6 gates (1079/1079, 0 diffs). The new slot and fits pairs equal CL6's hook and usage pairs on every
  matched item. Measure it with a `cl6check` slots comparison extended to compare values, costs and units (the current
  gate compares ids only: `slotmap.py:10-11`). Target 100% of matched items. Unmatched items are listed.

### Stage 3: domain, one fit engine

- In `src/sr6/catalog/domain/structure.ts`, add `fit(host, hostInstance, fittable, fitted[]) → {ok, hook, reason}` and
  `hookBudgets(host, instance, fitted[])`. They take the catalog hooks + standard + computed + `addedSlots` −
  `removedBuiltins`. Placement uses matching (reuse `mountSlots`' augmenting path) weighted by cost per unit.
- `modsOf` keeps only what is book rules *on top of* hooks: the DC 2:1 shift, universal slots, CRB Body/3 mounts,
  Pilot/2 autosofts, the do-it-yourself price. It reads its budgets from `hookBudgets`.
- Replace the name heuristics (`isMount`, `hardpointOf`, `weaponSize`, `mountHolds`, `modKind`, `isDrone`) with class
  and hook reads. Keep a regex fallback only for entries without class, and count those in the import report.
- Remove the `fitsHost` category-word path once Stage 2 data leaves zero entries that depend on it. Measure first: the
  count of fittables with a category `fits` but no slot `fits` must be 0, or each remaining one must be listed for
  an owner ruling.
- **Verify:** unit tests per matrix cell using invented data (cyberware→drone rejected, mount→weapon size gate,
  limb points, alternatives). A property test checks that picker, guard and Review agree on 100% of (host, fittable)
  pairs in the reconstructed catalog.

### Stage 4: Review rules and UI on the same engine

- `catalog.accessoryHost` becomes `catalog.fit`: "X uses hook H; this host offers none". Same severity. Drop the
  kind exemption (`rules.ts:1629-1630`). Vehicles go through the same engine.
- `catalog.capacity` and `vehicle.mods` read `hookBudgets`. Each message names the hook and unit.
- `Picker.tsx:432-437` and `Ledger.tsx:1507` call `fit`, so `addedSlots` counts everywhere (R4).
- **Verify:** on the 18 runners, `catalog.accessoryHost/fit` goes from 26 to 0. The genuine findings stay exactly as
  they are (leftover.karma 4, skill.cap 3, catalog.capacity 3, …). No new capacity errors. Every remaining
  difference is listed and ruled on. Run the e2e `sr6-accessories.spec.ts`.

### Stage 5: sample builder and carried gear

- `importer/sr6/archetypes.py` emits CARRIED-mode gear (holsters, slings) standalone, per the 0.27.0 ruling. Weapon
  nesting is reserved for EMBEDDED usages.
- **Verify:** sample runners carry 0 CARRIED items nested on weapons. Their karma and nuyen totals are unchanged.

### Stage 6: release and reimport

- One PR per stage, or batched per the owner's batching rule. Bump the version, run the CL6 gates, then reimport on
  tower04 (re-apply GM toggles: a reimport resets creation.xml).
- **Verify:** the live tower04 Review shows no fit errors on the owner's runners. The owner confirms.

### Order and dependencies

Stage 0 → 1 → 2 → 3 → 4. Stage 5 can run in parallel with Stage 3 (it only touches the importer's archetypes) once
Stage 2's mode data exists. Stage 6 comes last. Stage 2 is the largest and the riskiest, because the capacity numbers
feed Review and the vehicle computation must match DC/CRB.

### Open decisions for the owner

1. Can a JDK or CFR be used to decompile five CL6 classes (Stage 0)? Otherwise the synthesized rules are inferred
   from behaviour.
2. Which source emits generic vehicle slots (R8)? Recommendation: the importer computes them (Stage 2.3).
3. Book-only weapons with no CL6 match: should a category→size rule be accepted, with its output reported?

---

## 6. Follow-up (2026-10-28): how CL6 decides attachment across every family

The owner has ruled that CL6's hook names may be adopted and may set per-item flags (hold type, class). The question
this section answers: is fit **hooks only**, **type + hold type**, or **both**?

### 6.1 Answer: both. The hook decides where an item can go; requirements on the host decide which hosts accept it

CL6 runs two independent layers, and an attachment must pass both:

1. **Hook layer (structural).** The fitted item's usage names the hook, and the host must offer that hook with room
   for it (§1). This alone keeps cyberware off drones, because no augmentation names a VEHICLE_* hook (measured: 0).
   It also keeps armor mods off weapons: the ARMOR capacity hook is offered only by ARMOR items (78 of 78 `valmod
   HOOK ARMOR` sit on type ARMOR).
2. **Requirement layer (the hold type).** The fitted item's `<requires>` tests the **host** item (`apply="DATA_ITEM"`
   or no `apply`), the host's parent (`apply="PARENT"`), or the character (`apply="CHARACTER"`). Several tests in a
   `<requires>` must all pass. A `<selreq>` is "any one of these". The host itself never restricts by the fitted item's
   type: no host-side filter on the fitted item exists in the data. Only the fitted item restricts its host.

There is no separate "hold type" enum. **Hold type means the host's `ITEMTYPE`, `ITEMSUBTYPE` and `WEAPON_SIZE` (plus
`AMMUNITION_CLASS`, `SOFTWARE_TYPES` and a few attributes), as tested by the fitted item's requirements.**

### 6.2 The requirement layer, measured

Items carry 434 `datareq`/`valuereq` elements in all. 433 sit outside a `<mode>`; 1 sits inside one (the smartgun
mode needs an active smartlink, `apply=ACTIVE_GEAR`). Grouped by what they test:

| Test (tag · type · ref · apply) | n | What it gates |
|---|---|---|
| valuereq ITEM_ATTRIBUTE SOFTWARE_TYPES DATA_ITEM | 101 | the program type a device runs (`nanite_pilot` needs BASIC) |
| valuereq ITEM_ATTRIBUTE AMMUNITION_CLASS DATA_ITEM | 55 | ammunition to weapon (`ammo_holdout_light_machine` needs LIGHT) |
| datareq ITEMTYPE (host) | 54 | vehicle mods by vehicle or drone type (`easy_assembly_micro` needs DRONE_MICRO) |
| datareq ITEMSUBTYPE (host) | 41 (+6 DATA_ITEM) | `comhack_armorlink_upgrade` needs a COMMLINK; `airburst_link` needs LAUNCHERS |
| valuereq ITEM_ATTRIBUTE ITEMSUBTYPE (host) | 37 | weapon accessories by weapon subtype (silencer: tasers, hold-outs, pistols, SMGs, …; shock pad: rifles, shotguns) |
| datareq GEAR (host / DATA_ITEM / PARENT / CHARACTER) | 30 / 17 / 5 / 5 | a specific host (`fn_p93_flashlight` needs `fn_p93_praetor`; `weapon_mount_military` needs a parent `milspec_hardpoint`) |
| valuereq ATTRIBUTE CHARACTER | 27 | Strength minimums (`stoner_ares_m202` 3): a character gate, not a fit gate |
| datareq CARRIED | 11 (+1 DATA_ITEM) | the character carries X, or not X with `negate` (`bark_skin` excludes `rhino_skin`) |
| valuereq ITEM_ATTRIBUTE WEAPON_SIZE (host) | 10 | `hidden_arm_slide` needs TINY; `concealable_holster` needs TINY or SMALL |
| valuereq ITEM_ATTRIBUTE ITEMTYPE (host) | 10 | `iron_hawk_arrow` needs BOWS |
| datareq CONSTRUCTION | 6 | vehicle skins by construction (`form_stripping` needs STANDARD) |
| datareq METATYPE CHARACTER | 5 | biosculpting by metatype |
| valuereq ITEM_ATTRIBUTE ARMOR / PILOT / DEVICE_RATING / DATA_PROCESSING / FIREWALL | 4/1/1/1/1 | host stat thresholds (`form_stripping` ARMOR ≥ $BODY) |
| datareq VEHICLE_TYPE | 2 | `oil_slick_sprayer` needs GROUND |

Host-targeted requirements (anything except `ATTRIBUTE`/`CHARACTER`), counted by the fitted item's type: SOFTWARE 105,
ACCESSORY 103, MOD_CHASSIS 67, AMMUNITION 63, MOD_POWER 16, MOD_SKIN 12, ELECTRONICS 6, BIOWARE 5, CYBERWARE 5,
GENEWARE 4, CYBERDECK 2, others 1 each. Of the 189 ACCESSORY items that declare a usage, **31 also gate their host by
requirement**. The other 158 are hook-only.

### 6.3 The gate sequence CL6 applies before an item occupies a hook [bytecode-strings]

From `CommonEquipmentController.canBeEmbedded`, in the order its constant pool lists them:

1. **Embeddable at all**: `ItemUtil.getEmbeddableIn` → `impossible.notEmbeddable`. The item needs an EMBEDDED usage,
   or one CL6's code synthesizes (§1.2).
2. **Requirements**: `Requirement` ×3, `areRequirementsMet`, `checkDecisionsAndRequirements`. These are the §6.2 tests
   against the host, the parent and the character. Missing choices fail as "Missing decision".
3. **Variant and mode select the usages**: `getCarryMode`, `getVariantID`, then `getAllowedHooks`. A variant can
   change the hook (smartgun `internal` → INTERNAL). The code special-cases `smartgun_system` / SMARTGUN.
4. **The host offers the hook**: `getSlot` → `impossible.noSuchSlot`.
5. **Room in the hook**: `hasCapacity`, then `getFreeCapacity` against the usage value → `impossible.notEnoughCapacity`.
   For a hook without capacity (one item per hook): `getAllEmbeddedItems().size` → `impossible.slotOccupied`.
6. **Size per item**: `getMaxSizePerItem` against the item's `SIZE` → `impossible.tooLarge` (drone hardpoints,
   `CalculateVehicleSlots.setMaxSizePerItem`).
7. **Matrix devices**: `ItemUtil.hasHookRequirement`, `SR6ItemFlag.MATRIX_DEVICE`, `matrixDevices`. Software hooks
   go only on matrix devices.

**Not a fit gate:** book availability. Source and book filtering is the selector's concern (`getAvailable`). This was
not measured as an embed check, and is listed as an open item for the Stage 0 decompile.

### 6.4 Per-family mechanism, with real rows

- **Weapon + weapon accessory.** `ares_predator_vi` declares HOOK TOP and BARREL, embeds `smartgun_system` into
  INTERNAL, and gets FIREARMS_EXTERNAL by code. `imaging_scope`: usage TOP, plus it offers OPTICAL 3 (vision
  enhancements go into the scope). `silencer`: usage BARREL, **plus** a selreq on host ITEMSUBTYPE (tasers, hold-outs,
  light and heavy pistols, SMGs, …). `shock_pad`: STOCK, plus selreq RIFLE_ASSAULT/HUNTING/SNIPER/SHOTGUNS.
  - *Wrong attachment, rifle scope on a pistol:* SR6/CL6 has **one** `imaging_scope` with no subtype gate. A pistol
    offers TOP, so CL6 **allows** it. There is no "rifle scope" item to block. A silencer on an assault rifle *is*
    blocked, by its subtype requirement.
- **Cyberware.** `cyberarm` variants offer CYBERLIMB_IMPLANT 8 (synthetic) or 15 (obvious). `built-in-medkit` uses
  CYBERLIMB_IMPLANT with value 4 (points) and offers MEDKIT. `cyberfinger` uses 1 point, and its `finger_gun` variant
  offers IMPLANT_HOLDOUT. The gates are hook and points. Five cyberware items add requirements:
  `grey_mana_armor` needs `dermal_plating`; `medullan_processors` needs a control rig (selreq).
  - *Wrong attachment, cyberware on a drone:* no augmentation usage names a vehicle hook (0), so it fails at
    `noSuchSlot`.
- **Bioware, geneware, nanoware.** Mostly IMPLANTED with an Essence value and no hook. Exceptions: GLAND /
  TRANSGEN_GLAND hosts and NANITES (23 usages). Their requirements are character-level exclusions (`bark_skin`
  excludes `rhino_skin`; `camouflage` excludes subtype BIOWARE_DERMAL with `negate`).
- **Electronics, decks, commlinks, RCCs.** Hosts offer SOFTWARE capacity (45 ELECTRONICS valmods), ELECTRONIC_ACCESSORY
  (38, plus the code standard), CASE_MODS (12 decks) and CORE_SLOTS. Programs use SOFTWARE and are gated by
  `SOFTWARE_TYPES` (101) and the MATRIX_DEVICE flag. Device upgrades are gated by subtype
  (`comhack_armorlink_upgrade`: COMMLINK and DEVICE_RATING ≥ $RATING; `external_program_carrier`: CYBERDECK).
- **Armor.** The host offers ARMOR / ARMOR_MEMS / ARMOR_REACTIVE / FASHION / HELMET_ACCESSORY capacity in points.
  Mods use those hooks with a value.
  - *Wrong attachment, armor mod on a weapon:* weapons offer no ARMOR hook, so it fails at `noSuchSlot`.
- **Ammunition.** Ammo never embeds: 0 of 133 AMMUNITION items has a usage. It attaches by **requirement only**:
  `AMMUNITION_CLASS` (55) against the weapon's ammunition class (attrdef on 56 items, such as BATTERY, RAILGUN, the
  ASSAULT_CANNON_B* family), or a specific weapon (`ammo_flametosser` needs `cyberweapon_flametosser`). `ammotype`
  records (29) gate by weapon subtype (`ballista_barbed` needs BALLISTAS) and multiply the base cost (`cmult`).
- **Vehicles and drones.** Hooks are computed (§1.2). Mods are additionally gated by ITEMTYPE (54), CONSTRUCTION (6),
  VEHICLE_TYPE (2), host stats (ARMOR ≥ Body) and a parent (`weapon_mount_military` needs `milspec_hardpoint`).
  Vehicle weapons are gated by WEAPON_SIZE through the synthesized mount usage.

### 6.5 Taxonomy and fit-matrix update

The §3.2 matrix is the hook layer and stays as it is. Every cell gains a requirement column. The canonical fit
predicate is:

```
fits(item, host) =
     usageHooks(item, variant, mode) ∩ offeredHooks(host) ≠ ∅               # hook layer (§3.3 I1, I2)
  ∧ requirements(item) hold against {host (DATA_ITEM), host.parent (PARENT), character}   # AND; selreq = OR; negate
  ∧ room(hook) ≥ cost(item) in the hook's unit, or the hook is empty when it takes one item  # I3
  ∧ size(item) ≤ maxSizePerItem(hook)                                         # I6
  ∧ (hook ≠ SOFTWARE ∨ host has the MATRIX_DEVICE flag)
ammo(item, weapon) = requirements(item) hold against weapon                  # no hook
```

New per-item flags derived from CL6 (owner-approved): `class` (type/subtype, which we already carry), `size`
(WEAPON_SIZE), `ammoClass` (AMMUNITION_CLASS, already carried in `structure.ts:13`), `softwareTypes`, `construction`,
`matrixDevice`. These are the host attributes that requirements test against.

Additions to the §3.3 rules:

- **I9, requirement gate.** A host-targeted requirement fails, so the item does not fit, even when the hook matches.
- **I10, ammunition** fits by requirement alone and never takes a hook.
- **I11, no host-side type filter.** Restriction always lives on the fitted item.

### 6.6 New root causes

| # | Root cause | Evidence | Effect |
|---|---|---|---|
| R9 | **CL6's host requirements are imported but never applied.** | `familymap.py:113-124` copies `requires` into `<prerequisite>` kids ("never applied by the app", `:113`). `structure.ts:15,32` exposes `prerequisites`, and the only consumer is martial arts (`martial.ts:106`) | 31 weapon accessories, 63 ammunition items, 67 chassis mods and 105 programs lose their host gate. A silencer is offered on an assault rifle, and micro-drone-only mods on cars. Today the name and category heuristics (R2, R5) partly stand in for it |
| R10 | **`selreq` (OR) is flattened into a plain list.** | `familymap.py:121-124` walks `rq.iter()` and emits every `datareq`/`valuereq` as a sibling, losing the `<selreq>` grouping and `negate` | Applying the prerequisites as imported would AND them. The silencer would need *every* subtype at once and fit nothing. The structure must keep the groups before R9 can be fixed |
| R11 | **Ammunition is matched by printed category, not ammunition class.** | `categories.ts:145,140` (`isAmmoGear` = category "Ammo by weapon"; `isAmmoType`). CL6 uses AMMUNITION_CLASS (55) and ammotype ITEMSUBTYPE requirements | Exotic weapons (railguns, assault cannons B25–B50, batteries, fuel, foam) can't be tied to their own ammunition |
| R12 | **No size-per-item gate on hooks.** | `structure.ts` has `size` (`:12,35`) but `mountSlots` never reads it. Drone hardpoint limits are hand-coded by name (`vehiclemods.ts:234-249`) | Becomes visible once Stage 2 imports `maxSizePerItem` |

### 6.7 Plan amendments

- **Stage 0.** Add to `hookmap.py`: the requirement census of §6.2 (target and type counts must reproduce 434 / 101 /
  55 / 54 / 41 / 37 / …) and the 31-of-189 accessory figure. The decompile also confirms the §6.3 gate order and
  whether availability gates embedding.
- **Stage 1 (format).** `<prerequisite>` gains `group` (the selreq index; an item's plain requirements are group 0
  = AND), `negate` and `apply` (host, parent or character, already present as a raw attribute). Add host attributes
  `softwareTypes`, `construction` and `matrixDevice`.
- **Stage 2 (importer).** `familymap` emits grouped prerequisites (fixes R10). Book-only items get no invented
  requirements; the report lists which items rely on hook-only fit. CL6 gates as before, plus a new
  comparison: for each matched item, our grouped prerequisites equal CL6's requirements tree (target 100%).
- **Stage 3 (domain).** `fit()` implements the §6.5 predicate. A `requirementsHold(item, host, parent, character)`
  evaluator lives in catalog/domain and covers the measured test types only: ITEMTYPE, ITEMSUBTYPE, ITEM_ATTRIBUTE,
  GEAR, CARRIED, CONSTRUCTION, VEHICLE_TYPE, METATYPE, ATTRIBUTE. An unknown test type counts as "not evaluated" and
  is reported, never silently passed. Ammunition matching moves to AMMUNITION_CLASS (fixes R11). `size` and
  `maxSizePerItem` are checked (R12). Unit tests, one per row of §6.2 (invented data): silencer rejects an assault
  rifle, holster rejects a LARGE weapon, ammo LIGHT rejects a HEAVY-class weapon, the military mount needs its parent
  hardpoint, a program needs a matrix device.
- **Stage 4 (rules and UI).** `catalog.fit` reports *which* gate failed: the hook, a named requirement, room, or
  size. The picker hides items failing the hook layer and shows requirement failures greyed with the reason.
  Whether to hide or grey them is an **owner decision**. Measure on the 18 runners before turning the requirement
  layer to `error`: new requirement failures are listed for an owner ruling, not shipped blind.

### 6.8 Gates for this follow-up

| # | Gate | Result |
|---|---|---|
| F1 | The mechanism question (hooks / type / both) has an evidenced answer | met: both (§6.1) |
| F2 | Requirement counts were measured from the jar, not estimated | met (§6.2; commands in Appendix A) |
| F3 | Every family has a mechanism and a real row (weapon, cyberware, bio, electronics/deck/RCC, armor, ammunition, vehicle) | met (§6.4) |
| F4 | The three wrong-attachment examples are each resolved | met: scope on pistol (allowed in CL6, no rifle-only scope exists), cyberware on drone (noSuchSlot), armor mod on weapon (noSuchSlot) |
| F5 | Every gate CL6 applies is enumerated | met (§6.3, 7 gates; availability flagged as unconfirmed) |
| F6 | Matrix, gaps and plan updated, with code claims cited | met (§6.5–§6.7) |
| F7 | Still only this one file changed | met |

---

## 7. Flag comparison layer: our derived flags vs CL6, name for name (2026-10-28)

The owner has decided: **on import, derive every per-item flag (hold type, type, category, size and the rest) from
the hooks, and name our flags exactly as CL6 names them.** This section sets each flag's CL6 source, our derivation,
and today's measured match.

### 7.1 How it was measured

- **Catalog:** the 78-book reconstruction from the sibling session (`C:\dev\_scratch\validation-audit\recon-current`,
  built 2026-10-27 from current code, overrides and the jar). **Caveat:** it predates the 0.29.x vehicle-slot changes.
  Re-run Stage 0 on a fresh import before taking these numbers as final.
- **Pairing:** `tools.cl6check.__main__.compare(...)[2]`, CL6's own matcher. 4,287 pairs. **2,269 of them are
  `<item>` records**, and those are the population below.
- **Scripts:** `C:\dev\_scratch\cl6cls\pairs.py` and `flags.py`, outside the repo. A flag is counted only on pairs
  where either side has it, and "match" means equal after normalizing case, spaces and underscores.

### 7.2 Summary table (for the owner)

| Flag (CL6 name) | CL6 source | How we will derive it on import | Items compared | Match today | What the mismatches are | Root cause |
|---|---|---|---|---|---|---|
| **ITEMTYPE / ITEMSUBTYPE** (class) | `<item type subtype>` | copy verbatim from the matched record; book-only items by the class table | 2,269 (2,106 without PACK) | **92.3%** (99.5% without PACK) | 163 starter packs (`PACK`) that have no class on our side; 11 real reclassifications (fangs BIOWARE vs CYBERWARE, imaging scope ELECTRONICS vs ACCESSORY, 4 sensor functions, 1 MOD_ELEC vs MOD_POWER, …) | R5 (class not authoritative), R1 |
| **Hooks offered** (host `ItemHook`s, as written) | `itemmod/valmod type=HOOK` | familymap, as today | 619 | **63.3%** | 211 of 227: we add six generic `vehicle-*` slots to vehicles where CL6 computes them in code; 16 others (audio, cybereye, mixed vehicle sets) | R1, R8 |
| **Hooks offered** (including CL6's code-added standard hooks) | `AddMissingStandardSlots` | standard-hook rule by class (Stage 2.2) | 853 | **50.8%** | we lack ELECTRONIC_ACCESSORY on 150 electronics, FIREARMS_EXTERNAL on 136 firearms, MELEE_EXTERNAL on 116 melee/special weapons, RANGED_EXTERNAL on 18 bows (tyres left out: CL6's subtype switch is unconfirmed) | R1 |
| **Usage hooks** (fits) | `usage mode=EMBEDDED slot` | familymap, as today | 551 | **98.2%** | 10: 4 sensor functions, laser sight and silencer missing `implantweapon-accessory`/`under`, 2 vehicle mods with extra families | R1, R7 (variant usages) |
| **Usage mode** (EMBEDDED/IMPLANTED/CARRIED/VIRTUAL) | `usage mode` | keep `mode` on each fits (Stage 1) | 822 | **0%** (not stored) | every item: the mode is dropped | R6 |
| **Host capacity** (points hooks) | `valmod HOOK value` on CYBER*/ARMOR/OPTICAL/AUDIO/HELMET/FASHION/SENSOR_HOUSING/ELECTRONIC_ACCESSORY | the slot `value` | 125 | **53.6%** | 38: ELECTRONIC_ACCESSORY value 99 (CL6's "no limit") vs none on ours; 20 more where the capacity sits on a variant and our record shows none | R7, R3 |
| **Usage cost** (capacity a fitted item takes) | `usage value` | keep `cost` on each fits (Stage 1) | 280 | **50.0%** | 140: ours has no printed cost where CL6 has one (mostly 1, 2, 0.5 and 0 slots or points) | R3 |
| **WEAPON_SIZE** (size) | `attrdef WEAPON_SIZE` | copy verbatim | 85 | **100%** | none | — |
| **AMMUNITION_CLASS** | `attrdef AMMUNITION_CLASS` | copy verbatim | 56 | **100%** (after normalizing spaces and underscores) | none; the spelling differs only (`Assault Cannon B25` vs `ASSAULT_CANNON_B25`) | adopt the CL6 spelling |
| **modonly** | `<item modonly>` | copy verbatim | 12 | **83.3%** | `spare_clip_new` (ours modonly, CL6 not); `living_console` (CL6 modonly, ours not) | R1 (copy, don't infer) |
| **Mount kind** (MOD_HARD/MOD_MOUNT) | subtype `MOD_MOUNT` | from class, never from the name | 11 | **45.5%** | 3 we call mounts by name that CL6 does not (articulated weapon mount, the Nissan Samurai vehicle, …); 3 CL6 mounts we miss (blow-away panels, pop-out concealment) | R5 |
| **Hold type** (host requirements present) | `requires` with apply = host / DATA_ITEM / PARENT | grouped prerequisites (Stage 1/2) | 237 | **86.9%** | 25 where CL6 gates the host and ours carries no host gate; 6 where ours has one and CL6 does not | R9, R10 |
| **Category** | none: CL6 has no category, its `subtype` is the closest | keep our printed category for display only; never use it for fit | — | not comparable | — | R2 (category must not decide fit) |

Headline numbers:
- **Already at 100%:** size and ammunition class.
- **At or near target:** class 99.5% (once packs are excluded), fits 98.2%.
- **Weak:** hooks offered (63% as written, 51% with CL6's standard hooks), host capacity 54%, usage cost 50%,
  mount kind 45%.
- **Not stored at all:** usage mode, 0% of 822.

### 7.3 Stage 2 verification amendment and the new gate

Stage 2 now ends with a **flag-parity report**: the `flags.py` logic moved into `tools/cl6check` (Stage 0 adds it
next to `hookmap.py`). For each flag it prints *matched / compared* and lists every mismatch.

**Gate S2-F (blocking for Stage 2 merge):** every derived flag matches CL6 on **≥ 99%** of matched items that carry
it, and every remaining mismatch is listed with an owner ruling or a root-cause id. The exceptions are hooks offered
and host capacity, which must reach 100% for every hook CL6 sets in code. Category is exempt: it is display-only.
Measured today, **this gate fails on 9 of 12 flags.** Only size, ammunition class and class (with packs excluded) pass. That is the expected starting point, and the list above is the
Stage 2 work.

### 7.4 Gates for this section

| # | Gate | Result |
|---|---|---|
| C1 | Every listed flag has a CL6 source, a derivation and a measured match | met (§7.2: 12 flags plus category) |
| C2 | Numbers measured, not estimated | met (2,269 item pairs, `flags.py`) |
| C3 | Every mismatch group is tied to R1–R12 | met |
| C4 | The new flag-parity gate is folded into Stage 2 | met (§7.3) |
| C5 | Only this file changed | met |

---

## Appendix A: measurement commands

- §6.2: walk each item's `<requires>` (outside `<mode>`) and count `(tag, type, ITEM_ATTRIBUTE ref, apply)`. The
  31/189 figure counts ACCESSORY items with a `<usage>` and at least one requirement whose `apply` is absent,
  DATA_ITEM or PARENT and whose type is not ATTRIBUTE.
- §6.3: constant-pool strings of `CommonEquipmentController.class` (around `canBeEmbedded`) and `ItemUtil.class`
  (`hasHookRequirement`).

All of these run from the repo root with `from tools.cl6check import reader; a,b = reader.read(reader.find_jar())`:

- Counting `r['el'].get('type')` over `tag=='item'` gives the type counts in §1.1.
- `Counter` over `iter('itemmod')` with `type=='HOOK'` gives the HOOK refs, host types and `remove` count.
- `iter('valmod')` with `type=='HOOK'` gives the capacity hooks. `iter('itemhookmod')` gives 6.
- `iter('usage')` grouped by `(slot, has value)` and by `(type, subtype)` gives the table in §1.3. Mode counts come
  from the same pass.
- Distinct usage slots per item gives the alternatives counts. Augmentation types with a `VEHICLE*` usage slot give 0.
- `iter('embed')` `intoRef` gives the embed targets. `attrdef id=WEAPON_SIZE` gives the size data.
- The **[bytecode-strings]** claims come from regex over the constant pools of `AddMissingStandardSlots.class`,
  `CalculateVehicleSlots.class`, `ItemTemplate.class`, `WeaponSize.class` and `ItemHook.class`, extracted to
  `C:\dev\_scratch\cl6cls\`.

# SR6 vehicle and drone decomposition: removable, upgradable parts

Status: plan only (2026-10-28). No code or data has been changed. This is a companion to
[sr6-item-classification-fit.md](sr6-item-classification-fit.md) (called "the fit plan" below). The fit plan
decides **where a part may go** (hooks plus host requirements). This document adds the other half: **what a
prebuilt vehicle or drone is made of**, so a player can take a factory part off, free its space, and fit something
else.

## Bottom line

1. **CL6 already models factory equipment as structured, removable parts.** It does not use descriptive text for this.
   Each vehicle record lists its factory parts as `<embed type="GEAR" ref=… intoType="HOOK" intoRef=…>` entries, and
   each one occupies a named hook (chassis, hardpoint, electronics and so on). **251 of 337** English vehicle and drone
   records carry at least one embedded part. **86 records carry none.** Under ruling **D7 (latest printing wins)** the
   oracle is **996** distinct placements (Stage 0 `embedmap`, "latest printing only" block). The earlier **1,056**
   figure was a *union across all printings including ~97 `lang="de"` records the importer drops* — a measurement
   artifact, not the import target. The Stage 2 gate checks the 996 set.
2. **The MCT Hornet's injector exists in CL6.** The core record defines it inline as `mct_hornet_stinger` ("MCT Hornet
   Injector": close-combat blade, 1P, AR 4, 0.5 of a hardpoint, `modonly`). CL6's own data comment says the book gives no
   stats and the numbers were reasoned by the CL6 authors. Double Clutch's record of the same drone instead embeds
   `hornet_injector_mount` into `VEHICLE_BODY`, and that id is **defined nowhere in the jar**.
3. **The GMC Bulldog's engine does not exist anywhere in CL6.** CL6 has no engine or powertrain *part* for any vehicle.
   Powertrain is a capacity (`VEHICLE_POWERTRAIN` slots), and the Bulldog's Double Clutch record only raises its chassis
   capacity (`itemhookmod VEHICLE_CHASSIS CAPACITY 4`). Verified in the jar (2026-10-28): no gear id is an engine/motor
   part; 15 real powertrain *upgrades* (improved_economy, nitro_boost, …) embed into `VEHICLE_POWERTRAIN` and import as
   parts by the normal rule. **Owner ruling D3 (RULED): synthesize the missing whole-system parts anyway** — an "GMC
   Bulldog Engine" and the like — each named after its source, sized by a derived/CL6 pattern, as an available removable
   item, every one flagged `origin="synthesized"` + needs-review. Synthesis fills only gaps CL6 has no part for.
4. **We import none of it.** `tools/cl6check/modifiers.py:145` lists `embed` as `UNSTATED` ("pre-installed gear … not
   modifiers of play"), and the importer has no other `embed` reader. Our only notion of factory parts is `<builtin>`.
   That comes from book box text (`importer/sr6/resolve.py:801-820`, `builtin_parts`). A builtin **never occupies a
   slot**: it can only *add* capacity (`vehiclemods.ts:210,227`). The exception is a mount's hardpoint share
   (`:242-250`). Its removal is a GM override (`actions.ts:127-128`). So removing a factory part frees nothing, and the
   Hornet has no injector to remove.
5. **The jammer is a different problem.** CL6 gives `jammer` (core, ELECTRONICS/COMMUNICATION) **no** usage on any
   vehicle hook, so CL6 itself would not let a player mount it on a drone. Our picker rejects it for the same structural
   reason (`categories.ts:116`: a host that declares slots offers nothing undeclared). **Owner ruling (D5):** the GM
   derives a custom mod from the jammer, with a set hook and size such as 0.5 hardpoint, and approves it as persisted
   custom content (§4.8).

So the work is mostly **import what CL6 already has, by pattern rules** (§4.6). On the D7 oracle (996 latest-printing
placements) the rules resolve every placement but one: 12 of the 13 undefined refs resolve by rule, M7 recovers the
Hornet's `mct_hornet_stinger`, and **exactly one placement needs a hand override** (§4.7) — the Scorpion's
`meta_adjust_pilot_troll` (ruling D9 → driver troll seat). **Synthesis is now non-zero by ruling D3**: for any
whole-system part CL6 lacks (engine/powerplant and the like) the importer synthesizes a named, flagged, removable
part. Book-only vehicles are still to be counted (G6).

---

## 0. Acceptance gates for this document

| # | Gate | Result |
|---|---|---|
| G1 | Every requested section is present: CL6 first, our model, decomposition model, synthesis method with two worked examples, coverage and confidence, owner decisions, staged plan with gates | met (§1–§6) |
| G2 | Every CL6 number was measured from `commlink6-1.14.0-complete.jar` in this session | met. Scripts in Appendix A. German books (`de_*`), `placeholder` and `icons` are excluded, as in `tools/cl6check/reader.py` |
| G3 | Every claim about our code carries a file:line | met. Lines checked against `release/0.30.0` @ 3598aa29 |
| G4 | Nothing was synthesized silently. Every inferred statement is marked **[inferred]** | met |
| G5 | Only this file changed | met (`git status` shows this file only) |
| G7 | The pattern rule set and override boundary are measured against the jar, with a hard forced-override count | met (§4.6–§4.7: 1 forced, out of 1,056) |
| G8 | The D5/D6 owner rulings are recorded, and the custom-mod design is specified | met (§4.8, §5.2) |
| G6 | Our *imported* builtin counts are measured | **not met, stated openly.** No current import is on disk: `custom/sr6` is absent and the `.extract/cl6-baseline` catalogs predate the builtin pass and hold 0 `<builtin>`. Stage 0 measures this |

---

## 1. How CL6 represents a prebuilt vehicle's parts (measured)

### 1.1 The three mechanisms

A CL6 vehicle record (`<item>` with a `<vehicle>` child) can describe its factory fit in three ways:

| Mechanism | XML | What it means | Records |
|---|---|---|---|
| **Embedded part** | `<modifications><embed type="GEAR" ref="X" intoType="HOOK" intoRef="H" [id] [intoId] [variant] [rating] [count] [included]/>` | Catalog item X is installed in hook H at the factory | 251 of 337 ids |
| **Inline part definition** | `<geardef><item id=… type=…><usage slot=… value=…/>…</item></geardef>` then an `<embed>` of it | A part that exists only on this vehicle, defined right there | 14 ids (19 parts) |
| **Capacity tweak** | `<itemhookmod hook="H" attr="CAPACITY" value="n"/>`, `<valmod type="HOOK" ref="H" value="n"/>` | Changes a hook's size. This is not a part | 5 / 24 |

Embed attributes, over 1,739 embed elements: `type`, `ref`, `intoType` and `intoRef` are always present. `variant` 304,
`id` 297 (an instance id, so a second embed can nest into it), `included` 93, `intoId` 45 (nesting: a weapon embedded
*into* a specific embedded mount, a smartgun into that weapon), `count` 30, `rating` 16.

**[inferred]** `included="true"` (58 distinct placements) marks a part whose price is already inside the vehicle's price,
as opposed to a listed option. It is not decompiled. Stage 0 confirms it on samples.

### 1.2 Coverage, by vehicle id

337 English vehicle and drone ids (VEHICLES 234, DRONE_MEDIUM 30, DRONE_LARGE 29, DRONE_SMALL 25, DRONE_MINI 13,
DRONE_MICRO 6). 126 ids have more than one record (core and a Double Clutch reprint). On **63** of those the records
disagree about the embeds. The owner's *latest printing wins* rule picks one ([latest-printing-default]).

| Decomposition class (union of embeds across a vehicle's records) | Ids |
|---|---|
| Every part resolves to a catalog item defined in the jar | **225** |
| Catalog parts plus inline (`geardef`) parts | 13 |
| Catalog parts plus undefined refs | 1 |
| Inline plus undefined refs (the **MCT Hornet**) | 1 |
| Undefined refs only | 11 |
| **No parts at all** (Bulldog, Americar, Rover 2080, trailers, airships, …) | **86** |

By type: VEHICLES 160 with parts and 74 without; drones 91 with parts and 12 without (micro 2/4, mini 9/4, small 22/3,
medium 30/0, large 28/1).

1,056 distinct (vehicle, part, hook) placements:

| Placement | Count | Meaning for us |
|---|---|---|
| The part declares a `<usage>` on the same hook it is embedded in | 792 (75%) | Removable *and* re-fittable by the normal fit engine |
| The part has usages, but not on this hook | 128 | Factory-only placement (amenities in CF, a microdeck in electronics) |
| The part has no usage at all | 121 | Embed-only. CL6 installs it, but a player could not fit it again |
| The ref is not defined anywhere | 15 | Must be synthesized (§4) |

Hooks used by embeds: VEHICLE_CHASSIS 512, VEHICLE_HARDPOINT 372, VEHICLE_ELECTRONICS 370, VEHICLE_CF 229,
VEHICLE_POWERTRAIN 105, VEHICLE_ACCESSORY 50, VEHICLE_TIRES 25, SOFTWARE 23, VEHICLE_WEAPON_MILITARY 20,
VEHICLE_WEAPON_LARGE 13, **VEHICLE_BODY 8**, INTERNAL 7, VEHICLE_WEAPON 5. VEHICLE_BODY does not appear in our
vocabulary at all (grep for `VEHICLE_BODY` and `vehicle-body` in `importer`, `tools` and `src`: 0 hits).

The 13 undefined refs: `hornet_injector_mount`, `realistic_features1..4`, `amenities_high`, `amenities_luxury`,
`armor_milspec1`, `gecko_tips1`, `life_safe_system_1`, `meta_adjust_pilot_troll`, `sec_power_boat`, `suspension_onroad`.
Most of them are a **rated or variant spelling of a defined item** (`realistic_features` is defined, rated 1–4).
**[inferred]** CL6 resolves them by a name convention, or they are CL6 data bugs. Either way they map by rule, not by
invention, and only `hornet_injector_mount` has no defined base.

The most-embedded parts are rigger_interface 115, hardpoint_large 75, drone_rack 60, satellite_link 59,
weapon_mount_standard 58, armor_ceramic 57, rigger_cocoon 55, amenities 54, and hardpoint_standard 53. Every one of them
is already a catalog item in the jar.

### 1.3 The two named cases

**MCT Hornet** (`mct_hornet`, DRONE_MINI/AIR, Body 1, 2,100¥):

```xml
<!-- core/data/gear_drones.xml -->
<geardef>
  <item id="mct_hornet_stinger" type="WEAPON_CLOSE_COMBAT" subtype="BLADES" modonly="true">
    <usage mode="EMBEDDED" slot="VEHICLE_HARDPOINT" value="0.5"/>
    <weapon dmg="1P" attack="4,,,," skill="close_combat" spec="close_combat/blades"/>
    <!-- Rules state the existence of the injector, but no data given. Using damage 1P ... AR 4 ... -->
  </item>
</geardef>
<modifications><embed type="GEAR" ref="mct_hornet_stinger" intoType="HOOK" intoRef="VEHICLE_HARDPOINT"/></modifications>

<!-- double_clutch/data/gear_vehicles_core.xml -->
<modifications>
  <embed type="GEAR" ref="realistic_features1" intoType="HOOK" intoRef="VEHICLE_CHASSIS" rating="1"/>
  <embed type="GEAR" ref="hornet_injector_mount" intoType="HOOK" intoRef="VEHICLE_BODY"/>
</modifications>
```

The English text (`core.properties`): `item.mct_hornet.item.mct_hornet_stinger=MCT Hornet Injector`, p. 299:
"Injector in the narrow abdomen … with a single dose of something unpleasant (purchased separately)."

So CL6 **does** carry the injector. The core printing has an inline part with *CL6-reasoned* stats, which CL6 marks as
such in a comment. The DC printing has a dangling ref plus Realistic Features 1. Our override
(`importer/sr6/overrides/crb.json:694,707`) gives the Hornet a `<fits slot="vehicle-hardpoint">`: the Hornet itself
"fits" a hardpoint. **[inferred]** That is the stinger's usage, lifted onto the drone. It is probably a mis-hoist of the
geardef child's `<usage>` by the family/slot generator, and it is a new root cause (R15).

**GMC Bulldog** (`gmc_bulldog`, VEHICLES/VANS, Body 16, 35,000¥): the core record has no modifications. The DC record has
`<itemhookmod hook="VEHICLE_CHASSIS" attr="CAPACITY" value="4"/>` only. No `engine` item exists in the jar. Grep for
engine/motor parts finds none, and CL6 has no powertrain *item* type. The Bulldog's "built-in armor" in its description
is its Armor 12 stat, not a part. **The Bulldog has nothing to remove in CL6.**

### 1.4 Carried gear (the jammer)

`jammer` (core, ELECTRONICS/COMMUNICATION, rating 1–6, variants area and direct) declares **no usage**. Across the whole
jar, the only non-mod item types with vehicle usages are 2 ELECTRONICS (`procam`, `procam_with_smart` →
VEHICLE_ELECTRONICS), a few weapons and specials → VEHICLE_HARDPOINT, and `emc_ink_dispenser` and `weapon_launcher`.
CL6 *embeds* electronics it would not let a player fit (`satellite_link` 59 times, commlinks, `citadel_outrider`: the
121 embed-only placements). **CL6 does not let a player mount a jammer on a drone.** Supporting it is a rules call (D5).

---

## 2. Our current model (cited)

| Layer | What it does | Evidence |
|---|---|---|
| Importer, CL6 embeds | Ignored: `embed` is in `UNSTATED`, skipped as "pre-installed gear" | `tools/cl6check/modifiers.py:145,196` |
| Importer, factory parts | Parsed from the book's box line into `<builtin name rating ref slots category>` or `<note field="builtin">`. Refs are matched by name (`_mod_ref`) | `importer/sr6/resolve.py:669,801-820,850` |
| Importer, Hornet | The class override plus `<fits slot="vehicle-hardpoint">` on the drone itself | `importer/sr6/overrides/crb.json:134,694,707` |
| Domain, builtins | `builtinsOf` reads `<builtin>`, drops GM-`removedBuiltins` | `vehiclemods.ts:118-132` |
| Domain, budgets | A builtin **adds** slots (`max: … + builtin.slots`) and never **uses** them. Only a built-in mount uses hardpoint units | `vehiclemods.ts:207-211,227,242-250` |
| Domain, removal | `op:'builtin'` remove or restore is a GM override, "everything is removable" (owner 2026-10-27). It frees nothing because nothing was charged | `actions.ts:127-128,713-720` |
| Domain, designs | A design's builtins are written as `<builtin>` snapshot parts | `src/sr6/runner-builder/domain/assets/design.ts:592-613` |
| Domain, mod kind | `modKind` classifies by class `MOD_*` and printed category. Gear without a class is `null` | `purchases.ts:261-270` |
| UI, Designer | The mod picker filters `modKind(e) !== null`, so electronics gear never shows | `src/sr6/designer/ui/Designer.tsx:711` |
| UI, career Fit | Vehicle Fit kinds are gear, weapons, electronics and programs, filtered by `e.kind!=='weapons' \|\| !isAccessory(e)` | `Ledger.tsx:1508-1510,1525-1526` |
| UI, picker gate | `Accessories` runs every candidate through `offeredOn` | `Picker.tsx:442` |
| Catalog, offeredOn | Offered if `fitsHost`. Never if `modOnly`. Otherwise only an undeclared, uncategorized entry, **and only on a host with no slots** | `categories.ts:109,113,116` |

**Why an integral part is not removable:** no integral part exists as an instance. It is either a `<builtin>` *label*
(text-derived, with a ref only when a name match succeeds) or nothing at all (the Hornet). A builtin consumes no hook
capacity, so removing it cannot free space. There is no "occupies" relation.

**Why a jammer cannot be mounted:** every vehicle carries `vehicle-*` slots, so `categories.ts:116` refuses anything that
declares no `fits`. The jammer declares none, because CL6 gives it no usage. The Designer refuses it earlier still, at
`modKind === null`.

### 2.1 Overlap with the fit plan's root causes

| Fit plan RC | How it shows here |
|---|---|
| R1 (one of three hook sources) | Embeds are a **fourth** CL6 source of hook occupancy, also unread |
| R3 (usage cost dropped) | The stinger's `value="0.5"` would be lost as well |
| R4 (four checkers) | Builtins are counted only in `modsOf`. Review and the picker don't see them |
| R5 (name heuristics) | `_mod_ref` name-matches box text to mods. `hardpointOf` and `addsHardpoint` match by name |
| R8 (who emits vehicle slots) | Builtin `slots` add to capacity beside CL6's declared caps (`declaredCap ?? body + builtin`) |
| R12 (no size per item) | Mini and micro drones get 0 free hardpoints (`vehiclemods.ts:237`), yet CL6 puts a 0.5 stinger in the Hornet's hardpoint. The hook must exist because its occupant exists |

### 2.2 New root causes

| # | Root cause | Evidence | Effect |
|---|---|---|---|
| R13 | **CL6 `<embed>` factory parts are not imported.** Factory fit comes from box text instead | `modifiers.py:145`. 251 vehicles and 1,056 placements are unread | Parts are labels, not instances. Text and CL6 disagree silently |
| R14 | **Builtins never occupy capacity.** There is no "installed in hook H, costs v" relation | `vehiclemods.ts:207-211` | Removing a factory part frees no space. A stock vehicle can look emptier than CL6 says |
| R15 | **A `geardef` child's usage is hoisted onto its parent vehicle** [inferred] | `crb.json:694,707` (the Hornet "fits" a hardpoint) | A drone looks like a hardpoint accessory. Its own part is lost |
| R16 | **The VEHICLE_BODY hook is missing from our vocabulary** | 8 placements in CL6, 0 references in our code | DC's Hornet injector and the Samurai mounts have nowhere to go |
| R17 | **No synthesized-part channel.** An undefined ref (15 placements) or a book-only vehicle part has no flagged representation | §1.2 | It is either dropped or would be invented silently |
| R18 | **Carried gear on drones has no rule.** CL6 gives payload gear no vehicle usage | §1.4 | The jammer case. It needs D5, not a code fix |

---

## 3. Decomposition model

### 3.1 Chassis and parts

A vehicle instance is **chassis + installed parts**:

- **Chassis (fixed):** the `<vehicle>` stats (Handling, Accel, Speed, Body, Armor, Pilot, Sensor, Seats), the type and
  subtype, and the **hook budgets**. A budget is the fit plan's hook graph (explicit hooks, standard hooks,
  `CalculateVehicleSlots`, `itemhookmod`/`valmod`). The chassis never comes off.
- **Integral parts (removable):** one per CL6 `<embed>`, with its ref, hook, cost in hook units (from the part's `usage
  value`, else 1), rating, variant, count, instance id and parent (`intoId`). Each part **occupies** its hook exactly
  as a player-fitted part does.

### 3.2 Data shape (catalog)

This extends the fit plan's Stage 1 format. It is a new child of `<vehicle>` that **replaces** text `<builtin>` wherever CL6 has
embeds:

```xml
<part id="p1" ref="weapon-mount-standard" hook="vehicle-hardpoint" cost="1" rating="" variant="" count="1"
      included="true" removable="true" parent="" origin="cl6|book|synth" review="none|needs-owner"/>
```

- `ref` is a catalog entry id. A synthesized part gets a real catalog entry (§4), so `ref` always resolves.
- `hook` is the fit plan's kebab-case hook. `cost` uses the hook's unit (the fit plan's `unit`).
- `parent` is another part's `id` (CL6 `intoId`): a weapon in a mount, a smartgun in that weapon.
- `origin` and `review` are the evidence flag (§4.3). They are rendered in the catalog browser and the import report.
- `<builtin slots category>` stays **only** for capacity grants that CL6 expresses as `itemhookmod`/`valmod`. Better
  still, those fold into the chassis budget, and `<builtin>` is retired once Stage 2 reaches parity (D2).

### 3.3 Instance state (character file)

Today: `removedBuiltins: string[]`. Proposed: `removedParts: string[]` (part ids), migrated 1:1 from `builtin:<n>`
when the indices map. A part that does not map is kept and reported. A removed part:

- **frees its hook cost** in `hookBudgets` (fit plan Stage 3), so the freed space is visible at once in the meter;
- **refunds nothing** by default. The book prices a vehicle as a whole, and nothing in CRB or DC that we have read
  prices a factory part's removal. **[inferred]** That is D4. The options are a 0 refund (recommended), or the part's
  catalog price at a resale fraction;
- removes the part's effects (a removed rigger interface stops granting its effect), and removes its children
  (`parent` chain) with it, the same as removing a mount today;
- may be **restored** (the inverse op) while its hook still has room.

Removal stays reversible ([creation-actions-reversible]). Whether a *player* may remove parts, or only the GM, is D1.
Today it is GM-only.

### 3.4 How it plugs into the fit plan

- Parts are hook occupants. `fit(host, instance, fittable, fitted[])` receives `fitted = installedParts −
  removedParts + accessories`. One engine, and the picker, the guard and Review agree (R4).
- A part with `usage matches hook` (792) re-fits through the normal engine. An **embed-only** part (121) and an
  **other-usage** part (128) are factory-only: `removable="true"`, but the picker cannot re-add them unless the GM
  "restores" them. That reproduces CL6's asymmetry exactly, with no table.
- The host-requirement layer (fit plan R9/R10) gates what goes into the freed space: weapon size for mounts, drone size
  for hardpoints.

---

## 4. Synthesized parts: method and flagging

### 4.1 When synthesis is allowed

Only when **all** of these hold:

1. The part is required by an embed ref that resolves to no jar item (15 placements), **or** a book-only vehicle's
   box line names a part with no catalog match.
2. Rule-based resolution fails. A synthesized part is a last resort after these rules, which are applied first and
   reported:
   - **R-a, rated spelling:** `<name><n>` → `ref=<name>` and `rating=n` when `<name>` is defined and rated
     (`realistic_features1..4`, `armor_milspec1`, `gecko_tips1`, `life_safe_system_1`).
   - **R-b, variant spelling:** `<name>_<variant>` → `ref=<name>` and `variant=<variant>` when the base defines that
     variant (`amenities_high`, `amenities_luxury`; `suspension_onroad`, `sec_power_boat`,
     `meta_adjust_pilot_troll` if their bases carry the variant). Stage 0 measures which ones resolve.
   - **R-c, inline definition:** a `geardef` child is imported **as a real catalog entry** (`origin="cl6"`), even when
     CL6's comment says its stats were reasoned. The stats are still CL6's, so CL6 stays the standard.
3. The owner has not ruled the part out (D3: no engines).

### 4.2 Where each field comes from (precedence, highest first)

| Field | 1st | 2nd | 3rd (reasoned default, always flagged) |
|---|---|---|---|
| Name | CL6 i18n key `item.<veh>.item.<part>` | Box line text | "<Vehicle> <role>" |
| Hook | CL6 `intoRef` | Fit-matrix rule by item class | — (never guessed: no hook means no part, ask the owner) |
| Cost in hook units | Part `usage value` | Sibling of the same class on the same hook (median) | 1 |
| Stats | CL6 inline `geardef` | Book text we hold (`texts/*.xml`) | The nearest catalog analogue, named in evidence |
| Price | CL6 `price`/`cost`/`attrdef PRICE` | Book box line | **0, included in the vehicle** (owner recommended), never a made-up ¥ |
| Availability | CL6 `avail` | The vehicle's | The vehicle's |
| Description | CL6 `.desc` | Book paragraph (summarized, not copied) | One line naming its source |

### 4.3 The flag and evidence trail

Every non-CL6 field writes the importer's existing `<found field how source page>` kid (as `resolve.py` already does
for ratings), plus the part-level `origin="synth" review="needs-owner"`. The import report gets a **Synthesized parts**
table: vehicle, part, each field, rule used, and evidence (jar path, i18n key, book page). The app shows a "needs
review" badge on such parts in the catalog browser and the Designer. Nothing synthesized ships silently. That makes it
the same contract as the fit plan's "override is listed in the import report".

### 4.4 Worked example 1: MCT Hornet injector

| Step | Result | Source |
|---|---|---|
| Embeds (latest printing = DC) | `realistic_features1` → CHASSIS, rating 1. `hornet_injector_mount` → VEHICLE_BODY | `double_clutch/data/gear_vehicles_core.xml` |
| R-a on `realistic_features1` | ref `realistic-features`, rating 1. **CL6, no synthesis** | `realistic_features` defined (DC p. 132) |
| `hornet_injector_mount` | Undefined. Its older printing has an inline `mct_hornet_stinger` with the same role | core `gear_drones.xml` |
| Decision | Import `mct_hornet_stinger` as catalog entry `mct-hornet-injector` (origin cl6) and use it for the DC ref. Rule M7; ruled D6 (owner 2026-10-28) | — |
| Name | "MCT Hornet Injector" | `core.properties item.mct_hornet.item.mct_hornet_stinger` |
| Class | WEAPON_CLOSE_COMBAT/BLADES, `modonly` | geardef |
| Stats | DV 1P, AR 4, Close Combat (Blades) | geardef. **CL6-reasoned** per its own comment, so it is flagged `review="needs-owner"` even though origin is cl6 |
| Hook and cost | DC: `vehicle-body`, cost unknown, so the core usage cost carries over: **hardpoint 0.5**. Ruled D6: hardpoint 0.5 | geardef `<usage value="0.5">` |
| Price | No price in CL6. **0, included** in 2,100¥ | rule §4.2 |
| Payload | "single dose … purchased separately", so the part has an ammo/toxin slot of 1 dose **[inferred]** | CRB p. 299 text |
| Result | The Hornet instance has 2 parts. Removing the injector frees 0.5 of a hardpoint (or the Body slot). A player can then fit any small hardpoint item that passes the size gate | — |

The jammer still does not go in that freed space unless D5 allows payload gear (§1.4).

### 4.5 Worked example 2: GMC Bulldog "engine"

| Step | Result | Source |
|---|---|---|
| Embeds | None in either printing | `core/data/gear_vehicles.xml`, DC `gear_vehicles_core.xml` |
| Capacity | `itemhookmod VEHICLE_CHASSIS CAPACITY 4`, folded into the chassis budget, not a part | DC record |
| An engine part in CL6? | None. No item of any type represents an engine. Powertrain is a hook budget (`VEHICLE_POWERTRAIN`) | jar-wide search |
| Book text we hold | Describes armor and seating, not an engine part ("built-in armor" = Armor 12) | `core.properties item.gmc_bulldog.desc` |
| Synthesis result if forced | Name "GMC Bulldog engine", hook `vehicle-powertrain`, cost = the whole powertrain budget, stats = the chassis Speed/Accel (removal → immobile?), price 0. **Every field is a reasoned default**, and nothing would be CL6-evidenced | — |
| Recommendation | **Do not synthesize.** "Upgrade the Bulldog's engine" is already modelled the CL6 way: fit powertrain mods (`improved_topspeed`, `improved_economy`, …) into its free powertrain slots. The stock powertrain budget is empty, not occupied by an engine | D3 |

This is the template for the 86 part-less vehicles: their factory state is "all hooks empty". Upgrades fill hooks, and
nothing needs removing.

---

### 4.6 The importer's pattern rule set (owner direction 2026-10-28: rules first, overrides only where no rule reaches)

The importer *reasons* every factory part from the data. The rules below are ordered: the first one that applies wins,
and each one writes a `<found field how="rule:<id>">` so the import report shows which rule set every field. None of
them is a table of names.

**Rules that create a part:**

| Id | Pattern | Produces |
|---|---|---|
| P1 | `<embed type="GEAR" ref intoType="HOOK" intoRef>` on the latest printing's vehicle record | one `<part>` with `ref` (resolved by M1–M6 below), `hook`=kebab(`intoRef`), and `rating`, `variant`, `count`, `included` copied, `id`=embed `id` (else `p<n>`) |
| P2 | `<embed intoId=X>` | the same part, with `parent`=the part whose embed `id` is X |
| P3 | `<geardef><item>` child of a vehicle | a real catalog entry (origin cl6, kind from its `type`), then referenced by the P1 embed that names it. Its `<usage>` stays on the child and is **never** hoisted onto the vehicle (fixes R15) |
| P4 | `<itemhookmod hook attr="CAPACITY" value>` / `<valmod type="HOOK" ref value>` | **no part.** It adjusts the chassis hook budget |
| P5 | Vehicle with no embeds | no parts: the stock vehicle has every hook empty |

**Rules that resolve a ref (M1–M6, applied in order; M1–M5 are exact, M6 is a guess and is reported):**

| Id | Pattern | Measured hits |
|---|---|---|
| M1 | `ref` is a defined item id | 1,022 placements + 19 inline (P3) |
| M2 | `<base><n>` or `<base>_<n>`, with `<base>` defined and rated → `ref=base, rating=n` | `realistic_features1..4`, `armor_milspec1` (5) |
| M3 | `<base><n>`, with `<base>` defined and unrated and exactly one variant id ending in `n` → `variant` | `gecko_tips1` → `gecko_tips`/`size1` (1) |
| M4 | the longest defined prefix `<base>`, where the remainder equals one of its variant ids → `variant` | `amenities_high`, `amenities_luxury` (3) |
| M5 | the remainder after the first token(s) equals a variant id held by **exactly one** item in the jar → that item and variant | `sec_power_boat` → `secondary_propulsion_system`/`boat`, `suspension_onroad` → `tuned_suspension`/`onroad` (3) |
| M6 | fuzzy name ≥ 75% to a unique id (the owner's fuzzy-matching rule) | `life_safe_system_1` → `life_safety_system` (1) |
| M7 | undefined ref on a vehicle whose **other printing** defines an inline part (P3) with the same role (both mount on the same drone, and that drone has no other weapon) | `hornet_injector_mount` → `mct_hornet_stinger` (1). This is D6, now ruled |

**Rules that derive a part's fields from the gear it references (no hand values):**

| Field | Derivation |
|---|---|
| Hook | the embed's `intoRef`. If the referenced item's `<usage>` names a different hook, the part is classed *factory placement* (§1.2), never re-mapped |
| Size / slot cost | the referenced item's (or chosen variant's) `<usage value>` for that hook. Else its usage value on any hook. Else the fit plan's class default for the hook unit. Formulas such as `$$BODY*…` are evaluated against the host chassis |
| Price | if `included="true"`, or the record is the vehicle's own factory fit, it is **inside the vehicle price** (the part shows its catalog price for information only). Otherwise the item's `price`/`cost`/variant `attrdef PRICE` at the part's rating and variant |
| Availability, effects, rules | carried from the referenced catalog entry (its effects apply while it is installed) |
| Name and description | the CL6 i18n key (`item.<veh>.item.<part>` for inline parts, else `item.<ref>`), otherwise the catalog entry's |

### 4.7 The override boundary (measured)

The 1,056 CL6 placements, under P1–P5 and M1–M7:

| Outcome | Placements | Refs |
|---|---|---|
| Resolved exactly (M1–M5) | 1,053 | — |
| Resolved by a reported guess (M6) | 1 | `life_safe_system_1` |
| Resolved by the sibling-printing rule (M7, D6 ruled) | 1 | `hornet_injector_mount` |
| **Forced hand override (no rule resolves it)** | **1** | `meta_adjust_pilot_troll` on the Harley-Davidson Scorpion (DC). M4 finds the base `meta_adjust_pilot`, but "troll" matches **two** variants (`driver_troll`, `passenger_troll`). The rule must not choose between them |

**So 1,055 of 1,056 placements (99.91%) need no override. Exactly 1 placement needs one.** I recommend
`driver_troll`, because "pilot" in the ref names the driver's seat; that recommendation needs the owner's ruling.

The cases where an override can still be unavoidable, the complete list:

1. **Ambiguous variant** (M4/M5 finds more than one candidate): today 1 (above).
2. **Unmapped undefined ref** (no M rule hits): today 0. A future CL6 version may add some. The import report fails the
   gate rather than shipping the part blank.
3. **Book-only vehicles with no CL6 record:** their box-line `<builtin>` names go through the same M rules against the
   catalog. Only a name no rule maps becomes an override, or a GM custom mod (§4.8). The count is **not yet measured**
   (gate G6, Stage 0).
4. **True synthesis** (a part neither CL6 nor the book defines): today **0**. The Hornet injector was the one candidate,
   and M7 now resolves it to CL6's own inline part. Engines stay unsynthesized (D3).

Overrides are the exception: each one is a row in `importer/sr6/overrides/*.json` with a `note` citing the ambiguity,
and the import report lists it.

### 4.8 GM custom mod derived from any gear (custom content)

**Ruling (owner 2026-10-28):** a GM may create a **new** accessory, mod or upgrade **derived from any existing gear
item**, set its hook and size, and allow it on vehicles or drones. In the fiction: a skilled tech strips the electronics
out of one handheld device, within a weight limit, and re-mounts them elsewhere. With GM approval that makes a new mod in
the game. This is the answer to carried gear on drones (D5) and the user-facing path for any part the rules cannot
supply (§4.7 items 1–4). It is **not** free-form gear-in-slot. The base gear stays what it is, and the derived mod is a
separate, persisted, approved catalog entry.

**What it is:** a custom-content catalog entry, stored where GM content already lives (the edits layer, which survives a
reimport; see [reimport-resets-creation-rules]):

```xml
<gear id="custom.jammer-area-hardpoint" derivedFrom="jammer" variant="area" rating="4"
      class="MOD_HARD/MOD_OTHERS" origin="gm" approvedBy="<gm>" approvedOn="2026-10-28">
  <name>Area jammer (hardpoint mount)</name>
  <fits slot="vehicle-hardpoint" cost="0.5"/>
  <requires><selreq><datareq type="ITEMTYPE" ref="DRONE_MINI"/><datareq type="ITEMTYPE" ref="DRONE_SMALL"/></selreq></requires>
</gear>
```

- **Carried over from the base gear, by reference (not copied):** price at its rating and variant, availability,
  description, effects and game rules. A later catalog fix to the jammer reaches the mod.
- **Set by the GM:** hook (any vehicle hook from the fit plan's vocabulary), cost in that hook's unit (e.g. 0.5
  hardpoint), the optional host requirements (which vehicle or drone types accept it), and the name.
- **Optional GM fields:** an extra install price or availability (labour). Each one defaults to 0 and is shown
  separately, never folded silently into the base price.
- **Approval:** a draft is invisible to players until the GM approves it. Once approved, it is offered by the one fit
  engine (fit plan Stage 3) exactly as an imported mod is. Review treats it as data, not as an exception.
- **Reversible:** deleting or un-approving it flags any installed copies in Review (it never silently removes them).

**What the 0.5 hardpoint can carry:** anything the GM derives into a mod of cost ≤ 0.5 on that hook, plus imported
items whose usage fits. The rules engine still applies the host requirements and size gates.

**Uses of the same mechanism:**
- the jammer on a Hornet (D5): derive `jammer` → hardpoint 0.5 → fit it in the space the injector freed;
- adjusting a factory part (D6): derive from `mct_hornet_stinger` with a different hook or cost;
- book-only vehicles' unmappable box-line parts (§4.7 item 3): the GM derives them from the nearest gear and the result
  is approved custom content, not an importer invention;
- the single forced override (§4.7) can alternatively be left to the GM in the same way.

## 5. Coverage, confidence and owner decisions

### 5.1 Coverage (CL6 jar, 337 ids)

| Bucket | Ids | Confidence | Why |
|---|---|---|---|
| A. Decomposes fully from the jar (catalog refs only) | 225 | **High** | Every ref is a defined item. 75% of placements re-fit via their own usage |
| B. Jar plus inline geardef parts | 13 | **High / medium** | Stats are CL6's own, some of them CL6-reasoned (flagged) |
| C. Has undefined refs, resolved by rules M2–M7 (§4.6) | 12 vehicles (14 placements) | **High** (M2–M5 exact), **medium** (M6 guess, M7 sibling) | Measured in this session |
| D. Needs a forced override | **1 vehicle, 1 placement** (Scorpion `meta_adjust_pilot_troll`, ambiguous variant) | **Medium** | Owner picks the variant, or the GM uses the custom mod (§4.8) |
| True synthesis | **0** | — | The Hornet injector is resolved by M7 to CL6's own part |
| E. No parts (stock = empty hooks) | 86 | **High** | Nothing to decompose. Upgrades only |
| Book-only vehicles (no CL6 match) | unknown | **Low** | Box-line `<builtin>` → part via §4. Counted in Stage 0 (G6) |

Placements: 792 re-fittable, 249 factory-only (128 + 121), 15 undefined. **Measured share decomposable without
synthesis: 1,041 / 1,056 = 98.6%** from direct refs alone. **With the pattern rules (§4.6): 1,055 / 1,056 = 99.91%,
measured, and exactly 1 forced override** (§4.7).

### 5.2 Owner decisions — all RULED (owner 2026-10-28)

1. **D1. Who may remove factory parts — RULED: the player**, at creation and in Ledger career. It is reversible
   (Restore re-installs), so no GM round-trip is needed for routine swaps.
2. **D2. Deriving parts — RULED: derive from CL6's model via the pattern rules (§4.6); a hard override is used only
   where the rules cannot resolve a part.** Where CL6 has structured embeds, those are the part list and the old
   text `<builtin>` entries are retired for that vehicle; `<builtin>` survives only for book-only vehicles CL6 does
   not cover.
3. **D3. Synthesize "whole system" parts CL6 lacks — RULED: yes, for ALL such parts, not only engines.** Each
   synthesized part is **named after its source object** (e.g. "GMC Bulldog Engine"), its size/slots come from a
   **derived or CL6 pattern** (§4.x synthesis rule), and it is an **available, removable item**. Every synthesized
   part carries `origin="synthesized"` and a **needs-review** flag (never silently invented). The powertrain remains
   a capacity hook; genuine CL6 powertrain upgrades (improved_economy, nitro_boost, …) already import as parts by the
   normal embed rule — synthesis fills only the gaps where no CL6 part exists (engine/powerplant and any other
   whole-system component the vehicle implies).
4. **D4. Refund on removal — RULED: 0 by default.** The factory kit is baked into the sticker price. A GM may enter a
   **custom refund and approve it** (used goods, likely sold on the black market); there are **no standard amounts**.
   Re-installing a removed part costs 0. Restore is always free and reversible.
5. **D5. RULED:** carried gear on drones is allowed **through the GM custom mod** (§4.8). A GM derives a new mod from
   any gear, sets its hook and size, and approves it as persisted custom content. Free-form gear-in-slot is not allowed.
6. **D6. RULED:** the Hornet injector defaults to CL6's `mct_hornet_stinger` on the **hardpoint at 0.5** (rule M7 maps
   DC's undefined `hornet_injector_mount` to it). The GM can adjust it through the same custom-mod path.
7. **D7. Records that disagree — RULED: latest printing wins, whole embed set** (not merged per part). Matches the
   standing "current latest printing wins, always" rule; avoids cross-edition loadouts no single book describes.
8. **D8. The `included` flag — RULED: `included="true"` = in the base price** (remove freely, no refund per D4);
   non-included factory parts are shown with their own price as add-ons. Stage 0 confirms the flag's exact meaning
   against CL6 before the importer relies on it; if it means something else, flag it back to the owner.
9. **D9. The ambiguous ref — RULED:** the Harley-Davidson Scorpion's `meta_adjust_pilot_troll` is a **driver/pilot
   troll seat** occupying VEHICLE_CF. Removing it frees that CF capacity — enough for a standard-size pilot seat plus a
   passenger seat.

The fit plan's open decisions still apply (decompiler access; who emits vehicle slots, R8; book-only weapon size).

---

## 6. Staged plan and gates

The stages slot into the fit plan's sequence. Each importer stage runs the standing CL6 gates (`docs/cl6check.md`:
replay 1,079/1,079 with 0 diffs, completeness 4,474, accuracy 4,288) and the 18-runner reconstruction harness.

### Stage 0: measure (evidence only; runs alongside fit-plan Stage 0)

- Add an `embedmap` measurement in `tools/cl6check`: per vehicle, the latest printing's embeds, ref resolution
  (defined, R-a, R-b, inline, undefined), hook, usage match and cost. Also count our imported `<builtin>`s and
  name-match refs (closes G6).
- **Gate:** it reproduces 337 / 251 / 86 / 1,056 / 792 / 128 / 121 / 15 from this document exactly, and lists the
  R-a/R-b resolution per undefined ref.

### Stage 1: format (docs + schema; with fit-plan Stage 1)

- `<part>` (§3.2), the `vehicle-body` hook, `removedParts` on the instance, and `origin`/`review` flags. Old catalogs
  and characters load: `<builtin>` and `removedBuiltins` keep today's behaviour.
- **Gate:** schema tests pass. An old character file round-trips unchanged, and Review output on the 18 runners is
  identical.

### Stage 2: importer (with fit-plan Stage 2; CL6 gates required)

**Data channel — RULED (owner 2026-10-28, option a).** The app importer builds the catalog from the book PDFs and
never reads the CL6 jar; tower04 and CI have no jar. So the per-vehicle part data is baked offline into a **committed,
generated table** `importer/sr6/overrides/vehicle_parts.json`: one `tools/cl6check` generator reads the jar, resolves
every part by the P/M rules on the D7 latest-printing oracle, keys each to **our** catalog id (via `match.py`), and
writes rows of `(vehicle, part ref, hook, cost, parent, origin, review, note)`. The importer reads that table (no jar
needed) to emit `<part>` and retire `<builtin>` (D2). **This is a narrow, owner-granted exception to the standing
"no CL6 data in the repo" rule** (`tools/cl6check/CLAUDE.md`, `docs/cl6check.md:7-8`): the committed data is
game-mechanical hook/slot/cost, generated reproducibly by a committed script and flagged by `origin`, not book prose.
Vehicles the matcher cannot pair to a book catalog entry are **not dropped**: they go on an unmatched list and are
flagged needs-review (a new Stage 2 gate; closes the G6 gap).

1. Read `<embed>` into `<part>` (latest printing), with `intoId` → `parent`.
2. Import `geardef` children as catalog entries. Stop hoisting their usage onto the vehicle (R15).
3. Apply the pattern rules P1–P5 and M1–M7 (§4.6). The single ambiguous ref is an override row with a note. Anything
   else unresolved **fails the gate** (it is never shipped blank).
4. `itemhookmod`/`valmod` fold into hook budgets. Retire `<builtin>` where parts exist (D2).
- **Gate:** for every matched vehicle, our (ref, hook, cost, parent) multiset equals CL6's **100%** on the **D7 oracle
  (Stage 0's "latest printing only" map, 996 placements)**. Overrides read **exactly 1** (the Scorpion's
  `meta_adjust_pilot_troll`, D9). Any new override fails the gate until the owner rules on it. Synthesized parts (D3)
  are additive beyond the 996 and are each flagged `origin="synthesized"`/needs-review. CL6 gates are unchanged, or
  moved on purpose with the JSON rulings updated in the same change.

### Stage 2b: synthesis (RULED/owner-approved)

Owner approved building D3 without a separate design review (2026-10-28). The jar shows the only systematically missing
whole-system part is the **powerplant**: Commlink6's powertrain embeds are upgrades (`improved_economy`, `nitro_boost`),
never a base engine, and every other subsystem is a real item. So the generator mints **one** synthesized part per vehicle.

1. **Scope.** Every catalog vehicle or drone of ours that is self-propelled (a Speed or an Acceleration stat above 0) gets
   one part named "<Our Vehicle Name> Powerplant" (the vehicle's own catalog name, e.g. "GMC Bulldog Powerplant"). A vehicle
   with no movement stats (a trailer, a static drone) gets none.
2. **Hook.** `vehicle-powertrain`, as a part-hook value only (like `vehicle-body`). It is **not** added to the importer's
   per-vehicle slot budget, and the part is not counted on the powertrain meter (`modsOf` leaves origin synth out of
   `usedByHook`), so a stock vehicle's imported data and Review are unchanged.
3. **Size** (the owner can tune it): `size = max(0.5, round(Body / 3))` in powertrain slot units, rounded half up. This is a
   **synthesized heuristic of this app**, not a book or Commlink6 figure. It is the room a replacement may take.
4. **Stats.** Price 0 (included in the vehicle, D8). The entry says "Powerplant: Speed X, Acceleration Y" from the vehicle's
   own stats. `origin="synth"`, `review="needs-owner"`. It never claims a Commlink6 source (the table row has no `cl6` key).
5. **Removal.** Removing it frees its size (`freedByHook`). While it is off and no mod is derived into `vehicle-powertrain`,
   Review notes "no powerplant installed — vehicle cannot move under own power". It is reversible; the D5 derive-a-mod path
   installs a replacement (a derived mod on this metered hook takes real powertrain slots).

**Where it lives.** `tools/cl6check/vehicleparts.py` `powerplants()` writes a `part` row (`id="pp"`) per vehicle into
`importer/sr6/classes/vehicle_parts.json` and a `gen: "vehicle-part"` add row for its catalog entry into the vehicle's book
table (`overrides/<book>.json`). The entry id is the vehicle's id tail plus `-powerplant`. The importer keeps a vehicle's
box-text builtins when its only part is the synthesized one.

**Gate.** Synthesized rows are additive: `embedmap --ours` leaves them out of the 996-placement oracle comparison and counts
them on their own line. The oracle still reads 996/996 with overrides exactly 1; completeness and effects parity do not move
(the entries are "extra" rows with no Commlink6 record).

### Stage 3: domain (with fit-plan Stage 3)

- `hookBudgets` counts parts as occupants. `op:'part'` remove/restore replaces `op:'builtin'` (migration
  `builtin:<n>` → part id). Effects and children follow their part. The refund applies per D4.
- **Gate:** invented-data unit tests: removing a part frees exactly its cost; restoring fails when the hook is full;
  children go with their parent. A property test checks that picker, guard and Review agree on parts as on accessories.
  The CL6 stock vehicle shows the same used/max per hook as CL6 on a 20-vehicle sample, both drones and cars.

### Stage 4: UI (with fit-plan Stage 4)

- Designer base vehicle and Ledger Fit list the parts with **Remove** and **Restore**, and a "needs review" badge on
  synthesized ones. The freed space shows in the meter at once. The Designer picker uses the fit engine rather than
  `modKind !== null` (`Designer.tsx:711`). A GM-only **Derive a mod** action (§4.8) picks base gear, hook, cost and
  host types. It saves a draft to custom content and offers it once approved.
- **Gate:** e2e: remove the Hornet injector → the hardpoint meter drops by 0.5 → the GM derives an area jammer as a
  0.5-hardpoint mod and approves it → the player fits it → the price, rating and description match the base jammer →
  after a reimport the mod and its install survive. Accessibility labels exist on the Remove and Restore buttons.

### Stage 5: release and reimport (with fit-plan Stage 6)

- Version bump, CL6 gates, reimport on tower04 (then re-apply GM toggles, because a reimport resets creation.xml).
  Migrate characters' `removedBuiltins`.
- **Gate:** owner live check on the Hornet and one DC vehicle with mounts (Nissan Samurai). Review shows no new fit
  errors on the owner's runners.

Order: 0 → 1 → 2 → 3 → 4 → 5, each riding with its fit-plan twin. Stage 2 depends on the fit plan's hook graph (budgets
must exist before parts can occupy them).

---

## Appendix A: measurement commands

Run from the repo root (Python 3.14). All scripts read only the jar.

```python
import zipfile, xml.etree.ElementTree as ET
z = zipfile.ZipFile(r"C:\Users\johnb\CommLink6\app\stable\commlink6-1.14.0-complete.jar")
R = "de/rpgframework/shadowrun6/data/"
# vehicle records: top-level <item> with a <vehicle> child, type VEHICLES|DRONE_*, books not de_*/placeholder/icons
# per id: union of <modifications>/<embed> (ref, intoRef) across printings; geardef children = inline parts
# placement class: ref in geardef -> inline; ref defined (any <item id>) -> check its <usage slot> against intoRef;
# else undefined
```

Results: 337 ids; 251 with embeds; 86 without; 126 multi-record, of which 63 disagree; 1,739 embed elements; 1,056
distinct placements = 792 usage-match + 128 other-usage + 121 no-usage + 15 undefined; 13 undefined distinct refs;
14 ids with geardef (19 inline parts); `included="true"` on 58 distinct placements.

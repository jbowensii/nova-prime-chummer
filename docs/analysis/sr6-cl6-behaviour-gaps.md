# SR6: Commlink6 behaviour vs ours — every special handler, classified

Date: 2026-10-31. Commlink6 (CL6) 1.14.0, `commlink6-1.14.0-complete.jar`. Read-only audit; no source changed.

**Bottom line.** Our *data* matches CL6 well (cl6effects 1,079/1,079; completeness/accuracy 4,474/4,288 all green), and the
importer already carries almost every CL6 choice marker into the catalog as a `<selection>` part (268 entries carry one,
against 266 non-rating choice owners in CL6 for the books we import). The bugs the owner keeps hitting come from the *app*
side: CL6 has a handler for 26 of its 27 choice types (`ChoiceSelectorDialog.handle*`); we have 6. The other recurring
source is CL6 data we keep but never act on: `<prerequisite>` at character level, `<modifier type="PRICEMOD">`, item
`<flag>`s, `<variant>`s, `SUBSELECT` sub-options with their own price, and 11 `RULE` refs.

## How this was done (reproducible)

* Jar unzipped to `C:\dev\_scratch\cl6audit\jar`. No JDK on the PC, so the classes were read with a small constant-pool
  parser: `C:\Users\johnb\claude\scripts\claude-scripts\cl6audit\classdump.py` (class, enum constants, methods, string
  constants, field/method references) → `C:\dev\_scratch\cl6audit\dump\*.txt` (2,241 classes).
* Handler inventory = every enum that drives behaviour (`ShadowrunReference` 62 values, `SR6ItemAttribute` 59, `ItemHook` 65,
  `SR6ItemFlag` 20, `SR6RuleFlag` 26, `ItemType` 33, `ItemSubType` 186, `AugmentationQuality` 8, `ShadowrunCheckInfluence`
  14, `ApplyTo` 11, `ApplyWhen` 3, `CreatePoints` 10, `PowerLevel` 5, `PriceModifiers` 4, `WizardPageType` 25, …) plus the
  switch tables that consume them (`ChoiceSelectorDialog$45`, `Shadowrun6Tools$2`, `ApplyModificationsGeneric$1`,
  `CalculateEssence$1`, `CommonQualityGenerator$1`), every processing step in `items/` and `proc/`, and every data item id
  hard-coded as a string in code (105, `C:\dev\_scratch\cl6audit\hardcoded.txt`).
* Data census of CL6's own XML (`xmlcensus.py` → `census.json`): every tag, attribute and type-like value with the items
  using it. Item counts below are CL6 data owners (top-level ids), German-only books included unless noted.
* Our side: `C:\dev\nova-prime-chummer\.extract\cl6check-runs30` (latest full import, 2026-10-21) for what the catalog
  carries; `src/sr6/**` for what the app does with it (`kwhits.py` keyword sweep, then reading the hits).

Classification: **SAME** (behaves like CL6), **SIMILAR** (different mechanism, same result for the player), **PARTIAL**
(some cases), **MISSING** (data present or absent, no behaviour), **N/A** (CL6-internal / UI / export only).

## Summary table

Counts are classified rows in the section tables below (a row is one handler, or a group of handlers that behave alike,
e.g. the 7 creation-cost RULE refs we implement are one SAME row).

| # | Category | Rows | SAME | SIMILAR | PARTIAL | MISSING | N/A | CL6 items affected by the gaps |
|---|---|---|---|---|---|---|---|---|
| 1 | Choice / "pick X" types (`<choice type>`) | 29 | 3 | 5 | 3 | 18 | 0 | ~240 (68 typed-list + 33 priced sub-option + 18 gear TEXT + …) |
| 2 | Modification types (valmod/itemmod/checkmod/allowmod/embed/selmod/…) | 30 | 9 | 10 | 6 | 5 | 0 | ~110 (27 PRICEMOD, 80 GEARMOD, 9 selmod, 7 stream allowmods) |
| 3 | Requirements (datareq/valuereq/selreq/anyreq/…) | 22 | 7 | 2 | 3 | 10 | 0 | ~200 (character-level) |
| 4 | Levels, multiples, quality limits | 9 | 4 | 1 | 1 | 3 | 0 | 11 nodouble, 92 SURGE, 2 multi-pick |
| 5 | Hooks, slots, accessories, capacity | 12 | 7 | 3 | 2 | 0 | 0 | 55 enhancements (partial), 1 default accessory |
| 6 | Item flags (`SR6ItemFlag`) | 14 | 2 | 3 | 2 | 6 | 1 | ~10 data items + every armor/gear (user flags) |
| 7 | Variants, alternates, enhancements, packs | 6 | 1 | 1 | 3 | 1 | 0 | 254 variant items (123 must pick), 289 packs |
| 8 | Ammunition and quantity | 6 | 2 | 2 | 2 | 0 | 0 | ~60 ammo/ammo types |
| 9 | Vehicle / drone / design / rigging | 8 | 3 | 3 | 2 | 0 | 0 | autosoft-dependent pools |
| 10 | Cyber / bio / essence / grades | 10 | 3 | 2 | 2 | 3 | 0 | ~5 qualities + exoware |
| 11 | Karma / nuyen / price formulas | 12 | 6 | 3 | 1 | 2 | 0 | 27 PRICEMOD, 8 chemical carriers, 98 alchemical |
| 12 | Metatype, attributes, creation methods | 15 | 8 | 2 | 0 | 5 | 0 | 92 metagenic, 32 shifter, drakes (4 types, 38 powers), 13 animalism |
| 13 | Rule flags (`SR6RuleFlag`) | 16 | 2 | 5 | 0 | 8 | 1 | 11 qualities (one each) |
| 14 | Item-specific hard-coded logic (ids in code) | 30 | 9 | 4 | 2 | 12 | 3 | 1 each |
| | **Total** | **219** | **66** | **46** | **29** | **73** | **5** | |

Unclassified after this pass: 2 (listed at the end).

---

## 1. Choice / "pick X" types

CL6: `ChoiceSelectorDialog` (`chargen.jfx.selector`), dispatch table `ChoiceSelectorDialog$45` over `ShadowrunReference`;
methods `handleSKILL handleSKILLSPECIALIZATION handleATTRIBUTE(+Values) handleITEMATTRIBUTE(+Values)
handleAUGMENTATIONQUALITY handleGeneric handleAMMUNITION_TYPE handleMENTOR_SPIRIT handleSUBSELECT handleTEXT handleGEAR
handleCARRIED handleCONTACT handlePROGRAM handleQUALITY handleSignatureManeuvers handleSPELL_CATEGORY handleSPELL
handleSENSE handleACTION`, plus `processRating`, `processVariants`, `processFlag`, `processModificationChoice`. Choices are
applied by `Shadowrun6Tools.instantiateModification` (a `ref="CHOICE"` modifier takes the decision) and the item's
hard-coded choice UUIDs (`ItemTemplate.getHardcodedChoice`: `c2d17c87-…170d` rating, `b015341d-…` ammo type).

Ours: the marker is in the catalog (`<selection type ref options>`; `src/sr6/catalog/domain/structure.ts:60`), the picker
is `choiceOptions` (`src/sr6/runner-builder/domain/creation/choices.ts:57-121`) used by Qualities, Magic, Ledger, Picker
(`ChoiceNote`, `src/sr6/runner-builder/ui/Picker.tsx:712-738`) and critter Design. It knows 6 types
(`choices.ts:57-64`). An unknown type returns `undefined`: qualities/powers then show a free-text note, **a purchased
item shows nothing at all** (`Picker.tsx:724`).

| CL6 type | CL6 choices / items | In our catalog (selection entries) | Ours | Evidence (ours) | Class |
|---|---|---|---|---|---|
| ITEM_ATTRIBUTE `ref=RATING` | 291 / 286 | n/a | one catalog item per level (owner rule) | `catalog/domain/values.ts` `rated()`; memory "one item per level" | SAME |
| ITEM_ATTRIBUTE (Matrix attr, other) | 8 items | 4 | `matrix` kind; options = A/S/D/F labels | `choices.ts:55,117` | PARTIAL (non-Matrix ITEM_ATTRIBUTE choices, e.g. Shock Shield, Built-in Accessory, Attribute Overclocking, fall into the Matrix labeller) |
| AUGMENTATION_QUALITY | hard-coded on every AUGMENTATION | grade select | grade select per purchase | `creation/grades.ts:10-32`, `Picker.tsx:702` | SAME |
| ATTRIBUTE | 248 / 24 (non-pack/lifemod) | 23 | `attribute` kind, options honoured, EDGE/MAGIC words known | `choices.ts:94-96` | SAME |
| SKILL | 211 / 29 | 28 | `skill` kind, options resolved by id/name | `choices.ts:97-104` | SIMILAR (CL6 also filters by `SkillType`, e.g. Improved Ability (combat) → combat skills only; we offer every skill when no options) |
| SKILLSPECIALIZATION | 5 | 5 | `specialization` kind (Grease Monkey fix 0.37.1) | `choices.ts:105-107` | PARTIAL: `CHOICE_PROMPT` has no `specialization` key (`Picker.tsx:712-718`) so a *purchased* item with it (Soft: Engineering, Portable Facility) labels the select "undefined"; Vehicle Empathy's `ref=piloting` works, Enthralling Performance (no ref) gets an empty list |
| QUALITY | 14 / 5 | 5 | `quality` kind | `choices.ts:108-110` | SIMILAR (CL6 also offers `ref=NEGATIVE/POSITIVE` filtered lists for lifepath events; ours lifepath has its own choice model, `catalog/domain/data.ts:320-335`) |
| SPELL | 2 | 1 | `spell` kind (Innate Spell, Adept Spell) | `choices.ts:111-115` | SIMILAR |
| TEXT | 61 / 60 | 57 | free text box on qualities/powers only | `Qualities.tsx:94` else-branch; `choices.ts:68` | PARTIAL: gear/cyber with TEXT (Datasoft, Mapsoft, Knowsoft, Linguasoft, Formula: Spell/Ritual/Focus, Ghillie Suit environment, Toxin/Pathogen Resistance, Expanded Visual Range, Nanite Pilot — 18 items) get no box at all |
| SUBSELECT (sub-options) | 49 / 42 (160 `<subOption>`, 105 with a cost) | 41 | none. Some books' options were split into separate entries (Claws (Digging/Razor/Retractable)) or carry a karma range (`karmaMax`, `karmaSteps`) | catalog `swc.claws-*`, `crb.allergy-substance-severity karma=2 karmaMax=20`; `sw.superbinder` carries `issue code="ambiguous"` for its two prices | **MISSING** (33 items price by sub-option: Allergy, Phobia, Compulsion, Natural Venom, Shifter, Latent Awakening, Camouflage, Beak, Functional Tail/Wings, Uncontrolled Metastasis, Superbinder, Trade-in Tonic, Infostick, Instant Window/Decorator, Data Tap Projectile, DocWagon contract …; 14 sub-options carry their own modifications, 2 their own requirements) |
| AMMUNITION_TYPE | 44 | 43 | ammo types bought as their own lines (0.25.0 multi-line ammo) | `formats/domain/types.ts:39`, `catalog/domain/data.ts:444` | SIMILAR (price multiplier and AR/DV change of the chosen type are CL6 `ApplyAmmunitionTypeStep`; see §8) |
| GEAR | 21 | 20 | none | — | **MISSING** (Chemical Gland ×4 → which chemical, Gas Grenade/Rocket/Warhead (chem) → which chemical, Sac Leech, Spare Clip → which weapon, autosofts Maneuvering/Stealth/Targeting/Soft: Close Combat → which vehicle/weapon model, Athame, Press Pass, the "AV" vehicle packs) |
| CARRIED | 5 | 4 | none | — | **MISSING** (Weapon Focus → which weapon it is, Item Attunement, Cypher Leech → which device, Dying Cyberware → which implant, Favored Weapon path) |
| SPELL_CATEGORY | 7 | 5 | none | — | **MISSING** (Spellcasting/Counterspelling/Sustaining/Ritual focus, 2 mentor spirits) |
| SPIRIT | 5 | 5 | none | — | **MISSING** (Summoning/Banishing focus, Spirit Affinity/Bane, Metaplanar Contract Lore) |
| ELEMENT | 6 | 6 | none | — | **MISSING** (Elemental Strike/Weapon/Missile, Elemental Mastery, Elemental Resistance, critter Elemental Attack) |
| PROGRAM | 4 | 4 | none | — | **MISSING** (Inherent Program, Program Dependency, Dedicated Program Slot, Emulate) |
| SPRITE | 3 | 3 | none | — | **MISSING** (Sprite Affinity/Bane, Sprite Caller) |
| ACTION | 3 / 2 | 2 | none | — | **MISSING** (Hacker Combo, Myonuclear Permanence) |
| SENSE | 2 | 1 | none | — | **MISSING** (Improved Sense power, Enhanced Senses) |
| MATRIX_ATTRIBUTE | 2 | 2 | none (kind `matrix` is fed only by ITEM_ATTRIBUTE) | `choices.ts:74` regex | **MISSING** (Diffusion/Infusion complex forms) |
| CONTACT | 2 / 1 | 2 | none | — | **MISSING** (Bilko Contacts) |
| SIGNATURE_MANEUVERS | 2 | 2 | none | — | **MISSING** (Signature Maneuver (+Upgrade): pick technique combo) |
| ADEPT_POWER | 1 | 1 | none | — | **MISSING** (Qi Focus → which power) |
| MENTOR_SPIRIT | 1 | 1 | mentor spirit has its own tab field | `formats/domain/character.ts:425` | SIMILAR (CL6 `handleMENTOR_SPIRIT` also picks the magician/adept advantage set: see §13 MENTOR_SPIRIT_BOTH*) |
| DAMAGE_ELEMENT | 1 | 1 | none | — | **MISSING** (Elemental Hardening) |
| PARAGON | 1 | 1 | free text | `choices.ts:68` | **MISSING** (no paragon list) |
| SPRITE_POWER | 1 | 1 | none | — | MISSING (CL6 itself has no handler: no `SPRITE_POWER` entry in `ChoiceSelectorDialog$45` — low priority) |
| Multi-pick (`count=2`, `distr`) | 2 | ? | single value per note | `choices.ts:119` | **MISSING** (pick two/distribute N among options) |

Also: a choice applies to effects only for attribute/skill/matrix targets (`catalog/domain/effects.ts:328`,
`attr:choice`/`skill:choice`); every MISSING type above also means its `ref="CHOICE"` modifiers are never resolved.

## 2. Modification types

CL6 applies modifiers in `proc/ApplyModificationsGeneric` (`applyAttribute applySkill applySkillSpec applyGear
applyLifestyle applyMagicOrResonance applyMetaEcho applyQuality applyCritterPower applyRule applySIN applyLicense
applySpell applyAdeptPower`), collected by `GetModificationsFrom{Gear,Powers,Foci,MentorSpirits,QualityPaths,Techniques,
MagicOrResonance,Collectives}`, `GetModificationsFor{Drakes,Shifters}`, item side `items/GetModificationsStep`,
`ApplyStockModificationsStep`, `ApplyGlobalItemModificationsStep`. Ours: CL6's `<modifier>` rows are kept beside our data
and **never applied** (`tools/cl6check/ours.py:165`); the applied engine is our book-text `<effect>`/`<link>` parts
(2,717 effects), verified against CL6 at 1,079/1,079 (`tools/cl6effects`). So most rows are SIMILAR by construction.

| CL6 modifier (count in data) | Ours | Class |
|---|---|---|
| valmod ATTRIBUTE (802) / attribute names (≈80) | `effect target="attr:*"` | SIMILAR (verified) |
| valmod SKILL (349) + skill ids | `skill:*` | SIMILAR |
| valmod ITEM_ATTRIBUTE (234) | `item:*` effects, formulas | SIMILAR |
| valmod HOOK (401) / itemmod HOOK (763) | `<slot>` parts, `importer/sr6/hooks.py`, `tools/cl6check/hookmap.py` | SAME (slot gate 2,471 rows) |
| valmod GEAR (559) / itemmod GEAR (874) / embed (4,558) | `<gear>`/builtin parts, vehicle decomposition 0.31 (embedmap 996/996) | SIMILAR; gear granted by **packs** MISSING (§7) |
| itemmod GEARMOD (142) | weapon built-in mods (`<builtin>` 37) | PARTIAL (80 items; CL6 builds the mod into the instance) |
| valmod CREATION_POINTS (313: lifemods 159, prio table 15, qualities 4) | lifepath grants, priority table | SIMILAR (`catalog/domain/data.ts:310-340`) |
| valmod METATYPE / MAGIC_RESO (priority rows) | providers | SAME (`creation/providers.ts`) |
| valmod ADEPT_POWER (58, mentor spirits) / itemmod ADEPT_POWER (29) | mentor-spirit adept options | SIMILAR |
| valmod/itemmod QUALITY (22/322) | `link rel=grants` | SIMILAR |
| itemmod CRITTER_POWER (62) / valmod (7) | critter powers on metatypes/drakes | PARTIAL (metatype yes; drake/shifter PCs MISSING, §12) |
| itemmod RULE (33) | rule-markers engine | PARTIAL (8 of 26 refs, §13) |
| valmod PRICEMOD (27) | worded only (`effects.ts:402,420`), never priced; troll/dwarf size pricing by name heuristic | **MISSING** as data (`creation/budgets.ts:140-146` covers only metatype size) — 13 metatypes, 6 qualities (Doesn't Quite Fit …), 7 bioware |
| valmod LICENSE / itemmod SIN / itemmod LIFESTYLE (packs) | — | MISSING (only via packs, §7) |
| checkmod SKILL/ATTRIBUTE/ACTION/SPELL/SKILLSPECIALIZATION (600) | `test:*`, `skill:* spec` effects | SIMILAR (situational, shown) |
| checkmod RESISTANCE / COMPLEX_FORM / ITEM_ATTRIBUTE / SPELL_CATEGORY (9) | words | SIMILAR |
| allowmod CONTACT_TYPES (415) | lifepath `contactTypes` | SAME |
| allowmod SKILL / MAGIC_RESO / ATTRIBUTE (48: e.g. technomancer/aspected skill access, 'neg' bans) | magic kind rules | PARTIAL (`allowmod neg` bans not generic) |
| allowmod SPRITE / COMPLEX_FORM (7) | — | MISSING (Machinists/Sourceror/Technoshaman streams' allowed sprites/forms) |
| selmod (9, uuid-keyed choice-dependent mods) | — | MISSING |
| relevancemod (93) | `<relevance>` parts | SAME (displayed) |
| EdgeModification COST/BONUS | `op=edge`, `edge-cost` | SAME |
| ShadowrunCheckInfluence (14: HIT DICE REDUCE_THRESHOLD EDGE … ADD_WILD NOT_EARN_EDGE) | effect ops `hits`, `wild-die`, `no-edge`, `no-edge-gain`, `edge-cost-set` | SAME (`effects.ts:486-504`) |
| ApplyTo (DATA_ITEM PARENT CHARACTER UNARMED MELEE ACTIVE_GEAR PERSONA DRAKE ANIMAL POINTS RULES) | `affects`, `switch`, `limb-attr` | PARTIAL (DRAKE 30, ANIMAL 18 mods have no carrier — shifter animal form) |
| ApplyWhen CREATION (173) | creation-only effects | SIMILAR |
| valmod `mode` WIRELESS / !SMARTGUN (16) | `switch="wireless"` | SAME |
| valmod `variant` (120) / itemmod `variant` (125) | — | MISSING (§7) |
| valmod `table` / attrdef `table` (47) | `R[a,b,c]` values | SAME |
| itemmod `remove` (91) | `<slot remove="true">`, vehicle part removal | SAME |
| itemmod PoliticalAlignment, CONSTRUCTION (13), DRAIN_ADEPT/DRAIN_MAGE (9), ITEMFLAG (1), METAECHO (5), SPELL (1) | drain attr (`derived:adept-drain-attribute`, shown only); construction worded | PARTIAL / words only |

## 3. Requirements

CL6: `Shadowrun6Tools.isRequirementMet / areRequirementsMet / checkDecisionsAndRequirements`, switch `Shadowrun6Tools$2`;
`ItemUtil` for item hosts; every generator's `canBeSelected` refuses (`Possible.State REQUIREMENTS_NOT_MET`).
Ours: host requirements (`apply="DATA_ITEM"`) tested in `requirementsOf` (`src/sr6/catalog/domain/structure.ts:196-239`,
warning only, owner ruling 5); martial techniques' printed prerequisites (`creation/martial.ts:58-130`); quality
metatype restriction by name/text heuristic (`catalog/domain/data.ts:268` `qualityMetatypes`); book `<incompatible>`
(`review/rules.ts:1900`). **Character-level CL6 requirements are carried as `<prerequisite>` but never tested.**

| CL6 req | Count (ours carried) | Ours | Class |
|---|---|---|---|
| valuereq ITEM_ATTRIBUTE ITEMTYPE/ITEMSUBTYPE/WEAPON_SIZE/AMMUNITION_CLASS/SOFTWARE_TYPES (DATA_ITEM) | 387 (322) | `requirementsOf` | SAME |
| selreq groups / anyreq | 106 / 4 | group semantics | SAME |
| datareq ITEMTYPE/ITEMSUBTYPE (host) | 116 (101) | `requirementsOf` | SAME |
| itemtypereq / itemsubtypereq | 7 | same path | SAME |
| datareq negate | 27 | `negate` | SAME |
| datareq `variant` / valuereq `variant` | 4 | per-variant groups | SAME |
| datareq METATYPE (CHARACTER) | 75 (72) | name heuristic for qualities | PARTIAL (42 items; gear/biosculpt never checked) |
| datareq QUALITY | 69 (63) | — | **MISSING** (59 items: quality paths, Apex Predator, Astral Gate Access …) |
| datareq METAECHO | 22 | — | **MISSING** (19 metamagics needing another, Athame) |
| datareq ADEPT_POWER | 13 (11) | techniques only | PARTIAL (12 items) |
| datareq MAGIC_RESO / magic-kind ids | 20 (16) | — | **MISSING** (10 items: metamagics for adepts only, astral hazing …) |
| datareq TECHNIQUE | 4 | `martial.ts` | SAME |
| datareq GEAR (character owns gear) | 87 (57) | martial augmentation prereq only | PARTIAL (47 items: ammo needing a weapon, softs needing hardware) |
| datareq CARRIED | 15 (14) | — | **MISSING** (11: Bark Skin, Chameleon Processor … "only as carried/implanted") |
| datareq LIFEMOD | 26 | lifepath `requires` | SIMILAR |
| datareq DRAKE_TYPE | 4 | — | MISSING (drake PCs absent) |
| datareq SKILL / SKILLSPECIALIZATION | 4 | — | MISSING |
| datareq COMPLEX_FORM | 2 | — | MISSING |
| datareq VEHICLE_TYPE / CONSTRUCTION | 4 | designer | SIMILAR (`designer/`) |
| valuereq ATTRIBUTE (CHARACTER; STR/BOD/ESSENCE/MAGIC minimums) | 66 (44) | — | **MISSING** (49 items: heavy weapons' Strength minimum, essence-floor qualities) |
| valuereq SKILL | 8 (7) | — | MISSING (Improved Ability needs ranks, Command Presence …) |
| valuereq QUALITY / ADEPT_POWER / GEAR | 4 | — | MISSING |

## 4. Levels, multiples, quality limits

| CL6 | Ours | Class |
|---|---|---|
| quality `max`/`hasLevel`, power `hasLevel`/`max`, metaecho `max` | `perLevel`/`maxLevel` (`catalog/domain/data.ts:236-239,302-304`) | SAME |
| quality/power/spell/metaecho `multi` | `multi` (`data.ts:262`) | SAME |
| quality `nodouble` (11: Favored Weapon path steps, Cyberadept steps, the 3 Streams) | read by cl6check only (`tools/cl6check/reader.py:31`) | **MISSING** (probable meaning: not doubled by the positive-quality multiplier / career factor; confirm with owner) |
| `CommonQualityGenerator`: max 6 qualities, max 20 karma gained, karma check | `qualityMaxCount`, `qualityNetBonusCap` (`table-setup/domain/creation.ts:1034-1035`) | SAME |
| SURGE collective karma, 30-karma SURGE cap (`calculateKarmaSURGE`, `impossible.spentMoreThan30SURGE`) | — | **MISSING** (§12) |
| quality `selectable=false` (20) | `granted`/`uncounted` | SIMILAR |
| item `count`/`units` (507 countable items) | quantity on stacking kinds (`Picker.tsx:708` STACKS) | SAME |
| quality-path steps (`CommonQualityPathController`, `QUALITY_PATH_STEP`) | path shown as `Path: Step n` (`data.ts:250-256`) | PARTIAL (no step order/next-steps gating) |
| choice `count=2` / `distr` | single note | MISSING (§1) |

## 5. Hooks, slots, accessory fitting, capacity

CL6 steps: `AddMissingStandardSlots`, `CalculateAccessorySizes`, `CalculateVehicleSlots`, `CalculateProgramSlots`,
`DeriveCapacityAttributeStep`, `InsertDefaultAccessories`, `ReAddUserItemsInFactoryItems`, `ItemTemplate.validate*`
(`validateVehicleWeaponMountSlots validateModificationSlots validateAutosoftsForVehicles validateFashionSlots`).

| CL6 | Ours | Class |
|---|---|---|
| 65 `ItemHook`s, usages (`usage@slot` 842) | `<slot>`/`<fits>`, `fit()` (`structure.ts:173-188`), `mountSlots` | SAME |
| AddMissingStandardSlots (rule S), vehicle slots (V), fashion (F) | `Slot.rule` S/V/F (`structure.ts:13`) | SAME |
| CalculateAccessorySizes / capacity sums | `hookBudgets` capacity unit (`structure.ts:85-101`) | SAME |
| DeriveCapacityAttributeStep | `capacity` formulas | SAME |
| CalculateProgramSlots / SOFTWARE_TYPES | `softwareTypes` (`structure.ts:215`) | SAME |
| InsertDefaultAccessories (incl. hard-coded `anti_theft`) / embed `included` (609) | vehicle factory parts 0.31; weapon built-ins | SIMILAR (`anti_theft` default MISSING; check weapons) |
| ReAddUserItemsInFactoryItems | remove/restore factory parts | SAME (0.31) |
| itemhookmod (6: capacity of a hook changed) | GM add-slot | SIMILAR |
| validateAutosoftsForVehicles | `vehicle.mods` governs autosofts (0.29.2) | SIMILAR |
| item enhancements (`SR6ItemEnhancement`, 55; `CommonItemEnhancementController`) | `enhancementFits` (`structure.ts:243`) | PARTIAL (fit yes; enhancement modifiers/size `itemenhancement@size`?) |
| UNMODIFYABLE flag (3) | — | PARTIAL (§6) |
| `modonly` (105) | `modOnly` / `fitsOnly` (`structure.ts:61,69`) | SAME |

## 6. Item flags (`SR6ItemFlag`)

Ours reads `<flag>` into `structureOf().flags` (`structure.ts:57`) and **nothing reads it** (no `.flags` use in `src/sr6`).

| Flag (CL6 data count) | CL6 code | Ours | Class |
|---|---|---|---|
| AUGMENTATION (369) | `HandleAugmentationGradeStep`, `isAugmentation` | grades by type/class | SIMILAR |
| MATRIX_DEVICE (56) | `isMatrixDevice`, persona/PAN | Matrix persona from class | SIMILAR |
| CODEMOD (24) | cyberlimb code mods | class CODEMODS | SIMILAR |
| CYBERLIMB (10) | `SpecialRuleStep` (Redliner) | category-based | PARTIAL |
| UNMODIFYABLE (3) | `ItemTemplate.validate` | — | **MISSING** (accessories still offered) |
| NUYEN_COST_KARMA1000 (1) / ESSENCE_COST_KARMA_10 (1) | price/essence paid in karma | — | **MISSING** |
| CUMULATIVE (1) | stacking | — | MISSING |
| CUSTOM_FITTED, CHEAP_KNOCK_OFF (user-selectable: `ItemTemplate.userSelectableFlags`, `AddUpPricesStep`) | price ×, armor | — | **MISSING** (player toggle on armor/gear) |
| USES_CASELESS / NO_CASELESS_AMMO | ammo compatibility | — | MISSING |
| ALCHEMICAL_PREPARATION | `ApplyItemFlagsStep.applyALCHEMICAL_PREPARATION` (potency, Magic, extended) | `Q*price per charge` formula | PARTIAL |
| MELEE_HARDENING_ALTERNATE | `CreateAlternatesStep` | — | MISSING |
| CONVERT_ONE_DIE_TO_WILD | wild die | `op=wild-die` | SAME |
| PRIMARY | primary weapon/armor | sheet picks | SAME |
| IGNORE_FOR_CALCULATIONS, ABSORBED, AUTO_ADDED, CANNOT_OVERCLOCK | internal bookkeeping | — | N/A (CANNOT_OVERCLOCK only with Redliner) |

## 7. Variants, alternates, enhancements, packs

| CL6 | Count | Ours | Class |
|---|---|---|---|
| `<variant>` with own attributes/mods (`SR6PieceOfGearVariant`, `processVariants`, `reqVariant`) | 254 items, 123 must pick | `<variant name>` kept (406), never selectable; some books split into separate entries (`bs.cybertails-*`) | **PARTIAL** — 123 `reqVariant` items cannot record the required variant, and variant-only price/essence/mods are lost |
| embed `variant` (810), valmod/itemmod `variant` (245) | — | vehicle parts honour some | PARTIAL |
| `SR6AlternateUsage` / `CreateAlternatesStep` (weapon/vehicle modes) | 53 items, 84 alternates | `link rel="as"` ("works as") | SIMILAR |
| Item enhancements | 55 | §5 | PARTIAL |
| PACK expansion (`CommonEquipmentGenerator.expandPACK`) incl. SIN/LICENSE/LIFESTYLE grants | 289 PACK items (CL6), 177 `<pack>` ours (SWC) | read-only "Gear packs" in Game data (`formats/domain/types.ts:86,108`) | **MISSING** (cannot buy a starter pack) |
| set (qualityset 11) | 11 | `qualityset` | SAME |

## 8. Ammunition and quantity

| CL6 | Ours | Class |
|---|---|---|
| `AmmunitionType` list + `ApplyAmmunitionTypeStep` (price multiplier, AR/DV change of the chosen type) | ammo types as own lines with own price; effects worded | PARTIAL (AR/DV modifiers shown, not applied to the weapon line; price-multiplier ammo e.g. cannon/rocket ammo by type) |
| `AmmunitionClass` (41 classes) + validateAmmunitionClass | `ammoClass` (`structure.ts:63,213`) | SAME |
| AmmoSlotType (clip, drum, belt …), spare clips | clips as accessories (0.29), spare-mag avail (0.25) | SIMILAR |
| `count`/`units` | qty | SAME |
| `CombatSectionTools` (apds/explosive hard-coded) | sheet | SIMILAR |
| `todo.buyAmmunition` hint | — | PARTIAL (nice-to-have) |

## 9. Vehicle / drone / design / rigging

`vehicle/` (ChassisType, ConsoleType, DesignMod, DesignOption, Powertrain, QualityFactor, DronePool/SR6DronePool,
VehicleOperationMode, VehicleTools, VehicleUnarmedAttack). Ours: Designer (`src/sr6/designer/`,
`runner-builder/domain/assets/design.ts`, `milspec.ts`, `vehiclemods.ts`), decomposition 0.31/0.32.

| CL6 | Ours | Class |
|---|---|---|
| ChassisType/Powertrain/DesignMod/DesignOption/QualityFactor (Double Clutch design) | Designer, DP, Body checks (`Designer.tsx:1042`) | SAME |
| factory parts remove/restore | 0.31 | SAME |
| powertrains per vehicle | 0.32 types | SIMILAR |
| DronePool / operation modes (Driven, RCC, Jumped-in, Autonomous) with VehicleTools hard-coded autosofts (`maneuvering`, `targeting`, `evasion`, `stealth_auto`, `clearsight`, `electronic_warfare`, `soft_close_combat`, `control_rig`, `active_control_rig`, `simsense_overdrive`) | autosoft rules on vehicles | PARTIAL (pools per mode on sheet not computed from these ids; autosoft *model* choice MISSING, §1 GEAR) |
| ConsoleType (rigger consoles) | class RIGGER_CONSOLE | SIMILAR |
| VehicleUnarmedAttack (ramming) | — | PARTIAL (in-play, Foundry side) |
| Construction OPEN/STANDARD/ENCLOSED | worded | SIMILAR |
| vehicle mod slots (chassis/powertrain/electronics) | `vehicle.mods` | SAME |

## 10. Cyber / bio / essence / grades

| CL6 | Ours | Class |
|---|---|---|
| AugmentationQuality (8 grades incl. OMEGA, EXO, GAMMA, USED) | `grades.ts` (standard five + catalog grades) | SAME |
| HandleAugmentationGradeStep incl. hard-coded `bad_luck` (Bad Luck changes grade outcome) | grade prices | PARTIAL (`bad_luck` interaction MISSING) |
| CalculateEssence, essence hole, Transhumanism | `essence.ts`, `transhuman` | SAME |
| CalculateEssence `empathic_retention` | — | **MISSING** |
| `latent_awakening` essence marking (`SR6QualityLeveller`, CalculateEssence) | — | MISSING |
| CANNOT_USE_ESSENCE_HOLE (Permanent Damage) | — | MISSING (§13) |
| CalculateExowareBonus | exoware grade | PARTIAL (bonus from exoware Essence not computed) |
| Cyberlimb capacity/attributes (`limb-attr`) | `effects.ts:414`, `purchases.ts:206` | SAME |
| FixEssenceChanges / recordEssenceChange (career) | career essence | SIMILAR |
| Critterware | `assets/critterware.ts` | SIMILAR |

## 11. Karma / nuyen / price formulas

| CL6 | Ours | Class |
|---|---|---|
| Formula engine (`genericrpg.items.formula`, `$RATING $LEVEL &INITIATION_RANK &SUBMERSION_RANK`), `SR6ResolveFormulasStep` | `importer/sr6/formula.py`, `rated()` (`catalog/domain/values.ts:33`) | SAME (accuracy 4,288/4,288) |
| attrdef `table` per rating | `R[…]` | SAME |
| Karma↔nuyen conversion (`getConversionRateKarma`, `RemainingKarmaNuyenController`) | `budgets.ts:125-127`, `toNuyen` | SAME |
| Availability cap at creation (`impossible.availTooHigh`) | `avail` caps (`catalog/domain/values.ts:183`, career) | SAME |
| AddUpPricesStep (accessory sums, auto-added free, `software_library`, `unarmed`) | `priced()` | SIMILAR |
| PRICEMOD / PriceModifiers (EVERYTHING, CLOTHING, ARMOR, LIFESTYLE_NECESSITIES) | words only; Fashion Influencer rule; metatype size by name | **MISSING** as data-driven (27 modifiers) |
| AddChemicalPriceStep (chemical + carrier price) | — | MISSING (gas grenade + chosen chemical, §1 GEAR) |
| Alchemical preparation price | §6 | PARTIAL |
| Quality karma, `karmaSteps`, positive multiplier | `data.ts:259-264`, settings | SAME |
| Focus bonding karma | `karma.ts:110` | SAME |
| Lifestyle cost, lifestyle qualities (`LifestyleQuality`, `aaa_zone`/`z_zone` hard-coded) | lifestyles | SIMILAR |
| SIN/licence pricing (`SIN.FakeRating`, `CommonSINController`) | licences | SIMILAR |

## 12. Metatype, attributes, creation methods

| CL6 | Ours | Class |
|---|---|---|
| Priority, Sum-to-Ten, Point Buy, Karma, Life Path generators | `Sr6Method` (`formats/domain/character.ts:9`) | SAME |
| Free generator | — (GM edits) | SIMILAR |
| PowerLevel (low/street/standard/prime/elite) | table settings (`table-setup/domain/creation.ts:391-409`) | SAME |
| Metatype/metavariant (SR6MetaType, MetaTypeOption, priority metatype controller) | providers | SAME |
| Attribute pools, derived attributes, initiative, monitors (`CalculateDerivedAttributes`, `CalculateAttributePools`, `CalculateSkillPools`) | `creation/derive.ts` | SAME |
| Native language (`ensureExistanceOfNativeLanguage`) | `actions.ts:994` | SAME |
| Exotic weapons need a specialization (`exotic_weapons`, `skill.error.specNotAvailable`) | `actions.ts:69` | SAME |
| Incompetent quality vs skill (`SR6SkillLeveller` `incompetent`) | `actions.ts:467`, `rules.ts:409` | SAME |
| Infected (WizardPageType INFECTED) | `creation/infected.ts` | SIMILAR |
| Magic/Resonance types incl. aspected, mystic adept | `MAGIC_KINDS` | SAME |
| SURGE / metagenic collectives (WizardPageType SURGE, `GetModificationsFromCollectives`, 92 METAGENIC qualities, 12 categories) | qualities buyable; no SURGE caps/collectives | **MISSING** |
| Shifter PC (`SR6ShifterGenerator`, `GetModificationsForShifters`, 32 SHIFTER qualities) | NPC only (`npc.ts:1252`) | **MISSING** |
| Drake PC (`SR6DrakeController`, `DrakeAttributeController`, `GetModificationsForDrakes`, DRAKE_EDGE, 4 drake types, 38 DRACOGENESIS powers) | NPC only (`npc.ts:1251`), review flags (`rules.ts:553`) | **MISSING** |
| Animalism (`SR6AnimalismController`, 13 ANIMALISM metaechoes) | — | **MISSING** |
| Neuromorphism / Spark (SPARK attribute, `SparkSection`) | — | MISSING (1 item) |

## 13. Rule flags (`SR6RuleFlag`, carried as `<modifier type="RULE">`)

Ours: `src/sr6/runner-builder/domain/creation/rule-markers.ts:12-20` (8 refs) plus scattered handlers.

| Ref (owner) | Ours | Class |
|---|---|---|
| POLYGLOT, KNOWLEDGE_COST2_AT_GEN, CONTACTS_START_LOYAL2, DECREASE_AVAILABILITY_2, MARTIAL_ARTS_PRODIGY, FASHION_50_PERCENT, DECK_5000_PER_KARMA | `rule-markers.ts` | SAME |
| IN_DEBT (In Debt) | `creation/karma.ts:64`, `rules.ts:614` | SAME |
| CHARISMATIC_DEFENSE | `creation/derive.ts:283` (by name) | SIMILAR |
| UNARMED_DAMAGE_IS_PHYSICAL (6) | `derive.ts:98` | SIMILAR |
| PHYSICAL_DAMAGE_IS_STUN (gel, stick-n-shock ammo) | `item:damage-type` effect | SIMILAR |
| PAIN_TOLERANCE_LOWER_MOD / DOUBLE_MOD / IGNORE_BOX | worded; Foundry side (`rule-markers.ts:4-5`) | SIMILAR |
| MENTOR_SPIRIT_BOTH (Beast's/Magician's Way) | table option (`table-setup/domain/creation.ts:522`) | SIMILAR |
| MENTOR_SPIRIT_BOTH_ADVANTAGES | — | MISSING |
| MAX_3_CONTACT_LOYALTY (All Business) | — | **MISSING** |
| ADD_2_TWO_LOWEST_CYBERJACK_ATTRIBUTES (Cyberjack Maximization) | — | MISSING |
| CYBERADEPT_NOVICE / DISCIPLE / MASTER | — | MISSING |
| CANNOT_USE_ESSENCE_HOLE (Permanent Damage) | — | MISSING |
| ESSENCE_REGROWTH | — | MISSING |
| CYBER_SINGULARITY_SEEKER, REDLINER (`SpecialRuleStep`: +WIL / +AGI,STR per cyberlimb) | — | **MISSING** |
| PHYSICAL_ROUND_DOWN (Neoteny) | — | MISSING |
| KARMA_COST_PLUS_1 (ours only; not a CL6 flag) | `rule-markers.ts:15` | n/a |

## 14. Item-specific hard-coded logic (ids referenced in CL6 code)

From `C:\dev\_scratch\cl6audit\hardcoded.txt` (105 string hits; ids of skills/contact types/actions used as plain keys
are excluded here as generic).

| Id (class) | What CL6 does | Ours | Class |
|---|---|---|---|
| `ambidextrous`, `shiva_arms` (CommonQualityGenerator) | quality special-cases (off-hand, extra arms) | Shiva arms in `attributes.ts:31`; ambidextrous none | PARTIAL |
| `bad_luck` (HandleAugmentationGradeStep) | grade interaction | — | MISSING |
| `empathic_retention` (CalculateEssence) | essence/magic loss rule | — | MISSING |
| `latent_awakening` (SR6QualityLeveller, CalculateEssence) | awakening at essence | — | MISSING |
| `in_debt` (CalculateDerivedAttributes) | debt | `karma.ts:64` | SAME |
| `incompetent` (SR6SkillLeveller) | blocks skill | `actions.ts:467` | SAME |
| `mentor_spirit` (GetModificationsFromMentorSpirits) | mentor advantages | mentor spirit | SAME |
| `redliner`, `cyber_singularity_seeker` (SpecialRuleStep) | §13 | — | MISSING |
| `emulate` (SR6EmulatedSoftwareController, Shadowrun6Tools) | complex form runs a chosen program | — | **MISSING** |
| `pain_resistance` (Shadowrun6Tools) | wound boxes | effects words (`importer/sr6/effects/rules.py:598`) | SIMILAR |
| `living_console` (Shadowrun6Tools) | technomancer living persona as console | — | MISSING |
| `smartgun_system` (CommonEquipmentController) | auto-wires smartlink | `assets/weapons.ts:35`, `rules.ts:1645` | SAME |
| `anti_theft` (InsertDefaultAccessories) | default accessory | — | MISSING |
| `melee_hardening`, `close_combat`, `clubs` (CreateAlternatesStep) | alternate melee use | — | MISSING |
| `natural_weapon` (GetModificationsForShifters), `elemental_attack` (GetModificationsForDrakes) | shifter/drake forms | NPC only | MISSING |
| `shifter` quality (CommonMetatypeGenerator, SR6ShifterGenerator) | PC shifter path | — | MISSING |
| `exotic_weapons` (skill generators) | spec required | `actions.ts:69` | SAME |
| `knowledge`, `language` skills | free-text skills | `data.ts:240-244` | SAME |
| `augmentation_acclimation`, `transhumanism` (EssenceSection) | essence UI | `essence.ts` | SAME |
| `neuromorphism` (SparkSection) | Spark | — | MISSING |
| `mundane`, `adept`, `magician`, `mysticadept`, `aspectedmagician`, `technomancer` | magic kinds | `MAGIC_KINDS` | SAME |
| `human` default metatype | default | default | SAME |
| `aaa_zone`, `z_zone`, `low` (lifestyle generator/page) | lifestyle bounds | lifestyles | SIMILAR |
| `signature_maneuver` (list cells) | §1 | — | MISSING |
| `weapon_focus`, `apds`, `explosive`, actions `block dodge full_defense take_aim call_a_shot data_spike …` (CombatSectionTools) | combat sheet | Foundry/print sheets | SIMILAR |
| VehicleTools ids (§9) | drone pools | autosofts | PARTIAL |
| PersonaConfigPane ids (`cyberjack datajack trodes ar_gloves image_link soundlink sim_module_hot control_rig`) | persona UI | Matrix persona 0.30 | SIMILAR |
| `contacts` (LoadCustomSR6DataStep), `trace`, `edit`, `lock` | UI/logging | — | N/A |
| FoundryExportService feature/skill ids | export | `src/sr6/foundry` | N/A |
| `hover` powertrain (SR6CharacterViewLayout) | UI | — | N/A |

---

## Prioritized fix plan (by how often a player hits it in creation)

Ranking basis: how many runners at an ordinary table meet the item in a first build (core rulebook + Street Wyrd + Firing
Squad + Body Shop + Hack & Slash first), times how badly the gap bites (wrong cost > unrecordable choice > missing
check > cosmetic).

### Stage 1 — "Every choice can be made" (one PR; touches `choices.ts`, `Picker.tsx`, `Qualities.tsx`, `Magic.tsx`, tests)
1. Fallback text box for **every** `<selection>` choiceOptions can't list (purchases included), and `CHOICE_PROMPT` for
   every kind (fixes the `specialization` "undefined" label now). Closes the "no way to record it" class for all 27 types
   in one change. ~240 items.
2. Typed lists for the high-traffic types: SPELL_CATEGORY, SPIRIT (traditions' spirit types), ELEMENT/DAMAGE_ELEMENT,
   SPRITE, SENSE, MATRIX_ATTRIBUTE, ADEPT_POWER, MENTOR_SPIRIT/PARAGON, CONTACT (the runner's contacts), PROGRAM (catalog
   programs), ACTION (catalog actions), SIGNATURE_MANEUVERS (martial techniques). Foci are bought by almost every mage.
3. CARRIED and GEAR: pick from the runner's own gear (CARRIED: weapon focus, item attunement) or from a catalog category
   (`ref="CHEMICALS"`, `MELEE`, `WEAPON`, `VEHICLE`).
4. SKILL `ref`/skill-type filter (Improved Ability (combat)); non-Matrix ITEM_ATTRIBUTE choices.
5. Multi-pick (`count`, `distr`) — 2 items, last.
Gate: one test per kind in `tests/sr6/runner-builder/choices.test.ts`; run against the runs30 catalog to assert every
`<selection>` resolves to options or a text box.

### Stage 2 — "Sub-options and variants price correctly" (importer + catalog + builder)
1. SUBSELECT: import CL6 `<subOption>` (id, cost, requires, modifications) as `<option>` parts; picker sets the karma/
   nuyen; retire the `ambiguous` cost issues it explains. 33 priced items (Allergy, Phobia, Natural Venom, Shifter, Latent
   Awakening, Superbinder …), 14 with modifiers.
2. Variants: import per-variant attributes; `reqVariant` items require a pick (123). Where a book already split variants
   into entries, keep the split (owner rule: one item per level/printing) and only add the picker for the rest.
Gate: CL6 replay + accuracy gates (importer change).

### Stage 3 — "Character prerequisites" (review rules, Picker note)
Apply CL6 `apply="CHARACTER"` requirements the same way host requirements are applied (`requirementsOf` sibling):
datareq QUALITY/METAECHO/MAGIC_RESO/ADEPT_POWER/METATYPE/SKILL/COMPLEX_FORM/CARRIED/GEAR, valuereq ATTRIBUTE/SKILL.
Error in Review with the page cited (owner rule: a missing prerequisite is an error), never a refusal. ~200 items.

### Stage 4 — "Rules and price modifiers" (builder)
1. PRICEMOD applied from data (EVERYTHING/CLOTHING/ARMOR/LIFESTYLE_NECESSITIES), replacing the metatype-name heuristic
   when the catalog carries it (27 modifiers).
2. User item flags: Custom Fitted, Cheap Knock-off; UNMODIFYABLE blocks accessories; NUYEN_COST_KARMA1000 /
   ESSENCE_COST_KARMA_10.
3. Missing RULE refs: MAX_3_CONTACT_LOYALTY, CYBERADEPT_*, CANNOT_USE_ESSENCE_HOLE, ESSENCE_REGROWTH, REDLINER,
   CYBER_SINGULARITY_SEEKER, ADD_2_TWO_LOWEST_CYBERJACK_ATTRIBUTES, PHYSICAL_ROUND_DOWN, MENTOR_SPIRIT_BOTH_ADVANTAGES.
4. `nodouble` (after owner confirms meaning); Empathic Retention, Latent Awakening, Bad Luck × grade.

### Stage 5 — "Packs"
Buy a PACK: expand its gear, SIN, licences, lifestyle (SWC 177 packs ours / 289 CL6). Owner decision first: Sum-to-Ten /
Street-level tables use them.

### Stage 6 — "Special creation paths" (each its own PR, owner rulings first)
SURGE collectives and the 30-karma cap (92 metagenic qualities); Shifter PCs (32 qualities, animal form `apply=ANIMAL`);
Drake PCs (drake types, DRAKE_EDGE, dracogenesis); Animalism (13); Emulate; Living Console; Spark/Neuromorphism;
quality-path step gating (Favored Weapon, Cyberadept).

### Stage 7 — "In-play item behaviour" (Foundry / sheets)
Ammo-type AR/DV applied to the loaded weapon and ammo price multipliers; melee-hardening alternates; ammo/caseless
compatibility; drone pools per operation mode from the autosoft ids; exoware bonus; alchemical preparation price by
potency.

## Could not classify (2)

1. `quality@nodouble` — CL6's meaning not visible in strings (no method name or message references it beyond the
   reader). Probable: exempt from cost doubling. Needs a decompiler (install a JDK + CFR into `C:\dev\_scratch`) or an
   owner reading of the books.
2. `selmod` (9, uuid-only `<selmod uuid>`): referenced choice-dependent modification sets; which choice each uuid binds
   to needs the decompiled `ModificationChoice` flow.

Not audited at code-line depth (bytecode has no line numbers without a JDK): CL6 evidence is cited as class + method.
CL6 UI-only classes (`jfx`), export (`org.prelle.shadowrun6.export`, Foundry export), Eden client and random generators
are N/A for creation behaviour and were inventoried only for hard-coded ids.

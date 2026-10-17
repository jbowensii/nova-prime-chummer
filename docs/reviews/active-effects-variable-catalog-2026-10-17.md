# Active-effect variable catalog (Shadowrun 6e)

Research only, 2026-10-17. No code or catalog data was changed. Nothing here matches our items to effects; this is the universe of variables an effect can touch, from the sources below, cross-referenced.

## 0. Bottom line

- **The variable universe is small and closed.** SR6 effects touch a short list of character variables: 10 attributes (+ Edge, Essence), 19 skills, a few dozen derived pools and ratings, 3 initiative tracks, 3 monitors, a handful of movement traits and flags. CommLink6 (CL6) names 74 constants in its `ShadowrunAttribute` enum, 46 of which any record in the jar actually uses. Eden exposes ~100 writable keys. Foundry core adds nothing game-specific.
- **Eden is our export target, and it has no "maximum" and no "natural vs augmented" concept.** 325 of CL6's 522 `valmod ATTRIBUTE` modifiers are attribute *maximums* (`set=MAX`), and Eden has no key for them. This is the largest single block of CL6 effects with nowhere to land.
- **CL6 `checkmod` is mostly not a dice-pool modifier.** Of 493 `checkmod` elements, only 146 are `what=DICE`. The other 347 are Edge mechanics (`EDGE`, `EDGE_ONLY_TEST`, `EDGE_BOOST`, `NOT_SPEND_EDGE`, `NOT_EARN_EDGE`, `EDGE_COST_MALUS`), wild die, hits and threshold. Eden has no key for any of those. Those are the effects behind the ~52% per-effect reproduction ceiling measured earlier.
- **Only one SR6 Foundry system turned up** (`shadowrun6-eden`; a search of the Foundry package list for "shadowrun" returned only it for SR6). So "any SR6 Foundry system" = Eden.

## 1. Sources, versions, method

| Short name | What | Version / ref | How read |
|---|---|---|---|
| **FVTT** | Foundry core ActiveEffect model | v14 (Eden package page lists Foundry 14; local install 14.369) | [API: ActiveEffectChangeData](https://foundryvtt.com/api/interfaces/foundry.documents.types.ActiveEffectChangeData.html); local source via the 2026-10-16 sibling note `eden-inventory.md` §2A (`common/constants.mjs:101-161`, `common/data/active-effect.mjs:13-23`) |
| **EDEN** | Shadowrun 6 Eden Foundry system, our export target ([repo](https://github.com/yjeroen/foundry-shadowrun6-eden), [package](https://foundryvtt.com/packages/shadowrun6-eden)) | 4.0.11 (`system.json`) | Read the local install `C:\Users\johnb\AppData\Local\FoundryVTT\Data\systems\shadowrun6-eden`. I re-checked `ACTIVE_EFFECT_OPTIONS` (`module/config.js:3922-4561`, 104 entries, 38 of them skill `.modifier`/`.points`) and the pool computations (`module/documents/actor.js:1020-1440`) myself. The remaining Eden rows come from the sibling research CSV `eden-active-effects.csv` (211 rows, file:line per key), which agreed with everything I spot-checked |
| **CL6** | CommLink6 1.14.0 (system of record) | `commlink6-1.14.0-complete.jar`, 4,474 English records | New raw tally (`tools/cl6check/reader.py`, script and CSV saved in the shared notes folder: `tally.py`, `cl6_raw.csv`), plus enum constants read from the jar's class files |

Notes on method and limits:

- **"Shadowrun-Eden" is not `C:\dev\chummer-sr6-foundry`.** That repo is our *importer module* (it writes Eden documents). Eden itself is the installed system above. The module's `scripts/lib/translate.js:26-28` shows which Eden keys we write today.
- **Eden mixes legacy and DataModel documents.** Player/NPC/Critter/Spirit/Vehicle actors are legacy `template.json`; only `sprite`/`host` actors and `mod`/`software` items are DataModels. Our runners are Player actors, so only the V1 key paths below apply to them.
- **CL6 counts are raw element counts across the whole jar** (3,556 modification elements; 1,034 distinct `tag/type/ref/set/what/apply` combinations). They differ slightly from `cl6-report.md`'s 3,409, which leaves out pre-installed gear and UI tags. The report's path families (`character/roll`, `item/slot`, …) are a tool abstraction from `tools/cl6check/modifiers.py:path()`; this catalog uses CL6's own raw vocabulary instead and notes the report family beside it.
- CL6's class files also expose its own Foundry exporter (`de/rpgframework/shadowrun6/foundry/*`: `Derived`, `DefenseRating`, `Initiatives`, `Resistances`, `Movement`, `Monitor`, `ActionSkills`, `PrimaryAttributes`). It writes the same Eden shapes (`attack_rating`, `defense_rating`, `composure`, `judge_intentions`, `memory`, `lift_carry`; resist `damage`/`toxin`/`astral_direct`/`astral_indirect`; movement `walk`/`sprint`/`perHit`). It exports qualities as `Modifier{type, ref, value}` lists, not as Active Effects.

## 2. How each source models an effect

| | Foundry core (FVTT) | Eden | CL6 |
|---|---|---|---|
| **Unit** | `changes[] = {key, type, value, phase, priority}`; `key` is a data path | Same, on the V1 `.mod`/`.modifier`/`.diceMod` input fields; recomputed pools read them | Typed element `<valmod|checkmod|allowmod|itemmod|itemhookmod type= ref= value= set= what= apply= cond= when=>` |
| **Operations** | `custom, multiply, add, subtract, downgrade, upgrade, override` (priorities 0, 10, 20, 20, 30, 40, 50) | Uses `add`, `override`, `multiply`, plus `upgrade` for skill points | `valmod` adds; `set=` qualifies it: `MAX`, `MIN`, `NATURAL`, `AUGMENTED`, `ARTIFICIAL`; `checkmod what=` picks DICE / HIT / EDGE family |
| **Scope** | Actor, or item (transfer) | `transfer` true → actor; false → the item, or the item a `mod` sits in. `@actor.`/`@item.` value macros | `apply=` on the modification: `CHARACTER`, `PARENT`, `UNARMED`, `ANIMAL`, `DRAKE`, `PERSONA`, `DATA_ITEM`, `MELEE`, `ACTIVE_GEAR`; `cond=`/`when=` conditions |
| **Cites** | [`ActiveEffectChangeData`](https://foundryvtt.com/api/interfaces/foundry.documents.types.ActiveEffectChangeData.html) | `module/config.js:3922`; `module/documents/actor.js:245-366`, `module/documents/item.mjs:531-621` | `de/rpgframework/genericrpg/modification/*.class`; `tools/cl6check/modifiers.py` |


## 3. The catalog, by domain

Reading the tables:

- **CL6** column: the `ref` of `valmod ATTRIBUTE` unless stated, with the element count across the jar. `(0)` means the name exists in the CL6 enum but no record in the jar uses it.
- **EDEN** column: the Actor AE key (V1 Player/NPC/Critter path). "none" means Eden reads no such input. "adv." means Eden computes with it but omits it from the sheet's key dropdown, so the effect must set `system.advanced = true` to display.
- Qualifier counts for CL6 `set=`: `MAX` 325, none (plain add) 112, `NATURAL` 40, `AUGMENTED` 25, `ARTIFICIAL` 19, `MIN` 1 (all `valmod ATTRIBUTE`).

### 3.1 Primary attributes

| Variable | CL6 ref (count; sets) | EDEN | Notes |
|---|---|---|---|
| Body | `BODY` (52; MAX 48, NATURAL 2, AUGMENTED 1, add 1) | `system.attributes.bod.mod` add (`config.js:3924`; computed `actor.js:1033-1039`, cap +4) | Eden id is the 3-letter abbreviation |
| Agility | `AGILITY` (61; MAX 43, ARTIFICIAL 9, add 6, AUGMENTED 3) | `…agi.mod` (`config.js:3928`) | `ARTIFICIAL` = a cyberlimb's own Agility |
| Reaction | `REACTION` (43; MAX 32, add 9, AUGMENTED 2) | `…rea.mod` (3932) | |
| Strength | `STRENGTH` (66; MAX 49, ARTIFICIAL 9, add 6, AUGMENTED 2) | `…str.mod` (3936) | |
| Willpower | `WILLPOWER` (39; MAX 35, add 2, AUGMENTED 2) | `…wil.mod` (3940) | |
| Logic | `LOGIC` (33; MAX 31, add 2) | `…log.mod` (3944) | |
| Intuition | `INTUITION` (34; MAX 31, add 3) | `…int.mod` (3948) | |
| Charisma | `CHARISMA` (48; MAX 46, add 1, AUGMENTED 1) | `…cha.mod` (3952) | |
| Magic | `MAGIC` (2; add 1, MIN 1) | `…mag.mod` (3956) | `MIN` has no Eden equivalent |
| Resonance | `RESONANCE` (1) | `…res.mod` (3960) | |
| (player's choice) | `CHOICE` (17) | n/a: resolved to one of the above at pick time | Choice is a build-time selection, not a target |
| Attribute pool override | `ARTIFICIAL` qualifier | `system.attributes.<abbr>.pool` override (`actor.js:1042`; Strength and Agility are in the dropdown at `config.js:4400/4404`, the rest adv.) | The only way to set an attribute outright |
| Attribute **maximum** | `set=MAX` (325, 62% of all `valmod ATTRIBUTE`) | **none** | Largest gap. Metatype/augmentation caps |

### 3.2 Edge, Essence, special ranks

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Edge | `EDGE` (6; add 2, MAX 4) | `system.edge.max` add (`config.js:3968`) | Only the *maximum* is writable in Eden |
| Drake Edge | `DRAKE_EDGE` (1) | none | Drake-specific |
| Essence | `ESSENCE` (2, NATURAL); `ESSENCE_HOLE` (5) | `system.attributes.essence.mod` is in the dropdown but **never read** (`actor.js` Essence uses item `system.essence`) | Carry Essence on the item, not as an effect |
| Initiation / Submersion rank | `INITIATION_RANK`, `SUBMERSION_RANK` (0) | `system.mag.initiation`, `system.res.submersion` are plain fields (the module writes them), no AE key | Other ranks in the enum: `TRANSHUMANISM_RANK`, `DRACOGENESIS_RANK`, `NEUROMORPISHM_RANK` (sic), `AUGMENTATION_INDEX` (all 0) |
| Spark | `SPARK` (0) | none | |

### 3.3 Skills

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Skill dice bonus | `checkmod SKILL <id> what=DICE` (65 of 331 `checkmod SKILL`) | `system.skills.<id>.modifier` add (19 keys, `config.js`) | Eden uses `_` in ids (`close_combat`, `exotic_weapons`) |
| Skill rating | `valmod SKILL <id>` (44; set `ARTIFICIAL` for skillsofts/hardwires) | `system.skills.<id>.points` add / override / upgrade | |
| Skill pool override | none | `system.skills.<id>.pool` override (adv., `actor.js:1350`) | |
| Skill specialisation bonus | `checkmod SKILLSPECIALIZATION` (21; DICE 11, EDGE_BOOST 2, EDGE_COST_MALUS 3, EDGE_ONLY_TEST 5) | none (specs are display text) | |
| Skill ids | astral, athletics, biotech, close_combat, con, conjuring, cracking, electronics, enchanting, engineering, exotic_weapons, firearms, influence, outdoors, perception, piloting, sorcery, stealth, tasking | Same 19 (`lang`/`template.json:266-420`) | CL6 and Eden agree exactly. |
| Skill pseudo-targets | `SOCIAL` (4), `ANY` (1), `ITEM` (1), `CHOICE` (11), `knowledge` (1) | none (see §3.12 for test groups) | A group target, not one skill |
| Knowledge / language | `valmod SKILL knowledge` (8) / `language` (6), `LANGUAGE` (2); `itemmod SKILL knowledge` (13) | not AEs: a `skill` item | Grant items |

CL6 `checkmod SKILL` uses by skill: influence 64, con 62 (+3 `CON`), athletics 38, perception 32, stealth 23, firearms 14, outdoors 13, cracking 10, sorcery 8, electronics 7, conjuring 6, engineering 6, piloting 6, enchanting 5, close_combat 4, exotic_weapons 4, astral 3, tasking 3, biotech 2.

### 3.4 Derived dice pools and resistance pools

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Composure | `COMPOSURE` (valmod 1; checkmod DICE 3, EDGE 1) | `system.derived.composure.mod` (`config.js:4199`; `actor.js:1106`) | |
| Judge Intentions | `JUDGE_INTENTIONS` (valmod 1; checkmod EDGE 1) | `system.derived.judge_intentions.mod` (4203) | |
| Memory | `MEMORY` (checkmod DICE 1, EDGE_ONLY_TEST 1) | `system.derived.memory.mod` (4211) | |
| Lift / Carry | `LIFT_CARRY` (0) | `system.derived.lift_carry.mod` (4215) | |
| Matrix Perception | action `matrix_perception` (checkmod ACTION) | `system.derived.matrix_perception.mod` (4219) | Eden treats an action as a derived pool |
| Damage resistance (soak) | `RESIST_DAMAGE` (valmod 6; checkmod EDGE_BOOST, EDGE_ONLY_TEST 2, HIT 2) | `system.defensepool.damage_physical.mod` (4189); also `derived.resist_damage.mod` adv. | |
| Astral damage resistance | `RESIST_DAMAGE_ASTRAL` (checkmod HIT 1) | `system.defensepool.damage_astral.mod` (4191) | |
| Toxin resistance | `RESIST_TOXIN` (valmod 4; checkmod DICE 1, EDGE 3, EDGE_ONLY_TEST 2, REPLACE_WITH_WILD 2) | `system.defensepool.toxin.mod` (4187); `derived.resist_toxin.mod` adv. | `checkmod RESISTANCE TOXIN_POOL/TOXIN_THRESHOLD` (2) |
| Drain resistance | `RESIST_DRAIN` (2) | `system.defensepool.drain.mod` (4193) | `RESIST_DRAIN_ADEPT` (0); also `itemmod DRAIN_ADEPT` (8) sets the adept drain attribute |
| Fading resistance | `RESIST_FADING` (0) | `system.defensepool.fading.mod` (4195) | |
| Matrix damage resistance | `RESIST_DAMAGE_MATRIX`, `…_BIOFEED` (0) | none | |
| Physical defense pool | `DEFENSE_POOL_PHYSICAL` (valmod 2; checkmod DICE 8, EDGE 2) | `system.defensepool.physical.mod` (4179) |  |
| Astral defense pool | `DEFENSE_POOL_ASTRAL` (valmod 1; checkmod DICE 7, EDGE 3) | `system.defensepool.astral.mod` (4181) | |
| Direct combat-spell defense | `DEFENSE_POOL_COMBAT_DIRECT` (valmod 1; checkmod DICE 7, EDGE 2) | `system.defensepool.spells_direct.mod` (4183) | |
| Indirect combat-spell defense | `DEFENSE_POOL_COMBAT_INDIRECT` (valmod 1; checkmod DICE 7, EDGE 4) | `system.defensepool.spells_indirect.mod` (4185) | |
| Matrix defense pool | `DEFENSE_POOL_MATRIX` (valmod 1; checkmod EDGE_ONLY_TEST 1); `FULL_DEFENSE_POOL_MATRIX` (0) | **none** | |
| Other-spell / vehicle defense | none | `system.defensepool.spells_other.mod`, `.vehicle.mod` (adv.) | Eden-only |
| Dice for every test | none (CL6 uses `skill`/`SOCIAL`/`ANY` groups instead) | `system.dicePoolMod` add (`config.js:4082`; actor-wide) | |

### 3.5 Limits

SR6 has no limits, so no source defines a limit variable for it. (Heading kept so section numbers match the cross-references below.)

### 3.6 Attack rating, defense rating, armor, damage reduction

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Physical attack rating | `ATTACK_RATING_PHYSICAL` (3, NATURAL) | `system.attackrating.physical.mod` (4125) | Eden: a sheet value only, never the Unarmed item's AR |
| Astral / Matrix attack rating | `ATTACK_RATING_MATRIX` (2); `ATTACK_RATING_ASTRAL` (0) | `…astral.mod`, `…matrix.mod` (4133, 4141) | |
| Resonance / vehicle / social attack rating | none | `…resonance.mod`, `…vehicle.mod`, `…social.mod` (adv.; social and vehicle are commented out of the dropdown as "not yet implemented", `config.js:4149-4150`; same for social and vehicle defense rating `:4176-4177` and the vehicle defense pool `:4197`) | Eden-only |
| Physical defense rating | `DEFENSE_RATING_PHYSICAL` (23; NATURAL 14, add 7, AUGMENTED 2) | `system.defenserating.physical.mod` (4152) | |
| Astral defense rating | `DEFENSE_RATING_ASTRAL` (4) | `…astral.mod` (4160) | |
| Social defense rating | `DEFENSE_RATING_SOCIAL` (3; NATURAL 1) | `…social.mod` (adv.) | |
| Matrix defense rating | `DEFENSE_RATING_MATRIX` (0) | `…matrix.mod` (4168) | |
| Damage reduction | `DAMAGE_REDUCTION_PHYSICAL` (3) | none | Hardened armor is separate, below |
| Hardened armor | `valmod CRITTER_POWER hardened_armor` (2), `hardened_mystic_armor` (1) | `traits.hardenedArmor` add (`config.js:4098`; adds to physical DR at `actor.js:1266`) | |
| Immunity to normal weapons | `valmod CRITTER_POWER immunity` (1) | `traits.immunityNormalWeapons` override (`config.js:4101`) | |

### 3.7 Condition monitors and damage

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Physical monitor | `PHYSICAL_MONITOR` (17; add 7, AUGMENTED 6, NATURAL 4) | `system.physical.mod` (4105) | |
| Stun monitor | `STUN_MONITOR` (3) | `system.stun.mod` (4113) | |
| Overflow | `DAMAGE_OVERFLOW` (3) | `system.overflow.mod` (4116) | |
| Matrix monitor | `MONITOR_MATRIX` (0) | **none** (comes from device rating, `actor.js:2076/2086`) | |
| Pain tolerance | rules `PAIN_TOLERANCE_LOWER_MOD` (2), `_DOUBLE_MOD` (1), `_IGNORE_BOX` (valmod 2) | `system.painTolerance` override `"high"`/`"low"` (`config.js:4086`) | Eden has two levels only |
| Wounds | none | none | |
| Unarmed damage physical / physical-to-stun | rules `UNARMED_DAMAGE_IS_PHYSICAL` (6), `PHYSICAL_DAMAGE_IS_STUN` (3) | `system.stun` on the Unarmed weapon item only | A rule flag, not a number |

### 3.8 Initiative

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Physical initiative dice | `INITIATIVE_DICE_PHYSICAL` (6) | `system.initiative.physical.diceMod` (4232; dice clamped 1..5) | |
| Physical initiative score | `INITIATIVE_PHYSICAL` (0) | `system.initiative.physical.mod` (4228) | |
| Astral initiative | `INITIATIVE_ASTRAL`, `INITIATIVE_DICE_ASTRAL` (0) | `system.initiative.astral.mod`, `.diceMod` (4234/4238) | |
| Matrix initiative | `INITIATIVE_MATRIX` (1), `…_VR_COLD` (1), `…_VR_HOT` (1); dice: `INITIATIVE_DICE_MATRIX` (3), `…_VR_COLD` (2), `…_VR_HOT` (2) | `system.initiative.matrix.mod`, `.diceMod` (4240/4244) | CL6 splits AR / VR cold / VR hot; Eden keeps one value |
| Minor actions | `MINOR_ACTION_PHYSICAL` (4), `_ASTRAL`, `_MATRIX` (0) | none | |
| Initiative formula parts | n/a | n/a | |

### 3.9 Matrix

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Device Attack / Sleaze / Data Processing / Firewall | `valmod ITEM_ATTRIBUTE ATTACK` (5) / `SLEAZE` (4) / `DATA_PROCESSING` (6) / `FIREWALL` (7); `apply=PERSONA` on 3 of these | Device item `system.a/.s/.d/.f` add / override (item effect, `transfer:false`) | A persona-wide bonus has no Eden actor key |
| Persona attribute maximum | `valmod ITEM_ATTRIBUTE … set=MAX` (8) | none | |
| Device rating | `ITEM_ATTRIBUTE` (rating lives in `DEVICE_RATING`, enum only) | `system.matrix.deviceRating` item | |
| Concurrent programs | `CONCURRENT_PROGRAMS` (4) | possibly `system.progSlots` (unverified) | |
| Noise reduction, matrix defense | `NOISE_REDUCTION` (1), `DEFENSE_MATRIX` (1), `apply=PERSONA` | none | |
| Matrix attack rating | `ATTACK_RATING_MATRIX` (2) | `system.attackrating.matrix.mod` | See §3.6 |

### 3.10 Magic and Resonance

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Power points | `POWER_POINTS` (1) | none | |
| Drain / fading attribute | `itemmod DRAIN_ADEPT` (8), `DRAIN_MAGE` (1) | `tradition.attribute` (field) | A choice of attribute, not a bonus |
| Tradition / magic-resonance type | `allowmod MAGIC_RESO` (16), `itemmod MAGIC_RESO` (5): magician, adept, mysticadept, aspectedmagician, technomancer | no AE | Gates; not variables |
| Sprite / complex form / metaecho | `allowmod SPRITE` (4), `allowmod COMPLEX_FORM` (3), `itemmod METAECHO` (5) | no AE | Grants |

### 3.11 Movement

| Variable | CL6 | EDEN | Notes |
|---|---|---|---|
| Movement (walk/run) | `MOVEMENT` (6, NATURAL) | `traits.movementSprintBase`, `traits.movementSprintMultiplier` add (`config.js:4092/4095`). `traits.movementRate` is **listed but never read** (`module/**`: only `config.js` and the default at `actor.js:213`) | CL6 exporter writes `movement.{walk,sprint,perHit}` |
| Sprint meters per hit | none | `system.perHit` field | |

### 3.12 Tests, actions, edge mechanics (CL6 `checkmod`)

| Concept | CL6 | EDEN | Notes |
|---|---|---|---|
| Dice on a named action | `checkmod ACTION <id> what=DICE` (49 `ACTION`, 16 with DICE): e.g. `data_spike`, `brute_force`, `take_aim`, `matrix_perception`, `matrix_search`, `backdoor_entry`, `spoof_command`, `probe`, `snoop`, `known_exploit`, `register_sprite`, `compile_sprite`, `decompile_sprite`, `trace_icon` | none (except `derived.matrix_perception.mod`) | |
| Dice on a complex form | `checkmod COMPLEX_FORM` (4): `puppeteer`, `resonance_spike`, `static_veil` | none | |
| Edge-boost / Edge cost on an action | `EDGE_BOOST` (48), `EDGE_COST_MALUS` (14) | none | Edge actions: `aimbot`, `attack_run`, `double_down`, `redline`, `the_exit`, `tokyo_drift`, `wrest`, … |
| Edge only on a test | `EDGE_ONLY_TEST` (93) | none | |
| Edge bonus on a test | `EDGE` (91, with `skill`/`attribute`/`action`) | none | |
| Not spend / not earn Edge | `NOT_SPEND_EDGE` (29), `NOT_EARN_EDGE` (15) | none | |
| Wild die | `REPLACE_WITH_WILD` (16), `ADD_WILD` (1) | `system.wild` override true (**item only**, `config.js:4058`) | |
| Hits / threshold | `HIT` (4), `REDUCE_THRESHOLD` (1) | none | |
| Bonus action effects | `valmod ACTION change_device_mode` (2), `ACTION_BONUS reload / change_device_mode` (2) | none | |
| Misc / usage | `OTHER` (10), `USAGE` (7), `EDGE_CHASE` (1), unspecified (17) | none | |
| `apply=CHARACTER` on checkmod | 120 of 493 | | Applies to the whole character rather than the carrying item |

### 3.13 Weapon item variables (item-scoped effects)

| Variable | CL6 `valmod ITEM_ATTRIBUTE` | EDEN item key | Notes |
|---|---|---|---|
| Attack rating, 5 range bands | `ATTACK_RATING` (76; `apply=` none 65, UNARMED 4, DATA_ITEM 3, ANIMAL 2, CHARACTER 2) | `system.attackRating.0..4` add / override | A value like `a,b,c,d,e` |
| Damage value | `DAMAGE` (25; UNARMED 4+3, ANIMAL 2, DATA_ITEM 2, MELEE 1, DRAKE 1) | `system.dmg` add / override | |
| Fire-mode AR / dice | none | `system.modes.SA_ar_mod / BF_ar_mod / FA_ar_mod`, `modes.dicePoolMod` | Eden-only |
| Ammo capacity | `AMMUNITION` (2) | `system.ammocap` add / multiply | |
| Stun flag | rules (§3.7) | `system.stun` override | |
| Concealability | `CONCEALABILITY` (6) | none | |
| Armor-piece defense / social | `DEFENSE_SOCIAL` (3), `ARMOR` (2) | `system.defense`, `system.social` (armor item fields, `config.js:4068/4074`) | |
| Availability, price, build points, size, blast range, cargo | `AVAILABILITY` (3), `PRICE` (3), `BUILD_POINTS` (5), `SIZE` (3), `BLAST_RANGE` (1), `CARGO` (1), `ESSENCECOST` (2), `DAMAGE_REDUCTION` (2), `SOFTWARE_TYPES` (2), `DICEPOOL` (1), `MAX_SENSOR_RATING` (1) | none | Not game-play variables |

### 3.14 Vehicle and drone item variables

| Variable | CL6 `valmod ITEM_ATTRIBUTE` | EDEN item key |
|---|---|---|
| Handling (on / off road) | `HANDLING` (7) | `system.handlOn`, `.handlOff` |
| Acceleration | `ACCELERATION` (15) | `system.accOn`, `.accOff` |
| Speed interval | `SPEED_INTERVAL` (12) | `system.spdiOn`, `.spdiOff` |
| Top speed | `TOPSPEED` (6) | `system.tspd` |
| Body / Armor / Pilot / Sensors / Seats | `BODY` (3), `ARMOR` (2), `PILOT` (1), `SENSORS` (1), `SEATS` (4) | `system.bod, .arm, .pil, .sen, .sea` |
| Hook slot capacities | `itemmod HOOK` (519) / `valmod HOOK` (333) / `itemhookmod` (6) | no AE (structure) |

### 3.15 Rules, flags, statuses, senses

| Concept | CL6 | EDEN | Notes |
|---|---|---|---|
| Rule flags | `SR6RuleFlag` has 26 values; 25 appear in the jar as `itemmod RULE`/`valmod RULE` (only `MENTOR_SPIRIT_BOTH_ADVANTAGES` does not): IN_DEBT, UNARMED_DAMAGE_IS_PHYSICAL (6), PHYSICAL_DAMAGE_IS_STUN (3), PAIN_TOLERANCE_* (5), DECREASE_AVAILABILITY_2, MENTOR_SPIRIT_BOTH (2), CHARISMATIC_DEFENSE, ADD_2_TWO_LOWEST_CYBERJACK_ATTRIBUTES, MARTIAL_ARTS_PRODIGY, POLYGLOT, MAX_3_CONTACT_LOYALTY, DECK_5000_PER_KARMA, KNOWLEDGE_COST2_AT_GEN, FASHION_50_PERCENT, PHYSICAL_ROUND_DOWN, CYBERADEPT_NOVICE/DISCIPLE/MASTER, CANNOT_USE_ESSENCE_HOLE, ESSENCE_REGROWTH, CYBER_SINGULARITY_SEEKER, REDLINER, CONTACTS_START_LOYAL2 | `painTolerance`, `badLuck` only | Almost all are chargen/price rules, not live variables |
| Bad luck | quality `bad_luck` (a record, not a modifier path) | `system.badLuck` override true (`config.js:4085`); `traits.badLuck` is the *runtime* copy | The key to use is `system.badLuck` |
| Vision senses | qualities `low-light-vision` (17), `thermographic-vision` (15), `underwater-vision` (7) | v14 core `token.sight.visionMode` (`token.*` keys; `actor.js:341-344`) | |
| Statuses | none | 44 status ids (`statuses`: blind, dead, prone, burning, …); markers, no changes | Not variables |
| Control rig | none found in modifier paths | `system.controlRig` override / upgrade (adv.) | |
| Recoil | none | none | |

### 3.16 CL6-only effect kinds that are not game-play variables

These show up in CL6 modifications but are *not* things an Active Effect can modify; they grant, forbid, or price. Listed so they do not get lost.

| CL6 tag / type | Count | What it does |
|---|---:|---|
| `itemmod QUALITY` | 285 | grants a quality |
| `itemmod GEAR` / `GEARMOD` | 472 / 79 | includes a gear item or mod |
| `itemmod HOOK` + `valmod HOOK` + `itemhookmod` | 519 + 333 + 6 | slot structure |
| `itemmod CRITTER_POWER` | 53 | grants a critter power |
| `itemmod SKILL` | 13 | grants knowledge/language skills |
| `itemmod LIFESTYLE` / `CONSTRUCTION` / `SIN` | 12 / 11 / 7 | lifestyle tier, construction, SIN |
| `itemmod METAECHO` / `ADEPT_POWER` / `ITEMFLAG` | 5 / 1 / 1 | grants |
| `allowmod` (ATTRIBUTE, SKILL, MAGIC_RESO, CONTACT_TYPES, SPRITE, COMPLEX_FORM) | 63 | permits or denies (17 are `neg`) |
| `valmod PRICEMOD` | 24 | price modifier (ARMOR, EVERYTHING, LIFESTYLE_NECESSITIES) |
| `valmod CREATION_POINTS` | 13 | chargen resources (NUYEN, CONTACT_POINTS, MAXED_OUT_*, ADJUST_DRAKE) |
| `valmod QUALITY` | 16 | per-quality values (`built_tough` 8, `dependents` 3, `shiva_arms` 3, …) |
| `valmod LICENSE` / `CONTACT_TYPES` | 6 / 1 | licence rating by SIN grade, contact types |
| `valmod ATTRIBUTE MONTHLY_COST` | 4 | lifestyle cost |

## 4. Where each variable exists

Counts of the §3 rows (not of distinct keys). Only CL6 and Eden are compared.

- **In both CL6 and Eden:** the 10 primary attributes, Edge (max only), physical/stun monitors and overflow, Composure/Judge Intentions/Memory/Lift, damage/drain/fading/toxin resistance, the 19 skills, the four SR6 defense pools, attack and defense rating, initiative (physical/astral/matrix), hardened armor, movement (partly), pain tolerance, the SR6 vehicle stat set (`handlOn/Off`…), weapon AR bands.
- **Eden only:** `dicePoolMod`, `modes.*_ar_mod`, `defensepool.spells_other`/`.vehicle`, `attackrating.resonance|vehicle|social`, `traits.movementSprintBase|Multiplier`, `system.perHit`, attribute `.pool` override, skill `.pool` override, `token.*`, 44 statuses.
- **CL6 only:** attribute `MAX`/`MIN`, the `NATURAL`/`AUGMENTED`/`ARTIFICIAL` qualifiers, the Edge-mechanics family (`EDGE`, `EDGE_ONLY_TEST`, `EDGE_BOOST`, `NOT_*_EDGE`, `EDGE_COST_MALUS`, `EDGE_CHASE`), `REDUCE_THRESHOLD`, `SKILLSPECIALIZATION`, matrix cold/hot VR splits, `DAMAGE_REDUCTION_PHYSICAL`, `MINOR_ACTION_*`, `POWER_POINTS`, `MONTHLY_COST`, `DRAKE_EDGE`, `ESSENCE_HOLE`, rule flags, all of §3.16.

## 5. Gaps and open questions

### 5.1 CL6 paths with no Eden equivalent (biggest first)

1. **Attribute maximum (`set=MAX`, 325 modifiers).** No key, and Eden has no max concept. Decision for the owner: carry these as an *engine-only* value (our app enforces the cap), not as exported effects?
2. **Edge-mechanics `checkmod` (about 290 across `EDGE`, `EDGE_ONLY_TEST`, `EDGE_BOOST`, `NOT_SPEND_EDGE`, `NOT_EARN_EDGE`, `EDGE_COST_MALUS`, `EDGE_CHASE`).** No Eden key; Eden's only Edge input is `system.edge.max`. Text on the item is the only option.
3. **Wild die on the actor (`REPLACE_WITH_WILD` 16, `ADD_WILD` 1).** `system.wild` exists only on weapon items.
4. **Skill specialisation bonuses (21).** No key; Eden specs are text.
5. **Action- and complex-form-specific dice (≈25).** No key except `derived.matrix_perception`.
6. **Natural vs augmented vs artificial (84 `valmod ATTRIBUTE`).** Eden's single `.mod` field is capped at +4 total, so `NATURAL` and `ARTIFICIAL` cannot be told apart from `AUGMENTED` and the cap may wrongly trim stacked bonuses. Only `ARTIFICIAL` for Strength/Agility has a path (`.pool` override).
7. **Matrix cold/hot VR initiative (10 elements).** Eden has one matrix initiative.
8. **Smaller ones:** `DEFENSE_POOL_MATRIX`, `DAMAGE_REDUCTION_PHYSICAL`, `MOVEMENT` base rate (`traits.movementRate` is dead), `MINOR_ACTION_PHYSICAL`, `POWER_POINTS`, `ESSENCE`/`ESSENCE_HOLE` (the Eden key is not read), `MAGIC MIN`, `DRAKE_EDGE`, `MONTHLY_COST`, device `MAX` rows (8), item `CONCEALABILITY`, matrix persona-wide bonuses (`apply=PERSONA`), `RESIST_DAMAGE_MATRIX*`.

### 5.2 Eden variables with no CL6 modifier (CL6 jar never writes them)

Eden-only: `dicePoolMod`, fire-mode keys, `spells_other` and `vehicle` defense pools, resonance/vehicle/social attack rating, `traits.movementSprint*`, statuses, `token.*`.

### 5.3 Open questions

1. **Which Eden version do we target?** Local 4.0.11 stores changes in the v14 `system.changes[]` shape; v13 uses a numeric `mode`. Eden accepts both and migrates. The owner's parked note says a Foundry `set` effect is written as `add` on Foundry 14, which is still unresolved.
2. **`system.advanced`.** Every key not in `ACTIVE_EFFECT_OPTIONS` (about 50 of the ~100) needs `system.advanced = true` to show in Eden's sheet. Is it acceptable for exported effects to be sheet-invisible dropdowns, or should we restrict to the 104 listed keys?
3. **Per-rating bonuses.** Eden supports `@item.system.rating` in change values, so one effect can cover every rating. We have "one catalog item per level" as a project rule, so each level can instead carry a literal number. Which wins for export?
4. **`transfer` semantics.** Item effects with `transfer:true` land on the actor; `false` applies to the item (or, for an installed mod, its host). Several CL6 modifications are `apply=PARENT` (5) or `apply=CHARACTER` (367). Do we map `CHARACTER`→`transfer:true` and `PARENT`→`transfer:false` on the mod?
5. **Unverified Eden rows.** The Eden pool code (`actor.js:1020-1440`) and the option list (`config.js:3922-4561`) I re-read myself. The item-level keys (§3.13/3.14) and the `data-model` actor keys (sprite/host) I took from the sibling CSV and did not re-trace in `item.mjs`. `CONCURRENT_PROGRAMS → system.progSlots` is a guess in the sibling note and is marked unverified here.
6. **No second SR6 system.** I found none via the Foundry package list ([search](https://foundryvtt.com/packages/systems?search=shadowrun)). CL6 ships its own Eden-shaped exporter, so the CL6 exporter's `Derived`/`DefenseRating`/`Initiatives`/`Resistances` shapes are exactly the same families as §3.4-3.8.

## 6. Source index

- Foundry core: [ActiveEffectChangeData](https://foundryvtt.com/api/interfaces/foundry.documents.types.ActiveEffectChangeData.html); local core 14.369 `common/constants.mjs:101-161`, `common/data/active-effect.mjs:13-23`, `common/documents/active-effect.mjs:135-183`, `client/documents/active-effect.mjs:527-560` (read by the sibling session, notes at `…\side-session-notes\local_3f94aea9-…\eden-inventory.md` §2A).
- Eden 4.0.11 (local install, [GitHub](https://github.com/yjeroen/foundry-shadowrun6-eden), [package](https://foundryvtt.com/packages/shadowrun6-eden)): `module/config.js:3922-4561`, `:4575`, `:4598-4599`; `module/documents/actor.js:97-366`, `:1020-1440`, `:1606-1607`; `module/documents/item.mjs:531-621`; `module/datamodels/active-effect-data.mjs`; `template.json`; sibling CSV `eden-active-effects.csv`.
- CL6 1.14.0 jar: class constants of `de/rpgframework/shadowrun/ShadowrunAttribute.class` (74 all-caps constants after dropping language codes; the last few, `PERCEPTION` and `DEFENSE_*`, may not be attributes), `de/rpgframework/shadowrun6/items/SR6ItemAttribute.class`, `de/rpgframework/shadowrun6/SR6RuleFlag.class`, `de/rpgframework/shadowrun6/foundry/*.class`; `tools/cl6check/modifiers.py:19-90`; `.extract/cl6check14/cl6-report.md` "Modifier patterns" (path vocabulary); raw tally `cl6_raw.csv` and `tally.py` in the shared notes folder.

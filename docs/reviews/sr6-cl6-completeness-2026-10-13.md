# SR6 import completeness vs CommLink6 — 2026-10-13

Source: `.extract/cl6check/cl6-diffs.csv` (rows `missing` and `extra`) of the 2026-10-12T21:07:55 run; read only, nothing re-run. Book titles come from `public/data/sr6/sources.xml`. Analysis only.

## Summary

- Report headline (`cl6-report.md`): completeness **4,226 / 4,410 = 95.83%** of all English records; 96.68% (4,217 / 4,362) of owned pages.
- **LIST 1, CommLink6 has / we don't:** 250 `missing` rows. **133 look like genuine gaps; 117 are artifacts** not worth chasing.
- **LIST 2, we have / CommLink6 doesn't:** 1092 `extra` rows.
- Reconciliation: the report counts 4,410 − 4,226 = 184 unmatched records, and separately leaves 69 CommLink6-only records ("no book prints as an item") out of both numerator and denominator. 184 + 69 = 253 vs 250 `missing` rows here; the CSV does not flag which rows are the 69, so the exact split is an estimate (a few duplicate-name rows, e.g. the two "Speciality Tires", may explain the small difference). The report also excludes 43 "no page in this book" and 5 "page beyond the owned PDF" from the owned denominator; this file finds 38 and 5 rows with those causes, matching exactly.
- Caveat: "extra" rows are not proof of error. Many are our own finer splits (mods, packs, sub-entries) that CommLink6 models differently or not at all.

## How the `missing` rows split

| class | rows |
|---|---:|
| genuine gap | 133 |
| artifact: we already have it under another name or kind | 22 |
| artifact: CommLink6 gives no page in this book (another book's entry) | 38 |
| artifact: running-text pseudo-records (table-cell / range / rate-of-fire / rating fragments) | 47 |
| artifact: CommLink6 placeholder ("Depreciated") entries | 5 |
| artifact: page beyond the owned PDF | 5 |
| **total** | **250** |

Rules used (all from the CSV `why` / `name_cl6` columns):
- **No-page**: `why` = "Commlink6 gives no page in this book (another book's entry)" — CommLink6 files the item under this book id but gives no page here; it belongs to another book.
- **Pseudo-record**: name is a table-cell fragment — `SS(1-2)`/`SA(2)`/`BF(4)`/`FA(10)` rate-of-fire cells, `Pilot 3`/`Sensor 5` ratings, bare `3`, `N km` ranges, `Uses N Energy per shot`, `Crew Served (n)`, `Adapter (see drones…)`, `Spare clip for…`.
- **Placeholder**: `why` = "Commlink6 placeholder entry" (names beginning "Depreciated").
- **Beyond owned PDF**: the five Hack & Slash sprites on p. 193 (page past the PDF we own).
- **Other name/kind**: not a `why` value. I cross-checked every other `missing` name against the `extra` rows of the same book and kept only matches that look right by eye (typos, long/short forms, same item filed in another kind). Our matching name is shown; confirm before relying on any one of them.

## LIST 1 — CommLink6 has, we don't

### All missing rows: counts per book

| book | rows |
|---|---:|
| Krime Katalog | 7 |
| Shadowrun, Sixth World Core Rulebook | 40 |
| Shadowrun: Bestial Nature | 4 |
| Shadowrun: Body Shop | 7 |
| Shadowrun: Deadly Arts | 64 |
| Shadowrun: Dealers of Death | 3 |
| Shadowrun: Double Clutch | 45 |
| Shadowrun: Firing Squad | 17 |
| Shadowrun: Hack & Slash | 13 |
| Shadowrun: Lofwyr's Legions | 3 |
| Shadowrun: No Future | 6 |
| Shadowrun: Power Plays | 1 |
| Shadowrun: Shadow Cast | 1 |
| Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go | 5 |
| Shadowrun: Sixth World Companion | 16 |
| Shadowrun: Smooth Operations | 3 |
| Shadowrun: Street Wyrd | 4 |
| Shadowrun: Tarnished Star | 9 |
| Shadowrun: The Kechibi Code | 2 |

### All missing rows: counts per kind

| kind | rows |
|---|---:|
| gear | 89 |
| vehicles | 34 |
| weapons | 30 |
| packs | 13 |
| armor | 11 |
| electronics | 11 |
| augmentations | 10 |
| ammotypes | 7 |
| actions | 5 |
| sprites | 5 |
| echoes | 4 |
| npcs | 4 |
| ruleoptions | 4 |
| metatypes | 4 |
| programs | 3 |
| lifestyles | 2 |
| skills | 2 |
| metamagics | 2 |
| lifemodules | 2 |
| qualities | 2 |
| spells | 2 |
| traditions | 2 |
| adeptpowers | 1 |
| qualitypaths | 1 |

### Genuine gaps only: counts per book (133)

| book | rows |
|---|---:|
| Krime Katalog | 4 |
| Shadowrun, Sixth World Core Rulebook | 27 |
| Shadowrun: Bestial Nature | 4 |
| Shadowrun: Body Shop | 4 |
| Shadowrun: Deadly Arts | 15 |
| Shadowrun: Dealers of Death | 3 |
| Shadowrun: Double Clutch | 16 |
| Shadowrun: Firing Squad | 10 |
| Shadowrun: Hack & Slash | 7 |
| Shadowrun: Lofwyr's Legions | 3 |
| Shadowrun: No Future | 6 |
| Shadowrun: Shadow Cast | 1 |
| Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go | 5 |
| Shadowrun: Sixth World Companion | 11 |
| Shadowrun: Smooth Operations | 3 |
| Shadowrun: Street Wyrd | 3 |
| Shadowrun: Tarnished Star | 9 |
| Shadowrun: The Kechibi Code | 2 |

### 1A. Genuine gaps

Each line: CommLink6 name — page (`page_cl6`) — `why` — CommLink6 id.

#### Krime Katalog

**ammotypes** (1)

- Krime Shotgun Penetrator — p. 24 — name not in our converted text (renamed, other printing, or a converter loss) — `krime_penetrator`

**gear** (1)

- Krime Spare Drum — p. 23 — name not in our converted text (renamed, other printing, or a converter loss) — `krime_drum`

**weapons** (2)

- Grenade, Party — p. 26 — name not in our converted text (renamed, other printing, or a converter loss) — `krime_party`
- Krime AKM-97 — p. 9 — name only in running text — `krime_akm_97`

#### Shadowrun, Sixth World Core Rulebook

**actions** (4)

- Compile Sprite — p. 191 — printed under a shorter or regrouped name (group/maker prefix, variant) — `compile_sprite`
- Decompile Sprite — p. 192 — printed under a shorter or regrouped name (group/maker prefix, variant) — `decompile_sprite`
- Register Sprite — p. 191 — name only in running text — `register_sprite`
- Toggle Silent Running — p. 178 — name not in our converted text (renamed, other printing, or a converter loss) — `running_silent`

**adeptpowers** (1)

- Improved Combat Ability — p. 157 — name not in our converted text (renamed, other printing, or a converter loss) — `improved_ability_combat`

**ammotypes** (1)

- Ammo Regular — p. 262 — printed under a shorter or regrouped name (group/maker prefix, variant) — `regular`

**augmentations** (1)

- Implanted Submachine Gun — p. 290 — printed under a shorter or regrouped name (group/maker prefix, variant) — `cyber_smg`

**echoes** (4)

- Attack Upgrade — p. 195 — name not in our converted text (renamed, other printing, or a converter loss) — `attack_upgrade`
- Data Processing Upgrade — p. 195 — name not in our converted text (renamed, other printing, or a converter loss) — `data_processing_upgrade`
- Firewall Upgrade — p. 195 — name not in our converted text (renamed, other printing, or a converter loss) — `firewall_upgrade`
- Sleaze Upgrade — p. 195 — name not in our converted text (renamed, other printing, or a converter loss) — `sleaze_upgrade`

**electronics** (1)

- Matrix Signal Scanner — p. 18 — name not in our converted text (renamed, other printing, or a converter loss) — `matrix_signal_scanner`

**gear** (7)

- Ares Light Fire Series Silencer — p. 260 — name not in our converted text (renamed, other printing, or a converter loss) — `ares_lf_silencer`
- Armor increase — p. 288 — name only in running text — `armor_increase`
- FN P93 Praetor Flashlight — p. 254 — name not in our converted text (renamed, other printing, or a converter loss) — `fn_p93_flashlight`
- First Aid kit — p. 282 — name only in running text — `first_aid_kit`
- Folding Stock — p. 254 — name only in running text — `folding_stock`
- Ritual formula — p. 294 — printed under a shorter or regrouped name (group/maker prefix, variant) — `formula_ritual`
- Variable ammunition system — p. 253 — name only in running text — `variable_ammo`

**lifestyles** (2)

- AAA zone — p. 57 — name not in our converted text (renamed, other printing, or a converter loss) — `aaa_zone`
- Z zone — p. 57 — name only in running text — `z_zone`

**skills** (2)

- Knowledge — p. 98 — bold run-in name in prose (no heading or table) — `knowledge`
- Language — p. 99 — bold run-in name in prose (no heading or table) — `language`

**vehicles** (1)

- Shiawase Inu w/better suit — p. 299 — name not in our converted text (renamed, other printing, or a converter loss) — `shiawase_inu_better_suit`

**weapons** (3)

- Crossbow for Quadrotor — p. 300 — name not in our converted text (renamed, other printing, or a converter loss) — `cyberspace_designs_quadrotor_crossbow`
- Detonator Cap — p. 264 — regroup block exists, not catalogued (kind classifier) — `detonator_cap`
- Nissan Spurs — p. 300 — printed under a shorter or regrouped name (group/maker prefix, variant) — `spurs_samurai_oni`

#### Shadowrun: Bestial Nature

**ammotypes** (3)

- Ammo, Copper — p. 36 — name not in our converted text (renamed, other printing, or a converter loss) — `metal_bullets_copper`
- Ammo, Gold — p. 36 — name not in our converted text (renamed, other printing, or a converter loss) — `metal_bullets_gold`
- Ammo, Silver — p. 36 — name not in our converted text (renamed, other printing, or a converter loss) — `metal_bullets_silver`

**gear** (1)

- Shielded data cable for buoy (100m) — p. 36 — name not in our converted text (renamed, other printing, or a converter loss) — `buoy_cable`

#### Shadowrun: Body Shop

**actions** (1)

- Puppet Cyberware — p. 30 — heading with no block (regroup unit rules) — `puppet_cyberware`

**augmentations** (2)

- Transgenic hearing expansion — p. 102 — printed under a shorter or regrouped name (group/maker prefix, variant) — `transgen_hearing_expansion`
- Transgenic rhino skin — p. 102 — name not in our converted text (renamed, other printing, or a converter loss) — `transgen_rhino_skin`

**weapons** (1)

- Fuel for Flametosser (5x) — p. 50 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_flametosser`

#### Shadowrun: Deadly Arts

**ammotypes** (1)

- Railguns & Linear Kinetic Cannons — p. 61 — name not in our converted text (renamed, other printing, or a converter loss) — `railgun`

**augmentations** (2)

- Extreme Cyberweapon — p. 44 — name only in running text — `xcw_starting`
- Hardened — p. 44 — name only in running text — `xcw_hardened`

**electronics** (1)

- M-TOC Fob — p. 68 — heading with no block (regroup unit rules) — `mtoc_fob`

**gear** (8)

- AR Interface — p. 58 — name only in running text — `ar_interface`
- Airframe Ceramic Plate — p. 150 — regroup block exists, not catalogued (kind classifier) — `ceramic_plate_airframe`
- Heavy Mil-Spec Plate — p. 150 — regroup block exists, not catalogued (kind classifier) — `milspec_plate_heavy`
- Mil-Spec Frame — p. 150 — name only in running text — `milspec_frame`
- Mil-Spec Hardpoint — p. 150 — regroup block exists, not catalogued (kind classifier) — `milspec_hardpoint`
- Mil-Spec Weapon Mount — p. 151 — name only in running text — `weapon_mount_military`
- Missle Control Wire (1500m) — p. 58 — name not in our converted text (renamed, other printing, or a converter loss) — `control_wire_1500`
- Missle Control Wire (5000m) — p. 58 — name not in our converted text (renamed, other printing, or a converter loss) — `control_wire_5000`

**weapons** (3)

- Cougar Polearm (Large) — p. 47 — name not in our converted text (renamed, other printing, or a converter loss) — `cougar_polearm_large`
- Cougar Polearm (Small) — p. 47 — name not in our converted text (renamed, other printing, or a converter loss) — `cougar_polearm_small`
- Fuel for Inferno (10x) — p. 55 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_inferno`

#### Shadowrun: Dealers of Death

**weapons** (3)

- H&K Urban Stinger Druckluftkartusche (50x) — p. - — name not in our converted text (renamed, other printing, or a converter loss) — `hk_urban_stinger_air`
- H&K Urban Stinger Pfeile (10x) — p. - — name not in our converted text (renamed, other printing, or a converter loss) — `hk_urban_stinger_bolts`
- Makarov V22.2 Kalte Munition (10x) — p. - — name not in our converted text (renamed, other printing, or a converter loss) — `makarov22_ammo`

#### Shadowrun: Double Clutch

**augmentations** (1)

- Rigger Command Console — p. 145 — name not in our converted text (renamed, other printing, or a converter loss) — `rcc_headware`

**gear** (11)

- Armor (Ceramic) — p. 133 — name not in our converted text (renamed, other printing, or a converter loss) — `armor_ceramic`
- Portable Facility - Installation Cost — p. 129 — name not in our converted text (renamed, other printing, or a converter loss) — `portable_facility_install`
- Push Bar — p. 28 — name only in running text — `push_bar`
- Reduce Seating — p. 126 — name only in running text — `reduce_seating`
- Road Strip — p. 121 — name only in running text — `road_strip`
- Speciality Tires — p. 121 — name not in our converted text (renamed, other printing, or a converter loss) — `tires_small`
- Speciality Tires — p. 121 — name not in our converted text (renamed, other printing, or a converter loss) — `tires_large`
- Tool Storage Compartment — p. 94 — name only in running text — `tool_storage`
- Weapon mount-Turret-Heavy — p. 142 — name only in running text — `weapon_turret_heavy`
- Weapon mount-Turret-Small — p. 142 — name not in our converted text (renamed, other printing, or a converter loss) — `weapon_turret_small`
- x Guide Override — p. 141 — heading with no block (regroup unit rules) — `xguide_override`

**programs** (1)

- Free Fall — p. 109 — name only in running text — `soft_freefall`

**vehicles** (1)

- Volkswagen Krime IV+ — p. 34 — name not in our converted text (renamed, other printing, or a converter loss) — `volkswagen_krime`

**weapons** (2)

- Launcher — p. 101 — name only in running text — `weapon_launcher`
- Micro Launcher — p. 113 — name not in our converted text (renamed, other printing, or a converter loss) — `micro_torpedo_launcher`

#### Shadowrun: Firing Squad

**gear** (2)

- MEMS Basic Harness — p. 48 — table row in the converted text, dropped (regroup pairing / recipe) — `mems_basic_harness`
- Metahuman Adaptation Close Combat Weapon — p. 63 — name not in our converted text (renamed, other printing, or a converter loss) — `metahuman_adaption_close`

**weapons** (8)

- Battery for laser weapons — p. 47 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_battery_laser`
- Cougar Weapons 'Long Tooth' — p. 13 — name only in running text — `long_tooth`
- Defense-Com Holdout — p. 33 — name not in our converted text (renamed, other printing, or a converter loss) — `horizon_flynn_dcom_holdout`
- Fuel for Blazer (5x) — p. 35 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_blazer`
- Fuel for Hell Turtle (15x) — p. 43 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_hell_turtle`
- Gas for Hornet (10x) — p. 34 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_hornet_gas`
- Kama — p. 11 — name not in our converted text (renamed, other printing, or a converter loss) — `kami`
- rEVO Crowssbow Bolts — p. 40 — name not in our converted text (renamed, other printing, or a converter loss) — `steel_falcon_crossbow_bolt`

#### Shadowrun: Hack & Slash

**electronics** (4)

- Built-In Accessory — p. 37 — regroup block exists, not catalogued (kind classifier) — `built_in_accessory`
- Grapple Tapper Cable (50m) — p. 44 — name not in our converted text (renamed, other printing, or a converter loss) — `grapple_tapper_cable`
- Living Command Console — p. 67 — bold run-in name in prose (no heading or table) — `living_console`
- Machinist Command Console — p. 131 — name not in our converted text (renamed, other printing, or a converter loss) — `machinist_console`

**vehicles** (2)

- Dominion Malakim — p. 167 — name not in our converted text (renamed, other printing, or a converter loss) — `malakim_drone`
- Dominion Ophanim — p. 167 — name not in our converted text (renamed, other printing, or a converter loss) — `ophanim_drone`

**weapons** (1)

- Ascalon Sabot — p. 168 — name not in our converted text (renamed, other printing, or a converter loss) — `ammo_sabot`

#### Shadowrun: Lofwyr's Legions

**metatypes** (3)

- Feathered Drake — p. 16 — table row in the converted text, dropped (regroup pairing / recipe) — `feathered`
- Sea Drake — p. 16 — table row in the converted text, dropped (regroup pairing / recipe) — `seadrake`
- Western Drake — p. 16 — table row in the converted text, dropped (regroup pairing / recipe) — `western`

#### Shadowrun: No Future

**electronics** (4)

- Instrument of death 1 (simple) — p. 156 — name not in our converted text (renamed, other printing, or a converter loss) — `instrument_death_simple`
- Instrument of death 2(professional) — p. 156 — name not in our converted text (renamed, other printing, or a converter loss) — `instrument_death_professional`
- Instrument of death 3 (rising star) — p. 156 — name not in our converted text (renamed, other printing, or a converter loss) — `instrument_death_rising_star`
- ProCam with internal SmartCam — p. 159 — name not in our converted text (renamed, other printing, or a converter loss) — `procam_with_smart`

**lifemodules** (2)

- Teen Diva — p. 163 — regroup block exists, not catalogued (kind classifier) — `teen_diva`
- You had Fifteen Minutes of Fame — p. 3 — name not in our converted text (renamed, other printing, or a converter loss) — `15_min_fame`

#### Shadowrun: Shadow Cast

**qualitypaths** (1)

- Private Investigator — p. 128 — heading with no block (regroup unit rules) — `private_investigator`

#### Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go

**gear** (3)

- Hunter's Alloy — p. 28 — regroup block exists, not catalogued (kind classifier) — `hunters_alloy_regular`
- Liar's Medium — p. 28 — regroup block exists, not catalogued (kind classifier) — `liars_medium_divination`
- UV Floodlight — p. 29 — table row in the converted text, dropped (regroup pairing / recipe) — `uv_floodlight`

**weapons** (2)

- Silver Arrow — p. 27 — table row in the converted text, dropped (regroup pairing / recipe) — `silver_arrow`
- Silver Bolt — p. 27 — table row in the converted text, dropped (regroup pairing / recipe) — `silver_bolt`

#### Shadowrun: Sixth World Companion

**metatypes** (1)

- Nartaki 2 — p. 81 — printed under a shorter or regrouped name (group/maker prefix, variant) — `nartaki2`

**packs** (10)

- Drones, Large-Anthro — p. 68 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_veh_nissan_oni`
- Drones, Medium-Anthro — p. 68 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_veh_nissan_samurai`
- Heavy Pistol-Ares Predator VI Silent — p. 57 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_heavy_predator2`
- Heavy Pistol-Colt Manhunter Silent — p. 57 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_heavy_manhunter2`
- Launchers-Aztechnology StrikerOnotari Interceptor — p. 58 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_interceptor`
- Machine Guns-Stoner-Ares M202Ingram Valiant — p. 58 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_m202`
- Rifles-FN-HAR Smart — p. 58 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_fn_har1`
- Shotgun-Mossberg CMDT Smart — p. 57 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_shot_mossberg2`
- Upgrades-Dirty Tricks — p. 71 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_upgrade_dirty`
- Upgrades-Gunports — p. 71 — name not in our converted text (renamed, other printing, or a converter loss) — `pack_upgrade_gunports`

#### Shadowrun: Smooth Operations

**armor** (1)

- Krime Rave Clothing Complete — p. 116 — name not in our converted text (renamed, other printing, or a converter loss) — `krime_rave_complete`

**gear** (1)

- Fashion Accessory (Très Chic) — p. 117 — name not in our converted text (renamed, other printing, or a converter loss) — `fashion_accessory_tres_chic`

**programs** (1)

- NanoMask — p. 122 — name only in running text — `nanomask`

#### Shadowrun: Street Wyrd

**spells** (2)

- Disentangle — p. 53 — heading with no block (regroup unit rules) — `disentangle`
- Stone Fist — p. 53 — regroup block exists, not catalogued (kind classifier) — `stone_fist`

**traditions** (1)

- Shamanism — p. 109 — name only in running text — `shaman`

#### Shadowrun: Tarnished Star

**armor** (6)

- Ares Rampart Shield Mk1 — p. 147 — name not in our converted text (renamed, other printing, or a converter loss) — `ares_rampart_mk1`
- Ares Rampart Shield Mk2 — p. 147 — name not in our converted text (renamed, other printing, or a converter loss) — `ares_rampart_mk2`
- Ares Rampart Shield Mk3 — p. 147 — name not in our converted text (renamed, other printing, or a converter loss) — `ares_rampart_mk3`
- Ares Rampart Shield Mk4 — p. 147 — name not in our converted text (renamed, other printing, or a converter loss) — `ares_rampart_mk4`
- Silver Shield GAPS — p. 148 — name only in running text — `silver_shield_gaps`
- Silver Shield GAPS Helmet — p. 148 — name not in our converted text (renamed, other printing, or a converter loss) — `silver_shield_gaps_helmet`

**electronics** (1)

- Badge Camera — p. 149 — name not in our converted text (renamed, other printing, or a converter loss) — `badge_camera`

**gear** (1)

- Foamtek Solvent Spray — p. 147 — name not in our converted text (renamed, other printing, or a converter loss) — `foamtek_solvent`

**programs** (1)

- Autosoft (Knowledge: Law) — p. 157 — name only in running text — `soft_know_law`

#### Shadowrun: The Kechibi Code

**gear** (2)

- Guizhen 1 Shield Glasses — p. 87 — name not in our converted text (renamed, other printing, or a converter loss) — `guizhen_shield_glasses`
- Guizhen 1 Shield Visor — p. 87 — name not in our converted text (renamed, other printing, or a converter loss) — `guizhen_shield_visor`

### 1B. Artifacts (not worth chasing)

#### 1B-1. We already have it under another name or kind (22)

##### Krime Katalog

**ammotypes** (1)

- Krime Shotgun Crackle Heat Slugs — p. 25 — we have: **Krime Crackle Fin-Stabilized HEAT Slugs** (ammotypes, p. 26)

**weapons** (2)

- Grenade, Cocktails — p. 28 — we have: **Krime Cocktails** (weapons, p. 28)
- Grenade, Stinger — p. 29 — we have: **Krime Stinger** (weapons, p. 29)

##### Shadowrun, Sixth World Core Rulebook

**augmentations** (1)

- Implanted Launcher — p. 290 — we have: **Grenade launcher** (augmentations, p. 290)

##### Shadowrun: Body Shop

**augmentations** (3)

- Demolishers — p. 85 — we have: **Utility Nanites (Demolishers) (colony template)** (gear, p. 87)
- Gastrocutter — p. 85 — we have: **Utility Nanites (Gastrocutter) (colony template)** (gear, p. 87)
- Oxyrush — p. 82 — we have: **Therapeutic Nanites (Oxyrush) (colony template)** (gear, p. 87)

##### Shadowrun: Deadly Arts

**armor** (1)

- Pneumatic Anti-Shock Garments (PAG) — p. 175 — we have: **PAG** (armor, p. 176)

**vehicles** (1)

- Saeder-Krupp Cyclops — p. 138 — we have: **S-K Cyclops** (vehicles, p. 139)

**weapons** (2)

- Garotte — p. 47 — we have: **Garrote** (weapons, p. 42)
- Urumi — p. 47 — we have: **Urumi Sword** (weapons, p. 43)

##### Shadowrun: Firing Squad

**armor** (2)

- AV Rapid Transit — p. 51 — we have: **Rapid Transit (Basic)** (armor, p. 51)
- Synergist Business Suit — p. 52 — we have: **Synergist Business Line** (armor, p. 55)

**weapons** (1)

- Defense-Com Garotte — p. 33 — we have: **Horizon-Flynn Defense-Com Weapons (Garrote)** (weapons, p. 33)

##### Shadowrun: Hack & Slash

**metamagics** (1)

- Neuromorphism — p. 129 — we have: **Neuromorphism** (qualities, p. 129)

##### Shadowrun: Power Plays

**qualities** (1)

- Evo-Insider — p. 70 — we have: **Evo In** (qualities, p. 71)

##### Shadowrun: Sixth World Companion

**metamagics** (1)

- Transhumanism — p. 146 — we have: **Transhumanism** (qualities, p. 146)

**packs** (3)

- Rifle-Ares Desert Strike Silent — p. 58 — we have: **Ares Desert Strike (suppressor)** (packs, p. 58)
- Shotgun-Defiance T-250 Smart — p. 57 — we have: **Short-Barrel Defiance T-250 (external smartgun system)** (packs, p. 57)
- Vans-Armed Range Rover — p. 66 — we have: **Armed Range Rover Model 2080** (packs, p. 66)

**qualities** (1)

- Cephalod Skull — p. 127 — we have: **Cephalopod** (qualities, p. 127)

##### Shadowrun: Street Wyrd

**traditions** (1)

- Hermeticsm — p. 112 — we have: **Classical Hermeticism** (traditions, p. 112)

#### 1B-2. CommLink6 gives no page in this book (another book's entry) (38)

##### Shadowrun, Sixth World Core Rulebook

**npcs** (4)

- Blademaster — no page — `blademaster`
- Combat Mage — no page — `combat_mage`
- Securityrigger — no page — `securityrigger`
- Soldato — no page — `soldato`

**ruleoptions** (4)

- Configurable — no page — `houserules`
- Shadowrun Missions — no page — `srm`
- Standard — no page — `core`
- Standard (Seattle) — no page — `core_seattle`

##### Shadowrun: Double Clutch

**vehicles** (29)

- Ares Black Sky — no page — `ares_black_sky`
- Ares Packmule — no page — `ares_packmule`
- Ares Venture — no page — `ares_venture`
- Artemis Industries Nightwing — no page — `artemis_industries_nightwing`
- Chrysler-Nissan Pursuit V — no page — `chrysler-nissan_pursuit_v`
- Cyberspace Designs Dalmatian — no page — `cyberspace_designs_dalmatian`
- Dodge Scoot — no page — `dodge_scoot`
- Eurocar Westwind X80 — no page — `eurocar_westwind_x80`
- Federated Boeing Blackhawk — no page — `federated-boeing_blackhawk`
- Federated Boeing Osprey X — no page — `federated_boeing_osprey_x`
- GMC Banshee — no page — `gmc_banshee`
- GMC Bulldog Step-Van — no page — `gmc_bulldog`
- Harley-Davidson Scorpion — no page — `harley-davidson_scorpion`
- Hyundai Shin-Hyung — no page — `hyundai_shin-hyung`
- Lockheed Optic-X2 — no page — `lockheed_optic_x2`
- MCT Gnat — no page — `mct_gnat`
- MCT Hornet — no page — `mct_hornet`
- MCT-Nissan Roto-Drone — no page — `mct-nissan_roto_drone`
- MCT-Sikorsky-Bell Seahawk — no page — `mct-sikorsky-bell_seahawk`
- MCT-Sikorsky-Bell Wolfhound — no page — `mct-sikorsky-bell_wolfhound`
- Mitsubishi Nightsky — no page — `mitsubishi_nightsky`
- Nissan Oni — no page — `nissan_oni`
- Nissan Samurai — no page — `nissan_samurai`
- Saeder-Krupp-Bentley Concordat — no page — `saeder-krupp-bentley_concordat`
- Shiawase Inu — no page — `shiawase_inu`
- Shiawase Inu w/better suit — no page — `shiawase_inu_better_suit`
- Shiawase Kanmushi — no page — `shiawase_kanmushi`
- Steel Lynx Combat Drone — no page — `steel_lynx_combat_drone`
- Suzuki Mirage — no page — `suzuki_mirage`

##### Shadowrun: Firing Squad

**gear** (1)

- MEMS Scabbard — no page — `mems_scabbard`

#### 1B-3. Running-text pseudo-records (table-cell / range / rate-of-fire / rating fragments) (47)

##### Shadowrun, Sixth World Core Rulebook

**gear** (2)

- Adapter (see drones for Smart firing platform) — p. 260 — name not in our converted text (renamed, other printing, or a converter loss)
- Spare clip for weapons with variable ammunition system. — p. 253 — name not in our converted text (renamed, other printing, or a converter loss)

##### Shadowrun: Deadly Arts

**gear** (45)

- 1.5 km — p. 154 — name only in running text
- 10 km — p. 154 — name only in running text
- 14 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 16 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 160 km — p. 154 — name only in running text
- 2 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 20 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 24 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 25 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 3 — p. 157 — table row in the converted text, dropped (regroup pairing / recipe)
- 3 km — p. 154 — name only in running text
- 30 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 32 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 4 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- 40 km — p. 154 — name only in running text
- 5 km — p. 154 — name only in running text
- 7 km — p. 154 — name only in running text
- 9 km — p. 154 — name not in our converted text (renamed, other printing, or a converter loss)
- Adapter (see drones for Powered Heavy Tripod) — p. 64 — name not in our converted text (renamed, other printing, or a converter loss)
- Adapter (see drones for Reinforced Smart Firing Platform) — p. 64 — name not in our converted text (renamed, other printing, or a converter loss)
- Adapter (see drones for Wheeled Heavy Tripod) — p. 64 — name not in our converted text (renamed, other printing, or a converter loss)
- BF(4) — p. 152 — name only in running text
- Crew Served (2) — p. 153 — bold run-in name in prose (no heading or table)
- Crew Served (3) — p. 153 — bold run-in name in prose (no heading or table)
- Crew Served (4) — p. 153 — bold run-in name in prose (no heading or table)
- FA(10) — p. 152 — name only in running text
- Pilot 3 — p. 157 — name only in running text
- Pilot 5 — p. 157 — name only in running text
- Pilot 7 — p. 157 — printed under a shorter or regrouped name (group/maker prefix, variant)
- Pilot 8 — p. 157 — name not in our converted text (renamed, other printing, or a converter loss)
- SA(2) — p. 152 — name only in running text
- SS(1) — p. 152 — name only in running text
- SS(1-2) — p. 152 — name only in running text
- SS(1-3) — p. 152 — name only in running text
- SS(1-4) — p. 152 — name only in running text
- SS(1-6) — p. 152 — name only in running text
- Sensor 2 — p. 157 — printed under a shorter or regrouped name (group/maker prefix, variant)
- Sensor 5 — p. 157 — printed under a shorter or regrouped name (group/maker prefix, variant)
- Sensor 7 — p. 157 — printed under a shorter or regrouped name (group/maker prefix, variant)
- Uses 0.5 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)
- Uses 1 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)
- Uses 10 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)
- Uses 2 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)
- Uses 4 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)
- Uses 5 Energy per shot — p. 65 — name not in our converted text (renamed, other printing, or a converter loss)

#### 1B-4. CommLink6 placeholder ("Depreciated") entries (5)

##### Shadowrun, Sixth World Core Rulebook

**armor** (1)

- Depreciated (replace by full body armor and separate helmet) — p. 265 — Commlink6 placeholder entry

**gear** (1)

- Depreciated (Smart firing platform) buy new — p. 260 — Commlink6 placeholder entry

##### Shadowrun: Firing Squad

**gear** (3)

- Depreciated WSS shock, replace with new modification — p. 65 — Commlink6 placeholder entry
- Depreciated WSS spikes, replace with new modification — p. 65 — Commlink6 placeholder entry
- Depreciated WSS tracker, replace with new modification — p. 65 — Commlink6 placeholder entry

#### 1B-5. Page beyond the owned PDF (5)

##### Shadowrun: Hack & Slash

**sprites** (5)

- Courier Sprite — p. 193 — page beyond the owned PDF
- Crack Sprite — p. 193 — page beyond the owned PDF
- Data Sprite — p. 193 — page beyond the owned PDF
- Fault Sprite — p. 193 — page beyond the owned PDF
- Machine Sprite — p. 193 — page beyond the owned PDF

## LIST 2 — We have, CommLink6 doesn't

### All extra rows: counts per book

| book | rows |
|---|---:|
| Krime Katalog | 8 |
| Shadowrun, Sixth World Core Rulebook | 86 |
| Shadowrun, Sixth World Core Rulebook: City Edition Berlin | 25 |
| Shadowrun, Sixth World Core Rulebook: City Edition Seattle | 8 |
| Shadowrun: Astral Ways | 94 |
| Shadowrun: Bestial Nature | 4 |
| Shadowrun: Body Shop | 176 |
| Shadowrun: Collapsing Now | 45 |
| Shadowrun: Deadly Arts | 47 |
| Shadowrun: Dealers of Death | 8 |
| Shadowrun: Double Clutch | 30 |
| Shadowrun: Firing Squad | 61 |
| Shadowrun: Hack & Slash | 30 |
| Shadowrun: Lofwyr's Legions | 16 |
| Shadowrun: No Future | 3 |
| Shadowrun: Power Plays | 1 |
| Shadowrun: Shadow Cast | 47 |
| Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go | 13 |
| Shadowrun: Sixth World Companion | 180 |
| Shadowrun: Slip Streams | 34 |
| Shadowrun: Smooth Operations | 16 |
| Shadowrun: Street Wyrd | 36 |
| Shadowrun: Tarnished Star | 66 |
| Shadowrun: The Kechibi Code | 58 |

### All extra rows: counts per kind

| kind | rows |
|---|---:|
| npcs | 269 |
| augmentations | 147 |
| gear | 104 |
| lifemodules | 92 |
| critters | 71 |
| contacts | 64 |
| weapons | 63 |
| spirits | 52 |
| qualities | 43 |
| qualitypaths | 33 |
| critterpowers | 22 |
| armor | 20 |
| vehicles | 17 |
| actions | 15 |
| trueelements | 14 |
| packs | 12 |
| spellfeatures | 10 |
| spells | 8 |
| ammotypes | 7 |
| grades | 7 |
| vehicledesign | 6 |
| programs | 6 |
| traditions | 3 |
| metamagics | 2 |
| martialtechniques | 1 |
| echoes | 1 |
| electronics | 1 |
| senses | 1 |
| metatypes | 1 |

### 2A. Entries

#### Krime Katalog

**ammotypes** (2)

- Krime Crackle Fin-Stabilized HEAT Slugs — p. 26 — `kk.krime-crackle-fin-stabilized-heat-slugs`
- Krime Penetrators Buckshot Shells — p. 26 — `kk.krime-penetrators-buckshot-shells`

**weapons** (6)

- AKM-97 (Assault Rifle) — p. 9 — `kk.akm-97-assault-rifle`
- Krime Cocktails — p. 28 — `kk.krime-cocktails`
- Krime Party (Flash-Bang) — p. 27 — `kk.krime-party-flash-bang`
- Krime Party (Frag) — p. 27 — `kk.krime-party-frag`
- Krime Soldier (GL) — p. 13 — `kk.krime-soldier-gl`
- Krime Stinger — p. 29 — `kk.krime-stinger`

#### Shadowrun, Sixth World Core Rulebook

**actions** (4)

- Counterspell — p. 43 — `crb.counterspell`
- Determine Effect — p. 176 — `crb.determine-effect`
- Hack — p. 182 — `crb.hack`
- Roll Dice — p. 176 — `crb.roll-dice`

**ammotypes** (1)

- Caseless — p. 262 — `crb.caseless`

**augmentations** (13)

- Foot (obvious) — p. 289 — `crb.foot-obvious`
- Foot (synthetic) — p. 289 — `crb.foot-synthetic`
- Forearm (obvious) — p. 289 — `crb.forearm-obvious`
- Forearm (synthetic) — p. 289 — `crb.forearm-synthetic`
- Grenade launcher — p. 290 — `crb.grenade-launcher`
- Hand (obvious) — p. 289 — `crb.hand-obvious`
- Hand (synthetic) — p. 289 — `crb.hand-synthetic`
- Lower leg (obvious) — p. 289 — `crb.lower-leg-obvious`
- Lower leg (synthetic) — p. 289 — `crb.lower-leg-synthetic`
- Retractable hand razors — p. 290 — `crb.retractable-hand-razors`
- Retractable handblade — p. 290 — `crb.retractable-handblade`
- Retractable spurs — p. 290 — `crb.retractable-spurs`
- SMG — p. 290 — `crb.smg`

**contacts** (5)

- Beat Cop — p. 212 — `crb.beat-cop`
- Mafia Consigliere — p. 213 — `crb.mafia-consigliere`
- Mechanic — p. 214 — `crb.mechanic`
- Street Doc — p. 214 — `crb.street-doc`
- Talismonger — p. 215 — `crb.talismonger`

**critters** (16)

- Cerberus Hound — p. 216 — `crb.cerberus-hound`
- Cockatrice — p. 217 — `crb.cockatrice`
- Eastern Dragons — p. 219 — `crb.eastern-dragons`
- Feathered Serpent — p. 220 — `crb.feathered-serpent`
- Ghoul — p. 218 — `crb.ghoul`
- Hell Hound — p. 218 — `crb.hell-hound`
- Large cat — p. 215 — `crb.large-cat`
- Vampire — p. 218 — `crb.vampire`
- Western Dragon — p. 220 — `crb.western-dragon`
- demon rat — p. 217 — `crb.demon-rat`
- devil rat — p. 217 — `crb.devil-rat`
- dog — p. 215 — `crb.dog`
- glitch rat — p. 217 — `crb.glitch-rat`
- horse — p. 215 — `crb.horse`
- shark — p. 215 — `crb.shark`
- wolf — p. 216 — `crb.wolf`

**echoes** (1)

- Matrix Attribute Upgrade — p. 195 — `crb.matrix-attribute-upgrade`

**electronics** (1)

- Binoculars, optical — p. 274 — `crb.binoculars-optical`

**gear** (13)

- Ares Predator VI spare magazine — p. 253 — `crb.ares-predator-vi-spare-magazine`
- Autosoft — p. 271 — `crb.autosoft`
- Cyberprogram, basic — p. 271 — `crb.cyberprogram-basic`
- Cyberprogram, hacking — p. 271 — `crb.cyberprogram-hacking`
- Enchanting focus — p. 294 — `crb.enchanting-focus`
- Fake SIN — p. 273 — `crb.fake-sin`
- Fake license — p. 273 — `crb.fake-license`
- Manual operation — p. 295 — `crb.manual-operation`
- Metamagic focus — p. 294 — `crb.metamagic-focus`
- Ritual Spellcasting — p. 168 — `crb.ritual-spellcasting`
- Skillsofts — p. 271 — `crb.skillsofts`
- Spell focus — p. 294 — `crb.spell-focus`
- Spirit focus — p. 294 — `crb.spirit-focus`

**grades** (4)

- Alphaware — p. 282 — `crb.alphaware`
- Betaware — p. 282 — `crb.betaware`
- Deltaware — p. 282 — `crb.deltaware`
- Used — p. 282 — `crb.used`

**npcs** (20)

- Beat Cop — p. 212 — `crb.beat-cop`
- Delta Force Logistics — p. 209 — `crb.delta-force-logistics`
- DocWagon HTR Officer — p. 207 — `crb.docwagon-htr-officer`
- DocWagon HTR Support Engineer (Technomancer) — p. 208 — `crb.docwagon-htr-support-engineer-technomancer`
- Lone Star Combat Mage — p. 207 — `crb.lone-star-combat-mage`
- Lone Star SWAT Officer — p. 207 — `crb.lone-star-swat-officer`
- Mafia Consigliere — p. 213 — `crb.mafia-consigliere`
- Mafia Soldato — p. 207 — `crb.mafia-soldato`
- Marine Corps Special Operations Forces — p. 208 — `crb.marine-corps-special-operations-forces`
- Mechanic — p. 214 — `crb.mechanic`
- Minuteman Security Rigger — p. 206 — `crb.minuteman-security-rigger`
- Renraku Red Samurai — p. 208 — `crb.renraku-red-samurai`
- SEAL Team 6 Counter-Electronics Commando (Decker) — p. 209 — `crb.seal-team-6-counter-electronics-commando-decker`
- Seraphim Avenging Angel (Adept) — p. 208 — `crb.seraphim-avenging-angel-adept`
- Sioux Wildcat Combat Specialist — p. 210 — `crb.sioux-wildcat-combat-specialist`
- Sioux Wildcat Shamanic Support — p. 210 — `crb.sioux-wildcat-shamanic-support`
- Street Doc — p. 214 — `crb.street-doc`
- Talismonger — p. 215 — `crb.talismonger`
- Tír Ghost (Elf adjustments applied) — p. 209 — `crb.t-r-ghost-elf-adjustments-applied`
- Yakuza Blademaster (Adept) — p. 207 — `crb.yakuza-blademaster-adept`

**qualities** (1)

- Examples — p. 75 — `crb.examples`

**senses** (1)

- Smell — p. 157 — `crb.smell`

**vehicles** (1)

- Proteus Sea Snake — p. 297 — `crb.proteus-sea-snake`

**weapons** (5)

- Grenade Launcher — p. 258 — `crb.grenade-launcher`
- Grenade Launcher — p. 258 — `crb.grenade-launcher-2`
- Missile Variant — p. 264 — `crb.missile-variant`
- Shock — p. 290 — `crb.shock`
- Smartgun system, external — p. 260 — `crb.smartgun-system-external`

#### Shadowrun, Sixth World Core Rulebook: City Edition Berlin

**contacts** (3)

- Kazimira “Cashmere” Burakgazi — p. 332 — `crb-ber.kazimira-cashmere-burakgazi`
- Saif Alhazred — p. 332 — `crb-ber.saif-alhazred`
- Sigma — p. 333 — `crb-ber.sigma`

**npcs** (3)

- Kazimira “Cashmere” Burakgazi — p. 332 — `crb-ber.kazimira-cashmere-burakgazi`
- Saif Alhazred — p. 332 — `crb-ber.saif-alhazred`
- Sigma — p. 333 — `crb-ber.sigma`

**vehicles** (11)

- Better Drek Car — p. 341 — `crb-ber.better-drek-car`
- BÆR E-Sperber (Scooter) — p. 341 — `crb-ber.b-r-e-sperber-scooter`
- BÆR Schlachtkreuzer — p. 342 — `crb-ber.b-r-schlachtkreuzer`
- Drek Car — p. 341 — `crb-ber.drek-car`
- Drek Van — p. 341 — `crb-ber.drek-van`
- E-Rickshaw — p. 341 — `crb-ber.e-rickshaw`
- Junk Dog — p. 344 — `crb-ber.junk-dog`
- Kuznechik Airbike — p. 342 — `crb-ber.kuznechik-airbike`
- Rat Bike — p. 341 — `crb-ber.rat-bike`
- Ruhrmetall Selket Crowd Control Walker — p. 343 — `crb-ber.ruhrmetall-selket-crowd-control-walker`
- Tuk-Tuk — p. 341 — `crb-ber.tuk-tuk`

**weapons** (8)

- Altmayr SP — p. 340 — `crb-ber.altmayr-sp`
- Altmayr White Star — p. 340 — `crb-ber.altmayr-white-star`
- Barzani AK-47M1 — p. 340 — `crb-ber.barzani-ak-47m1`
- HaKa MP2 — p. 340 — `crb-ber.haka-mp2`
- HaKa Skorpion — p. 340 — `crb-ber.haka-skorpion`
- Samopal vz/88V — p. 340 — `crb-ber.samopal-vz-88v`
- Sorokin G9 — p. 340 — `crb-ber.sorokin-g9`
- Sorokin Predator I — p. 340 — `crb-ber.sorokin-predator-i`

#### Shadowrun, Sixth World Core Rulebook: City Edition Seattle

**contacts** (4)

- Brynne “Red” Taggart — p. 329 — `crb-sea.brynne-red-taggart`
- Ni Ni Xiaolu — p. 329 — `crb-sea.ni-ni-xiaolu`
- Toil — p. 330 — `crb-sea.toil`
- Trubble — p. 330 — `crb-sea.trubble`

**npcs** (4)

- Brynne “Red” Taggart — p. 329 — `crb-sea.brynne-red-taggart`
- Ni Ni Xiaolu — p. 329 — `crb-sea.ni-ni-xiaolu`
- Toil — p. 330 — `crb-sea.toil`
- Trubble — p. 330 — `crb-sea.trubble`

#### Shadowrun: Astral Ways

**armor** (4)

- Ares Encounter Suit Mk III — p. 176 — `aw.ares-encounter-suit-mk-iii`
- Encounter Suit Helmet — p. 176 — `aw.encounter-suit-helmet`
- Generic Encounter Suit (light milspec) — p. 176 — `aw.generic-encounter-suit-light-milspec`
- Low-Threat Exploration Suit — p. 176 — `aw.low-threat-exploration-suit`

**critters** (13)

- Atomic devil rats — p. 157 — `aw.atomic-devil-rats`
- Baseline Doppelganger — p. 73 — `aw.baseline-doppelganger`
- Demon Squirrel Chimera — p. 73 — `aw.demon-squirrel-chimera`
- Epic toxic mutant horror — p. 156 — `aw.epic-toxic-mutant-horror`
- Gorilla Chimera — p. 73 — `aw.gorilla-chimera`
- Obsidian golem — p. 114 — `aw.obsidian-golem`
- Orichalcum golem — p. 114 — `aw.orichalcum-golem`
- Patchwork Chimera — p. 74 — `aw.patchwork-chimera`
- Radiant Hell Hounds — p. 158 — `aw.radiant-hell-hounds`
- Silver golem — p. 114 — `aw.silver-golem`
- Steel golem — p. 113 — `aw.steel-golem`
- Toxic Fallout Ghoul Animi — p. 156 — `aw.toxic-fallout-ghoul-animi`
- Toxic mutant horror — p. 156 — `aw.toxic-mutant-horror`

**gear** (5)

- Map/Grimoire — p. 170 — `aw.map-grimoire`
- Sauropod Heart Amulet — p. 138 — `aw.sauropod-heart-amulet`
- Sextant of Worlds — p. 170 — `aw.sextant-of-worlds`
- Shadow Amulet — p. 170 — `aw.shadow-amulet`
- Shadow Cloak — p. 164 — `aw.shadow-cloak`

**npcs** (12)

- Bone Trader Gnawer — p. 154 — `aw.bone-trader-gnawer`
- Crimson Carnage Ghoul Biker — p. 154 — `aw.crimson-carnage-ghoul-biker`
- Crimson Carnage Vampire Lieutenant — p. 155 — `aw.crimson-carnage-vampire-lieutenant`
- Dis Magician — p. 72 — `aw.dis-magician`
- Elder Minotoad — p. 103 — `aw.elder-minotoad`
- King Carnage — p. 155 — `aw.king-carnage`
- Lesser Minotoad — p. 103 — `aw.lesser-minotoad`
- Mature Minotoad — p. 103 — `aw.mature-minotoad`
- Tandoran Beast Caller — p. 144 — `aw.tandoran-beast-caller`
- Tandoran Defender Adept — p. 143 — `aw.tandoran-defender-adept`
- Tandoran Hunter Adept — p. 143 — `aw.tandoran-hunter-adept`
- Tandoran Water Shaman — p. 144 — `aw.tandoran-water-shaman`

**spirits** (46)

- Ankylosaur — p. 142 — `aw.ankylosaur`
- Archaeopteryx — p. 141 — `aw.archaeopteryx`
- Ardor — p. 46 — `aw.ardor`
- Argil — p. 46 — `aw.argil`
- Bise — p. 46 — `aw.bise`
- Bole — p. 47 — `aw.bole`
- Borea — p. 47 — `aw.borea`
- Brume — p. 47 — `aw.brume`
- Carnosaur — p. 143 — `aw.carnosaur`
- Ceratops — p. 142 — `aw.ceratops`
- Conductor — p. 155 — `aw.conductor`
- Crocosaurus Rex — p. 143 — `aw.crocosaurus-rex`
- Drumlin — p. 47 — `aw.drumlin`
- Dust Devil — p. 48 — `aw.dust-devil`
- Earth Gnome — p. 48 — `aw.earth-gnome`
- Empyrean — p. 49 — `aw.empyrean`
- Errhine — p. 49 — `aw.errhine`
- Esker — p. 49 — `aw.esker`
- Firn — p. 49 — `aw.firn`
- Gabbro — p. 50 — `aw.gabbro`
- Hyetal — p. 50 — `aw.hyetal`
- Jökulhlaup — p. 50 — `aw.j-kulhlaup`
- Kaolin — p. 50 — `aw.kaolin`
- Khamsin — p. 51 — `aw.khamsin`
- Marl — p. 51 — `aw.marl`
- Midden — p. 51 — `aw.midden`
- Mote — p. 51 — `aw.mote`
- Névé — p. 52 — `aw.neve`
- Phlogiston — p. 52 — `aw.phlogiston`
- Plesiosaur — p. 142 — `aw.plesiosaur`
- Prehistoric Piranha — p. 141 — `aw.prehistoric-piranha`
- Pterosaur — p. 142 — `aw.pterosaur`
- Punkah — p. 52 — `aw.punkah`
- Raptor — p. 142 — `aw.raptor`
- Salamander — p. 52 — `aw.salamander`
- Sauropod — p. 143 — `aw.sauropod`
- Silap — p. 53 — `aw.silap`
- Simoon — p. 53 — `aw.simoon`
- Sjörå — p. 54 — `aw.sj-r`
- Stegosaur — p. 142 — `aw.stegosaur`
- Suttee — p. 54 — `aw.suttee`
- Sylph — p. 54 — `aw.sylph`
- Undine — p. 54 — `aw.undine`
- Vadose — p. 55 — `aw.vadose`
- Welkin — p. 55 — `aw.welkin`
- Zephyr — p. 55 — `aw.zephyr`

**trueelements** (14)

- Animated — p. 57 — `aw.true-air-crafting-animated`
- Animated — p. 57 — `aw.true-fire-forged-animated`
- Dangerous — p. 57 — `aw.true-fire-forged-dangerous`
- Dangerous — p. 58 — `aw.true-water-quenched-dangerous`
- Elemental Mastery — p. 57 — `aw.true-earth-sandcasting-elemental-mastery`
- Elemental Mastery — p. 57 — `aw.true-air-crafting-elemental-mastery`
- Elemental Mastery — p. 57 — `aw.true-fire-forged-elemental-mastery`
- Elemental Mastery — p. 58 — `aw.true-water-quenched-elemental-mastery`
- Familiar — p. 57 — `aw.true-earth-sandcasting-familiar`
- Familiar — p. 57 — `aw.true-fire-forged-familiar`
- Protective — p. 57 — `aw.true-earth-sandcasting-protective`
- Protective — p. 58 — `aw.true-water-quenched-protective`
- Secretive — p. 57 — `aw.true-air-crafting-secretive`
- Secretive — p. 58 — `aw.true-water-quenched-secretive`

#### Shadowrun: Bestial Nature

**ammotypes** (3)

- Silver Bullets (copper) — p. 36 — `bn.silver-bullets-copper`
- Silver Bullets (gold) — p. 36 — `bn.silver-bullets-gold`
- Silver Bullets (silver) — p. 36 — `bn.silver-bullets-silver`

**qualities** (1)

- Natural Weapon (Shifter add-on) — p. 16 — `bn.natural-weapon-shifter-add-on`

#### Shadowrun: Body Shop

**augmentations** (116)

- AI Host Device — p. 148 — `bs.ai-host-device`
- Additional Critter Power, Awakened — p. 158 — `bs.additional-critter-power-awakened`
- Additional Critter Power, Mundane — p. 158 — `bs.additional-critter-power-mundane`
- Agility Increase — p. 148 — `bs.agility-increase`
- Aluminum Exoframe — p. 142 — `bs.aluminum-exoframe`
- Aqua Jets — p. 143 — `bs.aqua-jets`
- Aquatic Cybertail, Obvious — p. 138 — `bs.aquatic-cybertail-obvious`
- Aquatic Cybertail, Synthetic — p. 138 — `bs.aquatic-cybertail-synthetic`
- Armor Increase — p. 148 — `bs.armor-increase`
- Armor Plating — p. 143 — `bs.armor-plating`
- Armor Plating, Hardened — p. 149 — `bs.armor-plating-hardened`
- Augmented Cyberlimb, Obvious — p. 148 — `bs.augmented-cyberlimb-obvious`
- Augmented Cyberlimb, Synthetic — p. 148 — `bs.augmented-cyberlimb-synthetic`
- Awakened Critter Power Enhancement — p. 158 — `bs.awakened-critter-power-enhancement`
- Balance — p. 62 — `bs.balance`
- Bio-Drone Harness — p. 148 — `bs.bio-drone-harness`
- Bio-Drone Harness — p. 149 — `bs.nano-critter-augmentations.bio-drone-harness`
- Blind — p. 70 — `bs.biosprayer-blind`
- Cargo — p. 149 — `bs.cargo`
- Cargo Matrix Shielding — p. 149 — `bs.cargo-matrix-shielding`
- Confused — p. 70 — `bs.biosprayer-confused`
- Corrosive Spit Glands — p. 148 — `bs.corrosive-spit-glands`
- Cortex area bomb — p. 30 — `bs.cortex-area-bomb`
- Cortex kink bomb — p. 30 — `bs.cortex-kink-bomb`
- Cortex microbomb — p. 30 — `bs.cortex-microbomb`
- Critter Awakening — p. 158 — `bs.critter-awakening`
- Critter Comm — p. 148 — `bs.critter-comm`
- Critterjack — p. 148 — `bs.critterjack`
- Custom fitted cyberlimb — p. 44 — `bs.custom-fitted-cyberlimb`
- Cyber restraint — p. 30 — `bs.cyber-restraint`
- Cybernetic Shells (Obvious) — p. 178 — `bs.cybernetic-shells-obvious`
- Cybernetic Shells (Synthetic) — p. 178 — `bs.cybernetic-shells-synthetic`
- Cyberskull, Obvious — p. 148 — `bs.cyberskull-obvious`
- Cyberskull, Synthetic — p. 148 — `bs.cyberskull-synthetic`
- Cybertorso, Obvious — p. 148 — `bs.cybertorso-obvious`
- Cybertorso, Synthetic — p. 148 — `bs.cybertorso-synthetic`
- Deployable Cover — p. 143 — `bs.deployable-cover`
- Electronics Systems — p. 144 — `bs.electronics-systems`
- Enhanced Movement — p. 138 — `bs.enhanced-movement`
- Exhalation spray — p. 62 — `bs.exhalation-spray`
- Expanded reservoir (5 doses) — p. 43 — `bs.expanded-reservoir-5-doses`
- Fangs (Non-retractable) — p. 71 — `bs.fangs-non-retractable`
- Fangs (Retractable) — p. 71 — `bs.fangs-retractable`
- Fearless — p. 158 — `bs.fearless`
- Finger/nose/toe — p. 67 — `bs.finger-nose-toe`
- Flash Module — p. 144 — `bs.flash-module`
- Fuel (per 5 shots) — p. 50 — `bs.fuel-per-5-shots`
- Full arm/leg — p. 67 — `bs.full-arm-leg`
- Full body hair growth — p. 57 — `bs.full-body-hair-growth`
- Gecko Pads — p. 139 — `bs.gecko-pads`
- Glider Wings — p. 144 — `bs.glider-wings`
- Hand/foot — p. 67 — `bs.hand-foot`
- Head or small area — p. 57 — `bs.head-or-small-area`
- Headjammers — p. 30 — `bs.headjammers`
- Heuristic Processor — p. 148 — `bs.heuristic-processor`
- Hydraulic Jacks — p. 148 — `bs.hydraulic-jacks`
- Inflammable — p. 158 — `bs.inflammable`
- Instinctive Skill Enhancement — p. 158 — `bs.instinctive-skill-enhancement`
- Insulated — p. 158 — `bs.insulated`
- Iron Stomach — p. 158 — `bs.iron-stomach`
- Jump Jets — p. 144 — `bs.jump-jets`
- Killswitch (1 dose) — p. 43 — `bs.killswitch-1-dose`
- Lockjaw — p. 148 — `bs.lockjaw`
- Matrix Defense Suite — p. 144 — `bs.matrix-defense-suite`
- Matrix Relay — p. 149 — `bs.matrix-relay`
- Mechanical Arm — p. 145 — `bs.mechanical-arm`
- Mental Attribute Enhancement — p. 158 — `bs.mental-attribute-enhancement`
- Mimic option — p. 62 — `bs.mimic-option`
- Mimic signal drug (per dose) — p. 62 — `bs.mimic-signal-drug-per-dose`
- Mini/micro drone — p. 50 — `bs.mini-micro-drone`
- Mundane Critter Power Augmentation — p. 158 — `bs.mundane-critter-power-augmentation`
- Natural Bioware — p. 158 — `bs.natural-bioware`
- Natural Weapon Sheathing — p. 148 — `bs.natural-weapon-sheathing`
- Nonconductive 0.2 — p. 158 — `bs.nonconductive-0-2`
- Paddle — p. 62 — `bs.paddle`
- Partial arm/leg — p. 67 — `bs.partial-arm-leg`
- Permanent — p. 57 — `bs.permanent`
- Physical Attribute Enhancement — p. 158 — `bs.physical-attribute-enhancement`
- Plastic Exoframe — p. 142 — `bs.plastic-exoframe`
- Precursor Compounds — p. 80 — `bs.precursor-compounds`
- Prehensile — p. 62 — `bs.prehensile`
- Prosthetic Cyberlimb, Crude — p. 148 — `bs.prosthetic-cyberlimb-crude`
- Prosthetic Cyberlimb, Custom — p. 148 — `bs.prosthetic-cyberlimb-custom`
- Prosthetic Cyberlimb, Generic — p. 148 — `bs.prosthetic-cyberlimb-generic`
- Quadrotor Flight System — p. 145 — `bs.quadrotor-flight-system`
- Replacement battery (5 shots) — p. 50 — `bs.replacement-battery-5-shots`
- Selective Dampening — p. 158 — `bs.selective-dampening`
- Sensor Array — p. 149 — `bs.sensor-array`
- Severing — p. 158 — `bs.severing`
- Shock Module — p. 145 — `bs.shock-module`
- Signal drug (per dose) — p. 62 — `bs.signal-drug-per-dose`
- Small drone — p. 50 — `bs.small-drone`
- Spikes Module — p. 145 — `bs.spikes-module`
- Spit — p. 62 — `bs.spit`
- Strength Increase — p. 148 — `bs.strength-increase`
- Technosense — p. 70 — `bs.technosense`
- Temporary — p. 57 — `bs.temporary`
- Thagomizer — p. 62 — `bs.thagomizer`
- Titanium Exoframe — p. 142 — `bs.titanium-exoframe`
- Toxin Injector — p. 149 — `bs.toxin-injector`
- Transgenic appendix reactivation — p. 101 — `bs.transgenic-appendix-reactivation`
- Transgenic exhalation spray — p. 101 — `bs.transgenic-exhalation-spray`
- Turret Ammunition Storage Module — p. 146 — `bs.turret-ammunition-storage-module`
- Turret Mount, Heavy — p. 146 — `bs.turret-mount-heavy`
- Turret Mount, Large — p. 146 — `bs.turret-mount-large`
- Turret Mount, Medium — p. 146 — `bs.turret-mount-medium`
- Turret Mount, Small — p. 146 — `bs.turret-mount-small`
- Unnatural Immunity — p. 158 — `bs.unnatural-immunity`
- Unnatural Instinct — p. 158 — `bs.unnatural-instinct`
- Vector Thrust Wings — p. 146 — `bs.vector-thrust-wings`
- Venom Enhancement — p. 149 — `bs.venom-enhancement`
- Venom Fangs — p. 148 — `bs.venom-fangs`
- Venom Reservoir — p. 148 — `bs.venom-reservoir`
- Venom Sprayer — p. 148 — `bs.venom-sprayer`
- Weapon reservoir — p. 62 — `bs.weapon-reservoir`
- Whip — p. 62 — `bs.whip`

**critterpowers** (10)

- Armor — p. 151 — `bs.armor`
- Concealment — p. 151 — `bs.concealment`
- Corrosive Spit — p. 151 — `bs.corrosive-spit`
- Enhanced Senses — p. 151 — `bs.enhanced-senses`
- Hardened Armor — p. 151 — `bs.hardened-armor`
- Mimicry — p. 151 — `bs.mimicry`
- Noxious Breath — p. 152 — `bs.noxious-breath`
- Venom (Vector: Contact) — p. 152 — `bs.venom-vector-contact`
- Venom (Vector: Inhalation) — p. 152 — `bs.venom-vector-inhalation`
- Venom (Vector: Injection) — p. 152 — `bs.venom-vector-injection`

**critters** (31)

- Ares Deinonychus — p. 165 — `bs.ares-deinonychus`
- Ares Deinonychus Bio-Drone Prototype — p. 165 — `bs.ares-deinonychus-bio-drone-prototype`
- Ares T-Rex Bio-Drone Prototype — p. 164 — `bs.ares-t-rex-bio-drone-prototype`
- Ares T-rex — p. 164 — `bs.ares-t-rex`
- Ares Triceratops — p. 164 — `bs.ares-triceratops`
- Ares Triceratops Bio-Drone Prototype — p. 165 — `bs.ares-triceratops-bio-drone-prototype`
- Ares Warhound — p. 159 — `bs.ares-warhound`
- Astral Guardian Barghest — p. 162 — `bs.astral-guardian-barghest`
- Bear — p. 156 — `bs.bear`
- Chimpanzee — p. 156 — `bs.chimpanzee`
- Crocodile/Gator — p. 156 — `bs.crocodile-gator`
- Dog, Large Breed — p. 156 — `bs.dog-large-breed`
- Dog, Small Breed — p. 156 — `bs.dog-small-breed`
- Elephant — p. 156 — `bs.elephant`
- Gorilla — p. 156 — `bs.gorilla`
- Hard Corps Cyber-Mammoth — p. 159 — `bs.hard-corps-cyber-mammoth`
- Hk-jaws — p. 161 — `bs.hk-jaws`
- House Cat — p. 157 — `bs.house-cat`
- Insect/Spider — p. 157 — `bs.insect-spider`
- Lusitano Melhor Horse — p. 162 — `bs.lusitano-melhor-horse`
- Lusitano Pegasus — p. 163 — `bs.lusitano-pegasus`
- Monkey — p. 157 — `bs.monkey`
- Pet Pal Kitty — p. 160 — `bs.pet-pal-kitty`
- Pet Pal Puppy — p. 160 — `bs.pet-pal-puppy`
- Pied Piper — p. 163 — `bs.pied-piper`
- Raptor: Eagle, Hawk, Owl — p. 157 — `bs.raptor-eagle-hawk-owl`
- Renraku Best Boy — p. 161 — `bs.renraku-best-boy`
- Stuffer Shack Chicken Taco — p. 160 — `bs.stuffer-shack-chicken-taco`
- Stuffer Shack Super Steer — p. 159 — `bs.stuffer-shack-super-steer`
- Tiny Animal: Bird, Fish, Rodent, Lizard, Snake, etc. — p. 158 — `bs.tiny-animal-bird-fish-rodent-lizard-snake-etc`
- Warfare Gorilla — p. 162 — `bs.warfare-gorilla`

**gear** (7)

- Aexd — p. 171 — `bs.aexd`
- Therapeutic Nanites (Oxyrush) (colony template) — p. 87 — `bs.therapeutic-nanites-oxyrush-colony-template`
- Therapeutic Nanites (Oxyrush) (pre-built) — p. 87 — `bs.therapeutic-nanites-oxyrush-pre-built`
- Utility Nanites (Demolishers) (colony template) — p. 87 — `bs.utility-nanites-demolishers-colony-template`
- Utility Nanites (Demolishers) (pre-built) — p. 87 — `bs.utility-nanites-demolishers-pre-built`
- Utility Nanites (Gastrocutter) (colony template) — p. 87 — `bs.utility-nanites-gastrocutter-colony-template`
- Utility Nanites (Gastrocutter) (pre-built) — p. 87 — `bs.utility-nanites-gastrocutter-pre-built`

**grades** (3)

- Exoware — p. 28 — `bs.exoware`
- Gammaware — p. 28 — `bs.gammaware`
- Omega Grade — p. 28 — `bs.omega-grade`

**martialtechniques** (1)

- Barrel Strike — p. 32 — `bs.barrel-strike`

**qualities** (1)

- Doesn’t Quite Fit — p. 105 — `bs.doesnt-quite-fit`

**weapons** (7)

- Blind (rating 1–3) — p. 72 — `bs.biospike-blind-rating-1-3`
- Confused (rating 1–3) — p. 72 — `bs.biospike-confused-rating-1-3`
- Corrosive spit (1–3) — p. 71 — `bs.corrosive-spit-1-3`
- Dazed — p. 72 — `bs.biospike-dazed`
- Nauseated — p. 72 — `bs.biospike-nauseated`
- Wrist shield slashing — p. 50 — `bs.wrist-shield-slashing`
- Wrist shield slashing bashing — p. 50 — `bs.wrist-shield-slashing-bashing`

#### Shadowrun: Collapsing Now

**npcs** (45)

- Akyromantic Magician — p. 20 — `cln.akyromantic-magician`
- Akyromantic Technomancer — p. 21 — `cln.akyromantic-technomancer`
- Alice Lewis — p. 61 — `cln.alice-lewis`
- Anna Moller — p. 21 — `cln.anna-moller`
- Blue — p. 123 — `cln.blue`
- Cereus Head case — p. 77 — `cln.cereus-head-case`
- Cyberzombie — p. 96 — `cln.cyberzombie`
- Dezba — p. 124 — `cln.dezba`
- Donovan Pyke — p. 121 — `cln.donovan-pyke`
- Eddie Wei — p. 122 — `cln.eddie-wei`
- Fear the Dark Terrorist — p. 95 — `cln.fear-the-dark-terrorist`
- First Union — p. 78 — `cln.first-union`
- Forum Politician — p. 20 — `cln.forum-politician`
- Freedom Network Johnson — p. 20 — `cln.freedom-network-johnson`
- GreenWar Eco-Warrior — p. 37 — `cln.greenwar-eco-warrior`
- GreenWar Hunter Adept — p. 37 — `cln.greenwar-hunter-adept`
- GreenWar Radical Eco-Shaman — p. 37 — `cln.greenwar-radical-eco-shaman`
- Grey Cell Adept Operator — p. 52 — `cln.grey-cell-adept-operator`
- Grey Cell Face — p. 53 — `cln.grey-cell-face`
- Grey Cell Handler — p. 53 — `cln.grey-cell-handler`
- Grey Cell Operator — p. 52 — `cln.grey-cell-operator`
- Grey Cell Watcher/decker — p. 52 — `cln.grey-cell-watcher-decker`
- Grey Cell Watcher/investigator — p. 52 — `cln.grey-cell-watcher-investigator`
- Institute Researcher — p. 20 — `cln.institute-researcher`
- Juanita Dasilva — p. 124 — `cln.juanita-dasilva`
- Jules Veldmeijer — p. 21 — `cln.jules-veldmeijer`
- Komon surgeon — p. 158 — `cln.komon-surgeon`
- Kyodai — p. 158 — `cln.kyodai`
- K’air’k — p. 110 — `cln.kairk`
- Lucas Moller — p. 21 — `cln.lucas-moller`
- Magical Researcher — p. 53 — `cln.magical-researcher`
- Mako — p. 110 — `cln.mako`
- Mr. Dufresne — p. 123 — `cln.mr-dufresne`
- Ms. Snow — p. 122 — `cln.ms-snow`
- Ordo Arcanoarchaeologist — p. 96 — `cln.ordo-arcanoarchaeologist`
- Ordo Field Operative — p. 95 — `cln.ordo-field-operative`
- Ordo Splatterpunks — p. 95 — `cln.ordo-splatterpunks`
- Popular Will Lieutenant — p. 20 — `cln.popular-will-lieutenant`
- Popular Will Thug — p. 20 — `cln.popular-will-thug`
- STV Fixer — p. 139 — `cln.stv-fixer`
- STV Mage-Lawyer — p. 140 — `cln.stv-mage-lawyer`
- STV Spider — p. 139 — `cln.stv-spider`
- Selena Juarez — p. 110 — `cln.selena-juarez`
- So-honbucho — p. 159 — `cln.so-honbucho`
- Wakagashira — p. 158 — `cln.wakagashira`

#### Shadowrun: Deadly Arts

**ammotypes** (1)

- Small caliber railgun ammo — p. 61 — `da.small-caliber-railgun-ammo`

**armor** (1)

- PAG — p. 176 — `da.pag`

**augmentations** (12)

- Buzzsaw — p. 44 — `da.buzzsaw`
- Cattle Prod — p. 44 — `da.cattle-prod`
- Electrocutioner — p. 44 — `da.electrocutioner`
- Extreme Cyberattack — p. 45 — `da.extreme-cyberattack`
- Four Thousand Newtons — p. 45 — `da.four-thousand-newtons`
- Meat Grinder — p. 45 — `da.meat-grinder`
- Red-Hot Poker — p. 45 — `da.red-hot-poker`
- Starting Extreme Cybernetic Weapon (No Features) — p. 45 — `da.starting-extreme-cybernetic-weapon-no-features`
- The Original Claw — p. 45 — `da.the-original-claw`
- The Wrecking Crew — p. 45 — `da.the-wrecking-crew`
- Wicked Flail — p. 45 — `da.wicked-flail`
- Wild Wave — p. 45 — `da.wild-wave`

**gear** (15)

- 1,500-meter control wire spools — p. 58 — `da.1-500-meter-control-wire-spools`
- 5,000-meter control wire spools — p. 58 — `da.5-000-meter-control-wire-spools`
- AC — p. 140 — `da.ac`
- Ballista II Rocket — p. 58 — `da.ballista-ii-rocket`
- Carl Gustaf Shell — p. 58 — `da.carl-gustaf-shell`
- Guided Missile Option for Class 0 Rockets — p. 58 — `da.guided-missile-option-for-class-0-rockets`
- Linear Kinetic Ammunition (LK4) — p. 149 — `da.linear-kinetic-ammunition-lk4`
- MG — p. 140 — `da.mg`
- Medkit Standard — p. 182 — `da.medkit-standard`
- Mortar Bombs (M80) — p. 142 — `da.mortar-bombs-m80`
- Northrop-Lockheed Pilum — p. 143 — `da.northrop-lockheed-pilum`
- Northrop-Lockheed Vespae — p. 143 — `da.northrop-lockheed-vespae`
- Warhead options (Guided) — p. 145 — `da.warhead-options-guided`
- Warhead options (Rocket Assist) — p. 145 — `da.warhead-options-rocket-assist`
- al-Assad Rocket — p. 58 — `da.al-assad-rocket`

**vehicledesign** (6)

- Additions — p. 152 — `da.additions`
- Dedicated Primary Weapons — p. 151 — `da.dedicated-primary-weapons`
- Inline Weapon Mount — p. 151 — `da.inline-weapon-mount`
- Open Weapon Mount — p. 151 — `da.open-weapon-mount`
- Turreted Weapon Mount — p. 151 — `da.turreted-weapon-mount`
- Weapon Profile Changes — p. 152 — `da.weapon-profile-changes`

**vehicles** (1)

- S-K Cyclops — p. 139 — `da.s-k-cyclops`

**weapons** (11)

- Ares Inferno (when link fired) — p. 55 — `da.ares-inferno-when-link-fired`
- Garrote — p. 42 — `da.garrote`
- Grenade Launchers — p. 56 — `da.grenade-launchers`
- Knife — p. 47 — `da.knife`
- One-hand — p. 47 — `da.one-hand`
- Pike — p. 47 — `da.pike`
- S-K Kali Vajra Particle Cannon (experimental) — p. 139 — `da.s-k-kali-vajra-particle-cannon-experimental`
- Shotgun — p. 50 — `da.shotgun`
- Spear — p. 47 — `da.spear`
- Urumi Sword — p. 43 — `da.urumi-sword`
- War Fan (Offensive) — p. 43 — `da.war-fan-offensive`

#### Shadowrun: Dealers of Death

**gear** (3)

- Black Mamba — p. 18 — `dod.black-mamba`
- Deathrattle — p. 18 — `dod.deathrattle`
- Dog Asp — p. 18 — `dod.dog-asp`

**lifemodules** (4)

- Assassin/Hitman — p. 12 — `dod.assassin-hitman`
- Event: Brush With Death — p. 13 — `dod.event-brush-with-death`
- Event: High Profile Hit Went Wrong — p. 13 — `dod.event-high-profile-hit-went-wrong`
- Training Camp — p. 12 — `dod.training-camp`

**weapons** (1)

- Sword Cane Scabbard — p. 14 — `dod.mortimer-of-london-weapon-cane-sword-cane-scabbard`

#### Shadowrun: Double Clutch

**augmentations** (3)

- Control rig — p. 145 — `dc.control-rig`
- RCC — p. 145 — `dc.rcc`
- RCC Headware — p. 145 — `dc.rcc-headware`

**contacts** (1)

- Chop Shop Owner — p. 166 — `dc.chop-shop-owner`

**gear** (21)

- Ceramic Plate — p. 133 — `dc.ceramic-plate`
- Facility <Type> — p. 162 — `dc.facility-type`
- Facility Rental — p. 162 — `dc.facility-rental`
- Large Turreted Weapon Mount — p. 142 — `dc.large-turreted-weapon-mount`
- Large Weapon Mount — p. 142 — `dc.large-weapon-mount`
- Off-Road Tires — p. 121 — `dc.off-road-tires`
- Pilot Mods — p. 141 — `dc.pilot-mods`
- Racing Tires — p. 122 — `dc.racing-tires`
- Rigger Interface — p. 141 — `dc.rigger-interface`
- Run-Flat Tires — p. 122 — `dc.run-flat-tires`
- Shop <Type> — p. 162 — `dc.shop-type`
- Shop Rental — p. 162 — `dc.shop-rental`
- Shredders — p. 122 — `dc.shredders`
- Small Turreted Weapon Mount — p. 142 — `dc.small-turreted-weapon-mount`
- Smart Tires — p. 122 — `dc.smart-tires`
- Spike Strip — p. 121 — `dc.spike-strip`
- Standard Turreted Weapon Mount — p. 142 — `dc.standard-turreted-weapon-mount`
- Toolkit <Type> — p. 162 — `dc.toolkit-type`
- Tracking Strip — p. 121 — `dc.tracking-strip`
- Vehicle Schematic/Plan — p. 162 — `dc.vehicle-schematic-plan`
- Zapper Strip — p. 121 — `dc.zapper-strip`

**npcs** (1)

- Chop Shop Owner — p. 166 — `dc.chop-shop-owner`

**programs** (1)

- Cracking (Electronic Warfare) — p. 145 — `dc.cracking-electronic-warfare`

**vehicles** (3)

- Cyberspace Designs Tamodachi — p. 94 — `dc.cyberspace-designs-tamodachi`
- Dodge Rampart LEV — p. 28 — `dc.dodge-rampart-lev`
- Ford Dasher Interceptor — p. 28 — `dc.ford-dasher-interceptor`

#### Shadowrun: Firing Squad

**armor** (6)

- Quick-Draw Holster — p. 55 — `fs.quick-draw-holster`
- Rapid Transit (Basic) — p. 51 — `fs.rapid-transit-basic`
- Rapid Transit (Diamond) — p. 51 — `fs.rapid-transit-diamond`
- Rapid Transit (Elite) — p. 51 — `fs.rapid-transit-elite`
- Rapid Transit (Platinum) — p. 51 — `fs.rapid-transit-platinum`
- Synergist Business Line — p. 55 — `fs.vashon-island-synergist-business-line`

**gear** (2)

- Crimson wasp battery — p. 44 — `fs.crimson-wasp-battery`
- Red fox battery — p. 44 — `fs.red-fox-battery`

**npcs** (32)

- Adept Infiltrator — p. 150 — `fs.adept-infiltrator`
- Centurion — p. 140 — `fs.centurion`
- Corner Dealer — p. 148 — `fs.corner-dealer`
- Detective Mage — p. 138 — `fs.detective-mage`
- Eagle Security — p. 140 — `fs.eagle-security`
- Firewatch — p. 137 — `fs.firewatch`
- Gunner — p. 145 — `fs.gunner`
- Hard Corps Security — p. 139 — `fs.hard-corps-security`
- Humanis Cyber Soldier — p. 142 — `fs.humanis-cyber-soldier`
- Humanis Decker — p. 143 — `fs.humanis-decker`
- Humanis General — p. 144 — `fs.humanis-general`
- Humanis Paramilitary Rigger — p. 143 — `fs.humanis-paramilitary-rigger`
- Humanis Paramilitary Sergeant — p. 142 — `fs.humanis-paramilitary-sergeant`
- Legbreaker — p. 148 — `fs.legbreaker`
- Long Gun — p. 150 — `fs.long-gun`
- Mage — p. 145 — `fs.mage`
- Mage Corps — p. 136 — `fs.mage-corps`
- Master of the Flame — p. 147 — `fs.master-of-the-flame`
- Minuteman Security — p. 140 — `fs.minuteman-security`
- Molotov — p. 147 — `fs.molotov`
- Negotiator — p. 148 — `fs.negotiator`
- Neophyte — p. 146 — `fs.neophyte`
- Petrovski Security — p. 141 — `fs.petrovski-security`
- Racer — p. 145 — `fs.racer`
- SWAT Doorkicker — p. 136 — `fs.swat-doorkicker`
- Shadowrider — p. 137 — `fs.shadowrider`
- Shaman — p. 149 — `fs.shaman`
- Social Adept Assassin — p. 150 — `fs.social-adept-assassin`
- Traditionalist — p. 149 — `fs.traditionalist`
- Warrior — p. 148 — `fs.warrior`
- Wolverine Security — p. 138 — `fs.wolverine-security`
- Young Buck — p. 149 — `fs.young-buck`

**qualities** (3)

- Addiction — p. 132 — `fs.addiction`
- Conscientious Fighter — p. 133 — `fs.conscientious-fighter`
- Immediate Aftermath — p. 132 — `fs.immediate-aftermath`

**qualitypaths** (1)

- Learning How to Deal — p. 134 — `fs.learning-how-to-deal`

**weapons** (17)

- AP Spikes — p. 65 — `fs.ap-spikes`
- Ash Arms Monofilament Combat Chainsaw — p. 14 — `fs.ash-arms-monofilament-combat-chainsaw`
- Cavalier-Parashield Emergency Responder (Dart Gun configuration) — p. 20 — `fs.cavalier-parashield-emergency-responder-dart-gun-configurati`
- Cougar collapsible staff/spear — p. 13 — `fs.cougar-collapsible-staff-spear`
- Crackshot Arms Thrust Grenade — p. 33 — `fs.crackshot-arms-thrust-grenade`
- Dassault Alpenstock (Knife configuration) — p. 13 — `fs.dassault-alpenstock-knife-configuration`
- Dassault Alpenstock (Spear configuration) — p. 13 — `fs.dassault-alpenstock-spear-configuration`
- Detachable blade — p. 13 — `fs.detachable-blade`
- Horizon-Flynn Defense-Com Weapons (Garrote) — p. 33 — `fs.horizon-flynn-defense-com-weapons-garrote`
- Horizon-Flynn Defense-Com Weapons (Hold-Out Pistol) — p. 33 — `fs.horizon-flynn-defense-com-weapons-hold-out-pistol`
- Izom Artemis (Grenade Launcher configuration) — p. 22 — `fs.izom-artemis-grenade-launcher-configuration`
- Kami (folding) — p. 12 — `fs.kami-folding`
- Kami (standard) — p. 12 — `fs.kami-standard`
- Krime Thumper (Shotgun configuration) — p. 35 — `fs.krime-thumper-shotgun-configuration`
- Onotari Arms War Hound (Shotgun configuration) — p. 24 — `fs.onotari-arms-war-hound-shotgun-configuration`
- RFID Tracker — p. 65 — `fs.rfid-tracker`
- Taser-Shock — p. 65 — `fs.taser-shock`

#### Shadowrun: Hack & Slash

**actions** (1)

- new matrix action: scapegoat — p. 164 — `hs.new-matrix-action-scapegoat`

**gear** (16)

- 50m Cable Spool — p. 44 — `hs.50m-cable-spool`
- ASDF Augmentation — p. 126 — `hs.asdf-augmentation`
- ASDF Overclocking — p. 126 — `hs.asdf-overclocking`
- Attack Module (Rating 9) — p. 39 — `hs.attack-module-rating-9`
- Bricks — p. 53 — `hs.bricks`
- Bricks — p. 53 — `hs.bricks-2`
- Bricks — p. 53 — `hs.bricks-3`
- Bricks — p. 53 — `hs.bricks-4`
- Cerebropathic — p. 168 — `hs.cerebropathic`
- Eraser — p. 168 — `hs.eraser`
- Infection — p. 168 — `hs.infection`
- Link Glove — p. 44 — `hs.link-glove`
- Matrix Relay (Rating 10+) — p. 44 — `hs.matrix-relay-rating-10`
- Nonlethal Black IC — p. 168 — `hs.nonlethal-black-ic`
- Psychotropic — p. 168 — `hs.psychotropic`
- Sleaze Module (Rating 9) — p. 39 — `hs.sleaze-module-rating-9`

**metatypes** (1)

- Exo-AI — p. 117 — `hs.exo-ai`

**npcs** (4)

- GOD Operative — p. 166 — `hs.god-operative`
- Lesser DemiGOD — p. 166 — `hs.lesser-demigod`
- Security Spider — p. 166 — `hs.security-spider`
- Security Spider Lieutenant — p. 166 — `hs.security-spider-lieutenant`

**programs** (5)

- Fade Value — p. 64 — `hs.fade-value`
- Nope! — p. 57 — `hs.nope`
- P-ICE — p. 57 — `hs.p-ice`
- Spines — p. 57 — `hs.spines`
- Watchdog — p. 57 — `hs.watchdog`

**qualities** (2)

- Aspect Peripheral — p. 131 — `hs.aspect-peripheral`
- Neuromorphism — p. 129 — `hs.neuromorphism`

**vehicles** (1)

- Malakim / Ophanim Drone (large rotor drone) — p. 168 — `hs.malakim-ophanim-drone-large-rotor-drone`

#### Shadowrun: Lofwyr's Legions

**critterpowers** (4)

- Dual Natured — p. 19 — `ll.dual-natured`
- Elemental Attack (Fire) — p. 19 — `ll.elemental-attack-fire`
- Natural Weapon — p. 19 — `ll.natural-weapon`
- Unsteady Hands — p. 20 — `ll.unsteady-hands`

**npcs** (10)

- Arrogant Saeder-Krupp Prime Assassin — p. 12 — `ll.arrogant-saeder-krupp-prime-assassin`
- Cocky Saeder-Krupp Prime Security Decker — p. 7 — `ll.cocky-saeder-krupp-prime-security-decker`
- Dangerous Saeder-Krupp Security Special Group Troubleshooter — p. 14 — `ll.dangerous-saeder-krupp-security-special-group-troubleshooter`
- Determined Saeder-Krupp Middle Executive (Lt) — p. 6 — `ll.determined-saeder-krupp-middle-executive-lt`
- Doorkicking Saeder-Krupp Prime Tactical Officer — p. 11 — `ll.doorkicking-saeder-krupp-prime-tactical-officer`
- Hotshot Saeder-Krupp Researcher — p. 5 — `ll.hotshot-saeder-krupp-researcher`
- Loyal Saeder-Krupp Executive Protection Agent — p. 9 — `ll.loyal-saeder-krupp-executive-protection-agent`
- Reliable Saeder-Krupp Prime Combat Hermetic Mage — p. 13 — `ll.reliable-saeder-krupp-prime-combat-hermetic-mage`
- Veteran Saeder-Krupp Prime Espionage Operative — p. 10 — `ll.veteran-saeder-krupp-prime-espionage-operative`
- Veteran Saeder-Krupp Security Guard — p. 8 — `ll.veteran-saeder-krupp-security-guard`

**qualities** (2)

- Latent Drake — p. 16 — `ll.latent-drake`
- Mightiest of Slaves — p. 22 — `ll.mightiest-of-slaves`

#### Shadowrun: No Future

**augmentations** (3)

- Audio Enhancement — p. 160 — `nf.audio-enhancement`
- AudioTune (Hacked) — p. 160 — `nf.audiotune-hacked`
- Vision Enhancement — p. 160 — `nf.vision-enhancement`

#### Shadowrun: Power Plays

**qualities** (1)

- Evo In — p. 71 — `pwp.evo-in`

#### Shadowrun: Shadow Cast

**qualities** (17)

- Alt/Morphinae — p. 85 — `shc.alt-morphinae`
- Back on the Horse — p. 47 — `shc.back-on-the-horse`
- Control/Apophenian — p. 85 — `shc.control-apophenian`
- Day Job — p. 161 — `shc.day-job`
- Delete/Erisian — p. 85 — `shc.delete-erisian`
- Enemy — p. 161 — `shc.enemy`
- Evaluating Humanity — p. 64 — `shc.evaluating-humanity`
- Getting the Word Out — p. 48 — `shc.getting-the-word-out`
- Ghost Town — p. 57 — `shc.ghost-town`
- Inevitable Challenges and Challengers — p. 168 — `shc.inevitable-challenges-and-challengers`
- Learning Too Fast — p. 68 — `shc.learning-too-fast`
- Losing Balance — p. 63 — `shc.losing-balance`
- Making One’s Mark — p. 167 — `shc.making-ones-mark`
- Playing It Cool (Optional) — p. 48 — `shc.playing-it-cool-optional`
- Rehab Blues — p. 68 — `shc.rehab-blues`
- To the Victor Go the Spoils — p. 122 — `shc.to-the-victor-go-the-spoils`
- What Can Be Taken Away — p. 121 — `shc.what-can-be-taken-away`

**qualitypaths** (30)

- Alchemical Gadgeteer — p. 58 — `shc.alchemical-gadgeteer`
- Astral Traveler — p. 14 — `shc.astral-traveler`
- Back in the Game — p. 47 — `shc.back-in-the-game`
- Best of The Best — p. 167 — `shc.best-of-the-best`
- Blood Pressure — p. 41 — `shc.blood-pressure`
- Combat Coordination — p. 93 — `shc.combat-coordination`
- Crime Magic — p. 15 — `shc.crime-magic`
- Cruel and Unusual — p. 25 — `shc.cruel-and-unusual`
- Dissonant Technomancer — p. 84 — `shc.dissonant-technomancer`
- Distant Past and Bleeding Present — p. 41 — `shc.distant-past-and-bleeding-present`
- Eagle-eyed Detective — p. 103 — `shc.eagle-eyed-detective`
- Eagles Ex Machina — p. 105 — `shc.eagles-ex-machina`
- Enmity of a Dragon — p. 16 — `shc.enmity-of-a-dragon`
- Home Sweet Home — p. 33 — `shc.home-sweet-home`
- I am the fortress — p. 77 — `shc.i-am-the-fortress`
- Mac the Wrench — p. 94 — `shc.mac-the-wrench`
- Mage Hunter — p. 14 — `shc.mage-hunter`
- Mama Bear — p. 76 — `shc.mama-bear`
- Panopticon — p. 77 — `shc.panopticon`
- Polite, Efficient — p. 26 — `shc.polite-efficient`
- Pulse — p. 41 — `shc.pulse`
- Purifier — p. 104 — `shc.purifier`
- Shamanic Hooder — p. 57 — `shc.shamanic-hooder`
- Street Medicine — p. 160 — `shc.street-medicine`
- Tactics — p. 161 — `shc.tactics`
- Talismonger’s Best Friend — p. 16 — `shc.talismongers-best-friend`
- The Bad Beat — p. 128 — `shc.the-bad-beat`
- Trickster Spirit — p. 56 — `shc.trickster-spirit`
- What is Most Sacred — p. 121 — `shc.what-is-most-sacred`
- Worse Things Than Me — p. 26 — `shc.worse-things-than-me`

#### Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go

**critters** (8)

- Afanc — p. 24 — `sif-no.afanc`
- Behemoth — p. 24 — `sif-no.behemoth`
- Boobrie — p. 24 — `sif-no.boobrie`
- Corpselight — p. 25 — `sif-no.corpselight`
- Devil Jack Diamond — p. 25 — `sif-no.devil-jack-diamond`
- Hell Hog — p. 26 — `sif-no.hell-hog`
- Snap Dragon — p. 26 — `sif-no.snap-dragon`
- Tylosaur — p. 26 — `sif-no.tylosaur`

**gear** (2)

- Ammunition — p. 26 — `sif-no.ammunition`
- Regular — p. 27 — `sif-no.regular`

**lifemodules** (1)

- Religious Figure — p. 31 — `sif-no.religious-figure`

**npcs** (2)

- Colo Colo — p. 25 — `sif-no.colo-colo`
- Red Tide Follower — p. 24 — `sif-no.red-tide-follower`

#### Shadowrun: Sixth World Companion

**actions** (9)

- Don’t Gaslight Me! — p. 157 — `swc.dont-gaslight-me`
- False Equivalence — p. 157 — `swc.false-equivalence`
- It’s A Dud! — p. 144 — `swc.its-a-dud`
- Reckless Tactics — p. 159 — `swc.reckless-tactics`
- Shotgun Choke — p. 144 — `swc.shotgun-choke`
- Silent Takedown — p. 144 — `swc.silent-takedown`
- Spell Adjustments — p. 159 — `swc.spell-adjustments`
- Through and Through — p. 144 — `swc.through-and-through`
- Untrained Skill Tests — p. 159 — `swc.untrained-skill-tests`

**contacts** (34)

- Armorer — p. 164 — `swc.armorer`
- Arms Dealer — p. 164 — `swc.arms-dealer`
- Artificer — p. 165 — `swc.artificer`
- Bartender — p. 162 — `swc.bartender`
- Beat Cop — p. 163 — `swc.beat-cop`
- Bounty Hunter — p. 165 — `swc.bounty-hunter`
- Chemist — p. 165 — `swc.chemist`
- City Worker — p. 166 — `swc.city-worker`
- Cleaner — p. 166 — `swc.cleaner`
- College Professor — p. 166 — `swc.college-professor`
- Corporate Wageslave — p. 166 — `swc.corporate-wageslave`
- Deckmeister — p. 167 — `swc.deckmeister`
- Entertainer — p. 167 — `swc.entertainer`
- Fixer — p. 163 — `swc.fixer`
- Ganger — p. 167 — `swc.ganger`
- Government Official — p. 168 — `swc.government-official`
- Hitman — p. 168 — `swc.hitman`
- ID Manufacturer — p. 168 — `swc.id-manufacturer`
- Lawyer — p. 169 — `swc.lawyer`
- Lorekeeper — p. 169 — `swc.lorekeeper`
- Mafia Consigliere — p. 163 — `swc.mafia-consigliere`
- Mechanic — p. 163 — `swc.mechanic`
- Mr. Johnson — p. 164 — `swc.mr-johnson`
- News Reporter — p. 169 — `swc.news-reporter`
- Pickpocket — p. 170 — `swc.pickpocket`
- Policlub Member — p. 170 — `swc.policlub-member`
- Safehouse Master — p. 170 — `swc.safehouse-master`
- Sensei — p. 171 — `swc.sensei`
- Smuggler — p. 171 — `swc.smuggler`
- Soldier — p. 171 — `swc.soldier`
- Squatter — p. 172 — `swc.squatter`
- Store Owner — p. 172 — `swc.store-owner`
- Street Doc — p. 164 — `swc.street-doc`
- Talismonger — p. 164 — `swc.talismonger`

**critterpowers** (4)

- Adaptive Coloration — p. 114 — `swc.adaptive-coloration`
- Corrosive Secretion — p. 114 — `swc.corrosive-secretion`
- Desire Reflection — p. 114 — `swc.desire-reflection`
- Sharpened Natural Weapon — p. 114 — `swc.sharpened-natural-weapon`

**lifemodules** (87)

- Academy Training — p. 33 — `swc.academy-training`
- Activist — p. 33 — `swc.activist`
- Adept Training — p. 33 — `swc.adept-training`
- Agent — p. 33 — `swc.agent`
- Alchemist — p. 33 — `swc.alchemist`
- Artifact Hunter — p. 34 — `swc.artifact-hunter`
- Artist — p. 34 — `swc.artist`
- Astral Explorations — p. 34 — `swc.astral-explorations`
- Athlete — p. 34 — `swc.athlete`
- Barista/Bartender — p. 34 — `swc.barista-bartender`
- Black Star Neo-Anarchist — p. 34 — `swc.black-star-neo-anarchist`
- Blue-Collar Laborer — p. 35 — `swc.blue-collar-laborer`
- Bodyguard — p. 35 — `swc.bodyguard`
- Born This Way — p. 32 — `swc.born-this-way`
- Bounty Hunter — p. 35 — `swc.bounty-hunter`
- Celebrity — p. 35 — `swc.celebrity`
- Charlatan — p. 35 — `swc.charlatan`
- Clairvoyant — p. 35 — `swc.clairvoyant`
- Coach/Trainer — p. 36 — `swc.coach-trainer`
- College/University — p. 36 — `swc.college-university`
- Coming of Age: Early Adult and the Transition to Adulthood — p. 32 — `swc.coming-of-age-early-adult-and-the-transition-to-adulthood`
- Cook/Chef — p. 36 — `swc.cook-chef`
- Counter-Hacker — p. 36 — `swc.counter-hacker`
- Courier — p. 36 — `swc.courier`
- Covert Ops — p. 37 — `swc.covert-ops`
- Data Liberator — p. 37 — `swc.data-liberator`
- Demolitions Expert — p. 37 — `swc.demolitions-expert`
- Detective — p. 37 — `swc.detective`
- Drone Technician — p. 38 — `swc.drone-technician`
- Engineer — p. 38 — `swc.engineer`
- Entertainer — p. 38 — `swc.entertainer`
- Entrepreneur — p. 38 — `swc.entrepreneur`
- Event: You became extremely interested in unusual or mysterious topics — p. 47 — `swc.event-you-became-extremely-interested-in-unusual-or-mysterio`
- Event: You benefited from the influence of a mentor — p. 47 — `swc.event-you-benefited-from-the-influence-of-a-mentor`
- Event: You came into a large sum of money — p. 47 — `swc.event-you-came-into-a-large-sum-of-money`
- Event: You could have averted something bad that happened, if only you had the right skills or knowledge at the time — p. 47 — `swc.event-you-could-have-averted-something-bad-that-happened-if-`
- Event: You got away with a lucrative theft — p. 47 — `swc.event-you-got-away-with-a-lucrative-theft`
- Event: You learned a harsh truth about the world — p. 46 — `swc.event-you-learned-a-harsh-truth-about-the-world`
- Event: You struggled through some tough times — p. 46 — `swc.event-you-struggled-through-some-tough-times`
- Event: You survived a lifethreatening event, but only because you happened to have just the right piece of gear — p. 48 — `swc.event-you-survived-a-lifethreatening-event-but-only-because-`
- Event: You were overwhelmed, but things worked out — p. 47 — `swc.event-you-were-overwhelmed-but-things-worked-out`
- Event: Your body was pushed to its limits — p. 47 — `swc.event-your-body-was-pushed-to-its-limits`
- Event: Your hard work paid off — p. 46 — `swc.event-your-hard-work-paid-off`
- Farmer — p. 38 — `swc.farmer`
- Financial Services Broker — p. 38 — `swc.financial-services-broker`
- Fixer — p. 39 — `swc.fixer`
- Growing Up: Early Childhood and Adolescence — p. 32 — `swc.growing-up-early-childhood-and-adolescence`
- Guide — p. 39 — `swc.guide`
- Hacker — p. 40 — `swc.hacker`
- Hunter — p. 40 — `swc.hunter`
- Intern — p. 40 — `swc.intern`
- Investigator — p. 40 — `swc.investigator`
- Janitor — p. 41 — `swc.janitor`
- Journalist — p. 41 — `swc.journalist`
- Lawyer — p. 41 — `swc.lawyer`
- Magical Studies — p. 41 — `swc.magical-studies`
- Martial Arts Training — p. 41 — `swc.martial-arts-training`
- Matrix Security — p. 41 — `swc.matrix-security`
- Matrix Vandal — p. 42 — `swc.matrix-vandal`
- Mechanic — p. 42 — `swc.mechanic`
- Medical Doctor — p. 42 — `swc.medical-doctor`
- Mentor — p. 42 — `swc.mentor`
- Military — p. 42 — `swc.military`
- Nurse — p. 42 — `swc.nurse`
- Office Manager — p. 42 — `swc.office-manager`
- Organized Crime — p. 43 — `swc.organized-crime`
- Patrol Cop — p. 43 — `swc.patrol-cop`
- Politician — p. 43 — `swc.politician`
- Professor — p. 43 — `swc.professor`
- Public Transit Operator — p. 43 — `swc.public-transit-operator`
- Research Scientist — p. 43 — `swc.research-scientist`
- Rigger — p. 44 — `swc.rigger`
- Salesperson — p. 44 — `swc.salesperson`
- Security Guard — p. 44 — `swc.security-guard`
- Security Mage — p. 44 — `swc.security-mage`
- Servant — p. 44 — `swc.servant`
- Shadowrunner — p. 44 — `swc.shadowrunner`
- Small Business Owner — p. 45 — `swc.small-business-owner`
- Smuggler — p. 45 — `swc.smuggler`
- Street Shaman — p. 45 — `swc.street-shaman`
- Stuffer Shack Clerk — p. 45 — `swc.stuffer-shack-clerk`
- Talismonger — p. 45 — `swc.talismonger`
- Technical School — p. 45 — `swc.technical-school`
- Technomancer — p. 45 — `swc.technomancer`
- Think Tank — p. 46 — `swc.think-tank`
- Traveler — p. 46 — `swc.traveler`
- Veterinarian — p. 46 — `swc.veterinarian`

**npcs** (26)

- Armorer — p. 164 — `swc.armorer`
- Arms Dealer — p. 164 — `swc.arms-dealer`
- Artificer — p. 165 — `swc.artificer`
- Bounty Hunter — p. 165 — `swc.bounty-hunter`
- Chemist — p. 165 — `swc.chemist`
- City Worker — p. 166 — `swc.city-worker`
- Cleaner — p. 166 — `swc.cleaner`
- College Professor — p. 166 — `swc.college-professor`
- Corporate Wageslave — p. 166 — `swc.corporate-wageslave`
- Deckmeister — p. 167 — `swc.deckmeister`
- Entertainer — p. 167 — `swc.entertainer`
- Ganger — p. 167 — `swc.ganger`
- Government Official — p. 168 — `swc.government-official`
- Hitman — p. 168 — `swc.hitman`
- ID Manufacturer — p. 168 — `swc.id-manufacturer`
- Lawyer — p. 169 — `swc.lawyer`
- Lorekeeper — p. 169 — `swc.lorekeeper`
- News Reporter — p. 169 — `swc.news-reporter`
- Pickpocket — p. 170 — `swc.pickpocket`
- Policlub Member — p. 170 — `swc.policlub-member`
- Safehouse Master — p. 170 — `swc.safehouse-master`
- Sensei — p. 171 — `swc.sensei`
- Smuggler — p. 171 — `swc.smuggler`
- Soldier — p. 171 — `swc.soldier`
- Squatter — p. 172 — `swc.squatter`
- Store Owner — p. 172 — `swc.store-owner`

**packs** (12)

- Ares Desert Strike (suppressor) — p. 58 — `swc.ares-desert-strike-suppressor`
- Ares Predator VI (concealable holster) — p. 57 — `swc.ares-predator-vi-concealable-holster`
- Armed Range Rover Model 2080 — p. 66 — `swc.armed-range-rover-model-2080`
- Colt Manhunter (concealable holster) — p. 57 — `swc.colt-manhunter-concealable-holster`
- Dirty Tricks Vehicle — p. 71 — `swc.dirty-tricks-vehicle`
- Gun Ports Vehicle — p. 71 — `swc.gun-ports-vehicle`
- Heavy Anthro Drone — p. 68 — `swc.heavy-anthro-drone`
- Light Anthro Drone — p. 68 — `swc.light-anthro-drone`
- Mossberg CMDT (internal smartgun system) — p. 57 — `swc.mossberg-cmdt-internal-smartgun-system`
- Onotari Interceptor — p. 58 — `swc.onotari-interceptor`
- Short-Barrel Defiance T-250 (external smartgun system) — p. 57 — `swc.short-barrel-defiance-t-250-external-smartgun-system`
- Stoner-Ares M202 — p. 58 — `swc.stoner-ares-m202`

**qualities** (8)

- Carrier — p. 114 — `swc.carrier`
- Cephalopod — p. 127 — `swc.cephalopod`
- Favored Weapon: Lost! — p. 141 — `swc.favored-weapon-lost`
- Lie Low — p. 141 — `swc.lie-low`
- Obsession: Momentous Misfortune — p. 140 — `swc.obsession-momentous-misfortune`
- Shut It Down — p. 142 — `swc.shut-it-down`
- This Is Fine … — p. 142 — `swc.this-is-fine`
- Transhumanism — p. 146 — `swc.transhumanism`

#### Shadowrun: Slip Streams

**critters** (2)

- Modern Druid — p. 134 — `sls.modern-druid`
- RazorRhino — p. 136 — `sls.razorrhino`

**npcs** (32)

- Astral Space Preservation Society Operative — p. 128 — `sls.astral-space-preservation-society-operative`
- Awakened Academic — p. 129 — `sls.awakened-academic`
- Az-Am War — p. 144 — `sls.az-am-war`
- Corp Troubleshooter — p. 131 — `sls.corp-troubleshooter`
- Corp Troubleshooter — p. 131 — `sls.corp-troubleshooter-2`
- Dis Apocalyptics — p. 129 — `sls.dis-apocalyptics`
- Dis Nativists — p. 129 — `sls.dis-nativists`
- Dis Traders — p. 129 — `sls.dis-traders`
- Dr. Alicia Fields, Antarctica Lab Researcher — p. 130 — `sls.dr-alicia-fields-antarctica-lab-researcher`
- Dr. Javier Watson, Veteran Arcanoarchaeologist — p. 130 — `sls.dr-javier-watson-veteran-arcanoarchaeologist`
- Freelance Journalist — p. 131 — `sls.freelance-journalist`
- Government Agent — p. 131 — `sls.government-agent`
- Government Agent — p. 131 — `sls.government-agent-2`
- III Corps Trooper — p. 143 — `sls.iii-corps-trooper`
- Kellan Colt — p. 132 — `sls.kellan-colt`
- Magical Investors Group Member — p. 132 — `sls.magical-investors-group-member`
- Magical researcher — p. 132 — `sls.magical-researcher`
- Milton Dunberry, Antarctica Lab Security — p. 133 — `sls.milton-dunberry-antarctica-lab-security`
- Modern Druid — p. 134 — `sls.modern-druid`
- Planesender — p. 134 — `sls.planesender`
- Private Investigator — p. 136 — `sls.private-investigator`
- Professional Cleaner — p. 135 — `sls.professional-cleaner`
- Professional Mercenary, Basic — p. 135 — `sls.professional-mercenary-basic`
- Professional Mercenary, heavy weapons expert — p. 135 — `sls.professional-mercenary-heavy-weapons-expert`
- Professional Mercenary, marksman — p. 136 — `sls.professional-mercenary-marksman`
- Professional Mercenary, sniper — p. 136 — `sls.professional-mercenary-sniper`
- Russian WW2 Sniper — p. 144 — `sls.russian-ww2-sniper`
- Sierra Leone Soldier — p. 143 — `sls.sierra-leone-soldier`
- Site 000 Security Trooper: Elite — p. 64 — `sls.site-000-security-trooper-elite`
- Site 000 Security Trooper: Magical Threat Response — p. 64 — `sls.site-000-security-trooper-magical-threat-response`
- Site 000 Security Trooper: Standard — p. 64 — `sls.site-000-security-trooper-standard`
- Stanley Wright — p. 137 — `sls.stanley-wright`

#### Shadowrun: Smooth Operations

**actions** (1)

- Zanshin — p. 47 — `so.zanshin`

**gear** (8)

- Basic — p. 89 — `so.basic`
- Free! — p. 89 — `so.free`
- Grooming (1 hour) — p. 118 — `so.grooming-1-hour`
- Grooming (2+ hours) — p. 118 — `so.grooming-2-hours`
- Premium — p. 89 — `so.premium`
- Single Use (Basic) — p. 89 — `so.single-use-basic`
- The Red Box — p. 126 — `so.the-red-box`
- VIP — p. 89 — `so.vip`

**qualities** (5)

- Contact Network — p. 168 — `so.contact-network`
- Façade — p. 45 — `so.fa-ade`
- Long Con Pool — p. 167 — `so.long-con-pool`
- Network Connections — p. 168 — `so.network-connections`
- Network Synergy — p. 168 — `so.network-synergy`

**qualitypaths** (2)

- Networking — p. 168 — `so.networking`
- Very Long Con — p. 166 — `so.very-long-con`

#### Shadowrun: Street Wyrd

**critterpowers** (4)

- Devouring — p. 162 — `sw.devouring`
- Pestilence — p. 164 — `sw.pestilence`
- Reinforcement — p. 162 — `sw.reinforcement`
- Skill Specialization — p. 55 — `sw.skill-specialization`

**gear** (1)

- New Metamagic Focus: Athame — p. 157 — `sw.new-metamagic-focus-athame`

**metamagics** (2)

- Augury and Sortilege ritual (Material Link) — p. 119 — `sw.augury-and-sortilege-ritual-material-link`
- New Metamagic: Sacrifice — p. 156 — `sw.new-metamagic-sacrifice`

**qualities** (2)

- Focused Channeling — p. 76 — `sw.focused-channeling`
- Spark of Brilliance — p. 76 — `sw.spark-of-brilliance`

**spellfeatures** (10)

- Area — p. 39 — `sw.area`
- Direct Combat — p. 25 — `sw.direct-combat`
- Environmental — p. 39 — `sw.environmental`
- Free — p. 66 — `sw.free`
- Great — p. 66 — `sw.great`
- Indirect Combat — p. 26 — `sw.indirect-combat`
- Multi-Sense — p. 33 — `sw.multi-sense`
- Realistic — p. 37 — `sw.realistic`
- Realistic Multi-sense — p. 36 — `sw.realistic-multi-sense`
- Single Sense — p. 33 — `sw.single-sense`

**spells** (8)

- Blast — p. 29 — `sw.blast`
- Clout — p. 29 — `sw.clout`
- Fireball — p. 26 — `sw.fireball`
- Flamestrike — p. 26 — `sw.flamestrike`
- Manaball — p. 25 — `sw.manaball`
- Manabolt — p. 25 — `sw.manabolt`
- Stunball/Sleep — p. 25 — `sw.stunball-sleep`
- Stunbolt — p. 25 — `sw.stunbolt`

**spirits** (6)

- Alphas (NPC monsters) — p. 165 — `sw.alphas-npc-monsters`
- Blood Spirit — p. 159 — `sw.blood-spirit`
- Caretaker — p. 164 — `sw.caretaker`
- Queen/Mother — p. 165 — `sw.queen-mother`
- Scout — p. 165 — `sw.scout`
- Soldier — p. 165 — `sw.soldier`

**traditions** (3)

- Classical Hermeticism — p. 112 — `sw.classical-hermeticism`
- Insect Tradition — p. 161 — `sw.insect-tradition`
- Shaman tradition — p. 109 — `sw.shaman-tradition`

#### Shadowrun: Tarnished Star

**armor** (9)

- Combat Helmet — p. 149 — `ts.combat-helmet`
- GAPS Heavy — p. 149 — `ts.gaps-heavy`
- GAPS Light — p. 149 — `ts.gaps-light`
- GAPS Medium — p. 149 — `ts.gaps-medium`
- Mk1 Tactical Shield — p. 148 — `ts.mk1-tactical-shield`
- Mk2 Riot Shield — p. 148 — `ts.mk2-riot-shield`
- Mk3 Deployable Barrier Shield — p. 148 — `ts.mk3-deployable-barrier-shield`
- Mk4 Folding Shield — p. 147 — `ts.mk4-folding-shield`
- Patrol Helmet — p. 149 — `ts.patrol-helmet`

**contacts** (17)

- Client Support — p. 164 — `ts.client-support`
- Crime Prevention Specialist — p. 164 — `ts.crime-prevention-specialist`
- Crime Scene Investigator (Awakened, Shaman) — p. 167 — `ts.crime-scene-investigator-awakened-shaman`
- Crime Scene Investigator (matrix) — p. 167 — `ts.crime-scene-investigator-matrix`
- Crime Scene Investigator (mundane) — p. 167 — `ts.crime-scene-investigator-mundane`
- Crime analyst — p. 164 — `ts.crime-analyst`
- Crisis Negotiator — p. 166 — `ts.crisis-negotiator`
- First Responder — p. 165 — `ts.first-responder`
- Fish and Game Warden — p. 168 — `ts.fish-and-game-warden`
- Fleet Manager — p. 165 — `ts.fleet-manager`
- Hostage Rescue Team (Magician) — p. 168 — `ts.hostage-rescue-team-magician`
- Hostage Rescue Team (matrix) — p. 168 — `ts.hostage-rescue-team-matrix`
- Hostage Rescue Team (mundane) — p. 168 — `ts.hostage-rescue-team-mundane`
- Matrix Emergency Help Specialist — p. 165 — `ts.matrix-emergency-help-specialist`
- Public Defender — p. 166 — `ts.public-defender`
- Records Clerk — p. 166 — `ts.records-clerk`
- Vice/Undercover Officer — p. 169 — `ts.vice-undercover-officer`

**gear** (9)

- Full-Body Scanner Booth — p. 150 — `ts.full-body-scanner-booth`
- Full-Body Scanner Portable — p. 150 — `ts.full-body-scanner-portable`
- Full-Body Scanner Wall Mount — p. 150 — `ts.full-body-scanner-wall-mount`
- Knight Errant Badgecam — p. 149 — `ts.knight-errant-badgecam`
- Lone Star Badgecam — p. 149 — `ts.lone-star-badgecam`
- Neo-PD Badgecam — p. 149 — `ts.neo-pd-badgecam`
- Shadowmarket solvent spray — p. 147 — `ts.shadowmarket-solvent-spray`
- Trauma Response System (Advanced) refill — p. 149 — `ts.trauma-response-system-advanced-refill`
- Trauma Response System (Basic) refill — p. 149 — `ts.trauma-response-system-basic-refill`

**npcs** (29)

- Armed Security — p. 170 — `ts.armed-security`
- Client Support — p. 164 — `ts.client-support`
- Crime Prevention Specialist — p. 164 — `ts.crime-prevention-specialist`
- Crime Scene Investigator (Awakened, Shaman) — p. 167 — `ts.crime-scene-investigator-awakened-shaman`
- Crime Scene Investigator (matrix) — p. 167 — `ts.crime-scene-investigator-matrix`
- Crime Scene Investigator (mundane) — p. 167 — `ts.crime-scene-investigator-mundane`
- Crime analyst — p. 164 — `ts.crime-analyst`
- Crisis Negotiator — p. 166 — `ts.crisis-negotiator`
- Detective — p. 160 — `ts.detective`
- First Responder — p. 165 — `ts.first-responder`
- Fish and Game Warden — p. 168 — `ts.fish-and-game-warden`
- Fleet Manager — p. 165 — `ts.fleet-manager`
- Hostage Rescue Team (Magician) — p. 168 — `ts.hostage-rescue-team-magician`
- Hostage Rescue Team (matrix) — p. 168 — `ts.hostage-rescue-team-matrix`
- Hostage Rescue Team (mundane) — p. 168 — `ts.hostage-rescue-team-mundane`
- Inexperienced Patrol Officer — p. 170 — `ts.inexperienced-patrol-officer`
- Matrix Emergency Help Specialist — p. 165 — `ts.matrix-emergency-help-specialist`
- New Corporate Spider — p. 170 — `ts.new-corporate-spider`
- Personal bodyguard — p. 172 — `ts.personal-bodyguard`
- Public Defender — p. 166 — `ts.public-defender`
- Records Clerk — p. 166 — `ts.records-clerk`
- SWAT Surveillance Rigger — p. 163 — `ts.swat-surveillance-rigger`
- Seasoned Patrol Officer — p. 161 — `ts.seasoned-patrol-officer`
- Seasoned Patrol Officer — p. 170 — `ts.seasoned-patrol-officer-2`
- Security agent — p. 172 — `ts.security-agent`
- Special Agent, High-Value Detainee Interrogation Group (Awakened) — p. 162 — `ts.special-agent-high-value-detainee-interrogation-group-awaken`
- Unarmed Security — p. 170 — `ts.unarmed-security`
- Vice/Undercover Officer — p. 169 — `ts.vice-undercover-officer`
- Watchguard — p. 169 — `ts.watchguard`

**weapons** (2)

- Mk1 Tactical Shield — p. 148 — `ts.mk1-tactical-shield`
- Mk2 Riot Shield — p. 148 — `ts.mk2-riot-shield`

#### Shadowrun: The Kechibi Code

**critters** (1)

- Devil Jack Diamond — p. 132 — `tkc.devil-jack-diamond`

**gear** (2)

- Glasses (full wrap) — p. 87 — `tkc.glasses-full-wrap`
- Visor (for helmets) — p. 87 — `tkc.visor-for-helmets`

**npcs** (49)

- Agano Kuniko — p. 114 — `tkc.agano-kuniko`
- Ai He Feng — p. 88 — `tkc.ai-he-feng`
- Allen — p. 134 — `tkc.allen`
- Alta — p. 141 — `tkc.alta`
- Areynn de Catelano — p. 58 — `tkc.areynn-de-catelano`
- Ayeowo — p. 50 — `tkc.ayeowo`
- Bando Keita — p. 115 — `tkc.bando-keita`
- Becky Wu Ping — p. 89 — `tkc.becky-wu-ping`
- Bessil “Slick” Sokeke — p. 60 — `tkc.bessil-slick-sokeke`
- Bintana Obukanwe — p. 49 — `tkc.bintana-obukanwe`
- Bobcat — p. 144 — `tkc.bobcat`
- CPU — p. 138 — `tkc.cpu`
- Caleb Robertson — p. 59 — `tkc.caleb-robertson`
- Cinder — p. 141 — `tkc.cinder`
- Dust — p. 136 — `tkc.dust`
- Embédé Edeygyé — p. 57 — `tkc.embede-edeygye`
- Eniola Okoro — p. 48 — `tkc.eniola-okoro`
- G04tsucker — p. 115 — `tkc.g04tsucker`
- Gaines — p. 132 — `tkc.gaines`
- Geoffrey Dakins — p. 57 — `tkc.geoffrey-dakins`
- Gu Guanyu (non-binary elf) — p. 88 — `tkc.gu-guanyu-non-binary-elf`
- Hard Drive — p. 139 — `tkc.hard-drive`
- Heller — p. 133 — `tkc.heller`
- Hillson — p. 127 — `tkc.hillson`
- Ire — p. 143 — `tkc.ire`
- Jetblack — p. 145 — `tkc.jetblack`
- Julie Lawdmore — p. 115 — `tkc.julie-lawdmore`
- Jynx — p. 143 — `tkc.jynx`
- Kale Logan — p. 115 — `tkc.kale-logan`
- Kalizny Okengeje — p. 54 — `tkc.kalizny-okengeje`
- Kinnick — p. 142 — `tkc.kinnick`
- Lei Yimu — p. 89 — `tkc.lei-yimu`
- Loophole — p. 116 — `tkc.loophole`
- Milton — p. 136 — `tkc.milton`
- Nguyen Rikki — p. 88 — `tkc.nguyen-rikki`
- Ocean — p. 133 — `tkc.ocean`
- Omahla Adegoke — p. 50 — `tkc.omahla-adegoke`
- Orikomu Kumo — p. 116 — `tkc.orikomu-kumo`
- Ozaki Nakazo — p. 116 — `tkc.ozaki-nakazo`
- Pulse — p. 139 — `tkc.pulse`
- RAM — p. 138 — `tkc.ram`
- Security decker — p. 125 — `tkc.security-decker`
- Sherlock — p. 141 — `tkc.sherlock`
- Silver — p. 135 — `tkc.silver`
- Sliver — p. 136 — `tkc.sliver`
- Term — p. 137 — `tkc.term`
- Ticker — p. 134 — `tkc.ticker`
- Wen Xun Lee — p. 90 — `tkc.wen-xun-lee`
- Zero One — p. 139 — `tkc.zero-one`

**weapons** (6)

- Flash Scope (high) — p. 86 — `tkc.flash-scope-high`
- Flash Scope (low) — p. 86 — `tkc.flash-scope-low`
- Handheld (high) — p. 86 — `tkc.handheld-high`
- Handheld (low) — p. 86 — `tkc.handheld-low`
- Mob Light (high) — p. 86 — `tkc.mob-light-high`
- Mob Light (low) — p. 86 — `tkc.mob-light-low`


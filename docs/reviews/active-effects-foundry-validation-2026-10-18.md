# Will our active effects work in Foundry / Shadowrun 6 Eden? (validation, 2026-10-18)

**Bottom line.** Our importer now matches all 1,079 CommLink6 (CL6) item effects. In Foundry, every effect Eden has a field for (attributes, skills, defense and resistance pools, Defense Ratings, condition monitors, initiative) lands in the same field CL6's own Foundry export fills, and Eden uses it in its rolls. Three families are broken in the Foundry module and need fixing before this is complete: programs, critter powers and data structures/ammo types drop their effects; Matrix attribute bonuses are not refreshed by Eden; and a fitted mod's "affects others" effects land on the owner's own vehicle. A handful more work but differently from CL6. Of the effects meant to change a number in Foundry, 73% work as intended today and 14% are broken.

Validation only: nothing was changed. Method: the module's own routing run over all 2,575 effects in the rebuilt books, a 60-effect stratified sample traced end to end (our export → module → Foundry core apply → Eden's prepare and roll code), reviewed by gossipcat consensus `0979238f-572c4412` (Opus, GPT, Gemini; findings verified against the code by the orchestrator).

## How CommLink6 does it (the reference)

CL6's own Foundry export (CommLink6 1.14.0, `de/rpgframework/shadowrun6/foundry/*`) uses **no Active Effects**. It works out every final number itself and writes it into the Eden character: each attribute's base, modifier and pool; the resistances (attacks, damage, astral direct/indirect, toxin); derived values; Defense Ratings; initiative score and dice; skills; movement; monitors. Items carry data only. Edge and situational rules are not exported as behaviour. Nothing recalculates in Foundry when gear changes.

Ours sends live Active Effects that Eden applies itself, so it recalculates when gear is added, removed or switched. For effects on the character, our keys are the same fields CL6 fills (`system.attributes.X.mod`, `system.defensepool.*`, `system.defenserating.X.mod`, `system.physical/stun/overflow.mod`, `system.derived.X.mod`; initiative: CL6 fills `dice`, we fill `diceMod`, Eden adds both). So "works like CL6" means: after Eden applies our effects, that field holds the number CL6 would have written.

The core path is sound on Foundry 14 + Eden 4.0.11: change values are converted to numbers, applied before Eden's own calculations, which only read the `.mod` fields and never reset them. Eden caps attribute and skill modifiers at +4.

## Every effect, by what Foundry will do with it (2,575)

| Outcome | Effects | Share |
|---|---:|---:|
| **Applied** — Eden reads it and changes the number | 722 | 28.0% |
| **Applied to the host item when fitted** (weapon/vehicle mods; a note when loose) | 137 | 5.3% |
| Applied, on the spell's target (the GM switches it on) | 9 | 0.3% |
| Applied, but also when the armor isn't worn | 17 | 0.7% |
| Applied, but `test:combat` misses Athletics and Engineering | 11 | 0.4% |
| **Note by your decision** — Edge, wild die, one-action rules | 895 | 34.8% |
| **Note by your decision** — attribute maxima, cyberlimb attributes | 240 | 9.3% |
| Note — Eden has no field (minor actions, movement, unarmed DV, concealability, senses, lifestyle) | 235 | 9.1% |
| Note — correct: the effect is on others | 22 | 0.9% |
| Note — a formula value Eden can't number (hits, Con ranks, band list) | 26 | 1.0% |
| Note — no module rule (a skillsoft setting a skill, Essence hole) | 15 | 0.6% |
| **Different** — single AR value lands on the Close band only | 63 | 2.4% |
| **Different** — unarmed AR shown on the sheet, not used in the unarmed roll | 16 | 0.6% |
| **Different** — armor's own Defense line skipped (toggles lost) | 3 | 0.1% |
| **Broken** — programs, critter powers, data structures, ammo types: effect dropped | 150 | 5.8% |
| **Broken** — Matrix attribute bonus not refreshed by Eden | 14 | 0.5% |

Of the 1,183 effects meant to change a number in Foundry (everything except your note decisions, the no-field notes and the effects on others): **868 (73%) work as intended**, 28 (2%) work with a caveat (unworn armor, combat-test coverage), 82 (7%) work differently from CL6, 41 (3%) become notes where a number was meant (formula values, no module rule), and **164 (14%) are broken**. Fixing the four broken items and the single-value AR alone would bring it to about 93%.

## Broken (fix in the Foundry module)

1. **Programs, critter powers, data structures and ammo types drop their effects** (150 effects). `programItem` builds the software item without its effects (`scripts/lib/translate.js:313-322`); critter powers get only a weakness line (`books.js:300-304`, `translate.js:624-628`); data structures and ammo types aren't routed in the book import and become reference pages (`books.js:321-331`). Examples: Directional Shield, Slim Jim, Code Shell, the drake's Improved Armor.
2. **Matrix attribute bonuses are stale.** We write `system.persona.device.mod`, but Eden reads `system.persona.used`, which it recalculates only when a commlink or deck item itself is edited (Eden `actor.js:2011-2032`, `item.mjs:168`). Importing a runner with +2 Firewall shows no change until the player edits the commlink; switching a wireless bonus doesn't update it. Eden also ignores a bonus to an attribute the active device lacks.
3. **"Affects others" on a fitted mod lands on the owner.** `modItem` clears `affects` before grouping (`translate.js:257-258`), and `vehicleActor` does the same (`translate.js:370-372`). Oil Slick Sprayer becomes +3 Handling on your own vehicle, while its note says it is for pursuers.
4. **A fitted weapon commlink's Firewall** goes to the weapon's own `system.f`, which Eden never reads (only access devices count).

## Works, but differently from CL6

- **Single-value Attack Rating** (`item:ar +2`, 63 effects) changes only the Close band (`eden.js:230`); CL6 treats it as the whole weapon. A removed band (`x`) is ignored.
- **Unarmed Attack Rating** goes to `attackrating.physical.mod`, which Eden shows on the sheet but its unarmed roll reads the Unarmed gear item. CL6 applies it to the unarmed attack itself (bone lacing, horns, tusks).
- **Armor effects apply whether or not the armor is worn**; Eden doesn't suppress them. Example: Mystic Tough's Magic −4 applies while the armor is in a pack.
- **Armor's own Defense line** is skipped on purpose (the printed bonus is counted elsewhere), but that also drops the switchable ones: the chameleon suit's wireless +2.
- **`test:combat`** misses Athletics (bows, throwing) and Engineering (launchers); **magic resistance** misses Eden's `spells_other` pool.
- **Standard Armor (vehicle)** Top Speed is −10 per level; CL6 has a flat −10.
- **Item effects on a non-mod** (a quality's `item:dv`, a vehicle's own DV) become notes.

## Data issues the trace found

- **Bio-drone harness** carries an always-on +6 initiative dice; the book gives a bio-drone 4D6, not a bonus. Importer extraction error.
- **Countermagic / Magic Resistance Edge** and similar: the Edge note covers fewer pools than CL6's (direct only vs direct, indirect, astral).

## Possible improvement

Drain and Fading resistance are notes today because an earlier Foundry version would have joined the numbers as text. Foundry 14 now converts change values to numbers first, so they could likely apply to Eden's `defensepool.drain` / `fading` fields. Check with one live test before switching.

## Recommended next steps

1. Module fixes for the four broken items, the single-value AR, unarmed AR, armor-worn suppression and the test-type coverage; one PR on `chummer-sr6-foundry`.
2. Importer fix for the bio-drone harness.
3. A live check in a local Foundry world (Quench): one test runner with an item from each family, Eden's numbers compared field by field, and ideally the same runner exported from CommLink6.

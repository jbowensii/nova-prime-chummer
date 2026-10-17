# Active effects: matching CommLink6's effects to our items, and how far each can be trusted

2026-10-17. Research only. No code or catalog data was changed. This follows [the variable catalog](active-effects-variable-catalog-2026-10-17.md) and [its plain-English version](active-effects-in-plain-english-2026-10-17.md). Your answers are applied throughout: attribute maximums stay inside the app; Edge effects and one-action dice stay as text; effects that need Eden's "Advanced?" box are fine; a rating-scaled effect where an item takes enhancements and a flat number on simple items, to be settled from the data.

## 1. The short answer

1. **The reliable link is the item's id, not a word pattern.** Every CommLink6 (CL6) record carries its effects as typed `<modifications>` children. We already match 4,307 CL6 records to our entries one-to-one, and our entries already hold a **verbatim copy** of those modifications (`<modifier>`, "kept beside, never applied"). Of the 1,139 effect-type modifications on feature items, 981 are copied exactly, 147 are the per-variant and per-mode blocks CL6 nests inside a record (never copied), 8 sit on a sibling entry, and 3 were lost. So for the items CL6 models, **the effects are already in our data. They are just not translated or applied.**
2. **Translating them is a lookup table, and it mostly works.** Of 1,079 CL6 effects that are real game variables, our prose reader already reproduces **735 (68%)** once the two vocabularies are made comparable: 654 exactly, 32 equal at rating 1, 31 "choose one" groups, 18 by an unverified formula. The repo's own cl6check tool reports about 10.5% for the same comparison because it compares raw spellings (`attribute:strength` against `attr:str`).
3. **How firm is that 68%?** Counting only the exact and rating-1 matches gives 686 (64%). Dropping those with a scope problem (our effect is broader than CL6's, or CL6 says "situational" and ours says always-on, or an animal-form effect applied in human form) leaves **609 (56%) that are clean**.
4. **The rest is a short, explainable list.** 54 (5%) need a target our vocabulary does not have (specializations 21, a cyberlimb's own Strength/Agility 18, astral and Matrix defense 14, a skill minimum 1). 139 (13%) are on items where our reader found no effect at all. 83 (8%) name a variable our reader did not write. 67 (6%) have the same variable with a different value or kind.
5. **Text is a good source where a plain sentence exists.** For 22% of CL6's effects a sentence in our description names the target and prints the number; our reader reproduces 84% of those. Another 7% are mentioned loosely (62%). For the other 71% no such sentence exists (the value is in a table, or worded loosely), yet our reader still reproduces 63% of them. So word patterns work for a minority of cases and tables carry a lot.
6. **CL6 is not complete.** 71% of items have no effects in either source. 618 items have effects in our prose that CL6 lacks entirely (CL6 has none for drugs and toxins, and few conditional, wireless or Edge bonuses). A model audit of a sample says about **84% of those are right**; the rest have a wrong value, the wrong scope, or text read from the wrong entry.
7. **Gemini's devil's-advocate review and the numbers both favour a hybrid** with CL6 as the primary source for the numbers, prose filling only what CL6 lacks, and your corrections outranking both (section 8). GPT's review found eight concrete failure cases in my first draft, which the design must handle.

## 2. What was done

| Step | By | Result |
|---|---|---|
| Join every matched CL6 record to our entry, its effects, its `<modifier>` copy and its description | me (scripts in the shared notes folder `effects-matching\`) | 4,307 pairs; 1,302 CL6 effect-type modifications |
| Write a CL6-to-our-vocabulary translator and score the match | me, in four versions | sections 4, 9 |
| Audit the translator against SR6 rules | Opus (`opus-reviewer`): 15 findings. GPT (`gpt-reviewer`) tried a second audit but its file access is limited to the repo, so it could not read the evidence file and gave opinions without counts | section 7 |
| Label 85 sampled misses by cause | Gemini (`gemini-reviewer`); 14 rows repeated by the local Qwen model | section 5 |
| Audit 96 of our effects that CL6 lacks: right or wrong | GPT | section 6 |
| Find recurring phrase patterns and their reliability | Sonnet (`sonnet-implementer`) | section 7 |
| Critique my draft design; argue the opposite | GPT and Gemini | section 8 |

Every model claim I use below was checked against the data or the code by me, except where marked "model view". One Opus claim was refuted (section 7).

Book text: the models received only short excerpts (at most 520 characters each) of our item descriptions plus CL6 ids and numbers. The local Qwen model ran on this machine.

## 3. Where an item's effects live: the identifiers

### On the CommLink6 side

| Identifier | What it does | How often |
|---|---|---|
| The record's `id` (unique within its type: `item`, `quality`, `metaecho`, `power`, `itemenhancement` ...) | owns its `<modifications>` | 1,735 `<modifications>` blocks in the jar |
| `<modifications>` children: `valmod` (a number changes), `checkmod` (a test changes), `itemmod` (grants an item), `allowmod` (permits or forbids) | one element is one effect | 3,556 elements in the jar; 1,302 effect-type ones on matched records |
| `type` + `ref` (`ATTRIBUTE` + `STRENGTH`, `SKILL` + `con`, `ITEM_ATTRIBUTE` + `ATTACK_RATING`) | names the variable | the translation table (Appendix A) |
| `set` (`MAX` `MIN` `NATURAL` `AUGMENTED` `ARTIFICIAL`) | says which kind of change | `MAX` is 325 of 522 attribute modifications |
| `what` (`DICE` `EDGE` `EDGE_ONLY_TEST` `EDGE_BOOST` `NOT_SPEND_EDGE` ...) | on a `checkmod`: dice or an Edge rule | `DICE` is 146 of 493 |
| `value` (`2`, `-1`, `$RATING`, `$LEVEL`, `$LEVEL-1`, `2,0,0,0,0` for five Attack Rating bands, `3/6/1` for movement) | the amount | 145 of 1,093 are rated |
| `cond` (`y`/`true`) | "situational" | about 220 modifications. **CL6 never says which situation**; only our prose has the condition |
| `mode` (`WIRELESS` ...), `when` (`CREATION`) | switch or phase | 12 and 119 |
| `apply` on `valmod` (`CHARACTER` 367, `UNARMED` 11, `ANIMAL` 9, `DRAKE` 9, `DATA_ITEM` 8, `PERSONA` 5, `PARENT` 5) | who or what receives it | `PARENT` is the accessory-changes-its-host case; `UNARMED`, `ANIMAL`, `DRAKE` mean a body part or form, not the item |
| A `<variant>` or `<mode>` block, or a mentor-spirit role block, holding its own modifications | per-variant values | 147 modifications (13%) |
| `selmod` / `choice` | a pick the player makes | 2 effect-type modifications; the options live in a separate `<choice>` element |

Accessories: 550 CL6 records are installable parts (`usage mode=EMBEDDED slot=...`). Only 144 carry modifications, and most of those are **structure** (`valmod HOOK`: slots added or removed). Only 43 are effect-type `ITEM_ATTRIBUTE` changes to the host. CL6 states an accessory's effect on its host with no marker; the host is implied by the slot it fits.

### On our side

| Identifier | Meaning |
|---|---|
| Entry `id` (`crb.muscle-augmentation`) and `kind` | what CL6's record id is matched to |
| `<effect target op value switch when spec affects confidence>` | effects read from prose; `switch` is always, wireless, activated, sustained or conditional |
| `<modifier kind type ref value set what apply ...>` | verbatim copy of CL6's modification, never applied |
| `<link rel="grants|as">`, `<slot>`, `<fits>`, `modonly` | structure: what an item grants, hosts, or fits |
| name patterns `Name (Rating N)` and `Name (Variant)` | one item per level and per variant (your rule) |

## 4. How well the two agree

Method: each CL6 effect-type modification is translated to our variables (Appendix A) and looked up among the `<effect>`s our reader wrote for the same item. Test groups are expanded (`test:social` is Con and Influence); "choose one" matches any member; Edge-cost signs are normalised; a flat 1 equals a per-rating 1 at rating 1 and is counted separately; an Attack Rating list with equal bands equals a single number; variant rows look at the sibling entry named for the variant.

**1,139 modifications on feature items** (items, qualities, powers, echoes, techniques, ammunition, accessories ...). 60 of them are not game variables (licences, rule flags, grants, catalog fields). Base for what follows: the other **1,079**.

| Result | Count | Share of 1,079 |
|---|---:|---:|
| Reproduced exactly | 654 | 60.6% |
| Reproduced, equal at rating 1 (CL6 flat, ours per rating) | 32 | 3.0% |
| Reproduced as a "choose one" group | 31 | 2.9% |
| Reproduced, formula not verified | 18 | 1.7% |
| **Reproduced in total** | **735** | **68.1%** |
| Needs a target we do not have | 54 | 5.0% |
| Our entry has no effects at all | 139 | 12.9% |
| Our entry has effects, none on this variable | 83 | 7.7% |
| Same variable, different value or kind | 67 | 6.2% |
| Partial | 1 | 0.1% |

Of the 686 exact or rating-1 matches, 77 carry a scope flag. Across all 735 matches the flags are: our effect is broader than CL6's (41), CL6 says situational but ours is always-on (30), an animal-form or dracoform effect is stated without its form (9). A further **289 matches run the other way**: our reader marks the effect conditional where CL6 shows none. CL6 flags "situational" rarely, so a plain CL6 effect does not prove "always on".

A further 163 modifications are on character-creation records (metatypes, life modules, sets). 93% have no `<effect>` in our data because that data lives in the metatype entries' own attribute columns. They are chargen data, not effects.

### By kind of effect

| Kind | CL6 count | Reproduced | Text states it | Mentioned loosely | Not found in a sentence | Note |
|---|---:|---:|---:|---:|---:|---|
| Attribute maximum (`set=MAX`) | 214 | 99.5% | 1% | 0% | 99% | Read from tables, not sentences. Stays in the app |
| Attribute or derived bonus (`valmod ATTRIBUTE`) | 184 | 70% | 35% | 10% | 55% | 20 need a target we lack (cyberlimb attribute, astral/Matrix defense) |
| Item stat (`ITEM_ATTRIBUTE`) | 172 | 56% | 41% | 9% | 51% | Acceleration and speed interval almost never match (on/off-road) |
| Dice on a test (`checkmod` dice) | 152 | 46% | 21% | 22% | 57% | The weakest large group |
| Edge rules (`checkmod what=EDGE*`) | 285 | 67% | 24% | 4% | 73% | Stays as text |
| Skill rating (`valmod SKILL`) | 32 | 50% | 3% | 9% | 88% | |
| Other | 40 | 48% | | | | |

"Text states it" means a sentence in our description names the target and prints the number. The sentence checks are independent of the translation. Table-sourced values are not in the description text, so the last column overstates what the book never prints.

### How reliable each signature is

| CL6 signature | n | Strict match | Reading |
|---|---:|---:|---|
| `valmod ATTRIBUTE <attribute> set=MAX` | 208 | 100% | safe, one-to-one |
| `checkmod SKILL <skill> what=NOT_SPEND_EDGE` | 21 | 90% | safe; the value is a flag (0 or 1) |
| `checkmod SKILL <skill> what=EDGE_ONLY_TEST apply=CHARACTER` | 27 | 88% | a bonus Edge that must be used on that test (our `edge`) |
| `checkmod SKILL <skill> what=NOT_EARN_EDGE` | 10 | 80% | safe |
| `valmod ITEM_ATTRIBUTE DAMAGE` | 10 | 80% | our `item:dv`; with `apply=UNARMED` it is `derived:unarmed-dv` |
| `valmod ATTRIBUTE DEFENSE_RATING_PHYSICAL set=NATURAL` | 8 | 75% | |
| `checkmod SKILL <skill> what=EDGE_BOOST` | 24 | 70% | our `edge-cost`; relative on skills, an absolute cost on actions |
| `valmod ITEM_ATTRIBUTE ATTACK_RATING` | 62 | 64% | band lists against single numbers are the usual difference |
| `checkmod SKILL <skill> what=DICE` | 55 | 61% | |
| `checkmod ACTION <action> what=EDGE_BOOST` | 20 | 55% | |
| `checkmod ACTION <action> what=DICE` | 15 | 40% | few action targets in our vocabulary |
| `valmod SKILL <skill>` | 23 | 30% | |
| `valmod ITEM_ATTRIBUTE ACCELERATION / SPEED_INTERVAL` | 27 | 6-8% | on/off-road pairs and `R/-R` |
| `checkmod ATTRIBUTE DEFENSE_POOL_PHYSICAL / COMBAT_DIRECT / COMBAT_INDIRECT what=DICE` | 22 | 0-14% | our reader has no effect on these entries; vocabulary gap |
| `checkmod ATTRIBUTE DEFENSE_POOL_ASTRAL what=DICE` | 7 | 0% | needs `test:defense-astral` |

## 5. Why the rest do not match (Gemini's labels, checked)

Gemini labelled 85 sampled misses from a cruder, earlier version of my comparison:

| Label | Count | Meaning |
|---|---:|---|
| EQUIVALENT | 43 (51%) | our effects already say the same thing in other words; my matcher was too literal |
| TEXT_SILENT | 23 (27%) | the description does not state it |
| GRAMMAR_GAP | 11 (13%) | the description states it and our reader missed it |
| CL6_ODD | 6 (7%) | CL6's data looks placeholder or odd |
| VARIANT_LEVEL | 2 (2%) | belongs to a different variant |

I checked 14 of the 43 EQUIVALENT rows by hand. Twelve were genuinely the same effect and became rules in the translator (Edge-cost sign, "choose one" groups, "physical tests" as the skills linked to physical attributes, flat 1 against per-rating 1, skill maximum). Two were doubtful (Alpha Factor, Reception Enhancer). Those two stay as open mismatches.

The local Qwen model labelled 14 of the same rows and agreed with Gemini on 7 (50%); on "could a text rule capture this?" they agreed on 12 of 14. Use the small model for volume sorting, not judgement.

The 11 GRAMMAR_GAP rows name concrete rules our reader lacks: percentage cost increases per level, flight as a movement type, hardened-armor conversions, "cannot gain Edge on social tests", bonuses to "any defensive test", a "gear bonus" to vehicle tests, lifestyle percentage cuts, "half the required Edge cost", and starting attributes at their maximum.

## 6. How often our own prose effects are right (GPT's audit, spot-checked)

Our reader wrote 2,158 effects on these items; 1,449 have no CL6 counterpart. GPT audited a stratified sample of 96 against the description excerpts:

| Verdict | Count |
|---|---:|
| Supported exactly | 50 |
| Supported, but the value, target or operation needs correcting | 23 |
| Unsupported by the excerpt | 7 |
| Wrong scope (others gain it; a cost; a precondition) | 6 |
| Duplicate | 1 |
| Excerpt too short to tell | 9 |

Of the 87 it could decide, **73 (84%) are right or nearly right and 14 (16%) are wrong.** The 96 are stratified by target family and switch; treat 84% as an estimate with a wide error bar.

Spot checks of the 14 wrong ones, plus Sonnet's pass over the matched sample, found real data problems:

- **Text from the wrong entry.** "Instrument 2 (professional)", a piece of gear, carries a Reaction/Intuition attribute effect from life-module text.
- **A section introduction applied to every item.** The geneware items "NDE" and "Fear Response Dampener" carry `test:attr-int` and `test:attr-str` +1 that the excerpt does not support (cause likely the section-wide rule; not traced).
- **A cost read as an effect.** "Reduce Cargo Space" has `item:cargo set R` from a price-table cell.
- **An example sentence read as a rule.** An example about filling 3 boxes of the condition monitor produced `derived:physical-monitor +3` (the monitor rule accepts any count before "boxes" and "monitor", `importer/sr6/effects.py:758`; Sonnet).
- **Whom an Edge bonus is for.** One entry gives the runner Edge that the text gives the target (Sonnet; another entry gets this right with `affects="others"`).
- **A double count.** "may be purchased twice for a total +2 DV" emits both +1 and +2 (Sonnet).
- **A schema mismatch in main.** The engine can emit `affects: "others"` (`src/sr6/engine/export.ts:101`, `:408`), but the JSON schema allows only `caster` and `target` (`public/data/schema/sr6-export.schema.json:481`). A validating importer would reject such a file.

## 7. What the translation audit and the text-pattern mining said

### Opus on the translation (15 findings, all applied in version 4 except where noted)

| Finding | Effect on the numbers |
|---|---|
| A flat CL6 number on a levelled record is a per-level value (37 rows) | moved to "equal at rating 1" |
| Conditional versus always-on was never compared (18 + 91 rows) | now flagged |
| A cyberlimb's own Agility/Strength (`ARTIFICIAL`) is not a bonus to the character (19 rows) | moved to "needs a target" |
| `USAGE` / `OTHER` / value-0 checkmods are rule markers (17 rows); grants and licences are not variables | removed from the denominator |
| Group matches were one-way: ours broader than CL6's (15 rows) | flagged as "ours broader" |
| "Formula" matches hid 13 real disagreements (movement triples, on/off-road pairs, signs) | split off as "unverified formula" |
| Attack Rating lists with equal bands equal a single number (7 rows); `N,0,0,0,0` equals N only for unarmed or melee | implemented |
| A checkmod with no `what` is a dice bonus (9 rows, foci) | implemented |
| `apply=UNARMED` means the unarmed attack (9 rows) | implemented |
| Edge-cost sign: CL6 stores a cut as a positive number; on actions the number is an absolute cost | implemented |
| Defense pools merge distinct SR6 tests (13 rows) | astral and Matrix split off as missing targets |
| Variant rows must use the sibling named for the variant (16 rows flip) | implemented |
| "Choose one" must not be filled from our own atoms (up to 43 rows) | counted separately as "choice" |
| `apply=ANIMAL/DRAKE` is an animal form or dracoform (15 rows) | flagged |
| Small one-to-one fixes (activesofts, chase Edge, thresholds ...) | implemented |

**One Opus claim is refuted.** It said all three Bone lacing variants meet an identical `unarmed-ar 1` in our data. Our Aluminum and Titanium siblings carry 2 and 3, which matches CL6. The check did find a real difference: CL6's Aluminium variant has unarmed damage 2 where ours has 1 (book check needed). Opus also found that "Iron Limbs" is `item:dv` in ours where CL6 says unarmed (`apply=UNARMED`); I confirmed it.

Opus's own caution applies to this document: the effect of each fix was counted on a moving version of my scripts, so the row counts in its findings are approximate. The totals in section 4 are from the final version.

### GPT's second translation audit

GPT could not read the evidence file (its file access is limited to the repo), so it gave opinions without counts. They agree with Opus on defense pools, unarmed Attack Rating and specializations. I treat them as unverified model views.

### Sonnet on phrase patterns

Reliability by kind, from 120 matched rows (42 of them are attribute-maximum rows for infected types, which come from a table, so their counts are inflated):

| Kind | Phrases that identify it reliably | Phrases that mislead |
|---|---|---|
| Attribute bonus | `-N Attr` in a fixed "Gained Weaknesses" list (21 rows); `increases Attr by N`; `adds its rating to your Attr` | `{Attr} + {Attr} (N) test` (a threshold, 11 rows); prerequisites `Attr N or greater`; `Attr is considered N higher for tests` |
| Attribute maximum | a table row with six or more attribute columns | the word "maximum" (7 rows: Essence cap, Edge-per-round cap, loyalty cap) |
| Skill and test dice | `adds its rating as a dice pool bonus to your X tests`; `+N dice to all X tests` | dice penalties phrased the same way as bonuses |
| Defense Rating | `+N Defense Rating bonus`; `bonus equal to its rating` | `Armor N` in power lists (29 rows, correctly ignored) |
| Initiative | `+N initiative die` in a "Gained Powers" list (18 rows) | `adjustment to Initiative Score` is derived |
| Edge | `gain a point of Edge on/for/when {test}` (11); `cannot/may not use, spend or gain Edge` (8); `Edge Boosts cost N less` (5); "must be spent on that test or is lost" as a co-signal | `maximum of +1 Edge per round` (a cap); the target gaining Edge |
| Item stats | `{±N}/{±N}/...` band lists; `Increase X by N` | unsigned stat-block lines `Attack Rating N` (41 rows, correctly ignored) |
| Price and lifestyle | `increases the cost of all X by N percent`; `±N LP modifier` | |
| Senses | none: CL6 has no sense modifications, so senses cannot be checked against it | `Enhanced Senses (...)` is a power name |

Highest-value grammar additions, in Sonnet's order: expand flat Attack Rating boosts to the five bands; scope guards on Edge sentences (who gains the Edge; which condition belongs to which effect; "half the required Edge cost"); a filter for caps, negations, examples and stacking sentences; three missed dice phrasings; two odd word orders (a monthly nuyen surcharge, `+N DR vs. X`).

## 8. Design: N effects per item, accessories that add and remove

I wrote [a draft design](../../.extract/effects-analysis/design_draft.md) (kept out of the repo) and asked GPT to find failure cases and Gemini to argue for the opposite. Both checked it against the code, and I verified the lines GPT cited.

**GPT's findings.**

1. **An accessory can change both the character and its host, but an Eden effect does one or the other.** Grouping "per item and switch" would put a host Attack Rating change on the actor, or leave a Reaction bonus off it. The export must group by *scope* (character, item, host). The engine already separates them (`hostBonus`, `src/sr6/engine/bonuses.ts:119`).
2. **Accessory bonuses are exported under the accessory, not the host** (`src/sr6/engine/export.ts:539`; `docs/sr6-export-format.md:106`). Foundry cannot tell a bonus meant for the host from one for the runner without an explicit host channel.
3. **No "removes" semantics.** The export has only additive effects, so a mod that replaces a built-in part would leave the old effect in place.
4. **Ids built from list position are unstable.** Inserting an effect before others in a re-import shifts them. `Sr6ExportEffect` has no id field (`src/sr6/engine/export.ts:93`).
5. **The +4 cap may not hold on unlisted keys.** Eden caps attribute and skill modifiers itself, but whether that holds on "Advanced?" keys is unconfirmed. Nova caps its own totals (`src/sr6/engine/derive.ts:162`).
6. **A "disabled" effect is not a condition.** Enabling a disabled conditional bonus applies it to every test of that skill. Wireless, activated and sustained effects are true switches; conditional ones should stay descriptive or become manual modifiers with the condition shown. (My finding that CL6 never names its situations, and that our reader marks 289 matched effects conditional where CL6 shows none, supports keeping conditions in text.)
7. **Per-rating tables (`R[1,1,2,2]`) cannot be written as `@item.system.rating`.** The draft's formula forms were too narrow (`src/sr6/engine/effects.ts:45`, `:57`).
8. **The `affects: "others"` schema mismatch** (section 6).

**Gemini's argument.** CL6's typed modifiers as the single source gives the most reliable numbers but needs a full translation layer and misses what CL6 never modelled. A prose-primary design puts roughly a 16% error rate on the maths. A hybrid has the highest ceiling but needs arbitration. Gemini's pick: **CL6 as the authority for the numbers, prose only to append what CL6 lacks**, with five tests: accessory mounting round-trip; cap enforcement; condition toggle state; stable ids across re-imports; host-deletion cascade.

**My reading of the evidence.** The numbers agree with Gemini: the CL6 copy is already in our entries for 87% of effect-type modifications, the translation is a lookup, and prose is about 84% right where CL6 is silent. Two cautions. CL6 is not always right (Alpha Factor; value-0 placeholders; a Matrix defense row that looks like a slip). And your corrections must outrank both.

## 9. Recommended order of work

1. **Promote the `<modifier>` copies to `<effect>`s through the translation table** (Appendix A). 735 of 1,079 are already confirmed by an independent prose reading; keep the source on each effect (`cl6`, `prose`, `owner`) and mark the agreed ones confirmed.
2. **Copy the 147 variant and mode blocks** CL6 nests inside records onto our variant entries.
3. **Add the missing targets** (54 effects): skill specializations (21), a cyberlimb's own Strength/Agility (18), astral and Matrix defense tests (14), a skill minimum (1).
4. **Fix the text-attribution bugs** (done, section 11; life-module text on gear; section-wide rule on every item; price cells as effects; example sentences as rules; target-gains-Edge) and the `affects: others` schema mismatch, then re-run the audit.
5. **Add the grammar rules** Gemini and Sonnet named, each with a regression row.
6. **Give every exported effect a stable id and a scope** (character, item, host). Key the id on the CL6 modification (type, ref, set, what, variant) where one exists, not on list position.
7. **Keep conditional effects descriptive in Foundry**; make only wireless, activated and sustained effects switchable Active Effects.
8. **Rating**: use `@item.system.rating` for entries that carry many ratings and flat numbers on per-level entries. Of the 1,079 variable effects, 145 are rated; the choice is cheap to postpone.
9. **Resolve disagreements by hand** from the "ours broader", "situational versus always" and Bone lacing lists (section 4, 7), which the shared notes folder holds as rows.

## 10. Owner decisions (2026-10-17)

1. **Which source wins.** CL6's numbers win over our prose when they disagree, **unless we are sure of ours** (the book text or table states it). Owner corrections sit above both.
2. **Conditional effects in Foundry.** Follow what CL6 does. Checked: CL6 stores the condition as a bare flag, `cond` = `y`/`true`/`yes`/`1` on 230 of 233 conditional modifications, with only three named (`unarmed`, `with_weapon`, `no_weapon`); no sentence is stored. Its engine keeps `isConditional` and a `conditionString` on each modification and lists conditional ones apart from the always-on total (class structure read from the jar, not run in the CL6 window). So the CL6 pattern is: *not summed, shown separately, player decides*. Foundry equivalent, in order: (a) an Eden catalog effect that already expresses it; (b) otherwise a manual modifier that is off by default, with our condition sentence from the prose as its name.
3. **Cyberlimb Strength and Agility.** CL6 does model them: `valmod ATTRIBUTE STRENGTH/AGILITY set=ARTIFICIAL value=2`, once per limb variant (full arm, forearm, full leg, lower leg; synthetic and obvious), 18 rows plus Additional cyberarm. Owner said yes. Open point: CL6's number is a bonus on the limb's own value and Eden's "Pool (Override only)" replaces the whole attribute, so the export must carry the limb's resulting value (base plus customization), not the 2.
4. **Text bugs and schema mismatch.** Explained to the owner in plain English; see the session reply. Recommendation: first small step of the build, before any effect is exported.
5. **Bone lacing (Aluminum).** The book table reads Body +2, Defense +1, Unarmed DV +1, Unarmed AR +2; ours matches. CL6 has DV 2 (a typo against the table). **Ours wins.** Plastic and Titanium agree with CL6.

## 11. The text bugs, fixed, and the re-audit (2026-10-17)

**Where the work is:** worktree `.claude/worktrees/effect-text-bugs`, branch `fix/sr6-effect-text-bugs` (off main d4b7f846), **not committed, no PR**. Files: `importer/sr6/effects.py`, new `importer/tests/test_sr6_effects_text_bugs.py` (13 tests), `public/data/schema/sr6-export.schema.json` (`affects` also allows `others`), `docs/sr6-export-format.md`, `tests/sr6/export.test.ts` (one new test). Importer suite: 1,153 tests pass (27 skipped, local data missing); the export tests pass.

### What was wrong, and what changed

| Bug | Real cause (not the one I guessed in section 6) | Fix |
|---|---|---|
| Fear Response Dampener (basic, enhanced), Pathogen/Toxin Resistance, Augmented Healing (with implants) carried 14, 8 and 2 effects of other items | The names hold a parenthesis inside a parenthesis, which the variant lookup could not read, so each entry kept the book's whole shared paragraph block (about 6,900 characters) and read every item's effects from it. Not a section-wide rule | Names are read with a nested parenthesis; the run-in label is the variant less its sub-variant |
| Genotype Enhancement (NDI): 14 effects | The book prints its paragraph under `**NDE:**` (a misprint) | The one paragraph label no sibling claims, when exactly one entry lacks a label, is that entry's paragraph |
| Instrument "Professional": 21 effects | A life-module rule ("Professional ...") matched the entry by one shared word and became its description | Rules printed under a "Life Modules" section never describe an item. I did **not** apply my own one-word rule: it would have broken Stealthlink, Armorlink, Securelink, ProCam and others |
| Bioamplifier Nanites (Bio-Response Override): +3 physical monitor | An illustration sentence ("For example ... filling 3 boxes ...") | Sentences opening For example / For instance / e.g. / Such as state no effect. A leading "Example:" label is kept: Off Road Chassis states a real number only there |
| Reduce Cargo Space (and 5 other CF mods, Gecko Tips, Ejection Seat): `set R` | A rule meant for names like "Enhanced Sensors" read a stat word out of a name, a note in parentheses, or a rating that is a dash | Names are read without their notes; change verbs (Reduce, Increase, Expand ...) are skipped; the rating must contain a digit |
| Edge on the wrong party (Antipathy, Sterilize, Marionette, BTL IRL) | A sentence with only "they" fell back to the caster; and the party was whoever was named first, not who gains | "They" with no one named inherits the sentence before; the party is the one named nearest before the verb, in that clause |

### Checking it

- **Replay, same input both ways** (the saved runs already contain earlier output, so I stripped the item effects and attached rule texts first): 28 entries change, **113 effects removed, 6 added**. All 28 are on the list above.
- **Against CommLink6:** the confirmed effects do not move (724 of 1,079 either way). So the 113 removals were not effects CL6 agrees with. On the paired items our effects go from 2,147 to 2,073.
- **Gemini** judged every removed or added effect in those 28 entries against the entry's own text: 108 correct removals, 2 correct additions, 8 unverifiable (the excerpt was cut off), **1 flagged as wrong, which was a duplicate**: Toxin Resistance (general) held its Edge twice and still has it once. Qwen returned nothing (local model not answering).
- **Opus** reviewed the code and found two regressions in the first version (hyphenated variant names such as Semi-Rigid lost their own sentence; "if the subject resists your spell, they gain Edge" gave the Edge to the caster) plus two weaker spots (the unclaimed-label rule did not check that only one entry lacked a label; "Ejection Seat" kept `set R`). All four are fixed and have a test.
- **A fresh GPT audit of 96 effects with no CL6 counterpart** (new sample, same method as section 6): 59 exactly supported, 7 supported with a different value, 2 unsupported, 8 wrong scope, 6 duplicate, 14 undecidable. Of the 82 decidable, **66 (80%) are right or nearly right**, against 84% before. That difference is inside the error of a 96-row sample, and the fixes touch only about 5% of the effects, so **this audit cannot show the improvement**. The replay and Gemini's check do.

### New problems the fresh sample found (fixed in rounds 2 and 3, below)

1. **A cost read as a bonus:** "+1 Drain" and "each additional person increases the Drain by 1" become effects (2 rows).
2. **What happens to others, recorded on the owner:** a vehicle hazard on pursuing vehicles, a complex form that lowers the target, a +2 that applies to a job (4 rows).
3. **A threshold read as dice:** concealability +1 (2 rows).
4. **Too broad a test:** "any Matrix search" becomes all Matrix tests (2 rows).
5. **A rule table read as an effect;** unrelated "overdrive" text read as Strength and Agility (3 rows).
6. **The "purchased twice for a total +2 DV" double count** from section 6 (both +1 and +2) is still there.
7. **Left over by the fix:** the four Pathogen/Toxin Resistance entries each keep one `test:toxin-resistance` Edge. It is right for Toxin (general) and wrong for the three others. The pathogen paragraph's own Edge is not read.
8. **Descriptions still shared:** the effects of the nested-name entries are now their own, but the description text shown to a user is still the whole block (6,900 characters for Fear Response Dampener).

### Rounds 2 and 3: the remaining problems, fixed (2026-10-17)

Same branch, still **not committed, no PR**. Importer suite 1,171 tests pass (27 skipped); `test_sr6_effects_text_bugs.py` now holds 31 tests; Prettier and ESLint are clean on the changed TypeScript test.

| Problem | Result |
|---|---|
| A spell's own Drain rise read as an effect (Treat, Babble, Stealth Effect and 12 more) | Removed. A Drain *resistance* bonus still reads |
| What hits others recorded on the owner | Oil Slick Sprayer and Black Mark Discharge now `affects="others"`; Increase Reflexes, Diffusion and Tyee! now `target`; Standards and Blend no longer wrongly `others` |
| Concealability threshold read as Perception dice (Fichetti Tiffani Needler) | Now `item:concealability +1` for visual Perception tests |
| "Any Matrix search" read as every Matrix test | `action:matrix-search` / `action:matrix-perception` on 11 entries (CL6 agreement rose by 3) |
| A GM's situation table read as an effect (Paradigm Shift) | Dropped; a table whose cells name the item's own test still reads |
| "Lower body replacement" read as the Body attribute | Removed; the overdrive +2 Strength and Agility the text does state stay |
| "Purchased twice ... total +2" double count (Improved Natural Weapon) | Only the stated +1 remains |
| Toxin Edge on the (specific) Pathogen and Toxin entries | Removed. The audit was half wrong: Pathogen (general) states a Disease Resistance Edge, which the grammar files under toxin resistance |
| Nested-name entries shown the whole 6,900-character block | Each now has its own paragraph (Fear Response Dampener 689 characters, NDI 392). Confirmed by running the real importer on the Body Shop book; not re-run for the other books |

**How it was checked.** Gemini judged every changed effect of round 2: 35 of 35 removals correct; of the additions, 7 correct and 8 short of a condition (`when`) or with the wrong party; the two real party errors (Black Mark Discharge, Blend) were fixed in round 3. Opus reviewed both rounds' code against main and found 13 defects in all, including 4 where round 2 dropped a real effect (a Drain sentence that also grants a bonus, a Drain-resistance bonus, a table of item modes, a "each purchase +1" sentence); every one was fixed with a test and re-probed. Of the 23 rows GPT's fresh sample marked wrong or approximate, 12 are now fixed; the rest are conditions the grammar cannot express (a multiplier, a per-hit Overwatch roll) or labels GPT gave that the full text does not support.

**Net effect against main** (same stripped input, every saved book): 61 entries change, **152 effects removed, 25 added**; effects CL6 confirms rise from 724 to **727** of 1,079; our prose effects on the items paired with CL6 fall from 2,147 to 2,057.

**Still open:** MeFeed, Shopsoft and Data Haven Membership have the right target but no `when` for the topic; "doubles the concealment bonus" (Krime Saint Nicholas Carbine) is a multiplier the grammar cannot hold; Facial Scanner's Edge stays on the user, as the text reads.

## 12. The whole-object reader (2026-10-17)

Owner direction: our reader is the primary source, from the whole imported entry; CommLink6 is a rare, marked override; the book wins where the two disagree.

| Stage | CL6 effects reproduced (of 1,079) |
|---|---:|
| PR #70 | 727 (67.4%) |
| Fairer matcher only (specializations, Essence/price units, variant to sibling entry) | 748 (69.3%) |
| Batch 1: book block for empty entries, links copied across books, variant table rows, cyberlimb section rule, new defense/matrix/tire targets | 827 (76.6%) |
| Batch 2 and four Opus review rounds | **881 (81.7%)** |

The last figure comes from a replay that follows the importer's own order (`run.py` `_read`: read every entry, the overrides, then read the entries an override added). An earlier replay kept stale effects from the saved run and was replaced.

**What the reader reads now:** the entry's own book block when its description is empty; links ("See X, p. N", "same as", "exactly like", "also have the X benefits") whose effects are copied onto the entry, marked `from=` the linked id, the link `copied`; a variant's row in its table; the cyberlimb section rule (`limb-attr:* set 2`, cyberlimbs only); printed fields ("Dice pool effect", ammunition DV); Edge wording and lists; natural weapons as unarmed Attack Rating and Damage Value; creation rules (`resource:maxed-out-attributes`, `maxed-out-skills`, `adjust-drake`).

**New targets:** `test:defense-astral`, `test:defense-spell-direct`, `test:defense-spell-indirect`, `derived:matrix-defense`, `limb-attr:*`, on-road/off-road value pairs on `item:acceleration` and `item:speed-interval`.

**CommLink6 as an override:** 11 rows (`"gen": "cl6"`, a required one-line `why`) in the crb, emc, fs, ll, nf and sw override files. Each replaces only its own target and op, and the effect it writes carries `gen="cl6"` so the app, the export and Foundry can tell it from the book reader. The FRAG warhead's 0.75 damage multiplier cannot be expressed.

**Owner corrections reach linked entries (Option 1):** when the owner has corrected a linked entry (the edits layer), the app and the export follow it live and drop the stale copies, up to two links away, without counting an effect twice.

**Not matched, and why:** 82 rows where CommLink6 differs from the book (book wins); about a dozen where the book prints no value (Reakt, engines, Improved Handling and Seating, Knowsofts, Critter Armor); natural weapons CommLink6 models as item stats; smaller wording gaps.

**Checks:** 1,236 importer tests and 1,805 app tests pass; lint, format and types clean; no book text over 12 words in code or tests; Anarchy untouched. Opus reviewed batch 1, batch 2 and two rounds of fixes; every confirmed finding was fixed with a test.

## Appendix A: Translation table (CL6 signature to our target to Eden key)

Evidence rows: `effects-matching\all_cl6_modifications_v3.csv`; the version-4 results are in `effects-matching\eval4.csv`. "Eden" is the actor key from [the catalog](active-effects-variable-catalog-2026-10-17.md).

| CL6 | Our target | Eden key | Note |
|---|---|---|---|
| `valmod ATTRIBUTE <BODY..RESONANCE>` | `attr:<abbr>` add | `system.attributes.<abbr>.mod` | `NATURAL` and `AUGMENTED` are qualifiers; `AUGMENTED` counts against Eden's +4 cap |
| `... set=MAX` | `attr-max:<abbr>` | none | stays in the app |
| `... set=ARTIFICIAL` (Strength, Agility) | a limb's own attribute: **new target** | `system.attributes.<abbr>.pool` override | needs the cyberlimb item |
| `valmod ATTRIBUTE EDGE` | `attr:edg` | `system.edge.max` | |
| `DEFENSE_RATING_PHYSICAL / ASTRAL / SOCIAL` | `derived:defense / defense-astral / social` | `system.defenserating.physical / astral.mod` | social is not in Eden's dropdown |
| `PHYSICAL_MONITOR / STUN_MONITOR / DAMAGE_OVERFLOW` | `derived:physical-monitor / stun-monitor / overflow` | `system.physical.mod / stun.mod / overflow.mod` | |
| `INITIATIVE_DICE_PHYSICAL` | `derived:initiative-dice` | `system.initiative.physical.diceMod` | |
| `INITIATIVE_(DICE_)MATRIX(_VR_COLD/_VR_HOT)` | `derived:matrix-initiative(-dice)` | `system.initiative.matrix.mod / diceMod` | cold and hot are lost |
| `COMPOSURE / JUDGE_INTENTIONS / MEMORY / LIFT_CARRY` | `derived:composure / judge-intentions / memory / lift` | `system.derived.<name>.mod` | |
| `RESIST_DAMAGE / RESIST_TOXIN / RESIST_DRAIN` | `test:damage-resistance / toxin-resistance / drain-resistance` | `system.defensepool.damage_physical / toxin / drain.mod` | `RESIST_DAMAGE_ASTRAL` needs its own target |
| `DEFENSE_POOL_PHYSICAL` | `test:defense` | `system.defensepool.physical.mod` | |
| `DEFENSE_POOL_ASTRAL / MATRIX` | **new targets** `test:defense-astral / -matrix` | `system.defensepool.astral.mod` | |
| `DEFENSE_POOL_COMBAT_DIRECT / INDIRECT` | `test:magic-resistance` (indirect: also `test:defense`) | `system.defensepool.spells_direct / spells_indirect.mod` | |
| `checkmod SKILL <skill> what=DICE` (or no `what`, non-zero) | `skill:<id>` add | `system.skills.<id>.modifier` | `SOCIAL` is Con and Influence |
| `checkmod ATTRIBUTE <attr> what=DICE` | `test:attr-<abbr>` | dice on the skills linked to that attribute | |
| `checkmod SKILLSPECIALIZATION` | `skill:<id>` with `spec`: **new target** | none | |
| `checkmod ... what=EDGE / EDGE_ONLY_TEST` | op `edge` | none | text only |
| `checkmod ... what=EDGE_BOOST` | op `edge-cost` (skills, attributes); `edge-cost-set` (actions) | none | |
| `checkmod ... what=EDGE_COST_MALUS` | op `edge-cost`, sign flipped | none | CL6 prints a cut as a positive number |
| `checkmod ... what=NOT_SPEND_EDGE / NOT_EARN_EDGE` | op `no-edge / no-edge-gain` | none | value is a flag |
| `checkmod ... what=REPLACE_WITH_WILD / ADD_WILD` | op `wild-die` | `system.wild` (weapons only) | |
| `checkmod ... what=EDGE_CHASE` | `pool:chase` | none | |
| `checkmod ... what=USAGE / OTHER` | rule marker | none | not a variable |
| `valmod SKILL <skill> set=ARTIFICIAL` | `skill:<id>` set | `system.skills.<id>.points` (override/upgrade) | skillsofts, hardwires |
| `valmod ITEM_ATTRIBUTE ATTACK_RATING` | `item:ar` (band list) | `system.attackRating.0..4` | `apply=UNARMED`: `derived:unarmed-ar` |
| `... DAMAGE` | `item:dv` | `system.dmg` | `apply=UNARMED`: `derived:unarmed-dv` |
| `... HANDLING / ACCELERATION / SPEED_INTERVAL / TOPSPEED / BODY / ARMOR / PILOT / SENSORS / SEATS` | `item:<same>` | `system.handlOn/Off, accOn/Off, spdiOn/Off, tspd, bod, arm, pil, sen, sea` | `R/-R` on and off road |
| `... ATTACK / SLEAZE / DATA_PROCESSING / FIREWALL` | `matrix:<same>` | device item `system.a / s / d / f` | |
| `valmod PRICEMOD`, `CREATION_POINTS` | `pricemod:*`, `resource:*` | none | not play effects |
| `valmod QUALITY / CRITTER_POWER / LICENSE / RULE / ACTION(_BONUS)`, `itemmod *`, `allowmod *` | grants, permissions, rules | none | not variables |

## Appendix B: Files

- This file: `docs/reviews/active-effects-matching-2026-10-17.md`.
- Shared notes folder `effects-matching\`: `xlate.py`, `eval4.py` (the translator and evaluator), `evalmatch.py`, `textstated.py`, `build.py`, `reverse.py`, `all_cl6_modifications_v3.csv`, `eval4.csv`, `evalmatch-summary.txt`.
- Repo-ignored `.extract/effects-analysis/`: the sample files the models read, `design_draft.md`, the first translator version Opus audited.

# SR6 reader corrections, Tier 1 build (2026-10-19)

Plan: [sr6-book-corrections-patterns-2026-10-19.md](sr6-book-corrections-patterns-2026-10-19.md) (Tier 1, approved), with
the owner's six conflict rulings of 2026-10-19. Branch `feat/sr6-reader-corrections`.

## Bottom line

- **Nine reader mistakes are now rules** in `importer/sr6/effects.py`, each with a test (`BookCorrectionPatternsTest` in
  `importer/tests/test_sr6_effects_final_review.py`, invented sentences).
- **Book corrections: 378 rows down to 357.** 21 rows retired because the reader now reads what they said; 24 more rows
  lost a drop that no longer matched anything (or had it moved to what the reader reads now). Every remaining drop
  matches a reader effect: the importer's "drop matches no effect" warnings went from **20 to 0**.
- **The six conflict rulings are in the rows** (cyberarms, full leg, three weapons, tusks, mob lights, object spells).
- **CommLink6:** no CommLink6 effect is lost or gained. Measured with a stand-in for the 1,079 check (see Checks): 932
  CommLink6 modifications on our entries, 0 lost, 0 gained, by target and op and by value.
- **86 entries change** across all 16,760 entry texts. 50 of them are entries nobody reviewed: 41 new or changed effects
  and links (on 36 entries) are listed below for you to check, and 40 removed ones.

## The fixes

| # | Reader mistake | Fix | Entries changed | Rows retired | Rows edited |
| --- | --- | --- | --: | --- | --- |
| 1 | `4D6 Initiative Dice` read as +6; `removes one Initiative Die` as +1 | `with ND6 Initiative Dice` sets N; a number inside `4D6` is no count; `-1D6` and `removes` are -1; `more than 5D6` is a cap | 9 | none | bio-drone harness (2), monoamine oxidase, cyberjack overclock: stale drops out (the rows keep the switch) |
| 2 | `reduces the Damage Value of any attack`, `incoming DV by its rating` read as the item's DV | `derived:damage-reduction` N, `R`, `R*N` (`dv` or `damage value` only) | 4 | da.wrecker, dc.milspec-plate-rating-1 | paraplate, reactive armor plates |
| 3 | `for those with Flight`, `tests to sell … you`, `test to prevent your` marked as someone else's | `those(?! with)`; `sell`, `prevent` in the denylist | 3 | none | jump master, snitch, smart cosmetics |
| 4 | An attribute word in another noun (`toxic magic`, `Resonance Spike`, `use Strength for … grappling`) made an attribute test for Edge | Edge, no-Edge, Edge cost and wild dice go on an attribute's tests only when the sentence names tests by it (`Logic tests`, `tests that include the Magic attribute`, `linked to a Physical Attribute (Agility …)`, `using the Magic attribute`, `Magic + Charisma test`); else the activity, else `test:other` with the condition | 23 | none | constriction, radiation tolerance, soul splice: drops out; code shell, blood magic resistance: drop moved to the new `test:other` |
| 5 | `Mr.` ended a sentence and a condition | the honorific guard in `sentences()` was a no-op (it looked behind the full stop); fixed, and `_cond_words` keeps `Mr.`, `Dr.`, `St.` | 6 | none | big dreams, all business |
| 6 | Specializations by another word (`Sprint`, `impersonate`, `Medical`) | `_spec` maps a single word to the first SPECS word of the same skill sharing its stem; `sprint`, `balancing` added to SPECS as words | 17 | cosmetic implants, oxyrush (2) | catlike reflexes; skateboards (see below) |
| 7 | `the cost of an Edge boost` | `an?` in both determiner groups; an activity after the number (`used during a grapple test`) is the skill | 1 | none | none (tentacle modification keeps its richer condition) |
| 8 | Grants missed | kind first (`the critter power Immunity (Pathogens, Toxins) with a rating of 2`), a bracket with a comma as `when`, `Free X power`, a drug's `Effect:` list naming an entry with its page. `See the X quality (p. N)` stays a cross-reference | 18 | crb-ber factory blood, hurlg, alcohol, coyote | eagle: its kid now `replaces` the reader's link (keeps "no bonus Karma") |
| 9 | Threshold wording | `reducing thresholds by 1` (the tests of the clause before), `have their threshold increased by 1`, `-1 for all repair test thresholds`, `the threshold for Surprise tests is 1` (`threshold-set`); test descriptions (`a Perception (3) test`, `a threshold of 2 to notice`) still read nothing | 5 | prehensile foot, pain editor | ares arms regulator |

Entries changed: the corpus run of `effects.read()` and `links()` over every entry text of the saved runs, each fix
against the one before; 86 against main in all.

Retired as already stale before this change (the reader stopped producing their drop earlier, nothing else in them):
signal drug per dose, mimic signal drug per dose, gestalt step 1, cat (mentor spirit, its effect the reader's own). Stale
drops taken out of rows that keep their effects: paint grenades large, critter bond, masterkey ammunition. The
"Gained Powers" rule reads ghoul (elf), ghoul (human) and loup-garou exactly: retired. Nosferatu stays: the reader does
not give its movement.

## Owner rulings applied (2026-10-19)

| Rows | Done |
| --- | --- |
| additional cyberarm obvious, synthetic (#7, #8) | `test:attr-str` and `test:attr-agi` wild die 1, and `attr:str`, `attr:agi` +2, all `[activated]` "overdrive: one test using this arm" (the +2 also "may exceed augmented maximum"); the minor-actions effect kept |
| primitive cyberlimb full leg (#56) | movement `-1/-1/0`. The reader already gives the printed "may not spend Edge on tests involving Agility using a primitive cyberlimb" (`test:attr-agi no-edge`, conditional) |
| monofilament chainsaw, garrote, juggernaut (#189, #206, #208) | retired: the reader gives `test:combat wild-die 1`, always on, as cheetah (#192) |
| tusk large, medium, small (#76-#78) | one set: unarmed AR +2 (Close) for "a pair of tusks"; unarmed AR +2 and `derived:unarmed-dv` +2 "combined with a Charge Minor (I) action" |
| mob light, high, low (#368-#370) | `test:other edge 1 [conditional] affects=others`, the condition as you wrote it |
| corrode, demolish, melt, ram, sludge, wreck object (#318-#338) | `skill:sorcery edge 1 [conditional] spec=Spellcasting affects=caster`, the condition as you wrote it; the drop of the spliced-text Edge corrected to the reader's `affects=target`, so it matches again |

Not done, by your ruling: weapon wild dice stay unconditional. Not in this PR: Tier 2 and 3.

## Checks

- `python -m unittest discover -s importer/tests -t .`: 1,357 tests, OK (27 skipped). The three known local failures did
  not occur in this worktree.
- `npx prettier --check .`: clean. No TypeScript touched; Anarchy untouched.
- **Importer replay:** the importer's own order (`run._read`: read, overrides, read the added entries, plus the City
  Editions' extra sources) on the 50 saved `book.md` files of `.extract/cl6check-runs14`, main against this branch.
  Unmatched drops 20 on main, 49 after the reader fixes, **0** after the row changes. 36 entries' final effects differ
  from the reader-fixes-only run, all from the rows above.
- **CommLink6:** the 1,079 figure's own tool (`make_fixed_runs23.py` and the evaluator in the side-session notes) is not
  in this repo and was not run. Instead: every CommLink6 modification in `.extract/effects-analysis/all_cl6_modifications.csv`
  whose record maps to one of our entries by name (932), checked for an effect of the same target and op, then the same
  value, in the final effects of both replays. 0 lost, 0 gained. This is a stand-in: please re-run the full measurement
  before calling it 1,079/1,079.
- Known limit, not new: in the replay the No Future skateboard rows (split entries) do not change those entries on main
  either; their drops were updated to what the reader reads now (the hardened skateboard drops the Sprint dice and wild
  die it gets from the roller-skate sentence, by your 2026-10-18 ruling).

## New effects on entries nobody reviewed (please check)

"Reviewed" means a correction row or a dataset row exists. A changed value (a specialization renamed) shows as new.
Snippets are at most ten words of the entry's text.

| Entry | Text | New effect or link |
| --- | --- | --- |
| aw.dis-magician | • For every two points of Essence lost to augmentations, | `test:other edge essence-lost/2 RU [conditional] when='per point of essence lost' affects=others` |
| bn.heavy-barding | If you end up in the water, add +4 to | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swimming affects=others` |
| bn.light-barding | If you end up in the water, add +4 to | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swimming affects=others` |
| bn.shifter-barding-light-or-heavy | If you end up in the water, add +4 to | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swimming affects=others` |
| bs.animal-tongue | • Effect: Animal Control (p. 221, SR6) | `LINK {'rel': 'grants', 'name': 'Animal Control', 'book': 'crb'}` |
| bs.false-front | False front with the mimic option adds its rating to | `skill:con add R spec=Impersonation, Disguise` |
| bs.immortal-flower | Effect: Regeneration (p. 227, SR6) Immortal flower is a plant | `LINK {'rel': 'grants', 'name': 'Regeneration', 'book': 'crb'}` |
| bs.little-smoke | Effect: Gain Concealment (p. 222, SR6) and Confusion (p. 222, | `LINK {'rel': 'grants', 'name': 'Concealment', 'book': 'crb'}` |
| bs.little-smoke | Effect: Gain Concealment (p. 222, SR6) and Confusion (p. 222, | `LINK {'rel': 'grants', 'name': 'Confusion', 'book': 'crb'}` |
| bs.mimic-option | False front with the mimic option adds its rating to | `skill:con add R spec=Impersonation, Disguise` |
| bs.resistance-and-adaptation | This microadaptation reduced the Burning status by one point and | `test:other edge 1 [conditional] when='a radiation resistance'` |
| bs.therapeutic-nanites | • Overdrive: Placing a point of nanite volume in overdrive | `skill:athletics edge 1 [activated] when='overdrive' spec=Sprinting, Swimming` |
| bs.warp-bubble | Effect: Astral Chameleon (p. 70, SR6) This magical compound is | `LINK {'rel': 'grants', 'name': 'Astral Chameleon', 'book': 'crb'}` |
| bs.witchs-moss | Effect: Paralyzing Touch (p. 227, SR6) Only a select few | `LINK {'rel': 'grants', 'name': 'Paralyzing Touch', 'book': 'crb'}` |
| crb.bliss | Effect: -1 Reaction, -1 Willpower, High Pain Tolerance (p. 72) | `LINK {'rel': 'grants', 'name': 'High Pain Tolerance'}` |
| crb.climbing-thresholds | If a player is equipped with climbing gear (p. 279), | `skill:athletics edge 1 [conditional] when='climb' spec=Climbing` |
| crb.drone-initiative | Drones acting on their own have an Initiative rank of | `derived:initiative-dice add 3` |
| crb.enhanced-articulation | Enhanced articulation provides you with a +1 Agility and a | `test:other edge 1 [conditional] when='when trying to move through cramped or confining spaces'` |
| crb.kamikaze | Effect: +1 Body, +1 Agility, +2 Strength, +1 Willpower, +2D6 | `LINK {'rel': 'grants', 'name': 'High Pain Tolerance'}` |
| crb.novacoke | Effect: +1 Reaction, +1 Charisma, +1 Perception, High Pain Tolerance | `LINK {'rel': 'grants', 'name': 'High Pain Tolerance'}` |
| crb.shark | Adept: Free Killing Hands power | `LINK {'rel': 'grants', 'name': 'Killing Hands', 'kind': 'adeptpowers', 'when': 'adept'}` |
| crb.snake | Adept: Free Kinesics power | `LINK {'rel': 'grants', 'name': 'Kinesics', 'kind': 'adeptpowers', 'when': 'adept'}` |
| dc.milspec-plate | This Foundation material reduces the Damage Value of any attack | `derived:damage-reduction add R` |
| emc.school-of-hard-knocks | • Game Effect: You gain one bonus point of Edge | `test:social edge 1 [conditional] when='when making social tests with fixers and mr. johnsons as well'` |
| hs.types-of-data-structures | If you use Code Shell against a Data or Resonance | `test:other edge 1 [conditional] when='if you use code shell against a data or resonance spike'` |
| lhv.fab-iii-epsilon | Apply a -3 dice pool modifier to the Biotech (medical) | `skill:biotech add -3 spec=Medicine` |
| pwp.shinto-summoner | Game Effect: Gain +1 to Summon rolls while in Shinto | `skill:conjuring add 1 [conditional] when='while in shinto shrines' spec=Summoning` |
| sco.example-of-disian-sorcery | The face with some bioware and 5.6 Essence only has | `test:other edge 1 [conditional] when='only has to oppose 3 hits'` |
| sco.example-of-disian-sorcery | The face with some bioware and 5.6 Essence only has | `test:other edge 2 [conditional] when='only has to oppose 3 hits'` |
| so.qualities-and-social-test-example | When Jazz makes his Influence (Etiquette) + Charisma test to | `test:attr-cha edge 2 [conditional] when='when jazz makes his influence (etiquette) + charisma test to behave appropriately'` |
| so.qualities-and-social-test-example | When Jazz makes his Influence (Etiquette) + Charisma test to | `skill:influence edge 2 [conditional] when='when jazz makes his influence (etiquette) + charisma test to behave appropriately' spec=Etiquette` |
| so.social-rating-example-one | If the meet was taking place in a corporate environment, | `derived:social add 2 [conditional] when='if the meet was taking place in a corporate environment'` |
| so.wooden-gun-i | If you succeed, you gain a +2 dice pool bonus | `skill:influence add 2 [conditional] when='if you succeed' spec=Intimidation` |
| swc.broad-side-of-a-barn | When attempting to hit anything with Body that is greater | `test:other edge 1 [conditional] when='when attempting to hit anything with body that is greater or equal'` |
| swc.broad-side-of-a-barn | When attempting to hit anything with Body that is greater | `test:other edge 1 [conditional] when='if you are attempting to hit anything with body that is greater'` |
| swc.quality-path-sinners-path | If your personal Heat ever reaches 10, you gain the | `LINK {'rel': 'grants', 'name': 'Records on File', 'kind': 'qualities'}` |
| ts.s-e-curity-systems-game-information | Effect: +1 Body, +1 Agility, +1 Willpower, +2D6 Initiative, High | `LINK {'rel': 'grants', 'name': 'High Pain Tolerance', 'book': 'crb'}` |
| ts.s-e-curity-systems-game-information | Effect: +4 Body, +3 Agility, +3 Reaction, +3 Strength, +3 | `LINK {'rel': 'grants', 'name': 'Toughness', 'book': 'crb'}` |
| ttp.who-wrote-the-book-hook-4 | If the team can't keep the ruse up during the | `skill:influence edge 1 [conditional] when="if the team can't keep the ruse up during the attempt"` |
| ttp.who-wrote-the-book-the-job-4 | Kludge gains a point of Edge when hacking while in | `skill:cracking edge 1 [conditional] when='hacking while in his cocoon' spec=Hacking` |
| wl.eager-to-please | On any Influence test made to issue commands (including complex | `skill:influence threshold -1` |

## Effects removed from entries nobody reviewed

Mostly rules and example entries, and attribute tests that were a word in another noun.

| Entry | Removed |
| --- | --- |
| asn.bmw-krupp-demon | `test:attr-bod wild-die 1` |
| aw.dis-magician | `test:attr-ess edge essence-lost/2 RU [conditional] when='per point of essence lost' affects=others` |
| bn.heavy-barding | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swim affects=others` |
| bn.light-barding | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swim affects=others` |
| bn.shifter-barding-light-or-heavy | `skill:athletics threshold 4 [conditional] when='if you end up in the water' spec=Swim affects=others` |
| bn.urbane-shifter | `test:attr-cha edge 1` |
| bn.urbane-shifter | `test:attr-int edge 1` |
| bs.false-front | `skill:con add R spec=Impersonate, Disguise, Impersonating` |
| bs.mimic-option | `skill:con add R spec=Impersonate, Disguise, Impersonating` |
| bs.resistance-and-adaptation | `test:attr-mag edge 1 [conditional] when='used on a radiation resistance test against background radiation or from'` |
| bs.therapeutic-nanites | `skill:athletics edge 1 [activated] when='overdrive' spec=Swimming` |
| crb.climbing-thresholds | `skill:athletics edge 1 [conditional] when='climb' spec=Climb` |
| crb.drone-initiative | `derived:initiative-dice add 6` |
| crb.dumpshock-and-link-locking | `test:attr-wil no-edge-gain 1 [conditional] when="if that weren't enough"` |
| crb.dumpshock-and-link-locking | `test:attr-wil no-edge 1 [conditional] when="if that weren't enough"` |
| crb.enhanced-articulation | `test:attr-agi edge 1 [conditional] when='when trying to move through cramped or confining spaces'` |
| crb.initiative | `derived:initiative-dice add 6` |
| crb.matrix-initiative | `derived:matrix-initiative-dice add 6` |
| crb.melee-close-combat-and-grunts-example | `test:attr-bod edge 1` |
| crb.sensors-and-scanners | `derived:initiative-dice add 1` |
| crb.step-two-distribute-edge | `test:attr-bod edge 1` |
| dc.chase-variant-races | `test:attr-agi edge 1` |
| dc.milspec-plate | `item:dv add -R` |
| emc.school-of-hard-knocks | `test:social edge 1 [conditional] when='when making social tests with fixers and mr'` |
| fbt.ba-ckground | `test:attr-res edge 1 affects=others` |
| fs.social-rating-from-armor | `test:attr-cha edge 1 [conditional] when='when comparing a social rating created by the charisma + social rating'` |
| hs.types-of-data-structures | `test:attr-res edge 1 [conditional] when='if you use code shell against a data or resonance spike'` |
| lhv.fab-iii-epsilon | `skill:biotech add -3 spec=Medical` |
| ll.drake-rules | `derived:initiative-dice add 1` |
| pwp.shinto-summoner | `skill:conjuring add 1 [conditional] when='while in shinto shrines' spec=Summon` |
| sco.disian-sorcery | `test:attr-ess edge 2 affects=others` |
| sco.example-of-disian-sorcery | `test:attr-ess edge 1 [conditional] when='only has to oppose 3 hits'` |
| sco.example-of-disian-sorcery | `test:attr-ess edge 2 [conditional] when='only has to oppose 3 hits'` |
| so.qualities-and-social-test-example | `test:other edge 2 [conditional] when="johnson's"` |
| so.social-rating-example-one | `derived:social add 2` |
| so.wooden-gun-i | `skill:influence add 2 [conditional] when='if you succeed' spec=Intimidate` |
| swc.broad-side-of-a-barn | `test:attr-bod edge 1 [conditional] when='when attempting to hit anything with body that is greater or equal, if you are attempting to hit anything with body that is greater'` |
| swc.life-path-example | `test:attr-int edge 1` |
| ttp.who-wrote-the-book-hook-4 | `skill:influence edge 1` |
| ttp.who-wrote-the-book-the-job-4 | `test:attr-bod edge 1 [conditional] when='when hacking while in his cocoon'` |

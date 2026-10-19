# SR6 reader corrections, Tier 3 build (2026-10-19)

Plan: [sr6-book-corrections-patterns-2026-10-19.md](sr6-book-corrections-patterns-2026-10-19.md) (Tier 3, approved: "fix
all this"). Tier 2 was [sr6-reader-tier2-2026-10-19.md](sr6-reader-tier2-2026-10-19.md) (PR #84); this branch,
`feat/sr6-reader-tier3`, builds on it.

## Bottom line

- **Three reader patterns are now rules** in `importer/sr6/effects.py`, each with a test
  (`BookCorrectionPatternsTier3Test` in `importer/tests/test_sr6_effects_final_review.py`, invented sentences; all four
  tests fail on the Tier 2 branch).
- **Book corrections: 347 rows down to 332.** 15 rows retired because the reader now reads what they said; 15 more rows
  had a drop refreshed to what the reader now gives (the row's own effect is unchanged). "Drop matches no effect"
  warnings: **0**.
- **CommLink6: 1,079/1,079 on the Tier 2 branch and on this one** (1,027 strict, 42 book-ruled, 10 accepted
  placeholders), full replay on the fresh runs (`cl6check-runs26`). Rows whose status differs: **0**. Retired rows whose
  effects are missing from the import: **0**.
- **In the real import, 32 entries change**: 19 are reviewed entries (retired rows, now the reader's), and **13 are
  entries nobody reviewed**, all a condition that now keeps its whole list (listed below for you to check).

## The patterns

"Entries" is the corpus run of `effects.read()` and `links()` over every entry text of `cl6check-runs26` (16,782 texts),
each pattern against the one before; "items" leaves out rule entries.

| #   | Pattern | Entries (items) | Rows retired | Rows edited |
| --- | ------- | --------------: | ------------ | ----------- |
| 1   | **The condition is the effect's own clause's** (P1). The sentence is cut into clauses at `, while/whereas`, at `, and/but/or` when a clause starts there (`, and you`, `, and an additional`, `, or +2 DV`; not a list's last item, `Stealth, Piloting, and Navigation tests`), at a dash, and at `… and provides/can/gains …` (a second verb of the same subject). Each effect's clause is the one that states it read alone; a clause that states nothing and opens with a condition or `but` (`…, while jumped in`, `…, but it is limited to …`) belongs to the clause before. When the sentence's condition is in another clause, the effect takes its own clause's condition (or the words after its tests, or none). It is kept when it is in a sentence-initial condition clause (`During this phase, …`), in the effect's own clause, or in a clause before it that states nothing (`… brought low when the drug wears off, and the user suffers -1 Willpower`). Also no condition: `even when/if/after …` (and the words of that clause), `if` after tell/see/determine/know/check/…, `while also …`, `While costs are listed for …`, `as a Minor Action` with no switch | 30 (23) | move-by-wire (rating 1, rating 2), solus, multitasking, brutal weapon | functional tail paddle, anabolic steroids, tusks (3), gearhead, spike strip, jiao di, phobia (object), lie detector, commanding voice, hip shooter, skateboard (hardened): stale drop refreshed |
| 2   | **A list in a condition is kept whole** (P10). A condition's words go on past a comma when what follows is a serial list (`, security, or law enforcement personnel`, at least one middle item and a final `or`/`and` item), or a one-word inserted alternative (`living in, or from, a rural setting`). An item that opens with a pronoun or a verb is a new clause, not the list's. A list may take the words to 16; a longer one is cut at its first item, as before; the words never end on a comma. The same holds for the words after a test name (`Influence tests with military, security, or …`) and for `test:other` words. `involving combat, stealth, or social situations` is a condition (combat is no test): only the first item decides whether the words name tests | 27 (19) | under the radar, trusted veteran, good ol' folks (Emerald City), k-puppet trauma | grey mana armor, shadow cloak: stale drop refreshed |
| 3   | **Edge when casting the spell** (owner ruling, the six Street Wyrd object spells). A spell's `Gain +1 Edge when casting the spell if …` is the caster's Edge on the casting test, `skill:sorcery` with `spec=Spellcasting`, `affects=caster`, the rest of the sentence its condition | 6 (6) | corrode, demolish, melt, ram, sludge, wreck (object) | none |

Total against the Tier 2 branch: 62 entries, 47 of them items. The 15 retired rows: 5 for pattern 1, 4 for pattern 2, 6
for pattern 3. Also fixed on the way: joining one effect's conditions from several tests split the words at `, `, so
a condition with a list in it was repeated (`…, or seoulpa ring members, when dealing with …`); it compares whole
conditions now (`effects.py`, the dedupe in `read()`).

### The old dataset's P1 rows

| Row | Entry | Now |
| --- | ----- | --- |
| #37, #348 | greasy skin (BS, SWC) | unchanged: the condition is in the sentence-initial `While not impairing …,` clause, which governs the sentence. Row stays |
| #50, #51 | move-by-wire 1, 2 | retired: +2 Reaction and Agility always on |
| #63 | toxin resistance (general) | unchanged: `is effective against a wide range …` states nothing before `and provides a point of Edge`; such a clause keeps its condition (otherwise red mescaline and the wild-zone Edge lose theirs). Row stays |
| #68 | solus | retired |
| #76-#78 | tusks | the concessive `While costs are listed …` is no condition; the stale drop is gone, the rows stay (owner ruling) |
| #89 | under the radar | retired (with pattern 2) |
| #115 | gearhead | the Edge on Repair tests is now unconditional (the downtime clause is the second verb's); drop refreshed, the row keeps `Repair tests for any vehicle` |
| #142 | hip shooter | AR +2 now unconditional (the Quick Draw clause is the second verb's); drop refreshed, the row keeps `2,2,0,0,0` |
| #143 | multitasking | retired |
| #207 | jiao di | the `even when` clause is no condition; the next one (`including while grappling`) is in a clause before that states nothing, so it stays. Drop refreshed, row stays |
| #219 | ruthenium armor | unchanged (`offers … Edge when performing Stealth tests and creates a threshold` is one clause). Row stays |
| #264 | draconic power | unchanged (`… or, if you have one at 1+, increase …`). Row stays |
| #300 | brutal weapon | retired (`even when`) |
| #305 | lie detector | `if` after `determine` is no condition; the words after the tests now read `to determine if someone is telling the truth` (one item of an or-list). Drop refreshed, row stays |
| #317 | commanding voice | `while also` is no condition; the power's `Activation: Major Action` now makes it activated. Drop refreshed, row stays |

### Where this differs from the brief, and why

- **A condition in a clause before the effect's that states nothing is kept.** The first trial moved it in that case too:
  red mescaline (`… brought low when the drug wears off, and the user suffers -1 Willpower`), the wild-zone Edge
  (`… do not suffer these penalties when in a wild Zone, and in fact benefit with a +1 Edge`) and agony lost real
  conditions. The cost: toxin resistance (#63) stays a row.
- **`, and` splits only where a clause starts.** Splitting at every `, and` cut serial lists, and Mong Kok street courier
  (`… Stealth, Piloting, and Navigation tests when operating in the streets of Hong Kong`) and representation lost
  their conditions.
- **A `, but` clause that states nothing is the clause before's limit** (dikote: `+1 AR, but it is limited to items
  that rely on a sharp edge` keeps its condition).
- **A list needs a middle item.** Sonnet's earlier trial read `, and <anything>` as a list's end; with no middle item
  `, and each one reduces the threshold` or `, and two automatic hits on damage resistance tests` became part of the
  condition (the trailing words seen in that trial). The 16-word limit replaces the cut that ended lists mid-way
  (`resisted by willpower, logic`).
- **Shadow cloak keeps a condition.** It is the entry the earlier trial left unconditional: the words now list stealth and
  social as tests, so only the list's first item (`combat`) decides; it is no test, so it is a condition.
- **The six object spells' condition is the book's wording**, `if the object is narrow rather than broad`, not your
  row's `the spell's object is narrow rather than broad (e.g., Heavy Pistol instead of Firearm)` (the reader leaves out
  parenthesized examples). Target, specialization, whom and switch are your ruling's. Say if you want the rows back for
  the example.

## Effects on entries nobody reviewed (please check)

From the real import (the branch replay against the Tier 2 branch's), item entries with no correction row or dataset row.
Every one is the same effect with a longer condition: the list the book prints.

| Entry | Was `when=` | Now `when=` |
| ----- | ----------- | ----------- |
| crb-sea.good-ol-folks (Edge, social) | `during any social interaction with people living in` | `… living in, or from, a rural setting` |
| emc.suburbanite | as above | `… living in, or from, a suburban setting` |
| emc.socialite | as above | `… living in, or from, people who` (the book goes on `who function in elite sectors`; a `who` clause ends a list) |
| da.ghillie-suit (others' Perception -2) | `when not moving` | `when not moving, or moving very slowly, and hiding in a location` |
| dc.life-safety-system-level-1, -level-2 (+6 toxin resistance) | `against any airborne drug` | `against any airborne drug, toxin, or disease that's in the air around` |
| emc.border-hopper (Edge, Outdoors and knowledge) | `used to help you determine where` | `used to help you determine where, when, and how to cross` |
| emc.carbonado-smuggler (+1 Outdoors) | `related to knowing where` | `related to knowing where, when, and how to cross the puyallup borders` |
| fs.state-of-zen (+1 magic resistance) | `when resisting spells including confusion` | `… confusion, chaos, and control thoughts` |
| pwp.dog-on-a-leash (+2 Willpower tests) | `that would result in you harming` | `that would result in you harming, defaming, or letting harm come to` |
| shc.scrappy-hipster (no Edge) | `using gear that you have not built` | `using gear that you have not built, modified, or accessorized yourself in` |
| so.interrogator (Edge, social) | `when you make a social skill test to question` | `… to question, interrogate, interview, or otherwise convince a target` |
| sw.iron-will (+1 to resist) | `limited to manipulation spells: …` | `limited to manipulation spells, critter powers, and adept powers: …` |

Reviewed entries whose import changed besides the retired rows: armor plating (hardened) (BS) `-1` on Agility, Reaction
and Strength actions now always (`Even after the critter becomes used to wearing the module, it suffers …`), M-TOC Mark I
(`to determine if a target is carrying …`), GMT dermal plating and toxic revenger (the whole list).

The corpus run shows more, not in the real import (their text there is a rule's or a table's, or a row replaces it): dual
attack (`+1 AR and +1 DV …, or +2 DV if that weapon has 5 DV or greater`: only the +2 DV conditional now), spike strip
and GMT ammunition (`even if`: no condition), essence loss and critters (`even if it's only 0.01`: the threshold's
condition is now the words after the test, `to influence, train, tame, …`), skateboards (`+2 Sprint`, and `if you
decide to` only on the wild die), the Ozaki dossier (`see if Nakazo might have an edge`: no Edge), and the whole-list
conditions of jailbreak, GMT bone lacing, cyberlimb plating, alloy arrowheads, broad side of a barn, making an easier
read.

## Checks

- `python -m unittest discover -s importer/tests -t .`: OK (27 skipped).
- `npx prettier --check .`: clean. No TypeScript touched; Anarchy untouched.
- **CommLink6 gate** (`python -m tools.cl6effects --tree <this worktree> --base <git archive of origin/feat/sr6-reader-tier2
  @ 24dbf158> --runs .extract/cl6check-runs26 --out .extract/cl6fx-t3`): tree and base both **1,079/1,079** (1,027
  strict, 42 book-ruled, 0 book-ruled keys that no longer fit, 10 placeholders); "drop matches no effect" **0** on both;
  rows whose status differs **0**; correction rows only the base has **15**, with effects missing from the tree's import
  **0**.

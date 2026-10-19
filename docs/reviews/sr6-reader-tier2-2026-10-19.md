# SR6 reader corrections, Tier 2 build (2026-10-19)

Plan: [sr6-book-corrections-patterns-2026-10-19.md](sr6-book-corrections-patterns-2026-10-19.md) (Tier 2, approved: "fix
all this"). Tier 1 was [sr6-reader-corrections-build-2026-10-19.md](sr6-reader-corrections-build-2026-10-19.md). Branch
`feat/sr6-reader-tier2`.

## Bottom line

- **Six reader patterns are now rules** in `importer/sr6/effects.py`, each with a test
  (`BookCorrectionPatternsTier2Test` in `importer/tests/test_sr6_effects_final_review.py`, invented sentences; all seven
  tests fail on main).
- **Book corrections: 362 rows down to 347.** 15 rows retired because the reader now reads what they said; 18 more rows
  lost a drop that no longer matched anything (or a part the reader now gives). "Drop matches no effect" warnings: **0**.
- **CommLink6: 1,079/1,079 on main and on this branch** (1,027 strict, 42 book-ruled, 10 accepted placeholders), the full
  replay on both (see Checks).
- **In the real import, 28 entries change**: 15 are the retired rows (same effect, now the reader's), 5 are rows that
  stay, and **8 are entries nobody reviewed**, listed below for you to check.

## The patterns

"Entries" is the corpus run of `effects.read()` and `links()` over every entry text of the saved runs (17,564 texts),
each pattern against the one before; "items" leaves out rule entries.

| #   | Pattern                                                                                                                                                                                                                                                                                                                                                                                                         | Entries (items) | Rows retired                                                                                                | Rows edited                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Activation carried forward.** A sentence that turns the thing on (`activat…`, `engage`, or an action spent) and has no effect of its own makes the rest of its paragraph `activated`; an adept power's `**Activation:** Minor/Major Action` line does it for the whole power. A sentence with its own condition, or `at all times`/`always`/`permanent`, ends it. `spend/invest/the expenditure of a Minor/Major Action` is the switch, and the sentence keeps its own condition beside it | 23 (17) | quadmod, attribute boost (attribute), attribute boost: mental, flying kick, facial sculpt, shamanic mask | toughskin (2): stale drop and the now-read Physical damage out (the +1 DV stays); determination, pheromone detection: stale drop out (the rows keep their richer condition) |
| 2   | **"Per X" that is not the rating.** `per pair of …`, `for every 5 crew`, `each level of wound penalty` (no longer read as `R`), `each drone beyond the first`: conditional, low confidence, `when="per …"` with the sentence's own condition after it. Time units, levels, ranks, points and hits are not an X; `2 meters per round per pair` is a rate's                                                     | 13 (9)  | primal rage                                                                                                 | cyberarms (2), cyber-singularity seeker, redliner, cutty sark II, essence drain: stale drops out (the rows keep their richer condition, `max +2`, the switch)                  |
| 3   | **Wild die on every test.** `a wild die to every/any/each test`, `makes a skill test`, with no skill named (outside parentheses): `test:all`, on the sentence's condition or the one after the tests                                                                                                                                                                                                              | 8 (4)   | technoregeneration                                                                                          | soul splice: stale drop and the now-read wild die out; wild soul: stale drop out (your row keeps it unconditional)                                                           |
| 4   | **"This bonus only applies …".** A sentence opening on a back-reference with `only applies/works/is only active` + `to/when/while/on/…` adds no effect; it narrows the effects of the sentence before in its paragraph (those it names, else all; not a price): tests named → retargeted, else → `when`                                                                                                        | 8 (7)   | woad, medullan parallel processors, stealthlink, soothing static                                            | machine merge: stale drop out                                                                                                                                                |
| 5   | **Edge on "this test" after one `Skill (Spec) + Attribute (N) test`.** The owner's Edge on `test:other` in the next sentence becomes that skill and specialization                                                                                                                                                                                                                                                | 7 (5)   | briefcase, explosive cosmetics eyeliner, finishing powder                                                   | none                                                                                                                                                                         |
| 6   | **Small guards.** A third party as the subject of a clause after a comma (`…, so any observers get +1`) is others' (not when the sentence opens with if/when/while); `score at least one net hit` is no `hits` value                                                                                                                                                                                             | 8 (5)   | none                                                                                                        | aztechnology death warrant, reflective eyes, admonisher, drone whisperer: stale drops out; spell components: the drop follows the junk effect, now `activated`              |

Per-pattern total: 66 entries against main, 47 of them items.

### Where this differs from the brief, and why

- **`also` does not end the carried activation.** With it, quadmod's and great leap's `They also get +1 die on the
  Jumping test per level` (after `requires a Minor Action to activate`) stayed always on; in the whole corpus `also`
  stopped nothing else. `at all times`, `always`, `permanent` stay as stops.
- **Only `activat…`, `engage` or an action spent starts the carry.** The first trial let any switch start it: `requiring a
  Minor Action` in light combat armor (a critter's discomfort, Wild Life) made its Defense Rating `activated`, and
  `swapped with a Minor Action` made both collapsible-stock settings activated.
- **The condition is kept beside the switch only for an action spent** (`spend/invest/expenditure of`). Keeping it for
  every `activated` sentence gave adrenaline pump `if your stun condition monitor is filled`, the vat-job pack `when it
  runs out` and nimble fingers a condition from another clause. The three entries the earlier trial broke are right now:
  `swc.social-actions` (`when performing a verbal attack`, activated), `so.informed-opinion-a` (activated, its knowledge-skill
  condition kept), `crb.cover-i-ii-iii-iv` (unchanged, `while attacking from cover`).
- **Essence drain stays a row.** Its switch sentence (`… with a Minor Action`) names no activation, so the carry does not
  start; the reader now gives `per point of essence spent` (conditional) and your row's activated effect replaces it.

## Effects on entries nobody reviewed (please check)

From the real import (the branch replay against main's), item entries only. "Reviewed" means a correction row or a dataset
row exists.

| Entry                                     | Was                                                       | Now                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| so.authoritative-tone                     | `skill:influence add R spec=Leadership`                   | the same `[activated]` (Activation: Major Action)                                                                         |
| sw.great-leap                             | `skill:athletics add R spec=Jumping`                      | the same `[activated]` (Activation: Minor Action; `after investing a Minor Action`)                                       |
| so.thermal-mood-reading                   | `derived:judge-intentions edge 1`                         | the same `[activated]` (`the expenditure of a Minor Action`)                                                              |
| so.vocal-tension-detection                | `derived:judge-intentions edge 1`                         | the same `[activated]` (`the expenditure of a Minor Action`)                                                              |
| so.explosive-cosmetics-lipstick           | `test:other edge 1 [conditional] when='if the user has the chemistry knowledge skill'` | `skill:engineering edge 1 [conditional] spec=Demolitions`, same condition (`Engineering (Demolitions) + Logic (3) test`) |
| so.explosive-cosmetics-nail-polish-remover | as lipstick                                              | as lipstick                                                                                                               |
| hs.response-increase                      | `derived:matrix-initiative-dice add R [conditional] when='in vr mode'` | when `'in vr mode, when used with a cyberhack'` (`These only function when used with a cyberhack`)          |
| hs.icu                                    | `skill:perception edge 1 [conditional] when='spot an icon that is running silent'` | when adds `', when it is relevant to the story-just cruising around town spotting random'` (`This only applies when it is relevant to the story`): a GM call, the words are the book's |

Rows that stay and changed in the import: machine merge (piloting and engineering +1 now say `tests made to operate the
vehicle or drone and its systems`), teamwork makes the drones work (`per drone beyond the first`, low confidence; the
reader's `test:all` beside your `test:other` was there on main too).

The corpus run shows four more, not in the real import (their text there is a rule's or a table's): aw.prehistoric-piranha
(`item:ar` 1 and 4 now `per 2 additional fish`, low), hs.primal-sprite (new `test:all wild-die 1` "whenever a primal
sprite makes any test"), aw.prepare-to-board (Edge `hits` → 1, `at least two net hits`), so.waterworks and
swc.spell-adjustments (actions: activated).

## Checks

- `python -m unittest discover -s importer/tests -t .`: 1,364 tests, OK (27 skipped).
- `npx prettier --check .`: clean for the tracked tree. No TypeScript touched; Anarchy untouched.
- **CommLink6, full replay** (`cl6measure` pipeline: `make_fixed_runs23`, `cl6rows21`, `linkpass21`, `build25`,
  `eval25`) on a `git archive` of main (`t2base`) and on this branch (`t2new`): both **1,079/1,079** (1,027 strict, 42
  book-ruled, 10 placeholders; 0 book-ruled keys that no longer fit). "Drop matches no effect" warnings: 0 on both.
- **Retired rows in the real import:** every effect of the 14 retired rows that have effects is in the branch run's
  `custom/sr6/imported/<book>/*.xml`, target, operation, value, switch, specialization and whom it affects equal (17
  entry copies, the core rulebook's in four runs); 8 have the reader's own wording for the condition (medullan `while the
  user is jumped-in`, stealthlink `when resisting a matrix perception action`, technoregeneration `when making any test
  using the device`, primal rage `per level of wound penalty` and low confidence, briefcase `if you are dressed to fit the
  role`, eyeliner and finishing powder `if the user has the chemistry knowledge skill`, soothing static without `(min cost
  1)`). Woad (a drop-only row) has one Agility +2, `activated` "while the user is currently raging".

Not in this PR: clause-scoped condition selection and comma lists (Tier 3).

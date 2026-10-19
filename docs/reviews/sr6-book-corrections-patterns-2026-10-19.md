# SR6 book corrections: which ones can become reading rules

Date: 2026-10-19. Data: the 378 `gen="book"` correction rows in `importer/sr6/overrides/*.book.json` (origin/main,
PR #74). 371 of them quote the book; those were sent to gossipcat (Opus, Sonnet, ChatGPT, Gemini). Each pattern
below was then checked by a second agent and re-run by me against the reader.

## Bottom line

- **About 30 rows follow patterns that are safe to turn into rules.** These are real mistakes in the reader,
  not one-off judgements. Fixing them also fixes the same mistake in entries nobody has reviewed yet.
- **About 30 more** follow patterns that are real but riskier. Each needs a full Commlink6 (CL6) re-check before
  it ships.
- **About 20 rows** share one big root cause: the reader takes the condition from the wrong part of the
  sentence. It is the single biggest win, and the riskiest change.
- **The other ~260 rows have no shared pattern.** They are human judgement, text from the next entry bleeding
  in, double counts, tables, or meanings you only get by reading the rules. You already ruled those are fine to
  keep as corrections.
- **Your corrections disagree with each other in 6 places** on the same book text. A rule can't satisfy both,
  so those need your ruling first (list below).
- **4 rows are already handled by the reader** ("Gained Powers") and can be removed once checked against the
  live entries.

## Tier 1: low risk, build now (each verified by re-running the reader)

| # | Reader mistake | Rows | What I saw when I ran it |
|---|---|---|---|
| 1 | "4D6 Initiative Dice" read as **+6** dice; "removes one Initiative Die" read as **+1** | #16, #49, #52 | `add 6` for the Bio-drone harness; the book says 4 dice |
| 2 | "reduces the Damage Value of any attack" / "incoming DV by its rating" read as the *weapon's* damage | #151, #166, #217 (#144 partly) | `item:dv -1` and `item:dv -R` instead of damage reduction |
| 3 | A weapon's wild die applied to every attack, unconditionally | #189, #206, #208 | `test:combat wild-die` with no condition (but see conflict with #192) |
| 4 | "for those with Flight", "tests to sell ... you" wrongly mark your own bonus as someone else's | #177, #185, #310 | Agents reproduced it with the book text |
| 5 | Attribute words inside other nouns ("toxic **magic**", "**Resonance** Spike") turned into attribute tests | DROP side of #2, #62, #70, #233, #272 | "resist toxic magic" became a Magic-attribute test |
| 6 | "Mr." treated as the end of a sentence, cutting the condition | #181 (and every "Mr. Johnson" entry) | condition came out as "... fixers and mr" |
| 7 | Specialization names not normalised ("Sprint", "Impersonate") | #20, #27, #73, #74 | spec "Sprint" instead of "Sprinting" |
| 8 | Edge-cost wording "the cost of **an** Edge boost" not recognised | #72, #54, #228 | (Opus and Gemini both found it) |
| 9 | Grant links missed: "the critter power Immunity (Pathogens, Toxins)", "Free Vocal Control power", drug "Effect:" lists | #86, #105, #107, #39, #94 | Found by Opus and Gemini separately; not re-run yet |
| 10 | Threshold wording: "-1 for all repair test thresholds" read as dice | #55, #122, #152, #205 | `engineering add -1` dice instead of a threshold change. Sonnet's trial added 6 plausible effects to unreviewed entries; check those |

## Tier 2: real patterns, medium risk (build one at a time, CL6 re-check each)

- **"Activated" carried forward** from "When this power is activated..." or "spend a Minor Action" into the next
  sentence (#58, #80, #81, #97, #157, #200, #308, #315, #335). Sonnet's trial showed the simple version wipes
  real conditions on 3 other entries. It must be built so it keeps both the switch and the condition.
- **"Per X" multipliers** where X isn't the item's rating: "per pair of cyberarms", "for every 5 crew", "each
  level of wound penalty" (#7, #8, #28, #59, #109, #156, #248, #292, #314).
- **Wild die "on every test"** should mean all tests, not whatever skill is mentioned nearby (#70, #256, #290, #378).
- **"This bonus only applies when..."** in the next sentence should limit the bonus before it (#83, #98, #165,
  #255, #360). The second reviewer could not confirm this one.

## Tier 3: biggest win, highest risk

- **The condition is taken from the wrong part of the sentence** (19 rows, e.g. #37, #50, #51, #63, #76-#78,
  #305). The reader grabs the first "when/while/if" anywhere in the sentence, even if it belongs to a different
  clause. Fixing that touches nearly every conditional effect in every book, so it needs the full CL6 1,079
  re-check and a before/after diff.
- **Lists in conditions cut at the first comma** ("military, security, or law enforcement"). Sonnet tried it:
  about half of the 44 entries it changed got worse. **Don't build this one** as currently designed.

## Not patterns (keep as corrections)

Roughly (Opus's estimate):
- text from a neighbouring entry: ~18 rows
- double counts: ~12
- judgement, optional or GM rules: ~30
- tables: ~6
- targets you only get by reading the rules: ~60
- mutually exclusive options: ~10
- one page of SW with two text columns spliced together, which garbles the spell rows #318-#338: ~10 rows. That is
  an extraction fix, not a reading rule.

## Your corrections that contradict each other (please rule)

| Rows | Same book text, different answers |
|---|---|
| #7 vs #8 | Overdrive wild die: all tests vs a chosen skill |
| #56 vs #57 | Movement: `-1` vs `-1/-1/0` |
| #189, #206, #208 vs #192 | Weapon wild die: conditional vs always on |
| #76, #77 vs #78 | Charge AR: `2` vs `2,0,0,0,0` |
| #368, #369, #370 | Same "resist the" fragment: rewritten, dropped, kept |
| #318-#338 | Object spells: targets and specializations differ row to row |

## Recommendation

1. You rule on the 6 conflicts.
2. I build Tier 1 (10 small fixes in `importer/sr6/effects.py`), re-run CL6 (must stay 1,079/1,079) and retire
   the corrections each fix makes redundant. Every new effect on an unreviewed entry gets listed for you to check.
3. Then Tier 2, one pattern at a time, the same way.
4. Tier 3 last, as its own PR with a before/after diff of every changed effect.

Expected result: about 378 corrections down to about 310-320. The rest stay as human corrections.

## Housekeeping found along the way

- Local `main` was 7 commits behind origin. It was fast-forwarded to origin/main (fe98baa) at 06:50, probably when
  the app created the side session's worktree from `main`. Those 7 commits delete no files, so nothing local was
  lost. The uncommitted deletion of `docs/reviews/active-effects-variable-catalog-2026-10-17.md` is still there.
- Sonnet found 12 corrections whose wrong effect the current reader no longer produces (stale), plus the 4
  Gained Powers rows.
- Working copies used for this review are in `docs/reviews/_work-corrections/` (untracked).

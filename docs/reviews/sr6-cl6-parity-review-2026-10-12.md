# SR6 Chummer ⇄ CommLink6 parity review — 2026-10-12

3-model consensus (Opus · GPT-5.5 · Gemini), every finding verified against the real code and the
`cl6check` trace. **Analysis only — no code or data changed.** Ground truth: `tools/cl6check` vs
`commlink6-1.14.0-complete.jar`, full 74-book SR6 corpus, 4,410 CommLink6 records, 12,916 fields.
Artifacts (gitignored): `.extract/cl6check/cl6-report.md`, `cl6-trace.md`, `cl6-diffs.csv`, `cl6-metrics.json` (baseline).

## Headline (measured)

| Measure | Value |
|---|---|
| Completeness | **95.83%** (4,226/4,410; 96.68% of owned pages) — ~184 missing |
| Accuracy | **89.82%** raw · **92.0%** counting verified printed differences (class b) |
| "class-a" (importer error) count | 99 **— but overstated, see below** |

## Most important consensus finding: the 99 "class-a errors" are inflated

GPT caught, and Opus + manual verification confirmed, that several "class-a" rows (where the tool
says the PDF prints CommLink6's value and we're wrong) are **mis-classified**:

- **CommLink6-only metadata, not printed in any book.** Shifter Barding `rating 1–20`, the Body
  Shop BTL block `rating 1–6`, Asphyxia Spores `avail 4` — all tagged `Commlink6-only field` in
  `cl6-trace.csv` (218/220/270/325). The PDF prints no such value; leaving ours empty is correct.
- **Our value IS the printed value.** Smart Clothes cost: diff shows cl6=`1500` vs ours=`1500 +
  (Rating x 250)`, but `cl6-trace.csv:221` records our value as the BN catalog's **own printed row**
  ("printed with a note"). Flattening to 1500 would regress against the book.
- **Intentional omissions.** Increased Myelination (nested run-in variant) deliberately carries
  `missing` issues because the table leaves its values out (`catalog.py:1220-1224`).

**Implication:** true accuracy is materially higher than 89.82%, and the single highest-value,
zero-risk fix is to **correct the measurement**, not the data — add a `cl6check` arbitration guard
that demotes any diff whose trace says `Commlink6-only field`, `weak link`, or whose `own row`
evidence contradicts the class-a label. Without it, chasing "class-a to zero" would drive the
importer to **invent** values the books never printed.

## What we got right

- **100% accurate** categories: actions, martial arts/techniques, metamagics, metatypes, mentor
  spirits, traditions, skills, echoes, vehicle design, datastructures; packs 99.4%.
- **Vehicle stat blocks** ~100% (body/armor/accel/pilot/sensor/top-speed). Qualities 99.7% complete /
  96% accurate; spells 98.9% complete.
- **Engine & schema model effects richly and correctly** — `src/sr6/engine/effects.ts` (`effectValue`
  parses per-rating `R`, `R*2`, `R-1`, `byRating` tables; `effectBonuses` maps `attr:`/`skill:`/`test:`/
  `derived:` with switch/when/spec/affects), schema `Effect` type at `common.xsd:326`. The low effect
  numbers are **not** a model weakness.
- The data model **already captures rating ranges** (`common.xsd:453`, widely populated), and the
  importer **already extracts** `(Rating X–Y)` from gear/electronics names (`catalog.py:705`,
  `TAG_RATING` 709, SIZE/LEVEL columns 711-716, rated-price fallback 915-920). *(This corrected
  Gemini's "no gear rating extraction" claim.)*

## What we missed, and why

### 1. Active effects — the biggest *clarity* gap (importer extraction, not model)
`effects` reproduced 0.9% (7/774); slots 0.8%; subtype/flags/requires/variants/relevance 0%.
CommLink6 has 3,411 modifiers; our prose grammar (`effects.py`) aligns only 22.29% to a target+value
sentence and its top-50 templates reproduce 13.31%. The schema and engine absorb output unchanged —
this is a dedicated **importer-grammar workstream** growing templates against the mined path
vocabulary (character/roll 501, character/attribute 406, item/slot 847, item/includes 840).

### 2. Completeness — 184 missing (PDF reading)
- **87 "name not in our converted text"** → `convert.py`/`reflow.py` PDF-layer extraction failures
  (ligatures, fonts, vector-path text). Hardest; the raw text layer.
- **22 "only in running text"** → `sections.py`/`regroup.py` promote only headings, bold run-ins and
  table rows; items listed in inline prose (New Orleans, Tarnished Star) are invisible.
- **10 regroup-dropped rows + 8 uncatalogued blocks** → `_valueless()`/`_TEXT_ROW` drops and
  `tables.kind_of()` column-match failures in non-standard tables (Krime, Kechibi).

### 3. Availability (the real *accuracy* lever)
~55 of the (overstated) class-a are "avail: ours empty" on gear/electronics. After the arbitration
guard removes the CommLink6-only ones, the residue should be fixed **only where the trace shows
`own row` PDF evidence** — never by copying CommLink6's number onto a row the book left blank.

### 4. Per-rating ranges
Extraction already exists for printed ranges. The residual ~29 are items whose range is **only
implied** by a per-rating cost formula or a shared group/table header, with **no printed token**.
Fix = a separate **inferred rating-range** model (derived from the cost formula's span), kept
distinct from printed ratings so it never masquerades as book data.

## Confirmed bug (clean, do first after the guard)
`importer/sr6/effects.py:477/506` writes `affects="others"` (owner decision #16), but both XSDs allow
only `caster|target` (`common.xsd:358`, `character.xsd:450`) → **37 imported files / 20 core books
fail `tools/validate-data.mjs`**. The engine already handles `others` correctly
(`effects.ts:112/279/317`). **Fix: add `<xs:enumeration value="others"/>` to `common.xsd` only** +
an XSD regression test. **Do NOT add it to `character.xsd`** until the character runtime
(`src/shared/effects.ts`, `charxml.ts:321`, the Bonus model, UI) is updated to preserve/suppress
`others` — otherwise a player's "others" bonus becomes schema-valid but is silently parsed as a
self-bonus (worse than failing). *(GPT, confirmed by Opus + manual.)*

## Ranked fix plan toward 99/99 (verified, by value × safety)

1. **cl6check arbitration guard** — demote `Commlink6-only field` / `weak link` / `own-row-contradicting`
   diffs out of class-a. Re-measures accuracy honestly; **zero data risk.** Do first.
2. **`affects="others"` → `common.xsd` only** + XSD regression. Unblocks 20 books' validation gate.
3. **Availability extraction, evidence-gated** — fix only rows with `own row` PDF evidence (~tens).
4. **Inferred rating-range model** for implied-not-printed per-rating items (separate from printed).
5. **Effects-grammar expansion** in `effects.py` against the modifier vocabulary — the long-tail
   push toward 99% effect clarity (the largest single effort).
6. **PDF-reading for completeness** — inline-prose promotion (22), regroup/classifier fixes (10+8),
   then the hard `convert.py`/`reflow.py` text layer (87).
7. **Dash normalization** — unify en-dash vs ASCII-hyphen rating ranges at the single format point
   (latent `cl6check` class-c inflater). Cleanup.

## Disputes resolved (for the record)
- Gemini: "AVAIL regex drops cells" → **refuted.** `_repair_row` preserves non-fitting cells as
  printed (`regroup.py:626/639`); a formula avail is preserved in `cl6-diffs.csv:88-89`. The avail
  losses are PDF dashes/blank cells, not rejected formulas. "Relax the regex" would recover nothing.
- Gemini: "no gear rating extraction" → **refuted**; `catalog.py:705` already does it.
- Opus: "compendium.test.ts checks schema comments vs engine" → **refuted** by GPT; it checks field
  names/types, not comments. (Comment extension still worth doing, just not test-enforced.)

## Agent scoring this round
gpt-reviewer +6 (the mis-classification catches — highest value), opus-reviewer +3/−1, gemini-reviewer
+1/−4 (correct counts, wrong mechanisms). Consensus id `78f71cc8-230f4f25`.

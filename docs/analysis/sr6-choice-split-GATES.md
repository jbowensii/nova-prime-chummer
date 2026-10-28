# GATES — SR6 break-apart-choices program (unlazy)

Stage A shipped (sorts). B/C/D below. Each gate: observable outcome + runnable check.

## Stage B — recognize every choice type + apply its effect
- B1 choiceOptions returns ordered options for a `selection`-part attribute choice (Way drain attr).
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "attribute selection"
  EXPECT: 1 passed
- B2 choiceOptions returns options for a SKILL selection (resolved to skill names, ordered).
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "skill selection"
  EXPECT: 1 passed
- B3 choiceOptions returns the Way qualities for a QUALITY selection (Finding Your Way), ordered.
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "quality selection"
  EXPECT: 1 passed
- B4 choiceOptions returns the matrix attributes for an ITEM_ATTRIBUTE selection, ordered.
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "matrix selection"
  EXPECT: 1 passed
- B5 a TEXT selection stays free-text (choiceOptions undefined → no dropdown).
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "free text"
  EXPECT: 1 passed
- B6 picking a Way on Finding Your Way GRANTS that Way quality (effect applied).
  CHECK: npx vitest run tests/sr6/runner-builder/choice-types.test.ts -t "grants the chosen"
  EXPECT: 1 passed
- B-gate full suite + tsc.
  CHECK: npx tsc -b && npx vitest run tests/sr6/runner-builder tests/sr6/catalog
  EXPECT: passed

## Stage C — break ≤12-option choices into directly-pickable ordered rows
- C1 add-picker expands a ≤12-option choice entry into one row per option, ordered.
- C2 big (>12) and open-ended choices keep a single row + dropdown.
- C3 picking a split row stores the entry with the chosen note (effect applies).
  CHECK: npx vitest run tests/sr6/runner-builder/choice-split.test.ts
  EXPECT: passed

## Stage D — choice control on Augmentations / Critters / Martial Arts tabs
- D1 each tab renders the choice picker for a choice-bearing entry.
  CHECK: npx vitest run tests/sr6/runner-builder (tab render tests)
  EXPECT: passed

## Ceilings / abandons
- matrix ITEM_ATTRIBUTE choice: the chosen attribute is a Matrix device/persona attribute, not a
  character attribute the builder computes — B4 ensures it DISPLAYS + records the pick; applying it
  to a persona is out of the character-builder's scope (ABANDON B4-effect: persona attrs not modeled here).

# SR6 "break apart choices + order lists" review and plan

Owner ask (2026-10-28): items that are combined choices should be broken into separate,
ordered, directly-pickable rows; lists reduced and alphabetized; every such item must
display properly and apply its effect. Goes beyond adept powers. Do the held items too.

## Findings (from the read-only audit)

The choice mechanism is centralized: `src/sr6/runner-builder/domain/creation/choices.ts`
(`choiceOptions`) + three UI sites (Qualities, Magic, Ledger learn-picker). But it only
recognizes `ATTRIBUTE` and `SKILL` choice types. The catalog carries **six** choice-type
families; the other four render **no picker** (blank free-text or nothing) and never apply:

- `QUALITY` choice — Finding Your Way (9 Ways)
- `ITEM_ATTRIBUTE` / `matrix:choice` — Matrix Attribute Advancement (4), Designer (2)
- constrained `GEAR` — armor resistance lines (2–3)
- `DRAIN_MAGE`/`DRAIN_ADEPT` with a sibling `selection type=ATTRIBUTE` — Way drain qualities (3);
  these are really attribute choices hiding behind a non-ATTRIBUTE type.

Three tabs never call the choice code at all (so choices on their entries show no control):
**Augmentations, Critters, Martial Arts**.

Option counts (corrected): attribute ≤8; skill ~19–21 (not 50+); book-constrained subsets 2–6.

### Held items — status
- "Learn spell/ritual/complex form/adept power" → **already 4 separate ops** (done).
- Spend "What" list → **already alphabetized + Find box** (done).
- One-item-per-level → **done, kind-agnostic** (`levels.ts` expands all kinds).
- Remaining: a handful of unsorted catalog-name `<select>`s.

## Owner decisions (2026-10-28)
1. Split threshold: **≤12 options → directly-pickable rows**; keep a dropdown for the full
   ~20-skill lists and open-ended gear/adept-power picks (40+).
2. Alphabetize **catalog-name lists only**; leave the runner's owned-item lists in
   insertion order.

## Staged plan (all code-only — no reimport)
- **Stage A — order fixes.** Alphabetize the unsorted catalog-name selects (Method metatype /
  magic kind / aspected skill, Ledger lifestyle, ammo material). *(This PR.)*
- **Stage B — recognize all choice types.** Extend `choiceOptions` to return ordered options
  for QUALITY, ITEM_ATTRIBUTE/matrix, constrained GEAR, and DRAIN_* sibling-attribute, so the
  three existing tabs show a proper ordered picker for every choice entry. Verify each applies
  its effect (wire the effect path where missing).
- **Stage C — break apart into rows.** In the add-pickers, expand ≤12-option choices into one
  directly-pickable, ordered row per option (note pre-set at add time); keep a dropdown for the
  big lists. Remove the now-redundant post-add dropdown for split entries.
- **Stage D — add the choice control to Augmentations, Critters, Martial Arts tabs.**

Each stage: tsc -b + lint + format + targeted tests green; owner verifies on tower04.

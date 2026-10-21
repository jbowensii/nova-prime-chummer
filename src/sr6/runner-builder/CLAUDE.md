# sr6/runner-builder

Build a runner, from creation through review to career. Shadowrun 6 only.

- **Owns:** `src/sr6/runner-builder/` (51 files, ~178k tokens); tests `tests/sr6/runner-builder/`; e2e `sr6-accessories.spec.ts`, `sr6-builder.spec.ts`, `sr6-lifepath.spec.ts`, `sr6.spec.ts`.
- **Public interface** (names other modules import; 118 in all, most used first): `useSr6Editor`, `band`, `br`, `n`, `poolOn`, `priced`, `runnerView`, `attrShown`, `exportSr6`, `gradeName`, `adeptDrainLabel`, `ATTR_NAMES`, `entryOf`, `NPC_KINDS`. Used by: `sr6/compendiums`, `sr6/designer`, `sr6/foundry`, `sr6/game-data`, `sr6/npcs`, `sr6/print`, `sr6/runner-library`, `sr6/shell`.
- **Imports today** (rank 10; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `features/catalog-edits`, `features/runner-store`, `features/campaigns`, `sr6/table-setup`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game; inside `domain/`, creation <- review <- career (`assets` sits outside that order).
- **Test:** `npx vitest run tests/sr6/runner-builder`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Sub-folders** (read the one you work in): `domain/creation` (build, budgets, actions; ~149k tokens), `domain/review` (`rules.ts`), `domain/career`, `domain/assets` (owned critters, vehicle mods, designs), `ui/` (editor kit, `view.ts`), `ui/tabs/`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/runner-builder/`, same file names, different rules): `career.ts`, `derive.ts`, `npc.ts`, `editor.ts`, `NpcBlock.tsx`, `Attributes.tsx`, `Concept.tsx`, `Gear.tsx`, `Ledger.tsx`, `Review.tsx`, `Skills.tsx`.

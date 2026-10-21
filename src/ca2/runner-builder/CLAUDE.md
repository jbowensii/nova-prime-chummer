# ca2/runner-builder

Build a runner, from creation through review to career. Anarchy only.

- **Owns:** `src/ca2/runner-builder/` (20 files, ~55k tokens); tests `tests/ca2/runner-builder/`, `tests/ca2/runner-builder/books/`, `tests/ca2/runner-builder/engine/`, `tests/ca2/runner-builder/ui/`; e2e `knowledge.spec.ts`, `starting.spec.ts`.
- **Public interface** (names other modules import; 52 in all, most used first): `ampCtx`, `ampRating`, `editHref`, `ampEssence`, `balance`, `Editor`, `EditorCtx`, `effectLines`, `NpcBlock`, `poolMarks`, `readSample`, `useEditor`, `AmpBuilder`, `ampFromTemplate`. Used by: `ca2/book-import`, `ca2/foundry`, `ca2/game-data`, `ca2/npcs`, `ca2/print`, `ca2/runner-library`, `ca2/shell`.
- **Imports today** (rank 10; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `ca2/catalog`, `core/ui-kit`, `features/catalog-edits`, `features/runner-store`, `features/catalog-browser`, `ca2/table-rules`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/runner-builder` (also `tests/ca2/runner-builder/books`, `tests/ca2/runner-builder/engine`, `tests/ca2/runner-builder/ui`); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/runner-builder/`, same file names, different rules): `career.ts`, `derive.ts`, `npc.ts`, `editor.ts`, `NpcBlock.tsx`, `Attributes.tsx`, `Concept.tsx`, `Gear.tsx`, `Ledger.tsx`, `Review.tsx`, `Skills.tsx`.

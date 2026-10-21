# ca2/game-data

Game data and rules reference pages. Anarchy only.

- **Owns:** `src/ca2/game-data/` (3 files, ~9k tokens); tests `tests/ca2/game-data/`.
- **Public interface** (names other modules import; 9 in all, most used first): `CatalogEdits`, `DataScreen`, `Entry`, `EntryForm`, `FormKind`, `nameOf`, `NOUN`, `RulesScreen`, `slug`. Used by: `ca2/compendiums`, `ca2/shell`.
- **Imports today** (rank 12; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/catalog-edits`, `features/ai-assist`, `features/catalog-browser`, `ca2/table-rules`, `ca2/runner-builder`, `ca2/foundry`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/game-data`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/game-data/`, same file names, different rules): `EditEntry.tsx`, `Rules.tsx`, `Data.tsx`.

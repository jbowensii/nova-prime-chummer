# sr6/game-data

Game data and rules reference pages. Shadowrun 6 only.

- **Owns:** `src/sr6/game-data/` (3 files, ~6k tokens).
- **Public interface** (names other modules import; 3 in all, most used first): `Sr6Data`, `Sr6EntryFields`, `Sr6Rules`. Used by: `sr6/compendiums`, `sr6/shell`.
- **Imports today** (rank 12; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/catalog-edits`, `features/ai-assist`, `features/catalog-browser`, `sr6/runner-builder`, `sr6/foundry`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/game-data/`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/sr6/edits.py`, `importer/tests` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/game-data/`, same file names, different rules): `Data.tsx`, `EditEntry.tsx`, `Rules.tsx`.

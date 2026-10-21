# ca2/book-import

The UI for reading a book PDF into the catalog. Anarchy only.

- **Owns:** `src/ca2/book-import/` (1 files, ~6k tokens); tests `tests/ca2/book-import/`; e2e `coreai.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `BookReview`. Used by: `ca2/shell`.
- **Imports today** (rank 13; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`, `features/book-library`, `ca2/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/book-import`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/ai`, `importer/effects.py`, `importer/recipes`, `importer/statblock.py`, `importer/tests` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.

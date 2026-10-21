# ca2/catalog

Load the books' catalog, apply house overlays, build typed views. Anarchy only.

- **Owns:** `src/ca2/catalog/` (4 files, ~6k tokens); tests `tests/ca2/catalog/`, `tests/ca2/catalog/books/`, `tests/ca2/catalog/data/`; e2e `canon.spec.ts`, `effects.spec.ts`, `sources.spec.ts`.
- **Public interface** (names other modules import; 8 in all, most used first): `levelLabel`, `dupeGroups`, `dupeLabel`, `familyName`, `levelsOf`, `loadCatalog`, `rescope`, `RULE_EFFECTS`. Used by: `ca2/runner-builder`, `ca2/shell`, `ca2/table-rules`.
- **Imports today** (rank 2; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/catalog` (also `tests/ca2/catalog/books`, `tests/ca2/catalog/data`); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/book-discrepancies.md](../../../docs/book-discrepancies.md), [docs/data-format.md](../../../docs/data-format.md).
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/catalog/`, same file names, different rules): `levels.ts`, `load.ts`.

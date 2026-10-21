# features/catalog-edits

Edit or correct catalog entries. Routes `/api/edits*`, `/api/samples`.

- **Owns:** `src/features/catalog-edits/` (2 files, ~4k tokens); tests `tests/features/catalog-edits/`; e2e `edits.spec.ts`; server `server/edits.mjs`.
- **Public interface** (names other modules import; 10 in all, most used first): `EditButton`, `EditedMark`, `EditKind`, `editState`, `OverrideFiles`, `useOpenEdit`, `EditCatalog`, `OpenEdit`, `OverrideGame`, `Target`. Used by: `ca2/game-data`, `ca2/runner-builder`, `ca2/table-rules`, `sr6/game-data`, `sr6/runner-builder`.
- **Imports today** (rank 6; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/catalog-edits`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/edits.py`, `importer/tests` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`.

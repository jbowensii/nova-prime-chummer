# core/shared

XML, formula, effect and source primitives, plus the types both games share (`newId`, `Violation`/`Severity`, `Override`, backdrops, identity).

- **Owns:** `src/core/shared/` (7 files, ~7k tokens); tests `tests/core/shared/`; server `server/common.mjs`, `server/games.mjs`.
- **Public interface** (names other modules import; 49 in all, most used first): `newId`, `Violation`, `bracketed`, `esc`, `SOURCE_ID`, `formulaText`, `escAttr`, `Formula`, `Issue`, `NameField`, `canFinalize`, `Codec`, `fieldName`, `formulaOf`. Used by: `ca2/book-import`, `ca2/catalog`, `ca2/formats`, `ca2/game-data`, `ca2/print`, `ca2/runner-builder`, `ca2/shell`, `core/ui-kit`, … (+15 more).
- **Imports today** (rank 0; may import only lower-ranked modules, and only their public names): nothing.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/core/shared`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/__init__.py`, `importer/reflow.py`, `importer/tests`, `importer/xmlio.py` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`; a shared type change moves both games.

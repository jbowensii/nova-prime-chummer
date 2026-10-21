# features/book-library

Upload books, run imports, watch progress. Routes `/api/books*`, which start `python -m importer`.

- **Owns:** `src/features/book-library/` (1 files, ~8k tokens); tests `tests/features/book-library/`; e2e `books.spec.ts`, `reimport-all.spec.ts`, `sr6-books.spec.ts`; server `server/books.mjs`, `server/jobs.mjs`, `server/library.mjs`, `server/resume.mjs`.
- **Public interface** (names other modules import; 4 in all, most used first): `BooksHeader`, `BooksScreen`, `PROVIDER_NAMES`, `Book`. Used by: `ca2/book-import`, `ca2/shell`, `features/ai-assist`, `sr6/shell`.
- **Imports today** (rank 6; may import only lower-ranked modules, and only their public names): `ca2/formats`, `sr6/formats`, `core/ui-kit`, `core/chrome`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/book-library`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/__main__.py`, `importer/convert.py`, `importer/library.py`, `importer/pdf`, `importer/tests`, `importer/CLAUDE.md` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`.

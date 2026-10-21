# features/catalog-browser

Browse game data (no server routes).

- **Owns:** `src/features/catalog-browser/` (2 files, ~4k tokens); tests `tests/features/catalog-browser/`; e2e `gamedata.spec.ts`, `hover-statblock.spec.ts`, `issues-formulas.spec.ts`.
- **Public interface** (names other modules import; 3 in all, most used first): `BookSelect`, `GameDataPage`, `BrowseKind`. Used by: `ca2/game-data`, `ca2/runner-builder`, `sr6/game-data`.
- **Imports today** (rank 8; may import only lower-ranked modules, and only their public names): `core/shared`, `core/ui-kit`, `core/chrome`, `features/ai-assist`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/catalog-browser`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

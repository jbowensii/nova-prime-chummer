# features/compendiums

Share house content with a table. Routes `/api/compendiums*`.

- **Owns:** `src/features/compendiums/` (2 files, ~6k tokens); tests `tests/features/compendiums/`; e2e `player-compendiums.spec.ts`; server `server/compendiums.mjs`.
- **Public interface** (names other modules import; 20 in all, most used first): `listCompendiums`, `parseRows`, `BookProps`, `CompendiumShell`, `CompGame`, `CopyButton`, `CopyDialog`, `deleteCompendium`, `entries`, `Entries`, `listShared`, `PageProps`, `readable`, `saveCompendium`. Used by: `ca2/compendiums`, `ca2/npcs`, `ca2/shell`, `sr6/compendiums`, `sr6/npcs`, `sr6/shell`.
- **Imports today** (rank 9; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/campaigns`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/compendiums`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

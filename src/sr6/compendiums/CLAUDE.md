# sr6/compendiums

Compendium pages (house content shared with a table). Shadowrun 6 only.

- **Owns:** `src/sr6/compendiums/` (2 files, ~4k tokens); tests `tests/sr6/compendiums/`; e2e `sr6-compendiums.spec.ts`.
- **Public interface** (names other modules import; 5 in all, most used first): `listSr6Compendiums`, `moveNpcsIn`, `parseSr6Rows`, `saveSr6Compendium`, `Sr6Compendiums`. Used by: `sr6/npcs`, `sr6/shell`.
- **Imports today** (rank 13; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/compendiums`, `sr6/table-setup`, `sr6/runner-builder`, `sr6/foundry`, `sr6/game-data`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/compendiums`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/compendiums/`, same file names, different rules): `Compendiums.tsx`.

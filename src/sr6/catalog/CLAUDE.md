# sr6/catalog

Load the books' catalog, apply house overlays, build typed views. Shadowrun 6 only.

- **Owns:** `src/sr6/catalog/` (9 files, ~26k tokens); tests `tests/sr6/catalog/`.
- **Public interface** (names other modules import; 63 in all, most used first): `Sr6Data`, `entryLabel`, `MAGIC_KINDS`, `normName`, `bookValue`, `dataFind`, `ratingRange`, `rated`, `resolveEntry`, `entryKey`, `legality`, `picksFor`, `Sr6QualityView`, `armorSocial`. Used by: `sr6/compendiums`, `sr6/designer`, `sr6/foundry`, `sr6/game-data`, `sr6/npcs`, `sr6/print`, `sr6/runner-builder`, `sr6/runner-library`, … (+2 more).
- **Imports today** (rank 2; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/catalog`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/catalog/`, same file names, different rules): `levels.ts`, `load.ts`.

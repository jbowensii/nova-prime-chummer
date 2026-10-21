# sr6/npcs

Book NPCs and critters, and the GM's own NPCs. Shadowrun 6 only.

- **Owns:** `src/sr6/npcs/` (4 files, ~17k tokens); tests `tests/sr6/npcs/`; e2e `sr6-career-npcs.spec.ts`.
- **Public interface** (names other modules import; 3 in all, most used first): `DesignTab`, `Sr6Npcs`, `StatsTab`. Used by: `sr6/shell`.
- **Imports today** (rank 14; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/campaigns`, `sr6/table-setup`, `features/foundry-kit`, `features/compendiums`, `sr6/runner-builder`, `sr6/foundry`, `sr6/compendiums`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/npcs`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/npcs/`, same file names, different rules): `Npcs.tsx`.

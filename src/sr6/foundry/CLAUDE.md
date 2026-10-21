# sr6/foundry

Export runners, books and compendiums to FoundryVTT. Shadowrun 6 only.

- **Owns:** `src/sr6/foundry/` (2 files, ~11k tokens); tests `tests/sr6/foundry/`; e2e `sr6-foundry.spec.ts`.
- **Public interface** (names other modules import; 4 in all, most used first): `downloadSr6Runners`, `SR6_FOUNDRY_ABOUT`, `downloadSr6Compendium`, `Sr6ExportBooksPanel`. Used by: `sr6/compendiums`, `sr6/game-data`, `sr6/npcs`, `sr6/runner-library`, `sr6/shell`.
- **Imports today** (rank 11; may import only lower-ranked modules, and only their public names): `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `sr6/table-setup`, `features/foundry-kit`, `sr6/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/foundry`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/sr6-export-format.md](../../../docs/sr6-export-format.md).
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/foundry/`, same file names, different rules): `export.ts`, `Foundry.tsx`.

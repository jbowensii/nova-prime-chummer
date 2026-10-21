# ca2/foundry

Export runners, books and compendiums to FoundryVTT. Anarchy only.

- **Owns:** `src/ca2/foundry/` (2 files, ~9k tokens); tests `tests/ca2/foundry/`; e2e `foundry.spec.ts`.
- **Public interface** (names other modules import; 3 in all, most used first): `downloadRunners`, `downloadCompendium`, `ExportBooksPanel`. Used by: `ca2/compendiums`, `ca2/game-data`, `ca2/npcs`, `ca2/runner-library`, `ca2/shell`.
- **Imports today** (rank 11; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `features/foundry-kit`, `ca2/table-rules`, `ca2/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/foundry`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/export-format.md](../../../docs/export-format.md).
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/foundry/`, same file names, different rules): `export.ts`, `Foundry.tsx`.

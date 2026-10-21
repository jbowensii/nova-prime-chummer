# ca2/compendiums

Compendium pages (house content shared with a table). Anarchy only.

- **Owns:** `src/ca2/compendiums/` (1 files, ~4k tokens); tests `tests/ca2/compendiums/`; e2e `compendiums.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `CompendiumsScreen`. Used by: `ca2/shell`.
- **Imports today** (rank 13; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/compendiums`, `ca2/table-rules`, `ca2/foundry`, `ca2/game-data`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/compendiums`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/compendiums/`, same file names, different rules): `Compendiums.tsx`.

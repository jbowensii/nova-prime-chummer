# ca2/npcs

Book NPCs and critters, and the GM's own NPCs. Anarchy only.

- **Owns:** `src/ca2/npcs/` (1 files, ~6k tokens); tests `tests/ca2/npcs/`; e2e `npcs.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `NpcsScreen`. Used by: `ca2/shell`.
- **Imports today** (rank 14; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/campaigns`, `features/compendiums`, `features/foundry-kit`, `ca2/runner-builder`, `ca2/foundry`, `ca2/runner-library`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/npcs`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/npcs/`, same file names, different rules): `Npcs.tsx`.

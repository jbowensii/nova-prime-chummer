# ca2/shell

The game's routes and the editor page. Anarchy only.

- **Owns:** `src/ca2/shell/` (2 files, ~5k tokens); tests `tests/ca2/shell/`.
- **Public interface** (names other modules import; 1 in all, most used first): `Main`. Used by: `core/app`.
- **Imports today** (rank 15; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `ca2/catalog`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/book-library`, `features/accounts`, `features/ai-assist`, `features/appearance`, `features/campaigns`, `features/compendiums`, `ca2/table-rules`, `ca2/runner-builder`, `ca2/foundry`, `ca2/print`, `ca2/game-data`, `ca2/compendiums`, `ca2/runner-library`, `ca2/book-import`, `ca2/npcs`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/shell`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/shell/`, same file names, different rules): `EditorView.tsx`.

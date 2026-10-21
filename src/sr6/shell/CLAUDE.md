# sr6/shell

The game's routes and the editor page. Shadowrun 6 only.

- **Owns:** `src/sr6/shell/` (2 files, ~6k tokens); tests `tests/sr6/shell/`; e2e `sr6-theme.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `Sr6Main`. Used by: `core/app`.
- **Imports today** (rank 15; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/book-library`, `features/accounts`, `features/ai-assist`, `features/campaigns`, `sr6/table-setup`, `features/compendiums`, `sr6/runner-builder`, `sr6/foundry`, `sr6/print`, `sr6/designer`, `sr6/game-data`, `sr6/compendiums`, `sr6/runner-library`, `sr6/npcs`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/shell`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/shell/`, same file names, different rules): `EditorView.tsx`.

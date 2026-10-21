# sr6/designer

Design vehicles and drones. Shadowrun 6 only.

- **Owns:** `src/sr6/designer/` (1 files, ~6k tokens); tests `tests/sr6/designer/`.
- **Public interface** (names other modules import; 2 in all, most used first): `Sr6DesignEditor`, `Sr6Designs`. Used by: `sr6/shell`.
- **Imports today** (rank 11; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `sr6/table-setup`, `sr6/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/designer`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.

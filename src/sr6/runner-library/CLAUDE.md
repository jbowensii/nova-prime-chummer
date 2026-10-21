# sr6/runner-library

List, import and export runners; sample runners. Shadowrun 6 only.

- **Owns:** `src/sr6/runner-library/` (1 files, ~6k tokens); tests `tests/sr6/runner-library/`; e2e `sr6-examples.spec.ts`, `sr6-migrate.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `Sr6Runners`. Used by: `sr6/shell`.
- **Imports today** (rank 13; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/campaigns`, `sr6/table-setup`, `features/foundry-kit`, `sr6/runner-builder`, `sr6/foundry`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/runner-library`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.

# core/ui-kit

Widgets, icons, the API client, session hooks, the settings store and the repo context every screen uses.

- **Owns:** `src/core/ui-kit/` (13 files, ~20k tokens); tests `tests/core/ui-kit/`; e2e `token.spec.ts`.
- **Public interface** (names other modules import; 82 in all, most used first): `Modal`, `useMe`, `IconButton`, `because`, `send`, `Stepper`, `canEdit`, `isAdmin`, `IconLink`, `useRepo`, `fmt`, `Game`, `Face`, `NonCanon`. Used by: `ca2/book-import`, `ca2/compendiums`, `ca2/foundry`, `ca2/game-data`, `ca2/npcs`, `ca2/print`, `ca2/runner-builder`, `ca2/runner-library`, … (+25 more).
- **Imports today** (rank 3; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/core/ui-kit`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/design-system.md](../../../docs/design-system.md).
- **Do not touch:** other modules' files, `public/data/**`.

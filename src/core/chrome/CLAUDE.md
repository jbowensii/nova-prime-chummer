# core/chrome

The page header and main menu.

- **Owns:** `src/core/chrome/` (1 files, ~2k tokens); e2e `menus.spec.ts`, `v083.spec.ts`, `v091.spec.ts`.
- **Public interface** (names other modules import; 5 in all, most used first): `PageHeader`, `HeaderBars`, `FOUNDRY`, `HeaderBarsContext`, `showFoundry`. Used by: `ca2/compendiums`, `ca2/game-data`, `ca2/npcs`, `ca2/print`, `ca2/runner-library`, `ca2/shell`, `ca2/table-rules`, `core/app`, … (+13 more).
- **Imports today** (rank 5; may import only lower-ranked modules, and only their public names): `core/ui-kit`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx playwright test e2e/menus.spec.ts e2e/v083.spec.ts e2e/v091.spec.ts` (no vitest folder); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

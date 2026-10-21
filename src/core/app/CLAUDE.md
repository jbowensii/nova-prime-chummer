# core/app

The app entry (`src/main.tsx`), the game picker and the settings dialog.

- **Owns:** `src/core/app/` (3 files, ~3k tokens); e2e `games.spec.ts`.
- **Public interface** (names other modules import; 0 in all, most used first): none outside the module. Used by: nothing in src.
- **Imports today** (rank 20; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/accounts`, `features/backup`, `features/ai-assist`, `features/appearance`, `ca2/shell`, `sr6/shell`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour (and each game's `shell`).
- **Test:** `npx playwright test e2e/games.spec.ts` (no vitest folder); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

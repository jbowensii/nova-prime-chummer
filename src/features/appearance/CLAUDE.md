# features/appearance

Backgrounds, sheet art and print style. Routes `/api/backgrounds*`.

- **Owns:** `src/features/appearance/` (3 files, ~6k tokens; sheet.css is the sheet paper and art both games print on); tests `tests/features/appearance/`; e2e `backdrops.spec.ts`, `backgrounds.spec.ts`; server `server/backgrounds.mjs`, `server/defaults/sr6-circuit.webp`.
- **Public interface** (names other modules import; 5 in all, most used first): `useSheetArt`, `SheetType`, `usePrintStyle`, `BackgroundArt`, `BackgroundSettings`. Used by: `ca2/print`, `ca2/shell`, `core/app`, `sr6/print`.
- **Imports today** (rank 7; may import only lower-ranked modules, and only their public names): `core/ui-kit`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/appearance`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

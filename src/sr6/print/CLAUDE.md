# sr6/print

Print sheets. Shadowrun 6 only.

- **Owns:** `src/sr6/print/` (5 files, ~26k tokens); e2e `sr6-sheets.spec.ts`.
- **Public interface** (names other modules import; 1 in all, most used first): `Sr6Sheet`. Used by: `sr6/shell`.
- **Imports today** (rank 11; may import only lower-ranked modules, and only their public names): `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `core/chrome`, `features/appearance`, `sr6/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx playwright test e2e/sr6-sheets.spec.ts` (no vitest folder); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.
- **Look-alikes in the other game** (`src/ca2/print/`, same file names, different rules): `BookSheet.tsx`, `Sheet.tsx`.

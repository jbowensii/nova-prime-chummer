# features/foundry-kit

The download and export dialogs both games share.

- **Owns:** `src/features/foundry-kit/` (1 files, ~1k tokens).
- **Public interface** (names other modules import; 4 in all, most used first): `ExportRunnersDialog`, `downloadJson`, `fileDate`, `runnersStem`. Used by: `ca2/foundry`, `ca2/npcs`, `ca2/runner-library`, `sr6/foundry`, `sr6/npcs`, `sr6/runner-library`.
- **Imports today** (rank 9; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `features/campaigns`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx playwright test e2e/foundry.spec.ts e2e/sr6-foundry.spec.ts` (no vitest folder); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

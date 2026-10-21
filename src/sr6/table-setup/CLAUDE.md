# sr6/table-setup

Choose creation rules for the server, a campaign or a runner. Shadowrun 6 only.

- **Owns:** `src/sr6/table-setup/` (5 files, ~28k tokens); tests `tests/sr6/table-setup/`.
- **Public interface** (names other modules import; 33 in all, most used first): `CreationRules`, `num`, `flag`, `str`, `n0`, `rulesForRunner`, `blockedBy`, `cite`, `CREATION_KEYS`, `isOn`, `missingLabels`, `MissingList`, `aboutOf`, `CampaignCreation`. Used by: `sr6/compendiums`, `sr6/designer`, `sr6/foundry`, `sr6/npcs`, `sr6/runner-builder`, `sr6/runner-library`, `sr6/shell`.
- **Imports today** (rank 9; may import only lower-ranked modules, and only their public names): `core/shared`, `sr6/formats`, `sr6/catalog`, `core/ui-kit`, `features/campaigns`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/table-setup`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`.

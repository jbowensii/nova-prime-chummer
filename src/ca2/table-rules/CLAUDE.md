# ca2/table-rules

Choose table rules for the server, a campaign or a runner. Anarchy only.

- **Owns:** `src/ca2/table-rules/` (2 files, ~5k tokens); tests `tests/ca2/table-rules/`; e2e `tablerules.spec.ts`.
- **Public interface** (names other modules import; 9 in all, most used first): `SourceLabel`, `loadTableRules`, `HOUSE_RULES`, `NATIVE_HELP`, `ruleHelp`, `seeds`, `tableFlags`, `tableRulesForExport`, `TableSetupScreen`. Used by: `ca2/compendiums`, `ca2/foundry`, `ca2/game-data`, `ca2/print`, `ca2/runner-builder`, `ca2/shell`.
- **Imports today** (rank 9; may import only lower-ranked modules, and only their public names): `ca2/formats`, `ca2/catalog`, `core/ui-kit`, `core/chrome`, `features/catalog-edits`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/table-rules`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.

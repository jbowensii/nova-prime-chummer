# features/runner-store

Save runners and NPCs, trash and restore. Routes `/api/characters`, `/api/npcs`, `/api/trash*`, `/api/sr6/designs`.

- **Owns:** `src/features/runner-store/` (4 files, ~7k tokens); tests `tests/features/runner-store/`; e2e `saving.spec.ts`, `trash.spec.ts`; server `server/server.mjs`.
- **Public interface** (names other modules import; 14 in all, most used first): `arrange`, `loadTrash`, `ownerGroups`, `saveAsNew`, `SortBy`, `ConflictDialog`, `npcRepoFor`, `SaveLine`, `useAutosave`, `TrashScreen`, `unedited`, `detectRepo`, `migrateBrowserToServer`, `serverRepo`. Used by: `ca2/compendiums`, `ca2/npcs`, `ca2/runner-builder`, `ca2/runner-library`, `ca2/shell`, `core/app`, `sr6/designer`, `sr6/npcs`, … (+3 more).
- **Imports today** (rank 6; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`, `core/chrome`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/runner-store`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

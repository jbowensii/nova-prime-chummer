# features/backup

Backup, restore and data packs. Routes `/api/backup`, `/api/restore`, `/api/datapack`.

- **Owns:** `src/features/backup/` (1 files, ~2k tokens); e2e `backup.spec.ts`, `datapack.spec.ts`; server `server/backup.mjs`.
- **Public interface** (names other modules import; 2 in all, most used first): `BackupSettings`, `RESTORED`. Used by: `core/app`.
- **Imports today** (rank 6; may import only lower-ranked modules, and only their public names): `core/ui-kit`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/backup/`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/backup.py`, `importer/datapack.py`, `importer/tests` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`.

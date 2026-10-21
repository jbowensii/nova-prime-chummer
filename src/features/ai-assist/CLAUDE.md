# features/ai-assist

AI settings and the "Ask" button. Routes `/api/ai-*`, `/api/ask`.

- **Owns:** `src/features/ai-assist/` (2 files, ~6k tokens); tests `tests/features/ai-assist/`; e2e `sr6-ai.spec.ts`; server `server/ai.mjs`.
- **Public interface** (names other modules import; 5 in all, most used first): `AskSearch`, `AiSettings`, `AskRules`, `AskButton`, `AskGame`. Used by: `ca2/game-data`, `ca2/shell`, `core/app`, `features/campaigns`, `features/catalog-browser`, `sr6/game-data`, `sr6/shell`.
- **Imports today** (rank 7; may import only lower-ranked modules, and only their public names): `core/ui-kit`, `features/book-library`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/ai-assist`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Importer side:** `importer/ai`, `importer/ask.py`, `importer/tests` (see `../../../importer/CLAUDE.md`).
- **Do not touch:** other modules' files, `public/data/**`.

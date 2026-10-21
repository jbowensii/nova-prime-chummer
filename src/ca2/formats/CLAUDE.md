# ca2/formats

The file formats (runner, catalog, entry, compendium) and their schemas: the contract everything else reads. Anarchy only.

- **Owns:** `src/ca2/formats/` (8 files, ~16k tokens); tests `tests/ca2/formats/`, `tests/ca2/formats/books/`, `tests/ca2/formats/engine/`.
- **Public interface** (names other modules import; 82 in all, most used first): `Catalog`, `Character`, `ATTRS`, `AmpEntry`, `AttrId`, `Build`, `newId`, `TableFlags`, `ItemEntry`, `AmpTemplate`, `EffectPick`, `Item`, `Npc`, `blankCharacter`. Used by: `ca2/book-import`, `ca2/catalog`, `ca2/compendiums`, `ca2/foundry`, `ca2/game-data`, `ca2/npcs`, `ca2/print`, `ca2/runner-builder`, … (+11 more).
- **Imports today** (rank 1; may import only lower-ranked modules, and only their public names): `core/shared`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/formats` (also `tests/ca2/formats/books`, `tests/ca2/formats/engine`); before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/character-format.md](../../../docs/character-format.md).
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/formats/`, same file names, different rules): `charxml.ts`, `compendium.ts`, `types.ts`.

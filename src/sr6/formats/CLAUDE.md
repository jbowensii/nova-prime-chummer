# sr6/formats

The file formats (runner, catalog, entry, compendium) and their schemas: the contract everything else reads. Shadowrun 6 only.

- **Owns:** `src/sr6/formats/` (5 files, ~24k tokens); tests `tests/sr6/formats/`.
- **Public interface** (names other modules import; 86 in all, most used first): `Sr6Entry`, `Sr6Character`, `Sr6Catalog`, `Sr6Purchase`, `Sr6Kind`, `Sr6Attr`, `Sr6Build`, `MAGIC_KIND_LABELS`, `CORE_ATTRS`, `sinName`, `MagicKind`, `PickKind`, `SR6_ATTRS`, `SR6_KINDS`. Used by: `features/book-library`, `sr6/catalog`, `sr6/compendiums`, `sr6/designer`, `sr6/foundry`, `sr6/game-data`, `sr6/npcs`, `sr6/print`, … (+4 more).
- **Imports today** (rank 1; may import only lower-ranked modules, and only their public names): `core/shared`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `ca2/`, the other game.
- **Test:** `npx vitest run tests/sr6/formats`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/sr6-character-format.md](../../../docs/sr6-character-format.md), [docs/sr6-data-format.md](../../../docs/sr6-data-format.md), [docs/sr6-data-format/categories.md](../../../docs/sr6-data-format/categories.md), [docs/sr6-data-format/classification.md](../../../docs/sr6-data-format/classification.md), … (+11 more).
- **Do not touch:** other modules' files, `public/data/**`, `src/ca2/`. Additive, backward-compatible XSD extensions driven by catalog data are permitted when old files must still load as defaults (e.g. the 2026-11 `pathProgress` extension for the CL6 quality-path picker).
- **Look-alikes in the other game** (`src/ca2/formats/`, same file names, different rules): `charxml.ts`, `compendium.ts`, `types.ts`.

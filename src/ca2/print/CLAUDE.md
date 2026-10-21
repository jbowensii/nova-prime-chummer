# ca2/print

Print sheets. Anarchy only.

- **Owns:** `src/ca2/print/` (4 files, ~14k tokens); e2e `book-style.spec.ts`, `print-page1.spec.ts`.
- **Public interface** (names other modules import; 3 in all, most used first): `BookSheet`, `OfficialSheet`, `Sheet`. Used by: `ca2/shell`.
- **Imports today** (rank 11; may import only lower-ranked modules, and only their public names): `core/shared`, `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/appearance`, `ca2/table-rules`, `ca2/runner-builder`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/print/`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.
- **Look-alikes in the other game** (`src/sr6/print/`, same file names, different rules): `BookSheet.tsx`, `Sheet.tsx`.

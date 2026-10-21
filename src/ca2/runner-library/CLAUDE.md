# ca2/runner-library

List, import and export runners; sample runners. Anarchy only.

- **Owns:** `src/ca2/runner-library/` (1 files, ~8k tokens); tests `tests/ca2/runner-library/`; e2e `features.spec.ts`, `library.spec.ts`, `markers.spec.ts`, `samples.spec.ts`.
- **Public interface** (names other modules import; 3 in all, most used first): `exportCharacter`, `FindDuplicates`, `Library`. Used by: `ca2/npcs`, `ca2/shell`.
- **Imports today** (rank 13; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/runner-store`, `features/campaigns`, `features/foundry-kit`, `ca2/runner-builder`, `ca2/foundry`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; never import `sr6/`, the other game.
- **Test:** `npx vitest run tests/ca2/runner-library`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`, `src/sr6/`.

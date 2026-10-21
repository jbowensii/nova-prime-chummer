# features/campaigns

Run campaigns, invite players, lock rules. Routes `/api/campaigns*`.

- **Owns:** `src/features/campaigns/` (2 files, ~5k tokens); tests `tests/features/campaigns/`; e2e `campaigns.spec.ts`; server `server/campaigns.mjs`.
- **Public interface** (names other modules import; 7 in all, most used first): `Campaign`, `loadCampaigns`, `approveRunner`, `CampaignScreen`, `CampaignsScreen`, `joined`, `campaignLinks`. Used by: `ca2/npcs`, `ca2/runner-library`, `ca2/shell`, `features/compendiums`, `features/foundry-kit`, `sr6/npcs`, `sr6/runner-builder`, `sr6/runner-library`, … (+2 more).
- **Imports today** (rank 8; may import only lower-ranked modules, and only their public names): `ca2/formats`, `core/ui-kit`, `core/chrome`, `features/ai-assist`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/campaigns`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Do not touch:** other modules' files, `public/data/**`.

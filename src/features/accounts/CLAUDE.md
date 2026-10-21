# features/accounts

Sign in (local and OIDC), users and roles. Routes `/api/auth*`, `/api/setup*`, `/api/users*`, `/api/auth-settings`.

- **Owns:** `src/features/accounts/` (4 files, ~9k tokens); tests `tests/features/accounts/`; e2e `accounts.spec.ts`, `oidc.spec.ts`, `setup.spec.ts`; server `server/auth.mjs`, `server/oidc.mjs`, `server/users.mjs`.
- **Public interface** (names other modules import; 5 in all, most used first): `UsersScreen`, `Recover`, `Setup`, `SignIn`, `SignInSettings`. Used by: `ca2/shell`, `core/app`, `sr6/shell`.
- **Imports today** (rank 6; may import only lower-ranked modules, and only their public names): `core/shared`, `core/ui-kit`, `core/chrome`.
- **Rules:** ranks in `docs/architecture/README.md`, enforced by `tests/core/shared/module-boundaries.test.ts`; may read a game's `formats` module only, never its behaviour.
- **Test:** `npx vitest run tests/features/accounts`; before a PR `npm run check`, `npm run lint`, `npm run format:check`.
- **Docs:** [docs/hosting-auth.md](../../../docs/hosting-auth.md).
- **Do not touch:** other modules' files, `public/data/**`.

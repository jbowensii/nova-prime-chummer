# Core Data Out of Git + User Accounts Implementation Plan (0.4.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Core catalogs come from the CRB import or a data pack instead of git; the app gets admin-created accounts with app passwords or Authelia (OIDC), roles, and per-user runners.

**Architecture:** Python (`importer/`) owns data writes (core recipe, data pack, backup of accounts); the dependency-free Node server adds auth (scrypt, sessions, OIDC verification with `node:crypto`) and enforces roles on every route; the TS loader reads `custom/imported/core/`; React adds sign-in, setup, Users, Sign-in settings, account menu and read-only runner views.

**Tech Stack:** Python 3.12 stdlib + pdfplumber, Node 22 (no new npm runtime deps), React 19 + TS, Vitest, Playwright.

**Specs:** `docs/superpowers/specs/2026-09-28-core-data-design.md`, `docs/superpowers/specs/2026-09-28-accounts-design.md`

## Global Constraints

- All written files are XML with schemas; writes are atomic (temp + rename).
- Secrets (password hashes, session tokens, API keys, OIDC client secret) never appear in responses or logs; backups carry keys/secret only when "Include my API keys" is ticked; sessions never.
- Every rule is enforced on the server; hidden UI is convenience only.
- No new runtime npm dependencies in the server; crypto via `node:crypto`.
- No book data or text committed: tests use invented fixtures; tests needing real values skip when the owner's local copies (gitignored `public/data/*.xml`) or PDFs are absent.
- Spawned Python: argument arrays, timeout, redacted stderr, `PYTHONIOENCODING=utf-8`.
- UI copy: sentence case, plain verbs, curly apostrophes; errors say what happened and what to do.
- Commits: `importer:`/`server:`/`ui:`/`engine:`/`docs:`/`ci:` subject < 70 chars, body explaining why, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `feat/accounts`; one PR at the end. Never touch the owner's local ignored files (`public/data/*.xml`, `custom/`, `library/`, texts).

---

### Task 1: Core data from the CRB import; tests off the real data

**Files:** `.gitignore`, `git rm --cached` the 12 core files (keep them on disk); `importer/recipes/crb*` (core catalogs), `importer/tests/`; `src/engine/load.ts` (load `imported/core/`, missing-core state); `tests/fixtures/mini/` (invented core files); engine/server/e2e tests switched to the fixture or guarded; setup screen for missing core data; server start-up re-import when core missing and a CRB is in the Library; CI/Docker check that the image has no core data.

- [ ] Recipe writes `custom/imported/core/{ampeffects,amptypes,armor,attributes,levels,lifestyles,metatypes,packages,pricing,skills,vehicles,weapons}.xml` (+ summaries into `texts/crb.xml`), AI fallback for unreadable tables, book-silent values as documented defaults.
- [ ] Answer-key test: with the local copies present, recipe output equals them (names/attributes; text separately); skipped otherwise.
- [ ] Loader order: public/data → imported/core → books → edits → house rules; missing core → setup screen (admin vs others copy).
- [ ] `npx vitest run`, `npx tsc -b`, `npm run build`, `npm run e2e`, `npm run test:py`, `npm run validate:data` all pass in a checkout **without** the local copies (verify by temporarily moving them aside, then restore them).

### Task 2: Data pack

**Files:** `importer/datapack.py` (+ CLI `datapack export|check|import`), `public/data/schema/datapack.xsd`, tests; server routes (admin): `POST /api/datapack` → token → `GET /api/datapack/<token>`, `POST /api/datapack/import` (upload cap 50 MB, zip magic, check, validate each file by schema, atomic write, serialized with imports/restore); Books page buttons; e2e.

- [ ] Pack = `datapack.xml` + `core/*.xml` only; import refuses anything else.

### Task 3: Accounts core — users, sessions, setup, roles on every route

**Files:** `server/auth.mjs` (users store, scrypt, sessions, lockout, Origin check, trusted proxy), `server/users.mjs` (CLI `reset <user>`), `public/data/schema/users.xsd`; mount in `server/server.mjs` and `server/books.mjs` routes with role checks; per-user runner folders + upgrade move; `edits.xml` `by=`; tests.

- [ ] Everything in accounts spec §2–§4 except OIDC: roles table enforced (403), last-admin guard, setup code (logged once, new per restart, single use), recovery code, sessions persisted hashed, 30-day sliding, Secure behind trusted proxy, lockout 5/15 min, Origin check on non-GET, scoped character API, rename moves folder, upgrade moves top-level runners to the first admin.
- [ ] `TRUST_PROXY` env; template field in `unraid/chummer-anarchy2.xml`.

### Task 4: Accounts UI

**Files:** `src/ui/SignIn.tsx`, `Setup.tsx`, `Users.tsx`, account menu, read-only runner view, role-based hiding; e2e `e2e/accounts.spec.ts`; existing e2e sign in first (fixture admin).

- [ ] Accounts spec §6; screenshots light/dark/phone checked.

### Task 5: Authelia (OpenID Connect)

**Files:** `server/oidc.mjs` (discovery, PKCE, state/nonce store, token exchange, JWKS RS256/ES256 verification), `public/data/schema/auth.xsd`, Settings → Sign-in UI, login button; tests with a local fake issuer (every failure case in the spec §7).

### Task 6: Backup/restore with accounts

**Files:** `importer/backup.py` (users.xml, auth.xml always; auth-secret.xml only with keys, dropped when issuer changes; sessions never; pre-0.4 backup → setup mode, runners to new admin), server ends all sessions after restore; tests.

### Task 7: Docs, history purge, release 0.4.0, install

- [ ] README (accounts, reverse proxy, Authelia client snippet with `two_factor`, core data: import CRB or data pack), data-format, deploy doc, CHANGELOG 0.4.0, version bump, template field in both template copies.
- [ ] Final whole-branch review; PR; merge.
- [ ] Purge the 12 core files from all GitHub history, and scrub the historical blobs of the docs that quoted core values (docs/superpowers/plans/2026-09-27-chummer-anarchy2-v1.md, docs/superpowers/specs/2026-09-27-chummer-anarchy2-design.md, docs/character-format.md) and of importer/recipes/dhsa.py and tools/* (they held core tables) (fresh mirror clone + git filter-repo, bundle backup first; local project untouched, branches re-pointed), force-push, tag v0.4.0, release, publish.
- [ ] tower04: pull, Apply template (Trusted proxy field), read setup code from the log, core data rebuilt from the CRB (auto re-import), check health, books, runners moved to the admin.

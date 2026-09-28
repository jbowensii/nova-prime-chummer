# Catalog Edits, Backup and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Users edit or add catalog entries in a separate edits layer on the server, and download/restore the whole server state as one zip.

**Architecture:** Python (`importer/`) owns all data writes (edits files, backup zip, restore); the Node server validates ids, streams bodies and spawns Python; the TS loader applies the edits layer after imports; React UI adds Edit / Add entry / Backup.

**Tech Stack:** Python 3.12 stdlib (zipfile, xml.etree), Node 22 server, React 19 + TS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-edits-backup-design.md`

## Global Constraints

- All written files are XML (edits.xml, texts.xml, sources.xml, backup.xml manifest); writes are atomic (temp + rename).
- API keys never appear in responses, logs or backups unless the user ticked "Include my API keys".
- Spawned Python uses argument arrays, a timeout, redacted stderr; the Library is never served.
- No book text committed; tests use invented data (the made-up fixture in tests/fixtures/mini).
- UI copy: sentence case, plain verbs, curly apostrophes; errors say what happened and what to do.
- Commits: "importer: …"/"server: …"/"ui: …"/"engine: …"/"docs: …" subject < 70 chars, body explaining why, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch feat/edits-backup; one PR at the end.

---

### Task 1: Edits layer — Python writer and engine loading

**Files:** create `importer/edits.py`, `importer/tests/test_edits.py`, `public/data/schema/edits.xsd` (if the data schemas can't validate an edits file directly); modify `importer/__main__.py` (CLI `edit set|remove`, `edit add-source`), `src/engine/load.ts`, `src/model/types.ts`, `tests/engine/edits.test.ts`, the fixture under `tests/fixtures/mini/custom/edits/`.

- [ ] `edit set <kind> <id> --custom <dir>` reads one entry (data-format XML) + optional `<description>` on stdin; validates with the same rules as propose/apply-review (`_entry_notes`) and the XSD; for an existing catalog id keeps the id, for a new entry requires a house-rule source that exists in custom/edits/sources.xml; writes custom/edits/edits.xml and texts.xml atomically (replace by id).
- [ ] `edit remove <kind> <id>` drops the entry and its description.
- [ ] `edit add-source <id> --name …` adds a canon="false" source (id format checked, not clashing with shipped/imported/user sources).
- [ ] Loader: after imported overlays and before custom/index.xml, load custom/edits/sources.xml, edits.xml, texts.xml; entries from edits replace same-id entries and carry `edited: true`; keep the replaced entry as `original` (a map on the catalog) for the UI.
- [ ] Tests (Python + vitest): set/replace/remove, new entry needs a house-rule source, invalid entry refused with a reason, load order (edits over imports, house rules over edits), `edited` flag, removal restores the book version.

### Task 2: Edits API and UI

**Files:** modify `server/books.mjs` (or a new `server/edits.mjs` mounted by server.mjs), `tests/server/*.test.ts`, stub worker; create `src/ui/EditEntry.tsx`; modify `src/ui/tabs/AmpBuilder.tsx` (catalog mode), `src/ui/tabs/Data.tsx`, `src/ui/Rules.tsx`, pickers in `src/ui/tabs/Amps.tsx`/`Gear.tsx`, `src/ui/SourceLabel.tsx`; `e2e/edits.spec.ts`.

- [ ] Routes: `PUT /api/edits/:kind/:id`, `DELETE /api/edits/:kind/:id`, `POST /api/edits/sources`, `GET /api/edits` (list of edited ids) — kind and id validated, body size cap, serialized with other writers, 400 with the Python reason.
- [ ] UI: Edit button on catalog entries (pickers' detail, Game data lists, Rules page); amps in Amp Builder catalog mode; items/rules in a form with a Description box; "Edited" mark next to the source label; "Restore book version"; "Add entry" with a house-rule source picker/creator. The catalog reloads after a save.
- [ ] e2e on the fixture: edit a description → reload shows it + Edited; restore book version; add a house-rule amp and see it in the picker with its source.

### Task 3: Backup and restore — Python

**Files:** create `importer/backup.py`, `importer/tests/test_backup.py`, `public/data/schema/backup.xsd`; modify `importer/__main__.py` (CLI `backup`, `restore --check`, `restore --apply`).

- [ ] `backup --characters D --custom D --library D --out F [--keys]` writes a zip with characters/, custom/, library/ (PDFs, book.md, reports, review files, .config/ai-providers.xml; ai-keys.xml only with --keys; skip library/.backups) and a backup.xml manifest (app version from package.json baked at build or passed in, date, counts, keys yes/no).
- [ ] `restore --check F` validates: manifest present and well-formed; every entry under characters/, custom/ or library/; no absolute paths, `..`, symlinks or device entries; total uncompressed size ≤ 20 GB and per-file ratio limits; prints the manifest/counts as XML.
- [ ] `restore --apply F …dirs`: runs check, writes an automatic backup of the current state to library/.backups/<timestamp>.zip (keep newest 3), then replaces each folder's contents (extract to temp siblings, then swap), never touching ai-keys.xml when the zip has none.
- [ ] Tests: contents with and without keys; each unsafe zip refused; apply with safety backup; rollback by restoring the safety backup.

### Task 4: Backup API and UI

**Files:** modify server (routes), tests, stub worker; create `src/ui/Backup.tsx` (in Settings); `e2e/backup.spec.ts`.

- [ ] `POST /api/backup[?keys=1]` makes the zip (one at a time) → token, `GET /api/backup/:token` streams it (Content-Disposition with date), temp removed afterwards; `POST /api/restore?preview=1` streams the upload to a temp file (cap 20 GB, zip magic check) and returns a token + manifest; `POST /api/restore/:token` applies (refused while a job runs; one at a time), then re-runs the startup sweep. Tokens expire and are single use; temp files cleaned.
- [ ] UI: Settings → Backup: Download backup (+ Include my API keys), Restore from backup (pick file → preview counts and date → confirm "Replace everything on the server" → done → reload).
- [ ] e2e: download a backup, change something, restore, see it back.

### Task 5: Docs, release 0.3.0, install

- [ ] README / docs/data-format.md / docs/deploy-tower04.md: edits layer files, backup and restore.
- [ ] CHANGELOG 0.3.0, version bump, PR, merge (owner-approved release flow), tag v0.3.0, GitHub release; publish runs; install on tower04 through the template (Edit → Apply pulls :latest); check health, books, runners.

# Catalog edits, backup and restore — Design Spec

Date: 2026-09-28. Approved in conversation.

Imports sometimes miss descriptions or details. Users can edit any catalog
entry and add new ones; edits live in their own layer on the server. The
whole server state can be downloaded as one zip and restored.

## 1. Decisions

| Question | Decision |
|---|---|
| How edits are kept | A separate edits layer applied on top of imported data. Re-imports never touch it. An entry shows it was edited; "Restore book version" drops the edit. |
| New entries | "Add entry" creates an entry under a house-rules source the user names (canon: no). |
| Backup scope | Everything: runners, edits, house rules, imported catalogs, descriptions, samples, uploaded PDFs and import reports, AI settings. |
| API keys in a backup | Left out unless the user ticks "Include my API keys". |
| Restore | Upload a backup zip, see its contents, confirm. The server first saves an automatic backup of the current state, then replaces. |
| Where the data logic lives | Python (`importer/`), like the importer: one parser decides. The Node server moves requests and spawns processes. |

## 2. Edits layer

Files (XML, one concern each):

```
custom/edits/edits.xml      edited or added entries, full entries in the data format (<amp>, <item>, <rule>, <spec> additions)
custom/edits/texts.xml      edited descriptions (<text of="amps|items|rules" id>)
custom/edits/sources.xml    house-rule sources the user created (canon="false")
```

- An edited entry keeps its scoped id (`crb.jazz`); the edits file's entry
  replaces the imported one with the same id at load time. A new entry gets
  an id `<houserule source lower>.<slug>`.
- Load order: shipped data → imported books → **edits** → the user's own
  `custom/index.xml` overlays (house rules always win).
- The loader marks entries that came from the edits layer (`edited: true`)
  and keeps the pre-edit entry so the UI can show "Edited" and diff it.
- Runners: entries they use update like any catalog change; their stored
  snapshots keep them loading if an edit is removed.

Server API:
- `PUT /api/edits/:kind/:id` body = one entry in the data format (+ optional
  description) → `python -m importer edit set …` validates it (XSD rules and
  the propose/validate-data reference checks) and writes the edits files
  atomically; 400 with the reason on failure.
- `DELETE /api/edits/:kind/:id` → `edit remove` (restores the book version).
- `POST /api/edits/sources` → create a house-rule source.

UI:
- An **Edit** button wherever catalog entries are listed (amp and gear
  pickers' detail, Game data, Rules page).
- Amps open the Amp Builder in "catalog" mode; spells, complex forms, gear
  and rules open a form (name, fields, description).
- "Edited" mark next to the source label; "Restore book version" button.
- "Add entry" with a source picker (existing house-rule sources or new).

## 3. Backup and restore

- `GET /api/backup[?keys=1]` → `python -m importer backup --out <tmp.zip>`,
  streamed as `chummer-anarchy2-backup-<date>.zip`, then the temp file is
  removed. Layout inside the zip mirrors the three volumes:
  `characters/…`, `custom/…`, `library/…` plus a `backup.xml` manifest
  (app version, date, counts, keys included yes/no). `library/.config/ai-keys.xml`
  only with `keys=1`.
- `POST /api/restore?preview=1` (zip streamed to a temp file, cap 20 GB: restore --check's own limit, so any backup the app makes can be restored) →
  `restore --check` returns the manifest and counts; the UI shows them.
- `POST /api/restore/:token` confirms → `restore --apply`: writes an
  automatic backup of the current state to `library/.backups/<date>.zip`
  (the newest 3 kept), then replaces the three folders' contents from the
  zip, then the server re-runs its startup sweep and the UI reloads.
- Safety: reject absolute paths, `..`, symlinks, entries outside the three
  top folders, zip bombs (total uncompressed size and ratio limits), a
  missing or wrong manifest. No job may run during a restore.

UI: Settings → **Backup**: "Download backup" (+ "Include my API keys"),
"Restore from backup" (file picker → preview → confirm).

## 4. Tests

- Python: edits set/remove/validation, backup contents (keys off/on),
  restore check (each unsafe case), restore apply with the safety backup.
- Engine: load order, `edited` marking, restore book version.
- Server: routes, validation errors, one-at-a-time, no keys in responses.
- e2e: edit a description → saved → reload shows it + "Edited"; restore
  book version; add a house-rule entry; download backup → restore.

## 5. Release

0.3.0 with release notes; merge, tag, publish to GHCR, install on tower04
through the template.

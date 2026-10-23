# Phase 2 data migration design note (2026-10-23)

Standalone design note gating the Phase 2 migration code. Companion to
`docs/plans/desktop-app-foundry-model-2026-10-22.md` (Phase 2, "Data layout"). **Design only — no code
has changed.** Every path claim below is cited to the code that reads or writes it.

## Bottom line

- The old layout is **not** three flat folders. It is three roots (`characters/`, `custom/`, `library/`),
  each with a per-game sub-tree (`…/sr6/`) and several **nested dot-folders** (`.npcs/`, `.designs/`,
  `.compendiums/`, `.trash/`, `.config/`, `.backups/`, `backgrounds/`).
- The cross-game account invariant **survives the split** — but only because account rename/delete
  already iterate per-game stores as independent folder renames (not one shared parent). The load-bearing
  requirement is that the **single account registry stays unified in `Config\`** and that the per-game
  stores stay on the **same volume** so `rename()` remains atomic. See §6 for the definitive verdict.
- The migration must run with the **server stopped** and the **job queue drained** (§5). Everything is a
  move to `_to_delete\`, never a delete (§4).

---

## 1. TODAY's data layout, enumerated from the code

### 1a. The three roots and how they resolve

`server/config.mjs` resolves each root (`resolveConfig`, lines 30-55):

- `charDir`  = `--char-dir` / `CHAR_DIR`  / `options.charDir`  else `<dataPath>/characters` else `/data/characters`
  (config.mjs:48)
- `customDir` = `--custom-dir` / `CUSTOM_DIR` / `options.customDir` else `<dataPath>/custom` else `/data/custom`
  (config.mjs:49)
- `libraryDir` = `--library-dir` / `LIBRARY_DIR` / `options.libraryDir` else `<dataPath>/library` else `/data/library`
  (config.mjs:50)
- `dataPath` itself: `--data-path` / `DATA_PATH` / `options.dataPath` (config.mjs:41). A root env var still
  overrides the `dataPath`-derived default, so Docker images that set `CHAR_DIR`/`CUSTOM_DIR`/`LIBRARY_DIR`
  resolve exactly as before (config.mjs:1-3, 43).

`server/server.mjs` resolves and, when `libraryDir` is unset, defaults it to `join(charDir, '..', 'library')`
(server.mjs:204-206).

### 1b. `characters/` — runners, NPCs, designs, compendiums, trash (per game)

Documented in the server header (server.mjs:1-11): "stores runners as XML files, one folder per account
(`characters/<username>/`, deleted ones in its `.trash/`)… Two games… Anarchy in `characters/` (`<username>/`,
`.npcs/`, `.compendiums/`, `.trash/`) … SR6 the same shape in `characters/sr6/`."

`gameStore(g)` (server.mjs:332-629) computes, for each game `g`:

- `home` = `charDir` for ca2, `join(charDir, 'sr6')` for sr6 (server.mjs:334). `g.sub` is `''` for ca2 and
  `'sr6'` for sr6 (games.mjs:11, 19).
- runner folder `folder(username)` = `join(home, username)` (server.mjs:362)
- `.npcs/` root and `npcFolder(username)` = `join(home, '.npcs', username)` (server.mjs:364-365)
- `.designs/` root and `designFolder(username)` = `join(home, '.designs', username)` — **SR6 only**
  (server.mjs:367-368; `DESIGNS` is null for ca2, server.mjs:412)
- each folder has a child `.trash/` created on delete (server.mjs:478-479) and restore reads it
  (server.mjs:527, 548)
- legacy upgrade: pre-accounts runners sit **loose at the top of `characters/`** plus `characters/.trash/`,
  adopted into the first admin's folder on setup (server.mjs:291-299, 294, 297)

Compendiums (`server/compendiums.mjs`): root `join(home, '.compendiums')`, per-owner
`.compendiums/<owner>/<id>.xml` + `.trash/` (compendiums.mjs:2-4, 64, 201-202). So:
`characters/.compendiums/<username>/` and `characters/sr6/.compendiums/<username>/`
(server.mjs:649-650).

Account-folder set per game, from `stores()` (server.mjs:647-651) and `gameStore.stores` (server.mjs:627):

| Store | ca2 path | sr6 path |
|---|---|---|
| runners | `characters/<u>/` | `characters/sr6/<u>/` |
| NPCs | `characters/.npcs/<u>/` | `characters/sr6/.npcs/<u>/` |
| designs | — (none) | `characters/sr6/.designs/<u>/` |
| compendiums | `characters/.compendiums/<u>/` | `characters/sr6/.compendiums/<u>/` |

Each of the above also owns a sibling `.trash/` (server.mjs:606-619 retire; 322-323 compendium retire).

### 1c. `custom/` — catalog data, overlays, campaigns (per game)

`AREAS` (server/books.mjs:116-120): ca2 custom = `customDir`, sr6 custom = `join(customDir, 'sr6')`.
Catalog loader (`src/ca2/catalog/domain/load.ts`) reads, relative to a game's custom root:

- `imported/core/*.xml` — the rules-engine CORE_FILES (load.ts:49-51, 284-285): `DATA_FILES` minus
  `sources` = levels, metatypes, attributes, skills, pricing, amptypes, ampeffects, packages, vehicles,
  weapons, armor, lifestyles (load.ts:34-51)
- `imported/sources.xml`, `imported/index.xml`, listed book overlays (load.ts:315, 325; `IMPORTED =
  'custom/imported/'`, load.ts:72)
- `sources.xml`, `index.xml`, `texts.xml` (load.ts:316-321)
- `edits/sources.xml`, `edits/edits.xml`, `edits/texts.xml` (load.ts:320, 327)

Other `custom/` members:
- `campaigns.xml` (server/campaigns.mjs:1 — "custom/campaigns.xml"); sr6 at `custom/sr6/campaigns.xml`
  (campaigns.mjs customDir = `join(customDir, g.sub)`, server.mjs:398)
- `table-rules.xml` (books.mjs:56)
- `samples/<set>/set.xml` + sample runner files (books.mjs:53-55)
- `sr6/creation.xml` (books.mjs:50-52) — SR6 only
- `CA2_CUSTOM_DIR` env is passed to the importer as the core-files location (jobs.mjs:46)

### 1d. `library/` — book folders, config, backups, backgrounds (per game)

`AREAS` (books.mjs:116-119): ca2 library = `libraryDir`, sr6 library = `join(libraryDir, 'sr6')`.

- **book folders** `library/<id>/` (and `library/sr6/<id>/`): `original.pdf`, `book.md`, `import.xml`,
  `review.xml`, `status.xml`, `upload.xml` (books.mjs:9-11, 73; status write jobs.mjs:80-82; `bookDir` =
  `join(AREAS[game].library, id)`, jobs.mjs:20-23)
- **`.config/`** = `join(libraryDir, '.config')` for ca2 (books.mjs:138; auth.mjs:322), and
  `join(libraryDir, 'sr6', '.config')` for sr6 AI (books.mjs:26, `aiConfig`). Contents:
  - `users.xml`, `sessions.xml`, `reset.xml`, `device-key.xml` (auth.mjs:209, 217, 324-326, 339-341) —
    **ca2 library `.config` only; these are account-global, not per-game**
  - `jobs.json` — the resumable job queue, **shared by both games** (jobs.mjs:2, 110; books.mjs:138 `config`)
  - `ai-providers.xml`, `ai-keys.xml` (books.mjs:34-36), `ask-counts.xml` (books.mjs:65); SR6's own set in
    `library/sr6/.config/` (books.mjs:26, 31; importer/ask.py:7; importer/ai/providers.py:267, 312)
- **`.backups/`** = `join(libraryDir, '.backups')` (books.mjs:113), download/restore temp zips
  (books.mjs:96-97)
- **`backgrounds/`** = `library/backgrounds/`, sr6 `library/sr6/backgrounds/` (server.mjs:652-658)
- restore scratch dirs `.restore-(old|new|done)-*` at the top of each of charDir/customDir/libraryDir
  (books.mjs:182-187); `.upload-*` temp dirs at top of each library (books.mjs:166-173)

### 1e. Who reads/writes each path class

| Path class | Writer | Reader |
|---|---|---|
| `characters[/sr6]/<u>/*.xml` | gameStore.handle PUT/DELETE (server.mjs:462-497); runners.move/rename/adopt/retire (server.mjs:300-327) | index() lists (server.mjs:371-395); campaigns (campaigns.mjs:402) |
| `characters[/sr6]/.npcs|.designs|.compendiums/<u>/` | same set (server.mjs:603-620; compendiums.mjs:190-202) | same |
| `characters[/sr6]/**/.trash/` | delete/retire (server.mjs:478-484, 606-619) | trash routes (server.mjs:502-598) |
| `custom[/sr6]/imported|edits|sources|index|texts|table-rules|samples|creation` | the **importer** (`python -m importer`, jobs.mjs:37-48; books.mjs:6-7) + edits.mjs | catalog load (load.ts:277-331) |
| `custom[/sr6]/campaigns.xml` | campaignsApi under `lock` (campaigns.mjs:1, 420-431) | campaignsApi |
| `library[/sr6]/<id>/*` | importer + upload (library.mjs:120-122); status (jobs.mjs:80-82) | books list, report, review (books.mjs:11-19) |
| `library/.config/users.xml` etc. | authApi (auth.mjs:421-423) | authApi load() (auth.mjs:358-378); users.mjs reset (users.mjs:6-14) |
| `library/.config/jobs.json` | jobsApi saveJobs (jobs.mjs:110-124) | resume on start (resume.mjs via books.mjs:158-165) |
| `library[/sr6]/.config/ai-*` | aiApi, redact reads keys (jobs.mjs:29-34) | ai + importer ask |
| `library/.backups/` | backupApi (backup.mjs) | backupApi |
| `library[/sr6]/backgrounds/` | backgroundsApi (server.mjs:653-659) | backgroundsApi |

Backup scope: `POST /api/backup` zips **`characters/`, `custom/` and `library/`** (books.mjs:66) — the three
roots, whole. The migration's backup step reuses exactly this set.

---

## 2. New layout (target, from the plan)

```
<dataPath>\
  Config\     options.json, admin password, AI settings, S3 settings, accounts, job queue
  Data\
    systems\
      sr6\        package (system.json), imported books' data, runners, campaigns, compendiums
      anarchy2\   same, for Shadowrun Anarchy 2
    assets\     backgrounds and, later, tokens
  Library\    uploaded PDFs and their extracted text (never served, never sent to the cloud)
  Logs\
  Backups\
```

Note the rename of the game id: today's **`ca2`** sub-tree (Anarchy, the un-prefixed routes) becomes
**`anarchy2`** on disk; today's **`sr6`** stays `sr6`. (Route prefixes and XML namespaces, games.mjs:6-23,
are unaffected — this is a disk layout change only.)

---

## 3. Complete old → new mapping

`<g>` = `anarchy2` for today's ca2 root, `sr6` for today's sr6 sub-tree. `DS` = `Data\systems\<g>`.

| # | Old path | New path | Note |
|---|---|---|---|
| 1 | `characters/<u>/*.xml` | `DS(anarchy2)\characters\<u>\` | runners |
| 2 | `characters/sr6/<u>/*.xml` | `DS(sr6)\characters\<u>\` | runners |
| 3 | `characters/.trash/` (loose, pre-account) | adopt into admin first, then map as #1 | legacy upgrade (server.mjs:297) |
| 4 | `characters[/sr6]/.npcs/<u>/` (+`.trash/`) | `DS(<g>)\npcs\<u>\` (+`.trash\`) | NPCs |
| 5 | `characters/sr6/.designs/<u>/` (+`.trash/`) | `DS(sr6)\designs\<u>\` (+`.trash\`) | SR6 only |
| 6 | `characters[/sr6]/.compendiums/<u>/` (+`.trash/`) | `DS(<g>)\compendiums\<u>\` (+`.trash\`) | compendiums |
| 7 | `characters[/sr6]/<u>/.trash/` | `DS(<g>)\characters\<u>\.trash\` | per-runner trash |
| 8 | `custom/imported/core/*.xml` | `DS(anarchy2)\imported\core\` | core data |
| 9 | `custom/sr6/imported/core/*.xml` | `DS(sr6)\imported\core\` | core data |
| 10 | `custom[/sr6]/imported/{sources,index}.xml` + book overlays | `DS(<g>)\imported\` | imported books' data |
| 11 | `custom[/sr6]/{sources,index,texts}.xml` | `DS(<g>)\` | house overlays |
| 12 | `custom[/sr6]/edits/{sources,edits,texts}.xml` | `DS(<g>)\edits\` | edits layer |
| 13 | `custom[/sr6]/campaigns.xml` | `DS(<g>)\campaigns.xml` | campaigns |
| 14 | `custom/table-rules.xml` | `DS(anarchy2)\table-rules.xml` | ca2 only |
| 15 | `custom/samples/<set>/` | `DS(anarchy2)\samples\<set>\` | ca2 only |
| 16 | `custom/sr6/creation.xml` | `DS(sr6)\creation.xml` | sr6 only |
| 17 | `library/<id>/{original.pdf,book.md,import.xml,review.xml,status.xml,upload.xml}` | `Library\anarchy2\<id>\` | PDFs + extracted text ⚑ (see §7) |
| 18 | `library/sr6/<id>/…` | `Library\sr6\<id>\` | PDFs + extracted text ⚑ |
| 19 | `library/.config/{users,sessions,reset,device-key}.xml` | `Config\` | **account registry — unified, §6** |
| 20 | `library/.config/jobs.json` | `Config\jobs.json` | shared job queue (§5) |
| 21 | `library/.config/{ai-providers,ai-keys,ask-counts}.xml` | `Config\ai\anarchy2\` ⚑ | AI settings (§7) |
| 22 | `library/sr6/.config/{ai-*}.xml` | `Config\ai\sr6\` ⚑ | SR6 AI settings |
| 23 | `library/.backups/` | `Backups\` | backup store |
| 24 | `library/backgrounds/` | `Data\assets\anarchy2\backgrounds\` ⚑ | assets (§7) |
| 25 | `library/sr6/backgrounds/` | `Data\assets\sr6\backgrounds\` ⚑ | assets |
| 26 | `.restore-*`, `.upload-*`, `.backup.*.tmp` scratch | **not migrated** — deleted on start anyway (books.mjs:166-187) | transient |

Rows marked ⚑ carry an owner decision (§7).

---

## 4. Migration algorithm

A one-shot migrator (`server/migrate.mjs`, invoked by the Electron entry on desktop, and by a one-shot
`node server/migrate.mjs` / container command on Docker/Unraid). Properties: backup-first, dry-run with
checksums, move-not-delete, idempotent and resumable.

1. **Preconditions (§5).** Refuse unless the server is not serving and the job queue is drained. Verify the
   old layout exists and the new layout is absent or empty (idempotency key, step 7).
2. **Backup first.** Make the standard backup zip of `characters/`, `custom/`, `library/` (same scope as
   `POST /api/backup`, books.mjs:66) into `Backups\pre-migration-<ISO>.zip`. Abort the whole migration if the
   zip cannot be written or its entry count is zero (file-safety rule: never destroy the only copy).
3. **Dry-run with per-file checksums.** Walk the old tree, build a manifest of every file → its sha256, size,
   and planned new path (the §3 table). Detect collisions (two old paths mapping to one new path — e.g. a
   legacy account literally named `sr6`, §6). Write the manifest to `Backups\migration-manifest-<ISO>.json`.
   On `--dry-run`, stop here and print the plan; make no moves.
4. **Move, verified.** For each manifest entry, in table order: `mkdir -p` the new parent, `rename()` old→new,
   then re-read the moved file and assert its sha256 matches the manifest. A rename that would cross volumes
   (EXDEV) falls back to copy-then-verify-then-move-source-aside. **Never `unlink` the source on this path** —
   see step 5.
5. **Old tree to `_to_delete\`, never deleted.** After all moves verified, move the now-empty old roots
   (`characters/`, `custom/`, `library/`) to `<dataPath>\_to_delete\<ISO>\`. Anything that failed verification
   stays where it is and is listed in the manifest's `unresolved`. The owner empties `_to_delete\` himself
   (repo file-safety rule).
6. **Env/path remap for Docker & Unraid.** Today the image sets `CHAR_DIR=/data/characters`,
   `CUSTOM_DIR=/data/custom`, `LIBRARY_DIR=/data/library` (users.mjs:5; config.mjs:2). The new layout is driven
   by a single `DATA_PATH` (config.mjs:41) with the fixed sub-folders `Config\`, `Data\`, `Library\`, `Logs\`,
   `Backups\`. The migrator reads the **old** roots from the current `CHAR_DIR/CUSTOM_DIR/LIBRARY_DIR` (or
   `DATA_PATH`-derived defaults) and writes under the **new** `DATA_PATH`. The Unraid template
   (`jbowensii/unraid-templates`) changes from three volume mappings to one `/data` → the share, with the new
   sub-folders inside it (Phase 4 task). A compatibility shim in the resolver (new code, Phase 2) keeps the
   three legacy env vars pointing a stopped server at the old tree so the migrator can find it.
7. **Idempotent / resumable.** The manifest file is the resume log: each entry is marked `done` after its
   checksum verifies. Re-running skips `done` entries, so a crash mid-move resumes from the manifest. A second
   run with the new layout already fully populated and no old tree is a no-op (the idempotency key: old roots
   absent or already under `_to_delete\`).

One runnable check to leave behind: a `migrate.test.mjs` that seeds a tiny fixture of the old tree (one ca2
runner, one sr6 runner, one `.npcs` file, `users.xml`, `jobs.json` idle), runs the migrator, and asserts every
§3 target exists with a matching checksum and the old roots are under `_to_delete\`.

---

## 5. Ordering guard — do not migrate mid-flight

The job queue persists to `library/.config/jobs.json` (jobs.mjs:110) and is re-read on start by `resume()`
(books.mjs:158). `saveJobs` writes `{ jobs, batches }` and **removes the file when idle** — idle = no jobs and
no `batches.ca2`/`batches.sr6` (jobs.mjs:118-121). A running import is kept in `jobs.json` across a stop so it
resumes (jobs.mjs:109, 133).

Guard, two conditions, both required:

1. **Server not serving.** The migrator runs with no live `createServer()` holding the roots. On desktop the
   Electron entry runs it **before** forking the server utility process. On Docker/Unraid it is a one-shot
   command run while the service container is stopped. (In-process state — `ctx.running`, `ctx.queue`,
   `lock.writes`, `lock.restoring` — only exists while the server runs; a stopped server cannot have an
   in-flight importer child, jobs.mjs:149-155.)
2. **Queue drained on disk.** Read `Config\`-bound `jobs.json` (old: `library/.config/jobs.json`). Migration
   proceeds only if the file is **absent**, or parses to `{ jobs: [], batches: { ca2: null, sr6: null } }`.
   If it lists any job or a non-null batch, **refuse** with: "An import was in progress. Start the app, let the
   book queue finish, then migrate." Rationale: a book folder mid-import is partial; `resume()` expects it at
   its old path. Moving it would strand resume state and could leave a half-written catalog file.

The migrator must not attempt to "wait" for jobs — it cannot, because it runs with the server down. It detects
and refuses. (Alternative, only if the owner wants unattended migration: start the server headless, poll
`GET /api/books/reimport-all` until `{queued:[],...}` and `jobs.json` is gone, then stop and migrate — more
moving parts; flagged in §7.)

---

## 6. Cross-game account invariant — DEFINITIVE verdict

**Claim under test:** today a rename/delete of an account moves *both games together* under one `characters/`
root; the new layout splits an account's folders across `Data\systems\anarchy2` and `Data\systems\sr6`; does
the split break rename/delete?

**Verdict: the split does NOT break rename or delete, provided two conditions hold** (both already true in the
code, and both must be preserved by the migration):

### Why it does not break

Account rename and delete do **not** assume a single shared parent. They iterate a per-game list of stores and
operate on each as an **independent folder rename**:

- The account registry (`users.xml`) is **already game-agnostic** and lives in `library/.config/`
  (auth.mjs:209, 324), *not* inside either game's tree. One account row, one username, no game dimension
  (auth.mjs:142-154). Rename is a field change on that single row (auth.mjs:835-869).
- `runners.rename(from, to)` loops over `stores()` (server.mjs:269-290), and `stores()` already spans **both
  games' roots plus every dot-folder**: ca2 under `characters/`, sr6 under `characters/sr6/`, each with
  `.npcs`, `.designs` (sr6), `.compendiums` (server.mjs:647-651, 627). Each entry is renamed with its own
  `rename(f(from), f(to))` (server.mjs:277). It then renames campaigns in each live game (server.mjs:280-283).
  There is **no operation that requires the two games to live under a common parent** — they are already
  treated as two independent root trees whose only tie is the username used as the leaf folder name.
- Rollback is per-store and order-reversing (server.mjs:284-289): if any rename fails, the ones already done
  are reversed. This logic is indifferent to where each store root physically sits.
- `runners.retire(u)` (delete) is the same shape: loop `live()` games, retire each, then each game's
  compendiums (server.mjs:318-326); each `gameStore.retire` moves that game's folders independently
  (server.mjs:603-620). `count()` sums across `live()` games (server.mjs:259-263). None of this couples the two
  roots.

So moving ca2's root to `Data\systems\anarchy2` and sr6's to `Data\systems\sr6` is a **path change in the
`home`/`folder` helpers** (server.mjs:334, 362-368) and the `stores()` builder (server.mjs:647-651), not a
structural change to rename/delete. The invariant — *one username is the folder name under every store root,
and account identity lives in one registry* — is preserved.

### The two conditions the migration MUST preserve

1. **Unified account registry in `Config\`.** `users.xml`, `sessions.xml`, `reset.xml`, `device-key.xml` must
   remain a **single set in one location** (`Config\`, mapping #19), never split per-system. If these were
   duplicated into each `Data\systems\<g>` folder, rename/delete would have two sources of truth and the
   last-enabled-admin and uniqueness checks (auth.mjs:668, 709-713) would diverge. `users.mjs reset` must point
   at the same `Config\` location (today `LIBRARY_DIR/.config`, users.mjs:14) — update its env to the new path.
2. **Both system roots on the same volume.** `rename()` across the two store roots is only atomic (and
   rollback only safe) when `Data\systems\anarchy2` and `Data\systems\sr6` are on one filesystem. They are, by
   construction (both under `Data\systems\`). If a future deployment ever puts a system folder on a different
   volume, `rename()` returns EXDEV and both the live rename (server.mjs:277) **and** the migrator's move need
   the copy-then-move fallback. Flag for the owner (§7).

### Resolution and a simplification it enables

- **Resolution:** keep a single unified account index in `Config\` (condition 1); keep both systems under one
  `Data\systems\` parent on one volume (condition 2). No per-account folder spanning systems is needed — the
  existing per-game iteration already does the right thing.
- **The `sr6` reserved-name problem goes away.** Today an account literally named `sr6` collides with the SR6
  game subtree (`characters/sr6/`), so `sr6` is reserved and a `legacy()` mode freezes the SR6 area until it is
  renamed (games.mjs:74-75; auth.mjs:666-667; server.mjs:253-256, 302, 740). In the new layout the game folders
  (`Data\systems\sr6`, `Data\systems\anarchy2`) are **no longer siblings of account folders**, so the collision
  cannot occur and `RESERVED`/`legacy()` can be retired. The migrator must handle an existing account named
  `sr6` on tower04 (detect in the dry-run, §3 row 3 / collision check) — this is an owner decision (§7).

---

## 7. Choices that need the owner

1. **Desktop default port.** Phase 2 table leaves it "to be chosen"; Foundry uses 30000, Docker keeps 80.
   Pick the desktop default.
2. **Unified account root — confirmed recommendation, needs sign-off.** Keep one account registry in `Config\`
   (not per-system). §6 condition 1. Confirm.
3. **Does `Library\` split by game?** (map rows 17-18). Plan shows a flat `Library\`; book ids are only unique
   *within* a game's `AREAS[game].library` (jobs.mjs:20-23), so a flat `Library\` risks an id collision between
   an Anarchy book and an SR6 book. Recommend `Library\<game>\<id>\`. Confirm.
3b. **PDF + extracted text vs imported catalog data are split today.** The PDF/`book.md`/`review.xml` live in
   `library/<id>/` (→ `Library\`), while the *imported catalog XML* lives in `custom/imported/` (→
   `Data\systems\<g>\imported`). The plan's Library description ("uploaded PDFs and their extracted text") and
   the systems description ("imported books' data") match this split — confirm the migrator keeps them apart
   rather than co-locating a book's PDF with its imported data.
4. **AI settings location** (map rows 21-22). Plan puts "AI settings" in `Config\`, but today each game has its
   own set (`library/.config` vs `library/sr6/.config`, books.mjs:26). Recommend `Config\ai\<game>\`. Confirm
   per-game-in-Config vs a single merged file.
5. **`jobs.json` home** (map row 20). It is cross-game and resume-critical. `Config\` is the natural home, but
   it is operational state, not configuration — alternative is `Data\jobs.json`. Pick one; whichever, the
   migrator and `resume()` must agree.
6. **Assets split by game** (map rows 24-25). Each game has its own backgrounds today (server.mjs:652-658).
   Recommend `Data\assets\<game>\backgrounds\`. Confirm.
7. **Game id on disk: `anarchy2` vs `ca2`.** Routes/namespaces stay `ca2` (games.mjs). The plan's folder is
   `anarchy2`. Confirm the disk folder is `anarchy2` (and the migrator maps `ca2` → `anarchy2`), or keep `ca2`
   on disk to avoid a rename.
8. **Existing account named `sr6`** on tower04, if any (§6). If one exists, migration must rename it (to what?)
   or the owner must rename it first. Confirm tower04 has none, or supply the new name.
9. **Retire `RESERVED`/`legacy()`?** The split makes them dead code (§6). Confirm removal is in scope for the
   follow-up, or keep for one release.
10. **Unattended vs refuse-on-busy migration** (§5). Recommend refuse-on-busy (simpler, safer). Confirm, or ask
    for the headless-drain variant.
11. **EXDEV / multi-volume systems** (§6 condition 2). Confirm both system roots stay on one volume so
    `rename()` stays atomic, or require the copy-fallback everywhere.
```

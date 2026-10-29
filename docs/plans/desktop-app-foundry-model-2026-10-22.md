# Nova Prime Chummer as a Foundry-style app: plan (revised 2026-10-23)

Prepared for John Owens. Version 2: updated with John's decisions of 2026-10-23. Version 1 (the first examination, with
the full Foundry findings) is in `Old Versions/`. **Status: IMPLEMENTED — all six phases are built and merged to
`main` (Phase 1 via PR #161; Phases 2–6 via the feat/desktop-app-phase2 merge). Windows packaging verified unsigned
2026-10-29 (embeddable Python 3.13.9 bundle green on a clean CI runner and locally; electron-builder produced the
NSIS installer + portable exe). The only unverified piece is code-signing, blocked externally on the eSigner cert.
Architecture-reviewed 2026-10-23 (opus, via Chief Architect): all phases GO or GO-WITH-CHANGES; Phase 1 re-scoped
below — it is not a thin wrapper around the unchanged server.**

## Bottom line

Nova Prime Chummer ships the way Foundry does, in **five ways you can choose from by what you can afford**:

1. A **Windows desktop app (Electron)** with everything inside it: Node, the app, Python and every library we use.
2. A normal **Docker container** (as today).
3. An **Unraid template** for that container (as today, kept current).
4. An **automated install script for Ubuntu**.
5. Later, a **Pelican egg**.

Each install is independent. **Nothing syncs between a server install and the desktop app**: people pick one way to
host.

The work is planned in **six phases plus a long-term track**, about 34 working days for the six phases. Phase 1 (the
desktop app, local access only) is useful on its own.

## John's decisions (2026-10-23)

| Topic | Decision |
|---|---|
| Address and port | Configurable, like Foundry (Foundry defaults to `localhost:30000`). Mirror Foundry's configuration options, **including S3 bucket access** |
| Packaging | Electron app for Windows, Docker container, Unraid template, automated Ubuntu install script, and later a Pelican egg |
| Data layout | `Data\systems` as in Foundry. **No modules and no worlds folders**: those are Foundry artifacts |
| Desktop contents | All the Node, JavaScript and Python, with every library we use, ships inside the Electron app |
| Phases | All phases approved |
| Game systems | Shadowrun 6e and Shadowrun Anarchy 2 each become a package using the core system. A package includes how the game works and how to read and extract its PDFs. Generalising to non-Shadowrun systems (a core engine plus configuration files and helper code) is long-term |
| PDFs and the cloud | **PDFs never go to the cloud.** Public storage is for token features later |
| Network access | **Local access on this computer only** for now in the Electron app. Remote access is a later phase |
| Code signing | **No paid signing service.** John signs with his own certificate |
| Syncing | **None.** No sync between a server install and the desktop app |

## How Foundry works (summary of version 1)

- `Foundry Virtual Tabletop.exe` is Electron: Chromium plus Node.js in one program. At launch it starts Foundry's own
  web server inside itself and opens a locked-down Chromium window on it (`localhost:30000`, menu hidden, sandboxed,
  outside links open in the normal browser).
- The same files run without a window as a server (`node main.js --dataPath=…`).
- Settings are in `Config\options.json`; the data is in `Data\` plus `Backups\` and `Logs\`.

## Phase 1: the desktop app, local access only (about 12–14 days)

> **Architecture review 2026-10-23 (opus):** GO WITH CHANGES. Phase 1 is **not** the unchanged Docker server in a
> window — the items marked "new code" below are required. Effort raised from 9 to ~12–14 days, and the Phase 2
> config resolver is pulled forward (see the amendments).

- **Electron 44** (Node 24.18, the same Node as our server); move to 45 after its first patches.
- `server/server.mjs` runs inside the app in an Electron **utility process**, but **not unchanged**: the CLI bootstrap
  (`import.meta.url === argv[1]`) does not fire under `utilityProcess.fork`, and the Docker defaults are Linux absolute
  paths. Phase 1 adds a small **Electron entry module** that calls `createServer()` with Windows paths and the bundled
  Python. The server factory stays shared with Docker.
- **Local only (new code — the server does not do this today):** `createServer()` has no host option and the current
  `server.listen(port)` binds **all** interfaces, so Phase 1 adds a `host` option and binds `127.0.0.1`. The port is
  configurable. The **Host-allow-list and per-launch secret are new**: today `sameOrigin()` guards only non-GET
  requests, so the check must cover **every** request including GET, and the window's own fetches must carry the secret
  (preload-injected header or a bound cookie). On plain-http localhost the `__Host-`/`Secure` cookie protections do not
  apply, so the per-launch secret is mandatory, not optional.
- **The window** works like Foundry's: maximized, no address bar or menu, F5 reloads, F12 opens developer tools,
  sandboxed, outside links open in the user's browser.
- **Everything bundled:**
  - the built app;
  - Node, through Electron;
  - the **official embeddable Python 3.13** with every pinned importer library pre-installed (lxml, pdfplumber,
    pypdfium2, Pillow, anthropic and the rest of `importer/requirements.lock`).

  Watch-outs: (1) embeddable Python ignores `PYTHONPATH`, so its `._pth` file must list the importer's folder, and the
  embeddable build ships **no pip** with `import site` disabled — bootstrap pip (get-pip) or stage prebuilt
  `site-packages`. (2) `importer/requirements.lock` is compiled for **Python 3.12** (Docker runs 3.14); a
  `--require-hashes` install into the bundled interpreter fails unless the lock is **recompiled for that exact
  interpreter**, because the cp313 native wheels carry different hashes than the cp312 pins. (3) `importer/` must be
  **`asarUnpack`-ed** — together with `server/defaults/` and `VERSION`, which the Dockerfile also ships — and
  `importerRoot` repointed there, because an external Python cannot import a module out of `app.asar`. A CI step fails
  the build if any library has no wheel for the bundled interpreter.
- **Installer:** electron-builder, NSIS, plus a **portable zip** that keeps its data beside the exe (Foundry's
  portable model). Expected size 130–180 MB, to be measured. User data is kept on uninstall.
- **Signing** with John's own certificate (electron-builder's certificate-file signing). Windows SmartScreen builds
  trust per publisher over time, so expect warnings at first. **Wire the signing config from the first build** (Phase 6
  otherwise): an unsigned Phase 1 that later "upgrades" to signed is a worse SmartScreen story.
- **Clean shutdown (new code):** on app quit the main process calls `server.stopJobs()` / `server.close()` and waits.
  There are no POSIX signals under `utilityProcess` on Windows, so without a `before-quit` handler a running importer
  child (6-hour timeout) is orphaned. The graceful-shutdown logic that lives in the CLI main block today must be driven
  by the Electron app instead.
- **Config resolver, pulled forward from Phase 2 (new code):** Phase 1 cannot run without non-default `host`,
  `dataPath`, `python` and `staticDir`, so the `options.json` lookup order (flag → env → file → default) is built now
  rather than retrofitted. Only the resolver moves up; the Setup **screen** stays in Phase 2.

## Phase 2: Setup screen and configuration (about 4 days)

`Config\options.json` mirrors Foundry's settings. As in Foundry, `null` turns a setting off, and the lookup order is
command-line flag, then environment variable, then `options.json`, then the default. Docker, Unraid and Ubuntu keep
their environment variables, which map to the same settings.

| Setting | Meaning |
|---|---|
| `port` | Listening port (configurable; desktop default to be chosen, Docker keeps 80) |
| `hostname` | The public name in links |
| `routePrefix` | Serve under a sub-path |
| `sslCert` / `sslKey` | Built-in HTTPS |
| `proxySSL` / `proxyPort` | Behind a TLS reverse proxy |
| `upnp` | Automatic router port forwarding. Present but off; used when remote access arrives |
| `dataPath` | Where `Config`, `Data`, `Logs` and `Backups` live |
| `awsConfig` | Path to the S3 settings file (bucket, region, endpoint for any S3-compatible service, credentials) |
| `language` | Interface language |
| `updateChannel` | Stable or Testing |
| `compressStatic` | Compress files the server sends |
| `telemetry` | Off; never sends anything |

Also in this phase:

- An **admin password** guards Setup.
- A **Setup screen** before entering a game, with tabs for Game Systems, Configuration, Updates and Backups.
- On the desktop's **first run**, the admin account is created on screen, with no setup code to find in a log.
- "**Browse User Data**" appears on the taskbar right-click menu.

**Data layout** (no `modules`, no `worlds`):

```
<dataPath>\
  Config\   options.json, admin password, AI settings, S3 settings
  Data\
    systems\   sr6\  anarchy2\  (each: its package, imported books' data, runners, campaigns, compendiums)
    assets\    backgrounds and, later, tokens
  Library\  uploaded PDFs and their extracted text (never served, never sent to the cloud)
  Logs\
  Backups\
```

The current three folders (`characters`, `custom`, `library`) migrate into this layout. Phase 2 has to design the
migration carefully, because tower04 already holds real data in the old layout. A one-time migration with a backup
first, and the Docker volume paths updated in the Unraid template.

**The migration needs its own standalone design note (architecture review 2026-10-23).** The old layout is not three
flat folders: it has nested dot-folders (`.npcs/`, `.designs/`, `.compendiums/`, `.trash/`) and an SR6 sub-tree under
`characters/sr6/`, `custom/sr6/`, `library/sr6/`, plus `library/.config/jobs.json` holding resumable job state. Every
one of these must be mapped; the migration must **not** run while the job queue is mid-flight; and because the account
model spans both games (a rename or delete moves both), splitting one `characters/` root across two system folders
complicates account operations — confirm that invariant survives. Do it as a **dry-run with checksums**, moving the old
tree to `_to_delete/` (never delete), per the repo's own file-safety rules.

## Phase 3: game systems as packages (about 6 days)

- `Data\systems\sr6` and `Data\systems\anarchy2`, each with a manifest (`system.json`). The manifest gives the id,
  title, version, compatibility (the minimum and verified core version) and the files the package provides.
- **Each package includes:**
  - how the game works: its creation rules, review rules and sheet layout, described for the core;
  - how to read its books: the PDF parsing and extraction recipes, layout notes and owner corrections, which today
    live in `importer/sr6/` and `importer/recipes/`;
  - its data: imported catalogs, data packs, and the optional CommLink6-only module.
- A **Game Systems tab** shows each system's version and status: core data imported, number of books, catalog size.
  Each install can turn a system on or off, and a package can be installed or updated from a file or URL.
- In this phase the two systems' code stays in the app. A package carries their data, rules descriptions and import
  recipes. Fully loadable code is the long-term track.

## Phase 4: distribution targets (about 4 days)

| Target | Work |
|---|---|
| Docker container | Exists. Add the new data layout, `options.json` support and a healthcheck on the configured port |
| Unraid template | Exists (`jbowensii/unraid-templates`). Update its paths and variables for the new layout |
| Ubuntu install script | New: an automated script that installs Node 24, Python 3.13 and the libraries, the app, a `systemd` service, a dedicated user and the data folder, plus an update and uninstall path. Tested on a clean Ubuntu LTS in CI |
| Pelican egg | Later: a Pelican Panel egg wrapping the Docker image (after the other four are stable) |

## Phase 5: S3 storage (about 4 days)

- `awsConfig` points to an S3 settings file, as in Foundry. Any S3-compatible service works: AWS, Backblaze B2,
  Cloudflare R2 or MinIO.
- **PDFs never go to the cloud.** Nothing from `Library\` is uploaded: no PDFs and none of their extracted text.
- **Uses now:** optional backups of runners, campaigns, settings and imported catalog data to a private bucket, with
  restore.
- **Later:** public storage for tokens and portraits (the token features).

## Phase 6: updates and signing (about 3 days)

- **Desktop:** auto-update from GitHub Releases (electron-updater), with Stable and Testing channels. Updates are never
  forced, and a backup is offered before each update.
- **Signing:** every release is signed with John's own certificate. The certificate file and password stay as CI
  secrets, never in the repository.
- **Docker, Unraid and Ubuntu:** updated the way each one normally is (pull the image, or run the script's update
  command).

## Later phase: remote access

Not now (local only, per John). When it comes:
- an invitation-links panel;
- UPnP;
- built-in HTTPS, or a reverse proxy;
- a Cloudflare Tunnel or Tailscale option;
- the server listening beyond `127.0.0.1` only when switched on in Setup.

## Long-term track: a generic game-system engine

The goal is to add systems beyond Shadowrun. A **core engine** would provide:
- characters, catalogs, books, the PDF pipeline, sheets, Foundry export, accounts and storage.

Each **game system** would be loaded as a package of:
- configuration files: attributes, skills, creation methods, review rules and sheet layout as data;
- helper code: a plug-in module for game-specific rules, loaded at runtime;
- book-reading recipes.

This needs the SR6 and Anarchy code reshaped around a plug-in interface, building on the module boundaries from PR #94.
It is a separate design effort and has no dates yet.

## Effort

| Phase | What | Days |
|---|---|---|
| 1 | Desktop app, local only, everything bundled, installer + portable zip, signed with John's certificate. Includes the new loopback bind, Host-allow-list + per-launch-secret lockdown, recompiled Python lock + pip bootstrap, `asarUnpack`, the Electron entry module, clean-shutdown handler, and the pulled-forward config resolver | 12–14 |
| 2 | Setup screen, `options.json` mirroring Foundry, new data layout + migration | 4 |
| 3 | SR6 and Anarchy 2 as system packages in `Data\systems` | 6 |
| 4 | Docker, Unraid template, Ubuntu install script (Pelican egg later) | 4 |
| 5 | S3 settings and private backups (no PDFs, ever) | 4 |
| 6 | Auto-update with channels, signing in CI | 3 |
| Later | Remote access; Pelican egg; generic game-system engine | — |
| | **Total for phases 1–6** | **~34** |

## Risks

| Risk | Mitigation |
|---|---|
| Migrating tower04's real data to the new layout | Backup first, one-time migration with a dry run, old folders moved to `_to_delete`, never deleted |
| A Python library has no Windows wheel | Python 3.13 (all our native libraries have 3.13 wheels); CI fails on a missing wheel |
| SmartScreen warnings at first, even when signed | Expected; publisher reputation builds over time |
| Installer size | Measured in phase 1 |
| Package format locks in too early | The phase 3 manifest stays small and versioned; the long-term engine can extend it |

## Sources

Unchanged from version 1 (see `Old Versions/desktop-app-foundry-model-2026-10-22.md`):
- Foundry's official articles;
- the Electron and electron-builder docs;
- the Python embeddable-package docs;
- Microsoft's SmartScreen docs;
- the on-disk examination of `C:\Program Files\Foundry Virtual Tabletop`.

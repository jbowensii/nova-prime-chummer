# Release notes

## 0.4.4 — 2026-09-29: the trash

**Trash**
- A **Trash** page for every account (**Trash (N)** in the runner list, and
  the account menu) lists the runners you deleted, with when each was
  deleted.
- **Restore** puts a runner back in your library. If a runner with the same
  id is already there (or in anyone’s library), it comes back as a copy with
  a new id, named “… (restored copy)”.
- **Delete forever** removes one; **Empty trash** removes them all, after
  asking: “Permanently delete N runners? This can’t be undone.”
- The admin opens anyone’s trash (a **Trash** button per account on the
  Users page, or the account picker on the Trash page) and can restore or
  empty it. Players and editors only ever see their own.
- The server checks every file name (only `*.xml` in that account’s
  `.trash/`, no separators or leading dot), counts each change as a write,
  and refuses them while a restore runs (`/api/trash`,
  docs/character-format.md).
- Browser-only storage has no trash (deleting there is for good), so the
  page isn’t offered there.

## 0.4.3 — 2026-09-29: the example character library

**Example characters**
- **Load example characters** (renamed from “Load sample characters”; every
  role) now brings every example the server has: the imported books’ runners
  (the core rulebook’s pregens and Lightning, Daegann’s pregen booklet) and
  the server’s example sets in `custom/samples/<set>/`, such as the first
  release’s 28 built-in runners in `custom/samples/builtin/`.
- One copy per character: at most one canon version (a canon book’s over an
  example set’s; of several canon books, the newest import) and one
  non-canon version. Loading again, re-importing a book, or already holding
  an older copy of the same character never adds a second one. Each person
  gets their own copies, so a player who joins later loads the full set.
- Example sets are read only: the admin manages `custom/samples/` on disk,
  the app lists it for everyone signed in (`GET /api/samples`), and backups
  carry it. An optional `set.xml` names a set and says whether it is canon
  (schema `sampleset.xsd`); `builtin` without one is “Built-in samples
  (first release)”, canon.
- **Tidy up** now offers to move every extra copy beyond one per character
  and canon-ness to your trash, and lists each one with where it came from.
  A copy you changed always stays; otherwise the preferred version stays.
  Other accounts’ runners are never touched.

## 0.4.2 — 2026-09-29: the last review leftovers

**Books and core data**
- The review screen edits every part of an AI-read core row: a metatype’s
  attribute ranges (min and max per attribute) and a skill’s
  specializations (add, rename, remove). The edits are checked on the
  screen and again when the rows are added, like any other edit; a range
  whose minimum is above its maximum and a specialization id used twice
  are now flagged too.
- The Books page’s “Read by AI” note goes for a table a data pack later
  replaced (a re-import already cleared it).

**Fixes**
- Table rules: two quick switches on the Rules page both save; the second
  no longer undoes the first.
- Renaming a username: if saving the accounts fails and the runner folder
  can’t move back either, the original error is still reported, and the
  server log says which folder to move by hand.

## 0.4.1 — 2026-09-29: table rules, self-service Authelia link and fixes

**Rules and samples**
- The **Rules** tab is for the GM (admin and editors). **Table rules** are
  switches for the core rulebook’s optional rules (extended social tests,
  vehicle rules for characters, critters and devices, planning pool or
  personal Edge), plus house rules the GM adds. They’re stored in
  `custom/table-rules.xml` and travel with backups. Players get a read-only
  **Table rules** page listing what’s on; the quick-reference data is still
  readable by everyone.
- **Load sample characters** never duplicates: each sample has a stable key,
  saved on the runner, and every account gets its own copies. The Library
  offers a one-time **Tidy up** that moves unchanged duplicates to your
  trash and never touches one you edited.

**Accounts**
- **Link my Authelia account**: a password account can switch itself to
  Authelia from the account menu. It asks for the current password and a
  fresh Authelia sign-in, refuses an Authelia user already linked elsewhere,
  ends the other sessions and drops the password.
- The Users page can rename a username; the person’s runners move with it.
- Sign-out waits for runner saves to finish (Duplicate, Export, import and
  delete included) and asks before leaving one behind.
- Settings links to **AI settings** for the admin.

**Books and core data**
- Loading a data pack now shows a preview (when it was made, the app version,
  what it replaces) and waits for your confirmation.
- A book can override a core price. The Conversion Guide import sets the
  complex-form price it prints; the core still writes the spell price as a
  stand-in.
- If the core rulebook’s recipe can’t read a core table, the AI fallback now
  covers all of them, not just weapons and armor.
- The automatic core rebuild follows the rulebook file itself: uploading or
  re-importing the same PDF replaces a data pack’s tables, and moving the
  file between Library folders no longer triggers a rebuild.
- Error messages read as sentences, and none names a particular host.

## 0.4.0 — 2026-09-28: accounts, Authelia and core data

**Accounts**
- Sign-in is required. On first start, a one-time setup code in the
  container log creates the first admin; the admin creates everyone else
  on the **Users** page (app password or Authelia), and can disable,
  reset or delete an account.
- Three roles — admin, editor, player — each seeing and doing only what
  their row of the roles table allows; the server enforces every rule, not
  just the UI. Each person owns their own runners; admins and editors can
  view and print everyone's, read-only.
- Sign in with an app password, or with [Authelia](https://www.authelia.com/)
  (OpenID Connect, with Authelia's own two-factor) per account.
- Locked out? `docker exec chummer-anarchy2 node server/users.mjs reset
  <user>` prints a one-time recovery code for `/#/setup/reset`.

**Core data out of the repository**
- The core rulebook's catalogs (levels, metatypes, skills, pricing, amp
  types and effects, packages, lifestyles, generic weapons, armor,
  vehicles) no longer ship with the app or live in its git history. A
  server builds them by importing the CRB PDF like any other book, or an
  admin loads a **data pack** — a small zip of just those tables, with no
  descriptions, PDFs or keys — exported from another server. Upgrading a
  server that already has the CRB in its Library re-imports it
  automatically on first start.

**Security hardening**
- Passwords hashed with scrypt; sessions are random tokens, stored as
  hashes, 30-day sliding expiry, `Secure`/`__Host-` behind a trusted
  proxy.
- Sign-in lockout per account and per client address/network, with a
  known-device cookie so a household's other sign-ins aren't slowed by one
  wrong password; every non-GET request is checked against its Origin.
- `TRUST_PROXY` and `PUBLIC_URL` settings (Unraid template: **Trusted
  proxy**, **Public address**) so the app knows which forwarded headers to
  believe when it sits behind a reverse proxy, with an example nginx rate
  limit for the login route.

**Backup changes**
- Backups now include accounts (`users.xml`, sign-in settings, every
  runner folder); sessions never do. The Authelia client secret travels
  only with **Include my API keys**. A restore signs everyone out; a
  backup from before accounts puts the server back into setup, with its
  runners going to the new first admin.

**Breaking**
- The app now requires signing in — it's no longer open to anyone who can
  reach it. Plan for the first-start setup code when upgrading.
- A server with no core data (a fresh install, or an upgrade whose CRB PDF
  isn't in its Library) opens on a setup page until the CRB is imported or
  a data pack is uploaded.

## 0.3.0 — 2026-09-28: edit the catalog, back up the server

**Catalog edits**
- An **Edit** button on any amp, item or rule (pickers, Game data, the Rules
  page) opens the Amp Builder in catalog mode, or a form with a Description
  box. Edits live in their own layer on the server, so a re-import never
  touches them; an edited entry gets an **Edited** mark and a **Restore
  book version** button.
- **Add entry** creates a new amp, item or rule under a house-rule source
  you name or pick.

**Backup and restore**
- Settings → **Backup**: **Download backup** zips up everything the server
  keeps — runners, house rules and edits, imported books, uploaded PDFs and
  AI settings — with "Include my API keys" left unticked by default.
- **Restore from backup** uploads a zip, shows what's in it (date, app
  version, file counts) before anything changes, then replaces the
  server's data. The server saves its own current state first, to
  `library/.backups` (newest 3 kept), so a restore can be undone.
  Restores are capped at 20 GB.

## 0.2.0 — 2026-09-28: bring your own books

The app no longer ships any book content. You upload the PDFs you own and it
builds its catalogs from them.

**Importing books**
- A **Books** page: upload a PDF, watch the import, re-import or remove it.
  Uploads, their converted text and import reports stay in the Library
  folder, which is never served over the web.
- Recipes for the core rulebook (spells, amps, gear, the 12 pregens and the
  Lightning example), the Conversion Guide (complex forms, technomancer
  rules), Daegann's Shadow Amps Expanded List, his pregen booklet (15 sample
  runners) and the quick-reference sheets (116 rules).
- Descriptions are kept privately per book, next to your imports.
- Any other book can go through an AI you set up: Anthropic, OpenAI-compatible
  (including Ollama and LM Studio), Gemini or AnythingLLM. Pick the model from
  a list loaded with your key, or type it. Proposed entries wait on a review
  screen until you accept, edit or drop them.
- API keys are stored in their own file, never shown again, and cleared if a
  provider's address changes.

**Catalog**
- Canon and non-canon: the core rulebook and Conversion Guide are canon;
  Daegann's material and the quick-reference sheets are published but not
  canon. Each runner can be set to flag non-canon content.
- Every entry shows which book and page it comes from. When two books define
  the same thing, both are kept and labelled.
- Six extra specializations from the expanded amp list, a searchable Rules
  page and hover help on amp effects.
- Existing runners keep working: their entries are mapped to the right book.

**Installing**
- Published as a public image, `ghcr.io/jbowensii/chummer-anarchy2`, with an
  Unraid template in [jbowensii/unraid-templates](https://github.com/jbowensii/unraid-templates).
  A new **Library** folder holds your uploaded books.

## 0.1.0 — 2026-09-27: first version

Character creation with a live nuyen receipt and cited rule checks, the
Shadow Amp builder, weapons, vehicles, technomancers, lifestyles, the career
ledger, a printable sheet in the book's style, light and dark themes, and
runners saved as XML files on the server.

# Release notes

## 0.5.3 — 2026-09-30: starting gear, a real SIN, native language, knowledge order

**Starting gear**
- Every runner, new or old, draft or finalized, examples included, carries a
  free **Commlink (with trodes)** and **Fake SIN** (CRB p.84). They sit on the
  Gear tab marked **Free (starting gear)**: rename them (the fake SIN’s name)
  and add a description, but they can’t be removed or sold. The printed sheet
  lists them with the rest of the equipment.
- Never twice: a runner that already has them gets none, and an imported pregen
  whose stat page lists “Fake SIN, Commlink” keeps exactly one of each, now
  free. Prices of existing runners are otherwise unchanged.

**A real SIN**
- **Has a real SIN** on the Concept tab (not a core rule) adds a free **Real
  SIN** entry to name, e.g. national or corporate, and, when an imported book
  has a quality named SINner (Daegann’s Shadow Amps), that quality, free and
  marked non-canon like the rest of that book. Unticking removes both (the
  quality only if the box added it). Without the book, a note says only the
  entry is added.

**Knowledge & languages**
- Two lists, **Knowledge** and **Languages**, each A–Z. Drag a row by its
  handle, or use its ↑ ↓ buttons from the keyboard, to set your own order;
  **Sort A–Z** puts it back.
- **Hide** leaves an entry off the printed sheet; it stays on the runner,
  dimmed with **Show**, and still counts.
- Mark one language **Native**: it’s free, one per runner, and the first
  language added to a runner is marked for you. The app’s reading of the rules:
  knowledge skills cover foreign languages, so the one you grew up with isn’t
  bought. Older runners have no native mark, so their prices don’t change.

**Files**
- New in the character format: `starting` and `note` on items, `realSin` on the
  amp the box added, `native` on a knowledge entry, and `knowledgeOrder` /
  `knowledgeHidden` in the build. Older files load unchanged and gain the
  starting gear. The importer marks a pregen’s fake SIN and commlink as
  starting gear.

## 0.5.2 — 2026-09-29: knowledge skills, languages, saving and the runner list

**Knowledge & languages**
- One **Knowledge & languages** list on the Skills tab, each entry saying
  where it comes from: **Free: keyword** (named after the keyword), **Free:
  <Skill> 4+** (named after the skill; rename it to anything related, it
  stays tied to that skill) or **Paid** (the knowledge price).
- Each entry is marked **Knowledge** or **Language**; the printed sheet lists
  languages and knowledge skills separately. There’s no free native language.
- A skill reaching 4 gets its free entry by itself. Lowering it below 4 asks
  first when its entry was renamed, since that entry then costs the knowledge
  price (Review notes it). A keyword’s entry follows the keyword’s text; remove
  the keyword and an entry you had marked stays as a paid one, noted on Review.
- In career mode, adding an entry is a ledger entry at the knowledge price;
  renaming a free one is recorded at no cost, and a free entry whose skill
  dropped below 4 can be paid for.
- Older files load unchanged: their knowledge skills are paid entries, and a
  “Language: X” entry becomes the language X.

**Saving**
- The runner’s bar shows the save state: “All changes saved” with the time,
  “Saving…”, or “Not saved” in red with the server’s reason and **Retry**.
- **Save** saves right away; **Save and close** goes back to the runner list
  once it’s saved.
- Leaving a runner sends its last change first, and the runner list waits for
  it. If it can’t be saved, leaving (or closing the tab) asks first.

**Runner list**
- Sorted A–Z by street name (else real name), ignoring case, accents and
  punctuation, so Father O’Neil files under F; unnamed runners come last.
  **Sort** also offers Z–A and Recently edited, and the browser remembers it.
  Before, the list followed the order of the files on the server, which could
  put a runner at the very bottom.
- **Search** by street name or real name.
- A **Draft** or **Finalized** badge on each runner and on the runner’s page
  replaces the Creation / Career label. A draft opens where it was left.
- A portrait that doesn’t load shows the runner’s initial instead.
- A saved file the app can’t read is no longer left out of the list: it shows
  as “Couldn’t open …” with the reason (line, column and element), **Download
  file**, and **Try to repair**, which lists what it would change (characters
  XML can’t hold removed, a stray “&” escaped, an unreadable part dropped) and
  saves the repaired runner after you confirm. Opening a runner reads only
  its own file.

**Saving what you type**
- Text pasted from a PDF can carry control characters XML can’t hold; they’re
  now dropped when saving instead of making the file unreadable. Line breaks
  and tabs in names, and blank fields in a draft (no metatype yet, say), now
  read back exactly as saved. A test saves random runners at every step of
  creation and in career, with every feature and awkward text, and reads
  them back.

## 0.5.1 — 2026-09-29: background art

- **Settings → Background art** (admin): upload your own images (PNG, JPEG
  or WebP, 10 MB each, up to 50), switch each one on or off, delete one after
  a confirm. A file that isn't really one of those images (an SVG or a web
  page renamed .png, say) is refused.
- The images that are on show behind every page for everyone signed in, one
  picked at random on each page load (one on: always that one; none: no
  background). The middle of the screen, where the text is, shows the art
  only faintly; it's a little stronger toward the edges. The dark theme tints
  it indigo, phones show it fainter still, and it never prints.
- **Settings → Background → Plain page** turns it off in your own browser.
- The images live in `library/backgrounds/` (`backgrounds.xml`, with its
  schema), are sent only to signed-in browsers, and travel in backups (not in
  data packs). No artwork ships with the app.
- A dialog opened over another one (like this delete confirm over Settings)
  no longer closes both.

## 0.5.0 — 2026-09-29: campaigns and Ask the rules

**Campaigns**
- A **Campaigns** page (runner list → **Campaigns**): the campaigns you run or
  play in, with the GM, players and runners of each; **New campaign** for the
  admin and editors, who become its GM. Archived campaigns show on request.
- A campaign's page: its runners grouped by player, and the table (GMs and
  players). The GM and the admin open each runner read-only and **Print** it;
  a player sees the others' runners as roster rows (name, archetype, level),
  never their sheets.
- GM tools: add players by username, remove them (their runners leave the
  campaign and stay theirs), rename, a note for the table, archive or
  unarchive, and delete once no runners are in it. The admin adds co-GMs.
- The runner list tags each runner with its campaign, has **Add to
  campaign…** and **Remove from campaign**, and can show one campaign's
  runners only. One campaign per runner: a duplicate is in none. A loaded
  example character is your own copy and joins a campaign like any other.
- Editors now read only the runners in the campaigns they run (they used to
  read everyone's); the admin still reads all.

**Ask the rules**
- Ask a rules question in the bar at the top of the builder and of a
  campaign's runners, or with the header's **?** button on any page (a drawer:
  Esc closes it, focus stays inside). Shown once the admin has an AI provider
  chosen, enabled and keyed.
- The answer comes from the passages the server finds in its own books,
  with its sources ("CRB p.61 · QREF Base"), shown as plain text. When the
  books don't cover it, it says so without asking the AI.
- The admin sets **Questions per day** per account on the Users page (blank:
  no limit); the bar shows how many are left, and a used-up day says “You’ve
  used all N of today’s questions. Ask again tomorrow.” (“You’ve used today’s
  question.” for one, “You have no questions today.” for none)
- Nothing is kept: asking again or closing clears the answer, and nothing is
  saved on the server or in the browser.

## 0.4.5 — 2026-09-29: AnythingLLM workspaces

**AI settings**
- AnythingLLM’s workspace can be a name: “Shadowrun Anarchy 2.0” used to fail
  the Test with HTTP 400 “not a valid workspace”, because AnythingLLM wants
  the workspace’s slug. The app now looks the saved text up in the server’s
  workspace list (a slug as is, or a name, ignoring case and spaces at either
  end) for the Test and for reading books, asking for the list once a minute
  at most.
- A workspace the server doesn’t have says so plainly and names the ones it
  has: “Workspace “X” isn’t on this AnythingLLM server. Its workspaces: A, B.”
  AnythingLLM’s own 400 “not a valid workspace” reads the same way.
- **Load workspaces** (AnythingLLM’s list button) shows the workspaces by
  name and saves the one you pick by its slug; asked with the saved key at the
  saved address, never following a redirect.
- **Test** no longer stays disabled after saving and reloading: it compares
  only the fields that provider’s test uses, trimmed as they are saved. The
  API key box no longer invites the browser’s password manager to fill the
  box before it (AnythingLLM’s workspace). Whenever Test is disabled, the text
  beside it says why: unsaved changes, no key saved, or a test running.

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
- Only regular files in a trash count (never links, or folders named like
  runners). **Empty trash** deletes the runners the page showed and says how
  many went; a trash file named only by its time restores as `runner.xml`.

**AI settings**
- A **Test** button for each provider (admin only) checks that it’s
  connected: it sends “Reply with the single word OK.” with the saved
  settings and key and shows, for example, “Connected — gemini-2.5-flash
  replied “OK” in 1.2 s.” Otherwise it says why in plain words: the key was
  refused, the model or workspace wasn’t found, the address can’t be
  reached, or there was no answer within 30 seconds. Works for Anthropic,
  OpenAI-compatible servers, Gemini and AnythingLLM. The key is never shown
  or logged; one test runs at a time, at most 10 a minute
  (`POST /api/ai-test?provider=`).

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

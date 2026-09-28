# Release notes

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

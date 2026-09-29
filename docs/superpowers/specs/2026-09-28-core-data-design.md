# Core data out of git — Design Spec

Date: 2026-09-28. Approved in conversation. Ships with accounts in 0.4.0.

The rules engine's core catalogs are facts taken from the core rulebook
(CRB). They leave the repository and its history, like the book catalogs
before them. A server gets them by importing the CRB or from a data pack.

## 1. Decisions

| Question | Decision |
|---|---|
| Which files leave git | `public/data/` ampeffects, amptypes, armor, attributes, levels, lifestyles, metatypes, packages, pricing, skills, vehicles, weapons (`.xml`). |
| What stays | `public/data/sources.xml` (book titles and canon flags only) and `public/data/schema/`. |
| Local copies | Stay on the owner's machine, gitignored. They are the answer key for the importer tests and keep local development working. |
| History | The 12 files are purged from every branch and tag on GitHub (the owner's local project keeps them). Pictures are not touched. |
| How a server gets them | Both: importing the CRB builds them, **and** the admin can upload a data pack. |

## 2. Where core data lives on a server

- `custom/imported/core/<name>.xml`, same format and schemas as today,
  every entry keeps `source="CRB"` and its page.
- Load order: `public/data/` (sources.xml; plus the local copies in
  development) → `imported/core/` → imported books → edits → house rules.
  A file present in `public/data/` (development) wins over nothing; on a
  server only `imported/core/` exists.
- Missing core data: the app opens on a setup screen. Admin: "Import the
  core rulebook on the Books page, or upload a data pack." Others: "The
  admin hasn't set up the game data yet."

## 3. From the rulebook

- The `crb` recipe also writes the 12 core files from the CRB tables
  (pages as in the files' comments; complex-form price from the CG when
  imported). Short `<text>` summaries go to the private
  `texts/crb.xml` like other descriptions; values and names go in the
  core files.
- Values the book doesn't state (e.g. `refundEffectRemoval`) are app
  defaults kept in the recipe code, documented there.
- Where a table can't be read by the recipe, the existing AI fallback
  proposes rows for review, as for other catalogs.
- On start, if `imported/core/` is missing but a CRB is in the Library,
  the server queues a re-import of it (upgrade path for existing servers).
- Test: with the owner's local copies present, the recipe output must
  equal them (attributes and names; text compared separately); skipped in
  CI where they're absent.

## 4. Data pack

- Books page (admin): **Download data pack** — a zip with `datapack.xml`
  (app version, date, file list) and `core/*.xml`; **Upload data pack** —
  checked like a restore (paths, sizes, manifest) and each file validated
  against its schema, then written atomically to `imported/core/`.
- A data pack never contains descriptions, PDFs or keys.

## 5. Tests without book data

- `tests/fixtures/mini/` gains invented core files (made-up names and
  numbers) so engine, server and e2e tests run in CI without the real
  data. Tests that check real book values move behind the "local answer
  key present" guard.
- The Docker image contains no core data; CI checks that.

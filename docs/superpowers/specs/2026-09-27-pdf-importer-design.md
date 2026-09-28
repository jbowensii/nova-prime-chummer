# PDF importer — Design Spec

Date: 2026-09-27. Status: approved in conversation, awaiting written review.

Users bring their own books. A fresh install ships the rules engine only;
every catalog (amps, spells, complex forms, gear, rules reference),
description and sample runner comes from PDFs the user uploads. Uploading
the PDF is the proof of ownership. Known books are extracted by
deterministic recipes; unknown PDFs can go through an AI the user
configures with their own API key, followed by a review.

## 1. Decisions

| Question | Decision |
|---|---|
| Where conversion runs | On the user's server, inside the Docker container (Node server + a Python worker). |
| Recognizing a book | A recipe per known book; AI fallback for unknown PDFs. |
| Keep the upload? | Keep both the PDF and the Markdown, privately, in a Library folder. |
| AI providers | Any or all of: Anthropic, OpenAI-compatible (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio), Google Gemini, AnythingLLM. One key (and URL where needed) each. |
| Protection | None for now (LAN use). User accounts are on the to-do list. |
| Fresh install | Rules engine only. No book catalogs, descriptions or samples. |
| When data goes live | Recipe imports: at once, with a report. AI imports: after review. |
| PDF library | pdfplumber (MIT) on pdfminer.six (MIT), pypdfium2 (Apache-2.0/BSD). No AGPL or GPL components. Optional OCR with Tesseract (Apache-2.0). |
| Settings and keys | Always XML. API keys in their own file; every set of user-configurable settings in its own file, separate from the keys. |
| Duplicate entries | Two books defining the same thing are both kept and both listed. Canon vs non-canon shows as the badge; when both have the same status, each is labeled with its book. |
| Where an entry comes from | Every entry carries `source` + `page`. The source resolves to the book's full title, and for imports to the uploaded file's name and checksum. Shown wherever an entry is shown. |

## 2. What ships

Kept in `public/data/` (mechanics needed to build any runner):
`sources.xml`, `levels`, `metatypes`, `attributes`, `skills`, `pricing`,
`amptypes`, `ampeffects`, `packages`, `lifestyles`, and the generic
`weapons`, `armor` and `vehicles` types.

Removed from the repository and produced by imports instead: `amps.xml`,
`spells.xml`, `complexforms.xml`, `gear.xml`, `rules.xml`, the DHSA specs in
`skills.xml`, and `public/samples/*` (the samples become recipe output).

`sources.xml` stays, listing every supported book with its canon flag and
recipe id, so the Books page can say what's supported before anything is
uploaded.

Existing runners keep working: each stores a snapshot of every catalog
entry it uses (character-format.md).

## 3. Architecture

```
browser ── Books page ──► POST /api/books (PDF upload)
                          GET  /api/books, /api/books/:id/report
                          POST /api/books/:id/reimport, DELETE /api/books/:id
                          GET/PUT /api/ai-settings   (keys write-only)
                          GET/POST /api/review/...
Node server (server.mjs) ── spawns ──► python -m importer <library/id>
                                          1. convert: PDF → book.md (pdfplumber)
                                          2. identify: recipes' match() → best score
                                          3. extract: recipe.extract(md) or AI proposal
                                          4. write: custom/imported/<source>/…
```

- One import at a time (a queue in the Node server); progress is written
  to `library/<id>/status.xml` and polled by the page.
- The Python worker is a package `importer/` in the repo with no network
  access except the AI step.

### Storage (new Unraid path "Library" → `/data/library`)

```
library/<book-id>/original.pdf     the upload, kept
library/<book-id>/book.md          our converter's Markdown, kept
library/<book-id>/import.xml       recipe, source id, file name, SHA-256, dates, report, counts
library/<book-id>/review.xml       AI proposals and the user's accept/edit/drop decisions
custom/imported/index.xml          generated list of imported overlay files
custom/imported/sources.xml        generated: one <source> per imported book (title, file, checksum, canon)
custom/imported/<source>/*.xml     data (kinds amps, items, rules, skills, samples…)
custom/texts/<source>.xml          private descriptions for that source
custom/sources.xml                 user-defined sources for house rules (user-editable)
library/.config/ai-keys.xml        API keys only (mode 600)
library/.config/ai-providers.xml   provider choices: enabled, base URL, model, workspace
```

Every file the app writes or the user configures is XML, one concern per
file: keys never share a file with settings, and generated files never
share one with user-edited ones. The Library folder is never served over
HTTP. Schemas: `aikeys.xsd`, `aiproviders.xsd`, `import.xsd`, `review.xsd`,
alongside the data schemas.

`loadCatalog` loads `custom/imported/index.xml` after the base data and
before the user's own `custom/index.xml`, so house rules still win.
Samples are served from `custom/imported/<source>/samples/`.

## 4. Sources and duplicates

### Every entry says where it comes from

- Every catalog entry keeps `source` (an id) and `page`. The id resolves
  through three files, merged in this order: the shipped
  `public/data/sources.xml` (supported books), the generated
  `custom/imported/sources.xml`, and the user's `custom/sources.xml`.
- A `<source>` has `id`, `canon`, `publisher`, `<name>` (full title) and,
  for imports, `file` (uploaded file name), `sha256` and `imported` (date).
- The app shows the source's title wherever it shows an entry: pickers,
  runner rows, the sheet's footnotes, Game data, Books. Hovering shows the
  publisher and file name.
- Entries built in the Amp Builder or as custom items have no book; they
  show "Built by you".
- House-rule overlays must cite a source; one not listed in any sources
  file is reported on Game data and treated as not canon.

### Duplicates are kept, not replaced

Today an overlay entry with the same id replaces the base one. For
imported books that would silently drop one book's version, so:

- Imported entries get ids scoped by source: `<source>.<id>` in lower case
  (`crb.jazz`, `dhsa.jazz`). House-rule overlays keep the old rule (same id
  replaces), because replacing is their purpose.
- Two entries are duplicates when they have the same type and the same
  normalized name (case, punctuation and "(Type)" suffixes ignored).
  The loader groups them; nothing is removed.
- Pickers list both, next to each other:
  - one canon and one not: the **Non-canon** badge tells them apart;
  - both canon or both not: each gets a label with its book's short
    title (for example "CRB" and "DHSA"), with the full title on hover.
- The Books page report lists every duplicate group with both ratings, so
  differences (DHSA's Jazz vs the CRB's) are visible.
- Existing runners reference unscoped ids (`jazz`). On load, an unscoped
  `catalogId` is mapped to the scoped entry whose source matches the
  runner's stored snapshot; the snapshot keeps it working either way.

## 5. Converter

`importer/convert.py`: pdfplumber per page → Markdown.
- Headings from font size and weight bands measured per document.
- Tables via pdfplumber's table finder, emitted as Markdown pipe tables.
- A page marker comment `<!-- page N -->` before each page, so recipes can
  cite pages.
- Optional OCR (Tesseract) only for pages with no text layer.

The recipes parse this converter's output, not any other tool's, so the
Markdown only has to be consistent, not pretty. A converter change that
alters output bumps a converter version stored in `import.xml`; re-import
reruns from `original.pdf`.

## 6. Recipes

`importer/recipes/<id>.py`, each with:

```python
ID = "dhsa"                    # the source id it produces
NAME = "Shadow Amps Expanded List v3.4b"
def match(meta, md_head) -> float      # 0..1: PDF title, known SHA-256s, heading markers
def extract(md, ctx) -> Result          # data files, texts, samples, report rows
```

`Result.report` lists what didn't match (printed vs computed ratings,
unresolved specs), shown on the Books page and replacing the hand-kept
parts of book-discrepancies.md.

Initial recipes, ported from today's tools:

| Recipe | Source | From |
|---|---|---|
| `dhsa` | DHSA | tools/dhsa_to_xml.py (reads a table-row JSON today; will read the Markdown tables) |
| `qref` | QREF | tools/qref_to_xml.py |
| `pregens` | PREGENS | new stat-block parser; today's samples were typed in by hand (tools/daegann-pregens.mjs) and can't ship |
| `cg` | CG | Emerged amp type, Tasking skill, complex forms |
| `crb` | CRB | new: amps (qualities, cyberware, bioware, adept powers, equipment, vehicles), spells, gear, and the 12 pregens + Lightning. Today these came in through DHSA's rows and hand-written files. |

The core-rulebook recipe is the largest piece of work. The DHSA list
reprints 148 core-rulebook amps; the DHSA recipe imports them as DHSA
entries (DHSA's text and numbers, not canon). With both books imported
they show as duplicates (section 4), the canon CRB version first.

## 7. AI fallback

- Settings: one block per provider (Anthropic, OpenAI-compatible with base
  URL, Gemini, AnythingLLM with URL and workspace). The PUT accepts keys;
  GET returns only whether each key is set. Keys are stored in
  `library/.config/ai-keys.xml` (mode 600) and nothing else goes in that
  file; provider choices (enabled, base URL, model, workspace) go in
  `library/.config/ai-providers.xml`.
- Before sending anything, the page says which provider will receive the
  book's text and asks to confirm.
- The worker splits `book.md` by headings, asks the model to fill a JSON
  schema derived from our XSDs (amps, items, spells, complex forms, rules),
  and validates every proposal with the same checks as `validate:data`.
- Proposals land in `library/<id>/review.xml`. The review screen lists
  them with accept, edit and drop, plus a source id and a canon choice for
  the book. Accepting writes the overlay exactly as a recipe would.

## 8. UI

A **Books** page (link in the library header):
- a drag-and-drop upload, with progress;
- the supported books from `sources.xml`, each shown as imported or not;
- imported books: source, recipe, date, entry counts, canon badge, the
  report, "Re-import", "Remove" (deletes its overlay, texts and samples;
  the PDF and Markdown stay unless "also delete the files" is ticked);
- **AI settings**, and the **review queue** for AI imports.

A fresh install's library shows "Upload your books to add amps, spells and
gear" with a link to the Books page.

## 9. Tests

- Engine tests move to a small made-up catalog committed in
  `tests/fixtures/` (no book data).
- Book tests (pregen numbers, discrepancy lists, catalog counts) run only
  when private imports are present locally, and are skipped in CI with a
  visible reason.
- Recipe tests run each recipe against the user's local `book.md` when
  present; the converter has its own tests on a generated PDF.
- e2e: upload a small generated PDF matching a test recipe; AI review with
  a stubbed provider.

## 10. Deployment (tower04)

- The Unraid template gains the Library path. The image grows by Python 3
  and pdfplumber (tens of MB).
- After deploying, upload the PDFs from `Downloads\Shadowrun Anachy 2.0` on
  the Books page to get back today's catalogs, descriptions and samples.
- Runners on the server are untouched.

## 11. Later (to-do)

- User accounts: each person logs in and has their own books, keys and
  runners. Needed before tower04 is reachable from outside the LAN.
- Git history still contains book data (earlier descriptions, and after
  this change the removed catalogs). Purging it means rewriting history;
  that's the owner's decision.

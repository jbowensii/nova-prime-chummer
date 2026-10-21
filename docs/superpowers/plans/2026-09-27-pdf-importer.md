# PDF Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users upload their own PDFs; the server converts them, extracts catalogs, descriptions and samples with per-book recipes (or an AI they configure, with review), and a fresh install ships the rules engine only.

**Architecture:** The Node server gains a Books API and a job queue that spawns a Python worker package `importer/` (pdfplumber → Markdown → recipe or AI → XML overlays in `custom/imported/<source>/`). The browser loader merges the imported overlays with source-scoped ids so duplicates from different books are both kept. All settings and records are XML, one concern per file.

**Tech Stack:** Node 22 (dependency-free server), React 19 + TypeScript + Vite, Vitest, Playwright, Python 3.12 with pdfplumber (MIT) + pypdfium2 (Apache-2.0/BSD), xmllint-wasm for XSD checks.

**Spec:** `docs/superpowers/specs/2026-09-27-pdf-importer-design.md` (read it with this plan).

## Global Constraints

- PDF and conversion libraries: pdfplumber, pdfminer.six, pypdfium2, Tesseract only. **No AGPL or GPL dependencies** (no PyMuPDF, pymupdf4llm, Marker).
- Every file the app writes or the user configures is **XML**, one concern per file. API keys live alone in `library/.config/ai-keys.xml` (mode 600); provider choices in `library/.config/ai-providers.xml`. The Library folder is never served over HTTP.
- Nothing extracted from a book is committed: no catalogs, descriptions, samples or book Markdown in the repository. Test fixtures are made up.
- Imported entry ids are `<source>.<id>` in lower case. House-rule overlays keep "same id replaces".
- Duplicates (same type + normalized name) are all kept and listed; told apart by the Non-canon badge, or by a book label when the canon status is the same.
- Every entry shows its source's title; imported sources also carry file name and SHA-256.
- No login (LAN use). Keys are write-only over the API.
- UI copy: sentence case, plain verbs, curly apostrophes (’), no “Submit”.
- Commit style: subject under 70 characters, body explaining why; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/importer`; one PR at the end.

## File structure

| Path | Responsibility |
|---|---|
| `importer/__main__.py` | CLI: `python -m importer run <library/id>` and `python -m importer convert <pdf> <md>` |
| `importer/convert.py` | PDF → Markdown (pdfplumber), page markers, tables, heading bands |
| `importer/xmlio.py` | Writing overlay XML, texts XML, import.xml, status.xml, review.xml |
| `importer/recipes/__init__.py` | Recipe registry, `identify()` |
| `importer/recipes/{qref,dhsa,pregens,cg,crb}.py` | One recipe per known book |
| `importer/ai/{providers,propose}.py` | AI provider clients (stdlib `urllib`), proposal pipeline |
| `importer/tests/*.py` | `unittest` tests; fixtures generated at test time |
| `server/books.mjs` | Books API, upload streaming, job queue, AI settings, review endpoints |
| `server/server.mjs` | Mount `/api/books*`, `/api/ai*`, `/api/review*`; serve `custom/imported` via `/custom/` |
| `src/engine/load.ts` | Load `custom/imported/index.xml` + sources files; scope imported ids |
| `src/engine/dupes.ts` | Duplicate grouping and labels |
| `src/engine/migrate.ts` (new) or `file.ts` | Map unscoped `catalogId`s on load |
| `src/features/book-library/Books.tsx`, `src/ui/Review.tsx`, `src/features/ai-assist/AiSettings.tsx` | Books page, review queue, AI settings |
| `src/ui/SourceLabel.tsx` | Source title / badge / "Built by you" |
| `public/data/schema/{aikeys,aiproviders,import,review,status}.xsd` | Schemas for the new XML files |
| `tests/fixtures/mini/` | Made-up catalog + imported overlay for engine and e2e tests |

---

### Task 1: Made-up test catalog, and book tests that skip without private data

Moves the tests off the shipped book catalogs before those are removed (Task 12).

**Files:**
- Create: `tests/fixtures/mini/amps.xml`, `tests/fixtures/mini/items.xml`, `tests/fixtures/mini/rules.xml`, `tests/fixtures/mini/imported/index.xml`, `tests/fixtures/mini/imported/sources.xml`, `tests/fixtures/mini/imported/test/amps.xml`
- Modify: `tests/helpers.ts`
- Move: `tests/engine/pregens.test.ts`, `tests/data/catalog.test.ts`, `tests/engine/canon.test.ts` parts that name book entries → `tests/books/`
- Create: `tests/books/_gate.ts`

**Interfaces:**
- Produces: `cat` (engine catalog = shipped mechanics + `tests/fixtures/mini`), `books: Catalog | null` (full catalog from `BOOKS_DIR` or `.extract/private/custom`), `describeBooks` (a `describe` that skips with a reason when `books` is null).

- [ ] **Step 1: Write the made-up amps.** `tests/fixtures/mini/amps.xml` holds 8 amps with fake names covering every type the engine tests touch: a first Quality with `rr-spec`, an adept power with `rr-attr`, cyberware with `grade-delta`, an equipment amp with an `<item kind="weapon">`, a vehicle with `flying`, a cyberdeck with `firewall-plus`/`attack-plus`, a mod (`mod="true"`), a drug with `init-1 init-2 negative`. Source `TEST`, pages 1–8. Example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="amps" version="1">
  <amp id="keen-eye" type="quality" printedRating="2" source="TEST" page="1"><name>Keen Eye</name><effect ref="rr-spec" param="perception.physical"/><narrative></narrative></amp>
  <amp id="rush" type="equipment" printedRating="3" source="TEST" page="2"><name>Rush</name><item kind="gear"/><effect ref="init-1"/><effect ref="init-2"/><effect ref="negative" value="2" note="book drawback"/><narrative></narrative></amp>
</ca2:data>
```

- [ ] **Step 2: Add `TEST` to a fixture sources file** `tests/fixtures/mini/sources.xml` (`canon="false"`), and a second fixture source `TESTC` (`canon="true"`) with one amp named "Rush" of the same type, to exercise duplicates later.

- [ ] **Step 3: Rewrite `tests/helpers.ts`.**

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildCatalog, type SourceFile } from '../src/engine/load'
import type { Catalog, Character } from '../src/model/types'

const dir = (d: string, overlay: boolean): SourceFile[] => readdirSync(d).filter(f => f.endsWith('.xml'))
  .map(f => ({ file: overlay ? `custom/${f}` : f, xml: readFileSync(join(d, f), 'utf8'), overlay }))

export const base: SourceFile[] = dir('public/data', false)
export const cat = buildCatalog([...base, ...dir('tests/fixtures/mini', true)])

/** full catalog from the owner's private imports; null in CI */
const BOOKS = process.env.BOOKS_DIR ?? '.extract/private/custom'
export const books: Catalog | null = existsSync(join(BOOKS, 'imported', 'index.xml')) ? loadDir(BOOKS) : null
export const sample = (name: string): Character =>
  JSON.parse(readFileSync(join(BOOKS, 'imported', 'samples', `${name}.ca2.json`), 'utf8'))
```

(`loadDir` reads `imported/index.xml` and each listed file plus `texts/*.xml` in the same order `loadCatalog` uses; implement it next to `cat`.)

- [ ] **Step 4: Gate the book tests.** `tests/books/_gate.ts`:

```ts
import { describe } from 'vitest'
import { books } from '../helpers'
export const describeBooks = books ? describe : describe.skip
export const SKIP_REASON = 'no private imports (set BOOKS_DIR or import your books); book tests skipped'
if (!books) console.info(SKIP_REASON)
```

Move `pregens.test.ts` and `catalog.test.ts` under `tests/books/`, wrap their top-level `describe`/`describe.each` with `describeBooks`, and switch `cat` → `books!`.

- [ ] **Step 5: Point the engine tests at made-up ids.** In `tests/engine/*.test.ts`, replace book ids (`jazz`, `gun-fu`, `light-armor` stays: it's a shipped mechanic) with fixture ids. Run: `npx vitest run tests/engine` → Expected: all pass using only `public/data` + `tests/fixtures/mini`.

- [ ] **Step 6: Run everything.** `npm test` → Expected: engine tests pass; book tests pass locally *while the old catalogs still exist in public/data* (point `BOOKS_DIR` at a temp dir made by copying `public/data` catalogs + `public/custom/texts` into `imported/` for now) and skip with `SKIP_REASON` when `BOOKS_DIR` is empty.

- [ ] **Step 7: Commit** `test: made-up fixture catalog; book tests skip without private data`.

---

### Task 2: Converter (PDF → Markdown with pdfplumber)

**Files:**
- Create: `importer/__init__.py`, `importer/__main__.py`, `importer/convert.py`, `importer/tests/test_convert.py`, `importer/requirements.txt`

**Interfaces:**
- Produces: `convert(pdf_path: str, md_path: str) -> dict` returning `{"pages": int, "converter": "1", "sha256": str, "title": str}`; Markdown with `<!-- page N -->` before each page, `#`/`##`/`###` headings from font-size bands, pipe tables for detected tables.

- [ ] **Step 1: requirements.** `importer/requirements.txt`:

```
pdfplumber==0.11.4
pypdfium2==4.30.0
```

Install locally: `py -3.12 -m pip install -r importer/requirements.txt`.

- [ ] **Step 2: Failing test with a generated PDF.** The test builds a two-page PDF with `pypdfium2`? No: pypdfium2 can't author text easily. Use a tiny hand-written PDF string (PDF 1.4, Helvetica, two pages, one 24pt heading, 10pt body, a 3×2 grid drawn with lines and text in cells) written to a temp file.

```python
import os, tempfile, unittest
from importer.convert import convert
from importer.tests.minipdf import two_page_pdf   # builds bytes of a valid PDF

class ConvertTest(unittest.TestCase):
    def test_pages_headings_tables(self):
        d = tempfile.mkdtemp()
        pdf, md = os.path.join(d, "t.pdf"), os.path.join(d, "t.md")
        open(pdf, "wb").write(two_page_pdf())
        meta = convert(pdf, md)
        text = open(md, encoding="utf8").read()
        self.assertEqual(meta["pages"], 2)
        self.assertIn("<!-- page 1 -->", text)
        self.assertIn("<!-- page 2 -->", text)
        self.assertRegex(text, r"(?m)^# Shadow Test$")
        self.assertRegex(text, r"(?m)^\| Name \| Rating \|$")
        self.assertEqual(len(meta["sha256"]), 64)
```

`importer/tests/minipdf.py` writes the PDF objects by hand (catalog, pages, two page objects with content streams using `BT /F1 24 Tf 72 720 Td (Shadow Test) Tj ET`, rectangles with `re S` for the table grid) and computes the xref offsets.

Run: `py -3.12 -m unittest importer.tests.test_convert -v` → Expected: FAIL (no module `importer.convert`).

- [ ] **Step 3: Implement `convert.py`.**

```python
"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty."""
import hashlib, statistics
import pdfplumber

CONVERTER_VERSION = "1"

def _bands(pdf):
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    body = statistics.mode(sizes) if sizes else 10
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big   # big[0] -> '#', big[1] -> '##', big[2] -> '###'

def _lines(page, body, big, table_boxes):
    words = page.extract_words(extra_attrs=["size", "fontname"], keep_blank_chars=False, use_text_flow=True)
    rows, cur, top = [], [], None
    for w in words:
        if any(b[0] <= w["x0"] <= b[2] and b[1] <= w["top"] <= b[3] for b in table_boxes):
            continue
        if top is not None and abs(w["top"] - top) > 2:
            rows.append(cur); cur = []
        cur.append(w); top = w["top"]
    if cur: rows.append(cur)
    out = []
    for r in rows:
        text = " ".join(w["text"] for w in r)
        size = round(max(w["size"] for w in r), 1)
        level = next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)
        out.append((r[0]["top"], ("#" * level + " " + text) if level else text))
    return out

def _table_md(rows):
    rows = [[(c or "").replace("\n", "<br>").strip() for c in r] for r in rows if any(r)]
    if not rows: return []
    head, *body = rows
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(r) + " |" for r in body]

def convert(pdf_path, md_path):
    sha = hashlib.sha256(open(pdf_path, "rb").read()).hexdigest()
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        body, big = _bands(pdf)
        for n, page in enumerate(pdf.pages, 1):
            out.append(f"<!-- page {n} -->")
            tables = page.find_tables()
            boxes = [t.bbox for t in tables]
            items = _lines(page, body, big, boxes)
            items += [(t.bbox[1], "\n".join(_table_md(t.extract()))) for t in tables]
            out += [text for _, text in sorted(items, key=lambda x: x[0])]
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    open(md_path, "w", encoding="utf8", newline="\n").write("\n".join(out) + "\n")
    return {"pages": pages, "converter": CONVERTER_VERSION, "sha256": sha, "title": title}
```

`__main__.py` adds `convert <pdf> <md>` (prints the dict as XML attributes) and later `run <dir>`.

- [ ] **Step 4: Run tests** → PASS. Then convert the real quick-reference PDF and eyeball it: `py -3.12 -m importer convert "Downloads/Shadowrun Anachy 2.0/1358228-SRA2_-_Matrix.pdf" .extract/matrix.md`. Expected: page markers, `# MATRIX QUICK REFERENCE`, `## ACTIONS`, bullets as lines.

- [ ] **Step 5: Commit** `importer: PDF to Markdown converter (pdfplumber, MIT)`.

---

### Task 3: XML records, recipe registry, `run` command, and the QREF recipe

The smallest book first, end to end on the Python side.

**Files:**
- Create: `importer/xmlio.py`, `importer/recipes/__init__.py`, `importer/recipes/qref.py`, `importer/tests/test_qref.py`, `importer/tests/test_run.py`
- Create: `public/data/schema/import.xsd`, `public/data/schema/status.xsd`
- Modify: `importer/__main__.py`; delete `tools/qref_to_xml.py` (its logic moves into the recipe)

**Interfaces:**
- Produces: `Result(files: dict[str, str], texts: str|None, samples: dict[str, str], report: list[dict], source: dict)` where `files` maps an overlay file name (`rules.xml`) to XML text; `source = {"id","name","publisher","canon"}`.
- Recipe module contract: `ID`, `NAME`, `PUBLISHER`, `CANON`, `match(meta: dict, md_head: str) -> float`, `extract(md: str) -> Result`.
- `identify(meta, md_head) -> (module|None, score)`; threshold 0.6.
- `run(book_dir, custom_dir)`: reads `original.pdf`, writes `book.md`, `status.xml` (`state="converting|identifying|extracting|done|failed|needs-ai"`), `import.xml`, then the outputs; updates `custom/imported/index.xml` and `custom/imported/sources.xml`.

- [ ] **Step 1: Failing QREF test on a Markdown string** (made-up text in the converter's format, not the real sheet):

```python
MD = """<!-- page 1 -->
# MATRIX QUICK REFERENCE
## ACTIONS
- Bricking: damages a device. Test text.
- Brute Force: direct hack. Test text.
## CONNECTION MODES
- VR hot-sim: full immersion. Test text.
"""
class QrefTest(unittest.TestCase):
    def test_extract(self):
        r = qref.extract_sheet("matrix", MD)
        ids = [x["id"] for x in r]
        self.assertEqual(ids, ["matrix-bricking", "matrix-brute-force", "matrix-vr-hot-sim"])
        self.assertEqual(r[2]["effects"], "vr-hot")
    def test_match(self):
        self.assertGreater(qref.match({"title": ""}, "# MATRIX QUICK REFERENCE\n## ACTIONS"), 0.6)
        self.assertLess(qref.match({"title": ""}, "# Something else"), 0.2)
```

- [ ] **Step 2: Implement `qref.py`** by porting `tools/qref_to_xml.py`'s `parse()` to read the converter's Markdown (`**Title:**` bold markers won't exist; titles are the text before the first `:` on a bullet or line). `match` scores 0.9 when the head contains `QUICK REFERENCE` and one of BASE/MAGIC/MATRIX/VEHICLES. Because the four sheets are four PDFs, the recipe produces `rules-<sheet>.xml` per upload and the loader merges all `rules-*.xml`. IDs are emitted unscoped (`matrix-vr-hot-sim`); scoping happens at write time (Step 4).

- [ ] **Step 3: `xmlio.py`** with `write_overlay(dir, name, xml)`, `write_texts(path, entries)`, `write_status(book_dir, state, message="")`, `write_import(book_dir, **attrs, report=[...])`, `update_index(custom_dir)` (lists every `imported/<src>/*.xml` except `samples/`), `update_sources(custom_dir)` (one `<source>` per `import.xml`: `id`, `publisher`, `canon`, `file`, `sha256`, `imported`, `<name>`). All files written to a temp name and renamed. Schemas `import.xsd` / `status.xsd` in `public/data/schema/`.

- [ ] **Step 4: Scope ids when writing.** In `xmlio.write_overlay`, rewrite every top-level entry's `id="x"` to `id="<source>.x"` (lower case) and every internal reference that points at an entry in the same file set (`linkedItem`, amp `<item>` ids if any, `mod` targets) the same way. Test: an overlay with `<amp id="rush">` for source `DHSA` is written as `id="dhsa.rush"`.

- [ ] **Step 5: `run` end to end test** (`test_run.py`): put the made-up QREF Markdown into a temp `library/b1/book.md` (skip conversion with `--md`), run `run(book_dir, custom_dir)`, assert `custom/imported/qref/rules-matrix.xml`, `custom/texts/qref.xml`, `custom/imported/index.xml` and `sources.xml` exist and validate against their XSDs (call `node tools/validate-data.mjs <custom_dir>` via `subprocess`).

- [ ] **Step 6: Real check.** Convert and run the four real sheets from Downloads into `.extract/private/custom` and compare titles with today's `public/data/rules.xml`: `py -3.12 -m importer run .extract/private/library/qref-matrix --custom .extract/private/custom`. Expected: the same 116 titles across the four sheets (report any difference in `import.xml`).

- [ ] **Step 7: Commit** `importer: records, recipe registry, quick-reference recipe`.

---

### Task 4: Engine loads imported books: sources files, scoped ids, duplicates

**Files:**
- Modify: `src/engine/load.ts`, `src/model/types.ts`, `src/engine/canon.ts`
- Create: `src/engine/dupes.ts`, `tests/engine/imported.test.ts`
- Modify: `public/data/schema/sources.xsd` (optional `file`, `sha256`, `imported`), `tools/validate-data.mjs` (validate `custom/imported/*` and the three sources files)

**Interfaces:**
- Consumes: fixture `tests/fixtures/mini/imported/*` from Task 1 (two sources `TEST` non-canon and `TESTC` canon, both with a "Rush").
- Produces:
  - `Source` gains `file?: string; sha256?: string; imported?: string; origin: 'shipped' | 'imported' | 'user'`.
  - `loadCatalog` fetches, in order: `data/*.xml`, `custom/imported/sources.xml`, `custom/sources.xml`, `custom/imported/index.xml` files, texts files named by all sources, then `custom/index.xml` files.
  - `dupeGroups(c): Map<string, string[]>` (key = `type|normalized name`, value = entry ids), `dupeLabel(c, id): { kind: 'badge' } | { kind: 'book', text: string, title: string } | null`.

- [ ] **Step 1: Failing tests.**

```ts
import { dupeGroups, dupeLabel } from '../../src/engine/dupes'
import { cat } from '../helpers'
test('both books’ Rush are kept', () => {
  expect([...cat.amps.keys()]).toEqual(expect.arrayContaining(['test.rush', 'testc.rush']))
})
test('one canon, one not: the badge tells them apart', () => {
  expect(dupeLabel(cat, 'test.rush')).toEqual({ kind: 'badge' })
})
test('same status: labeled with the book', () => {
  // fixture TEST2 (non-canon) also has "Keen Eye"
  expect(dupeLabel(cat, 'test.keen-eye')).toEqual({ kind: 'book', text: 'TEST', title: 'Test Book One' })
})
test('normalization ignores case, punctuation and "(Type)" suffixes', () => {
  expect([...dupeGroups(cat).values()].some(g => g.includes('test.rush') && g.includes('testc.rush'))).toBe(true)
})
test('an imported source carries its file and checksum', () => {
  expect(cat.sources.get('TEST')).toMatchObject({ file: 'test-book.pdf', origin: 'imported' })
})
```

- [ ] **Step 2: Implement.** `normalize = s => s.toLowerCase().replace(/\s*\((cyberware|bioware|quality|adept power|equipment|weapon|vehicle|drone)\)\s*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim()`. `dupeLabel`: none if the group has one entry; `badge` if the group mixes canon and non-canon; else `book` with the source id and name.

- [ ] **Step 3: Loader.** Extend `loadCatalog` per the interface order. Sources from `custom/imported/sources.xml` get `origin: 'imported'`, from `custom/sources.xml` `origin: 'user'`. A house-rule overlay entry citing an unknown source adds a `LoadError` "source "X" isn't listed in any sources file; treated as not canon".

- [ ] **Step 4: Run** `npx vitest run` → PASS. `npm run validate:data -- tests/fixtures/mini` → OK.

- [ ] **Step 5: Commit** `engine: load imported books with scoped ids; keep duplicates`.

---

### Task 5: Runners referencing old unscoped ids

**Files:**
- Modify: `src/engine/file.ts` (or the migrate step used by `parseCharacterFile` / `xmlToCharacter`), `tests/engine/imported.test.ts`

**Interfaces:**
- Produces: `rescope(c: Catalog, ch: Character): Character` — for each amp/item with a `catalogId` not in the catalog, find `<source>.<catalogId>` where `<source>` is the snapshot's `source` (lower case); fall back to any scoped match with the same normalized name and type. Called by the editor when a runner is opened (not by the file parser, which has no catalog).

- [ ] **Step 1: Failing test:** a runner with `{ catalogId: 'rush', snapshot: { source: 'TESTC', … } }` → `rescope` → `catalogId === 'testc.rush'`; one with an unknown id and no match keeps its id and snapshot.
- [ ] **Step 2: Implement; call it in `EditorView` after `repo.get` and in `Library` before listing badges.** Save only when something changed.
- [ ] **Step 3: Run tests → PASS. Commit** `engine: map old unscoped catalog ids to their book`.

---

### Task 6: Source labels everywhere

**Files:**
- Create: `src/ui/SourceLabel.tsx`
- Modify: `src/core/ui-kit/bits.tsx` (Picker gets `label?: ReactNode`), `src/ui/tabs/Amps.tsx`, `src/ui/tabs/Gear.tsx`, `src/print/Sheet.tsx`, `src/ui/tabs/Data.tsx`
- Test: `e2e/sources.spec.ts`

**Interfaces:**
- Produces: `<SourceLabel c={c} source="DHSA" page={6} id="dhsa.rush" />` renders `DHSA p.6` with `title="Shadow Amps Expanded List v3.4b — Daegann (Holostreets) — file 1659004-….pdf"`, plus the duplicate label from `dupeLabel` (badge or book tag). `<SourceLabel builtByYou />` renders "Built by you".

- [ ] **Step 1: Component** (uses `NonCanon` for the badge; book tag is `<span className="booktag" title={title}>{text}</span>`).
- [ ] **Step 2: Use it** in the amp and gear pickers (replace the `${a.source} p.${a.page}` strings), on runner amp/item rows (catalog entries → label; entries without `catalogId` → "Built by you"), on the sheet (a small source column in the amps table, screen only via `@media screen`), and on the Game data Sources table (file + checksum columns for imported sources).
- [ ] **Step 3: e2e** with the fixture overlay served by the e2e server (Task 11 wires `customDir` to the fixture): the picker shows two "Rush" rows, one with the Non-canon badge; two "Keen Eye" rows each with a book tag; a runner-built amp row shows "Built by you".
- [ ] **Step 4: Commit** `ui: show every entry’s source; label duplicates`.

---

### Task 7: DHSA recipe (Markdown tables instead of the row JSON)

**Files:**
- Create: `importer/recipes/dhsa.py`, `importer/tests/test_dhsa.py`
- Move logic from: `tools/dhsa_to_xml.py` (Mapper, effect parsing, cite, mods, contacts, complex forms, grades); then delete `tools/dhsa_to_xml.py`, `tools/dhsa_rows.py`

**Interfaces:**
- Consumes: converter Markdown; `xmlio`; the shipped `public/data/skills.xml` for spec resolution (the six DHSA specs move into the recipe's own `skills.xml` overlay per the spec).
- Produces: overlay files `amps.xml`, `spells.xml`, `complexforms.xml`, `gear.xml`, `skills.xml` (spec additions only, as `<skill id>` with new `<spec>`s, merged by the loader into the existing skill), `texts/dhsa.xml`, report rows (printed vs computed, unresolved specs).

- [ ] **Step 1: Row reader test.** A made-up Markdown table in the DHSA layout (`|**Name**|Amp 2|10 000¥*|RR 1 Influence (Animals).|`) → `rows()` yields `{page, section, subsection, name, type, cost, effects, added}` exactly like today's `dhsa34.json` rows.
- [ ] **Step 2: Parity test (book test, gated):** when the owner's `library/dhsa/book.md` exists, run the recipe and compare counts with the report's last line today: `amps 554 (mods 84), spells 77, complex forms 31, gear 41`, mismatches 21. Differences must be listed and explained before moving on.
- [ ] **Step 3: Implement**: `rows()` parses pipe tables under the section/subsection headings, carrying `page` from the page markers; everything after that is the existing `build()` code with `private()` writing to the texts result and `cite()` always returning `DHSA` + DHSA page (the 148 core-book reprints are DHSA entries now — spec §6).
- [ ] **Step 4: Loader merge for skill additions:** an imported `skills.xml` whose `<skill id>` matches an existing skill appends its `<spec>`s instead of replacing the skill. Test in `tests/engine/imported.test.ts`.
- [ ] **Step 5: Commit** `importer: DHSA recipe reads the converted Markdown`.

---

### Task 8: Pregen recipes (stat-block parser) and samples from imports

**Files:**
- Create: `importer/recipes/pregens.py`, `importer/statblock.py`, `importer/tests/test_statblock.py`
- Modify: `src/ui/Library.tsx` (samples come from `custom/imported/samples/index.xml`), `server/books.mjs` later serves them
- Delete (Task 12): `tools/daegann-pregens.mjs`, `tools/build-samples.mjs`, `public/samples/*`

**Interfaces:**
- Produces: `parse_statblock(md_page: str) -> dict` with keywords, skills `[(name, rating|None, attr, dp, rr)]` and spec rows, weapons, armor rows, dispositions, cues, amps `[(name, type, ess, rating, effect_lines)]`, equipment; `to_character(block, catalog_specs) -> dict` (the `.ca2.json` shape) that back-computes attributes as the most common `dp - rating` per attribute (ties broken by threshold rows), exactly the method used by hand in `tools/daegann-pregens.mjs`; samples written to `custom/imported/samples/<source>.<id>.ca2.json` with `origin`, plus a `samples/index.xml`.
- The printed numbers go into `library/<id>/import.xml` report rows, and a gated book test compares engine output with them (replacing `tests/fixtures/pregens-printed.json`, which is book data and is deleted).

- [ ] **Step 1: Parser test** on a made-up stat block in the converter's layout (fake runner "Test Face": Athletics 3 STR 5, (Ranged defense +2) AGI 8, Influence 5 CHA 9 …). Expect attributes `{str:2, agi:3, …}` and the spec list.
- [ ] **Step 2: Implement** the parser (section anchors `KEYWORDS`, `SKILLS`, `WEAPONS`, `ARMOR`, `WOUNDS`, `DISPOSITIONS`, `CUES`, `SHADOW AMPS`, `EQUIPMENT`), the effect-line mapper reusing DHSA's `Mapper.effects`, and the amp-type mapping from "(Adept power)", "(Cyberware)", "(Equipment)", "(Contact)", "(Vehicle - sedan)", "(Drone)".
- [ ] **Step 3: Gated parity test:** with the owner's pregen booklet imported, the 15 generated runners reproduce every pool, threshold and Essence value the hand-encoded ones did (the counts and discrepancy list in `docs/book-discrepancies.md` are the oracle; the doc itself moves to import reports in Task 12).
- [ ] **Step 4: Commit** `importer: pregen booklet recipe builds sample runners`.

---

### Task 9: Conversion Guide and core rulebook recipes

**Files:**
- Create: `importer/recipes/cg.py`, `importer/recipes/crb.py`, tests for both
- Modify: `docs/data-format.md`

**Interfaces:**
- `cg` produces: amp type `emerged` stays shipped (mechanics), plus CG complex forms if the CG lists any beyond DHSA, and the Tasking skill's description text.
- `crb` produces: amps (qualities CRB p.~58-63 examples and the Shadow Amps chapters), spells (p.~190-205), gear, weapons/armor named items, vehicles, the 12 pregens + Lightning (reusing `statblock.py` with the CRB layout), rules text for the quick references' canon counterparts is **not** in scope.

- [ ] **Step 1: Survey (no code).** Convert the owner's CRB PDF, record the headings and table layouts for each target chapter in `importer/recipes/crb.md` (private notes: page ranges and layout only, no book text). Get the owner's OK on the target list before extracting.
- [ ] **Step 2: Spells first** (most regular layout): test on a made-up spell block, then gated parity with today's 33 CRB spells.
- [ ] **Step 3: Amps**: gated parity with today's 148 CRB-cited amps (names and printed ratings from the current `amps.xml`, captured once into a private oracle file `.extract/private/oracle-crb-amps.xml` before Task 12 deletes the catalog).
- [ ] **Step 4: Pregens + Lightning** through `statblock.py`; gated parity with `tests/fixtures/pregens-printed.json` captured privately the same way.
- [ ] **Step 5: CG recipe**: small; parity with today's source="CG" entries.
- [ ] **Step 6: Commit per recipe.**

---

### Task 10: AI providers, settings files, and proposals

**Files:**
- Create: `importer/ai/providers.py`, `importer/ai/propose.py`, `importer/ai/schema.py`, `importer/tests/test_ai.py`
- Create: `public/data/schema/aikeys.xsd`, `public/data/schema/aiproviders.xsd`, `public/data/schema/review.xsd`

**Interfaces:**
- `providers.py`: `complete(provider: dict, key: str, system: str, user: str) -> str` for `anthropic` (POST `https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, model default `claude-sonnet-5`), `openai` (POST `{base_url}/chat/completions`, `Authorization: Bearer`), `gemini` (POST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=`), `anythingllm` (POST `{base_url}/api/v1/workspace/{workspace}/chat`, `Authorization: Bearer`). Stdlib `urllib.request` only; 120 s timeout; errors raise `ProviderError(message)`.
- Settings files:

```xml
<!-- library/.config/ai-providers.xml -->
<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="anthropic">
  <provider id="anthropic" enabled="true" model="claude-sonnet-5"/>
  <provider id="openai" enabled="false" baseUrl="http://localhost:11434/v1" model="llama3.1"/>
  <provider id="gemini" enabled="false" model="gemini-2.5-pro"/>
  <provider id="anythingllm" enabled="false" baseUrl="http://tower05:3001" workspace="shadowrun"/>
</ca2:aiproviders>
<!-- library/.config/ai-keys.xml (mode 600), nothing else in this file -->
<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">
  <key provider="anthropic">sk-ant-…</key>
</ca2:aikeys>
```

- `propose.py`: split `book.md` by `#`/`##` headings into chunks ≤ 12k characters; per chunk ask for JSON matching `schema.py` (amps with type/effects/printedRating/page; items; spells; complex forms), parse, validate each proposal with the same rules as `validate-data` (known effect refs, legal types, spec ids or `custom:`), write `review.xml` entries `<proposal id kind state="pending" page>` containing the proposed entry XML and any validation notes.

- [ ] **Step 1: Tests with a stub HTTP server** (`http.server` on a free port) for each provider format: request shape (URL, headers, body keys) and response parsing. No real network in tests.
- [ ] **Step 2: Implement providers; keys read from `ai-keys.xml` only at call time.**
- [ ] **Step 3: Proposal test**: stub provider returns two amps (one valid, one with an unknown effect) → `review.xml` has two proposals, the second with a note.
- [ ] **Step 4: Commit** `importer: AI providers and reviewable proposals`.

---

### Task 11: Server: Books API, upload streaming, job queue, settings, review

**Files:**
- Create: `server/books.mjs`, `tests/server/books.test.ts`
- Modify: `server/server.mjs`, `e2e/serve.mjs` (customDir → copy of `tests/fixtures/mini/custom`, libraryDir → temp), `Dockerfile`, `unraid/chummer-anarchy2.xml`

**Interfaces:**
- `createServer({ staticDir, charDir, customDir, libraryDir, python = 'python3' })`.
- Routes:
  - `POST /api/books` — body is the PDF, streamed to `library/<id>/original.pdf` (no 5 MB limit; 500 MB cap; `Content-Type: application/pdf`; `X-Filename` header, sanitized). Returns `202 { id }` and queues `python -m importer run <dir> --custom <customDir>`.
  - `GET /api/books` — `[{ id, file, state, source, recipe, imported, counts }]` from each `import.xml`/`status.xml`.
  - `GET /api/books/:id/report` — the `import.xml` as XML.
  - `POST /api/books/:id/reimport`, `DELETE /api/books/:id?files=1` (removes `custom/imported/<source>`, its texts and samples; with `files=1` also the Library folder), then rebuild the index and sources.
  - `GET /api/ai-settings` → providers XML with `<key provider set="true|false"/>` summaries (never the keys); `PUT /api/ai-settings` accepts the providers XML and, separately, `PUT /api/ai-keys` accepts `<key provider>` elements and writes only `ai-keys.xml` (chmod 600).
  - `POST /api/books/:id/ai` — start AI proposals for a book in state `needs-ai`.
  - `GET /api/review/:id`, `PUT /api/review/:id` (accept/edit/drop decisions + source id, name, canon) → on "apply", the worker writes the overlay like a recipe.
- Queue: one job at a time; `status.xml` updated by the worker; the server only spawns and reports exit codes.

- [ ] **Step 1: Server tests** (node environment, `python` replaced by a stub script that writes `status.xml state="done"` and a tiny overlay): upload a 10 MB buffer → 202; list shows it; report served; delete removes outputs; `GET /api/ai-settings` never contains a key; `/custom/../library` is 404/403; Library is not reachable by any URL.
- [ ] **Step 2: Implement `books.mjs`; mount in `server.mjs`.**
- [ ] **Step 3: Dockerfile** runtime stage: `RUN apk add --no-cache python3 py3-pip && pip install --no-cache-dir --break-system-packages -r /app/importer/requirements.txt`; `COPY importer ./importer`; `ENV LIBRARY_DIR=/data/library`; `VOLUME ["/data/characters", "/data/custom", "/data/library"]`. Optional OCR: `tesseract-ocr` behind a build arg `OCR=0`.
- [ ] **Step 4: Unraid template**: add `<Config Name="Library" Target="/data/library" Default="/mnt/user/appdata/chummer-anarchy2/library" Mode="rw" Description="Your uploaded PDFs, their converted text, import reports and AI settings (keys). Never served over the web." Type="Path" Display="always" Required="true" Mask="false">…</Config>`.
- [ ] **Step 5: Commit** `server: Books API, PDF upload, import queue, AI settings and review`.

---

### Task 12: UI — Books page, AI settings, review; remove shipped catalogs

**Files:**
- Create: `src/features/book-library/Books.tsx`, `src/features/ai-assist/AiSettings.tsx`, `src/ui/Review.tsx`, `e2e/books.spec.ts`
- Modify: `src/core/app/App.tsx` (routes `#/books`, `#/books/:id/review`), `src/ui/Library.tsx` (Books link; empty-catalog hint; samples from imports), `src/core/ui-kit/app.css`
- Delete: `public/data/{amps,spells,complexforms,gear,rules}.xml`, the DHSA `<spec>`s in `public/data/skills.xml`, `public/samples/`, `tools/build-samples.mjs`, `tools/daegann-pregens.mjs`, `tests/fixtures/pregens-printed.json`
- Modify: `docs/book-discrepancies.md` (keep only the rules notes that aren't book data; the per-book tables now live in import reports), `docs/data-format.md`, `README.md`, `docs/deploy-tower04.md`, `DATA_FILES` in `src/engine/load.ts`

**Interfaces:**
- Books page: upload (drop zone + file input, progress from `status.xml` polling every 2 s), supported books from shipped `sources.xml` (imported / not yet), imported books table (source label, recipe, date, counts, report link, Re-import, Remove with "also delete the PDF and text" checkbox), a "Needs AI" state with a button "Extract with AI" that first shows "This sends the book’s text to {provider}. Continue?".
- AI settings: one block per provider, enabled toggle, base URL/model/workspace fields, key field that shows "Key saved" when set and never shows the key; "Save settings" and "Save key" are separate actions (separate files).
- Review: table of proposals (name, kind, rating, notes), Accept / Edit (opens the Amp Builder or an item form prefilled) / Drop; source id, name, canon choice; "Add accepted entries".

- [ ] **Step 1: e2e first** (`books.spec.ts`), using the e2e server with a stub Python that "imports" the fixture: upload a small PDF → row appears as "Imported"; its amps appear in the amp picker; Remove → gone. AI flow with a stub provider: needs-ai → confirm → review shows proposals → accept one → it appears in the picker with the chosen source.
- [ ] **Step 2: Implement the three screens.**
- [ ] **Step 3: Remove the shipped catalogs** and the files listed above; run `npm run check` and `npm run e2e`. Expected: engine and e2e pass on fixtures; book tests skip in CI with the reason, and pass locally against `BOOKS_DIR`.
- [ ] **Step 4: Commit** `ui: Books page, AI settings and review; ship the rules engine only`.

---

### Task 13: Deploy to tower04 and re-import

- [ ] **Step 1:** Update `docs/deploy-tower04.md` and `/mnt/user/temp/ca2-rebuild.sh` (no more `ca2-texts` copy; create `library/`). Redeploy (git archive → `//tower04/temp`, run the script in the web terminal, Edit → Apply after adding the Library path to the template).
- [ ] **Step 2:** On the Books page, upload the owner's PDFs from `Downloads\Shadowrun Anachy 2.0`: the quick references, DHSA v3.4b, the pregen booklet, the Conversion Guide, and the core rulebook. Check each report; compare counts with today's catalog (amps 554, spells 77, complex forms 31, gear 41, rules 116, samples 28).
- [ ] **Step 3:** Open three existing runners (one CRB pregen, one Daegann pregen, one of the owner's own) and confirm their amps resolve to scoped ids and still price the same.
- [ ] **Step 4:** Report results to the owner; list anything the recipes missed.

---

## Self-review

- Spec coverage: decisions table → Global Constraints; §2 what ships → Task 12; §3 architecture/storage → Tasks 3, 11; §4 sources and duplicates → Tasks 4–6; §5 converter → Task 2; §6 recipes → Tasks 3, 7–9; §7 AI → Task 10–12; §8 UI → Task 12; §9 tests → Task 1 and each task; §10 deployment → Task 13; §11 later → docs/TODO.md (no task, by design).
- Types used across tasks: `Result`, `identify`, `run`, `Source.origin/file/sha256/imported`, `dupeGroups`, `dupeLabel`, `rescope`, `createServer({ … libraryDir, python })` are each defined once in the task that produces them.
- Known risk: the core-rulebook recipe (Task 9) depends on the rulebook's layout; Step 1 is a survey with the owner's sign-off before extraction, and parity oracles are captured privately before Task 12 deletes today's catalogs.

# importer (Python)

Reads the owner's book PDFs into the catalog. The server starts it as `python -m importer <args>` (argument arrays, no
shell: `server/jobs.mjs:41`); nothing in `src/` imports it. Shadowrun 6 has its own stage tree in `importer/sr6/`
(see `importer/sr6/CLAUDE.md`); this folder is the shared part and Anarchy.

- **Owns:** `importer/*.py` (`convert.py` PDF to Markdown with `pdf/`; `library.py`; `statblock.py`; `reflow.py`;
  `xmlio.py`; `datapack.py`; `backup.py`; `edits.py`; `ask.py`; `ai/`; Anarchy's `recipes/*.md`; `effects.py`; `recipes/amps.py`, the amp/effect engine the Anarchy recipes share), and
  `importer/tests/` (Python `unittest`).
- **Public interface:** the command line (`python -m importer ...`, usage in `importer/__main__.py`'s docstring); the
  Python names `importer.DATA_DIR`, `find_core_file`, `use_custom`, `xmlio` that the `sr6/` stage tree and
  `tools/cl6effects/rebuild.py:27` import by module name. Keep those import names when a file becomes a package.
- **Depends on:** only the shared kernel (`core/shared`'s contract: the XML shapes, `public/data` schemas). It never
  imports the TypeScript side; the TypeScript side reaches it over the command line only.
- **Style:** Black (120 columns) and pylint, configured in `pyproject.toml`; CI runs both (`pip install -r importer/requirements-lint.txt`, then `black --check importer tools` and `pylint importer tools`).
- **Test:** `npm run test:py` (= `python -m unittest discover -s importer/tests -t .`, what CI runs). One file:
  `python -m unittest importer.tests.test_ask`.
- **CommLink6 gates:** a change to the Shadowrun 6 reader, overrides or pipeline runs the gates in `docs/cl6check.md`
  (see `importer/sr6/CLAUDE.md`); Anarchy-only changes do not.
- **Do not touch:** `public/data/**` (served by URL, read by the importer, never moved); book text or Commlink6 data
  (the repo holds none, tests use invented data); `importer/sr6/` when your change is Anarchy's, and the reverse.
- **Look-alikes:** `importer/effects.py` (Anarchy) vs `importer/sr6/effects.py` (SR6); `importer/recipes/` vs
  `importer/sr6/recipes/`; `recipes/amps.py` (Anarchy's shared engine, never DHSA content) vs `recipes/dhsa.py` (the DHSA recipe only); `importer/library.py` vs `importer/sr6/catalog.py`.
- **Docs:** `docs/data-format.md` (Anarchy), `docs/sr6-data-format.md` (SR6), `docs/superpowers/specs/2026-09-27-pdf-importer-design.md` (history).

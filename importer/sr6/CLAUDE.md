# importer/sr6 (Python): Shadowrun 6 book import, owner rulings, CommLink6 gates

Turns an SR6 book PDF into catalog entries under `custom/sr6`. Stages, in order: convert (`../convert.py`) -> layout
-> regroup (`regroup.py`) -> extract (`recipes/`, `classes/`, `shapes.py`, `tables.py`) -> effects (`effects.py`) ->
resolve (`resolve.py`) -> links; `run.py` runs them, `__main__.py` is the CLI (`python -m importer sr6 ...`, usage in
its docstring). The owner's rulings and book corrections live in `overrides/*.json` and `overrides/*.book.json` (about
270k tokens of JSON: search them, do not read them whole).

- **Owns:** `importer/sr6/**`, `importer/tests/` (the SR6 and CL6 tests), `tools/cl6check/` and `tools/cl6effects/`
  (see `tools/cl6check/CLAUDE.md`).
- **Public interface:** the CLI; `importer.sr6.classes`, `.effects`, `.overrides` (imported by name by
  `tools/cl6effects/rebuild.py:27` from older base trees: keep the names). A stage reaches another through its public
  helpers, not a leading-underscore one.
- **Depends on:** only the shared importer part (`importer/xmlio.py`, `importer/convert.py`) and `public/data` schemas.
- **Test:** `npm run test:py`; one file `python -m unittest importer.tests.test_cl6effects`.
- **CommLink6 gates (`docs/cl6check.md`)**, required for any change to the reader, overrides, `run.py`, `resolve.py` or
  `effects.py`:
  1. Replay, main vs branch: `python -m tools.cl6effects --tree . [--base <origin/main archive>] --runs <main checkout's .extract/cl6check-runs26>`
     must read `parity: 1079/1079` on both, 0 differing rows, 0 unmatched drops.
  2. Fresh production import: `python -m tools.cl6check import --library <books file> .extract/cl6check-runsNN`, then
     `python -m tools.cl6effects --fresh <runs>` (1,079/1,079) and `python -m tools.cl6check --ours <runs> --out <report>`
     (completeness 4,474/4,474, accuracy 4,307/4,307).
  Both need the owner's PDFs and the Commlink6 jar; with no jar they print "skipped" and exit 0.
- **Do not touch:** `importer/*.py` Anarchy files; the Commlink6 jar's data (never committed); `overrides/*.json` by hand
  without a reason in the row (an owner ruling decides it, see `docs/cl6check.md`); `public/data/**`.
- **Look-alikes:** `importer/effects.py` (Anarchy), `importer/recipes/` (Anarchy), `importer/library.py`.
- **Docs:** [docs/sr6-data-format.md](../../docs/sr6-data-format.md) (index of the per-section files),
  [docs/cl6check.md](../../docs/cl6check.md), `importer/sr6/recipes/crb.md`.

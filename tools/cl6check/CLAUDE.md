# tools/cl6check and tools/cl6effects (Python): CommLink6 comparison and replay gates

Measure the SR6 import against Commlink6, the system of record (accuracy target 99%+). `cl6check` reports
**completeness** (how many Commlink6 records we have) and **accuracy** (how many matched records agree field by field);
`cl6effects` counts how many of Commlink6's 1,079 modifications our entries carry as effects. The repo holds no
Commlink6 data, no book text and no reports; both tools read the owner's jar and say "skipped" (exit 0) without one.

- **Owns:** `tools/cl6check/` (comparison, arbitration, `class_accept.json`, `value_keep.json`, `relocated.json`),
  `tools/cl6effects/` (replay; `bookruled.json`, `cl6placeholder.json`), tests `importer/tests/test_cl6*.py`.
- **Public interface:** `python -m tools.cl6check [import|--ours ...]`, `npm run cl6check -- ...`,
  `python -m tools.cl6effects --tree . [--base ...] [--runs ...] [--fresh ...]`. `tools/cl6effects/rebuild.py` imports
  `importer.sr6.classes/.effects/.overrides` by name (also from older trees).
- **Depends on:** `importer/sr6` (read only). Nothing imports these tools.
- **Test:** `python -m unittest importer.tests.test_cl6check importer.tests.test_cl6effects` (invented data, no jar);
  the full suite is `npm run test:py`.
- **Gates (full commands in `docs/cl6check.md`):** replay main vs branch must read 1,079/1,079 with 0 differing rows;
  a fresh production import must read effects 1,079/1,079, completeness 4,474/4,474, accuracy 4,307/4,307. If a change
  moves a number on purpose, update the two JSON files in `tools/cl6effects/` in the same change.
- **Do not touch:** the thresholds or the JSON rulings without an owner ruling; do not add Commlink6 data to the repo.
- **Docs:** [docs/cl6check.md](../../docs/cl6check.md), [docs/sr6-cl6-optional-package.md](../../docs/sr6-cl6-optional-package.md).

# Nova Prime Chummer: Shadowrun 6 data format

The Shadowrun 6 (SR6) catalog is XML, like Anarchy's (`docs/data-format.md`), but in its own namespace, folders and
schemas: neither game reads the other's files. The app ships only `public/data/sr6/sources.xml` (the books an SR6
recipe supports), the standard creation numbers in `public/data/sr6/creation-defaults.xml` (numbers only, no book text)
and the schemas in `public/data/sr6/schema/`. Everything else comes from the PDFs the admin uploads on
the SR6 Books page. `npm run validate:data` checks the shipped file and the made-up test catalog
(`tests/fixtures/sr6/custom`), and `node tools/validate-data.mjs --sr6=<dir>` checks any SR6 custom folder.

## Sections

- [Common rules](sr6-data-format/common-rules.md)
- [Kinds](sr6-data-format/kinds.md)
- [Formulas and issues](sr6-data-format/formulas-and-issues.md)
- [Categories](sr6-data-format/categories.md)
- [Override files](sr6-data-format/override-files.md)
- [Per-book name tables (`importer/sr6/overrides/<recipe id>.json`)](sr6-data-format/per-book-name-tables.md)
- [Commlink6's classification (`class`)](sr6-data-format/classification.md)
- [Commlink6's values in the per-book tables (`"gen": "value"` and `"gen": "family"`)](sr6-data-format/values-in-per-book-tables.md)
- [Item structure (Commlink6's data, kept and not applied)](sr6-data-format/item-structure.md)
- [Structure ops in the per-book tables, and the extra classes](sr6-data-format/structure-ops.md)
- [Layout and load order](sr6-data-format/layout-and-load-order.md)
- [Creation rules](sr6-data-format/creation-rules.md)
- [Compendiums (`characters/sr6/.compendiums/<owner>/`)](sr6-data-format/compendiums.md)

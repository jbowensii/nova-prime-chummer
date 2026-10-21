# Layout and load order (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

```
library/sr6/<book-id>/   original.pdf, upload.xml, status.xml, import.xml, book.md, regrouped.md
custom/sr6/
  imported/index.xml               the overlay files, in load order
  imported/sources.xml             the imported books (file, checksum, date)
  imported/crb/<kind>.xml          one file per kind, ids scoped crb.<slug>
  texts/crb.xml                    private descriptions (never committed)
  edits/edits.xml, edits/texts.xml the catalog edits and their descriptions
  creation.xml                     the admin's changes to the standard creation rules (Table setup page; creation.xsd)
```

The app loads `data/sr6/sources.xml`, then `custom/sr6/imported/sources.xml` (merged by source id), then the files in
`custom/sr6/imported/index.xml` (the same id replaces, `<remove>` deletes), then the texts file each source names, then
`custom/sr6/edits/edits.xml` and `edits/texts.xml`, then the compendiums the account can read (see Compendiums below).

**Scoping.** Every imported id is scoped by its source (`crb.zap-gun`), as the Anarchy books are, so two books never
clash. Attribute `abbr` and skill `attr` values are never scoped.

**Sample overrides (importer).** `importer/sr6/overrides/samples/<recipe id>.json` holds the owner's rulings on what a book
sample prints that the importer can't read right (a misprinted name, a line the book priced another way), applied in
`archetypes.build` before the stat block is read. A row is `{"sample": "<name>", "note": "<why>", "edits": [{"field":
"<label>", "from": "<printed text>", "to": "<replacement>"} | {"field": "<label>", "add": "<text appended to the line>"}]}`;
its `note` goes in the runner's notes. An edit whose printed text isn't there (a reprint) is reported on stderr, the row's
note left out. `<samplefix>` (below) still corrects a `rating`, `qty` or `grade` in the app.

**Edits.** An edit is a full entry of its kind with `by`. It replaces the loaded entry with the same id and survives
re-imports. Its description, if any, is in `edits/texts.xml`. An empty one means the book's text.

**Sample corrections.** The edits layer also holds `<samplefix id="<sample id>" source page>` entries (kind
`samplefixes`, `samplefixes.xsd`): a book sample runner's printed line corrected, the owner's way to set right a value the
book misprints without touching the importer. Each `<correct item field from to note?>` sets `rating`, `qty` or `grade`
of the runner's line buying catalog item `item`, while that line still prints `from`. The runner file keeps the book's
value; the app reads the corrected one everywhere (editor, Your runners, the export: `src/sr6/runner-builder/domain/creation/samplefix.ts`) and
Review notes "Earbuds: the book prints rating 4; corrected to 3 by an override" in place of the error. `source` and `page`
must be the sample's printed ones. Export my edits and Import edits carry them like any edit.

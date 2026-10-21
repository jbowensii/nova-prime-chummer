# Override files (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Game data's **Export my edits…** (editors and the admin) saves the edits layer, every edit or one book's, as an edits
file in its own format (`edits.xsd`), each edit's own description in its `<text>`. **Import edits…** reads such a file
and previews it: new entries, changes to a book's entry (the fields that change), and conflicts with an edit already
here, each with Keep mine or Take theirs. Save edits sends the chosen entries one by one as edits made in the app
(`PUT /api/sr6/edits/<kind>/<id>`); a refused one is listed with why. The file's issues are left out.

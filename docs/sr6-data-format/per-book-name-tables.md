# Per-book name tables (`importer/sr6/overrides/<recipe id>.json`) (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

A last resort for the few names Commlink6 gives an item that no rule derives (`Hermeticsm` for the Street Wyrd tradition
`Classical Hermeticism`). Each recipe has its own table, empty when its file is absent; the importer applies it after the
book is read (`importer/sr6/overrides.py`, called from `run._read`), so an older printing's catalog gets it too. A row is
`{"cl6": "<Commlink6's name>", "kind": "<catalog file>", "ours": ["<our printed name>", ...], "set": {"<attribute>":
"<value>"}}`: the Commlink6 name becomes an `<alias>` (a name only) of each entry named in `ours`, and `set`, optional,
sets an attribute to a value taken from Commlink6. A description is never an override: descriptions come from the book's
own text, and a table that sets one is refused. A name in `ours` that no entry carries is reported on stderr, not
guessed. A row with `"add": {"page", "attrs", "kids", "name"?}` instead of `ours` creates an entry the book prints only inside other items' text (id `slug(name)`, source the recipe's, rule data from Commlink6 hard-coded in `attrs`/`kids`; an id already there is left as is; never a description: the texts step fills it only if the book has a text for it). Generic cases (a heading naming the brand or category, roman numerals, `hold-out`, `SMG`) are the importer's
and cl6check's rules, not rows here.

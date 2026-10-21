# Commlink6's values in the per-book tables (`"gen": "value"` and `"gen": "family"`) (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Owner decision 2026-10-13: where a printed value of ours is not confirmed (the PDF page prints Commlink6's value, neither
value, a formula or several values, or the three gossipcat reviewers did not all answer KEEP_OURS, 100% certain), the
value is Commlink6's. `python -m tools.cl6check.valuemap <cl6-diffs.csv> [<diffs of a run on the result>]` writes one row
per entry, `{"cl6", "kind", "id", "set": {"cost": "500", "avail": "3(L)"}, "formula": {"cost": "tier(R; 1: ..)"}?,
"gen": "value"}`, from the counted field differences; `tools/cl6check/value_keep.json` lists what stays ours (`keep`:
unanimous) and what is left to the owner (`hold`: a per-rating item, a variant's value, two Commlink6 records that
disagree about one entry). A per-rating Commlink6 value is `Rating x N` when it is linear, else the value at rating 1 with a
`tier()` formula; a level's own entry (`wired-reflexes-2`) takes the value at its level. The entry's own `<formula>`,
`<issue>` and `<found>` for a field set go. Commlink6's enum keys become the books' words (`AUTO` -> `Auto`, `MANA` ->
`M`). `python -m tools.cl6check.familymap` writes `"gen": "family"` rows for the structured data the schema models: a
weapon's `skill` and `spec`, an armor's `social`. Slots, variants, relevance, flags, modonly, size and ammunition class
are not in the data schema, and a Commlink6 modification has no one-to-one `<effect>`; they are not written.

### Errata rows (`"gen": "errata"`)

Owner decision 2026-10-15: a book's official errata wins over the printing, and over Commlink6. The corpus pass applies an
errata PDF only to a library that holds both PDFs, so the importer's per-book runs (and cl6check) cannot see it; where the
owner wants its numbers the per-book table carries them as hand-written rows that no generator replaces: `{"cl6": "<label>",
"kind", "id", "set": {...}, "formula"?, "effects"?, "gen": "errata"}`. Game numbers only, never description text. `set` takes a
`null` to drop an attribute (a rating the errata removes); `effects` is a list of `<effect>` attribute dicts, each replacing
the entry's effect of the same `target` (the Trenchcoat's Concealability +2); `kids` adds children the entry lacks, among them a
`<status name level?>` the item applies (the Molotov's Burning 4, CRB p. 51's statuses: shown on the item's line and card,
never applied to the runner). The rows apply after every other id row, so they win
over `value` rows. A removal and a rename are the ordinary `remove` / `rename` rows (`"alias": false` for a renumbering). The
corpus pass skips a renumbering the table already made (resolve.py `_renumber`). `nf.json` holds the No Future errata (6E
availabilities, Cybereyes/Cyberears as ratings 6 and 7 with ids kept, Vocal Expansion and AutoVoice unrated, the hacked
AutoVoice and the vision/audio enhancement rows removed).

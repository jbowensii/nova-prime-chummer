# Formulas and issues (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Book values are canon: the printed attribute is never rewritten from anything but print. Where the importer can say
how a value is worked out, or that the book leaves it out, the entry carries it as a child; where the entry's own row
leaves a value out and the books print it elsewhere, the importer writes that printed value and says where it found it
(`<found>`, below). The app reads both; an edit (Game data's Edit, or an
override file) is how a table sets what the book leaves out.

```xml
<gear id="crb.flare-kit" source="CRB" page="270" rating="1–6" avail="2" cost="Rating × 200">
  <name>Flare Kit</name><formula field="cost">R * 200</formula><text/></gear>
<gear id="crb.null-box" source="CRB" page="271" cost="150">
  <name>Null Box</name><issue field="avail" code="missing" page="91">no availability printed</issue><text/></gear>
```

**`<formula field round? unit? qty?>EXPR</formula>`.** `field` is the attribute it works out (`cost`, `avail`, `rating`,
`ammo`, `essence`…). The builder prices a bought item with it, at the item's rating, quantity and options, in the
budgets, the ledger and the exports (which show the plain number); without one the printed value is read as above.
EXPR is read by the app's own small parser (`src/core/shared/formula.ts`, never `eval`):

- numbers, `+ - * /` (`×` too), parentheses, a leading minus;
- `R` the rating, `Q` the quantity, `M` the runner's Magic, `B` this field's printed value, `H` the same field of the
  item it goes on (a material add-on's `H*2`: its ammunition then costs twice as much, so the add-on adds the host's
  price once more, as an `x2` cost does), `opt.<id>` an option;
- `tier(R; 1-3: a; 4-6: b; 7+: c)`: the value of the band the first argument falls in (a single number is a band);
- `ref(kind:id, field[, R])`: another entry's value (its formula, else its printed value), at this rating or the one
  given, e.g. `ref(gear:crb.flare-kit, cost, 2) + 50`;
- `ceil(x)`, `floor(x)`, `min(a, b, …)`, `max(a, b, …)`.

The result rounds up to a whole number (`round="down"` rounds down; Essence keeps two decimals). `unit` and `qty` say
the price is for `qty` `unit`s (`unit="rounds" qty="10"`). A formula that uses `Q` works out the whole line, so the
line's quantity isn't multiplied in again. A variable the app isn't given (an unrated item's `R`, say) counts as 1, and
Review notes it. A formula that can't be read, or a `ref` to an entry or value that isn't there, leaves the item
**unpriced** (never 0): the entry gets an issue (code `unreadable`) and the builder shows "unpriced".

Game data and the pickers show a formula with its values over the entry's ratings (`Rating × 200¥ (200–1,200¥)`); a
bought item shows its value, with the formula on hover.

**`<issue field code page?>note</issue>`.** `code` is `missing` (the book prints nothing), `unreadable` or
`ambiguous`; `page` is where the book has the entry; the text is a short note. The app shows a warning badge (the field,
the note, the page) in Game data and the pickers, and Game data's **Needs attention** filter lists only these entries.
A runner that uses one gets a cited Review note ("Null Box: the book prints no availability, set it in Game data or an
override file."), never an error. An edit (or an override file) that sets the field clears its issue; the edit dialog
still shows what the book has ("book: none printed").

**`<found field how source? page?>replaced</found>`** (from `importer/sr6/resolve.py`): the field's value was printed
somewhere other than the entry's own row. `how` is `table` (another table of the same book whose row names the item and
has the column: a summary table, a gear list in another chapter, the implant table that prices an implant weapon),
`text` (a sentence of the same book printing the value with its word: `ratings 1 to 6`, `Availability 4`, the item's
own description first, then the text of the heading it is printed under: `All skillsofts are available in ratings from 1 to 6` over
`Activesofts`), `corpus` (another source of the library: the same kind and name in another book, a card
deck's stat line, the class row a type names: `Cyberprogram, hacking`, `Autosoft`; the latest published wins, and
sources of one date that disagree leave the issue), `errata` (an errata PDF's statement on its own book, applied
when the errata is newer than the printing; the text keeps the value it replaced. A book's Current Printing
(`recipes.crb.CURRENT`) already incorporates its errata, so an erratum never replaces a value it prints: it fills only a
field the printing leaves open, whatever the dates, and renumbers or unrates nothing), or `printing` (an older printing of
the same book, `importer/sr6/run.py` `older_printings`: field by field the latest printing wins, which for the core rulebook is its Current Printing (2019) before the Seattle, Berlin and Hong Kong City Editions (`recipes.crb.CURRENT`; another book ranks by publication month), and a field it leaves
out or prints as no SR6 value takes the newest older printing's valid value; the text names that printing). `source` and `page` say where it is
printed. Beyond fields, an older printing fills entries (`older_extras`, listed in import.xml as `printing-extra` rows):
an item only an older printing prints (the Hong Kong City Edition's Shotgun ammunition, Armor cyberlimb accessory and Sim module
w/ Hot sim, rows the Current Printing leaves out) is added with its text; not rules or table categories, not an item the
loaded printing prints under another name (`Uzi V` for `Uzi IV`: an entry only it has, on the same page of the same file,
with the same printed values), not one it has under another id. An item the loaded printing files under another id than
an older printing (an id carries its category when another category of the file has the name: the focus `Ritual Spellcasting`
is `foci.ritual-spellcasting` beside the Formula row, `ritual-spellcasting` without it) takes the older printing's id
(`same_ids`), so a saved runner and the override rows keep naming it. It is provenance for the owner: the app leaves it out of the entry. The corpus pass runs after every import
(an errata or card deck uploaded later counts too); a book removed leaves the values it gave other books until those
are imported again.

# Character file format

A runner is one XML file. That's what the server stores in
`characters/<username>/`, one folder per account (on Unraid: `/mnt/user/appdata/chummer-anarchy2/characters`), and
what **Export** downloads. The schema is `public/data/schema/character.xsd`
(namespace `urn:chummer-anarchy2:character:1`). The Foundry VTT export (`docs/export-format.md`)
is built from this data; the format itself is ours and stays stable.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" rev="4" id="…"
    streetName="Slick" name="Jan Novak" gender="…" metatype="dwarf" level="runner" package="free"
    lifestyle="low" backdrop="grid" finalizedAt="…" finalRemaining="0" updatedAt="…">
  <portrait>data:image/jpeg;base64,…</portrait>
  <background>…</background>
  <notes>…</notes>
  <keyword>Dwarf</keyword> …            (5)
  <disposition>Lucky</disposition> …    (4)
  <cue>…</cue> …                        (4)
  <build mainArmor="it-coat" altArmor="it-clothes">
    <attributes str="2" agi="3" wil="2" log="3" cha="4"/>
    <skill id="influence" rating="5"><spec>influence.bluff</spec></skill>
    <knowledge kind="language" native="true">Japanese</knowledge>
    <knowledge kind="knowledge" from="skill:influence">Corporate gossip</knowledge>
    <amp uid="amp-3" type="adept" name="Silver tongue" catalogId="…" linkedItem="…" vehicle="…">
      <narrative>…</narrative>
      <effect ref="rr-spec" param="influence.impersonation"/>
      <effect ref="edge-advantage" param="influence" switch="conditional" when="when flashing the badge"/>
      <snapshot><amp id="…" type="adept" …>…</amp></snapshot>
      <chassis><vehicle id="street.scooter" …>…</vehicle></chassis>   (a compendium vehicle only)
    </amp>
    <item uid="it-coat" kind="armor" name="Lined coat" catalogId="light-armor" armor="3">
      <effect ref="social-armor" value="1"/>                         (the player's own: they replace the catalog item's)
      <snapshot><item id="light-armor" kind="armor" …>…</item></snapshot>
    </item>
    <item uid="start-fake-sin" kind="gear" name="Fake SIN" starting="fake-sin" note="…"/>
    <knowledgeOrder key="skill:influence"/>
    <knowledgeHidden key="knowledge:Old flames"/>
  </build>
  <career>
    <event id="…" at="…" type="finalize" remaining="0"/>
    <event id="…" at="…" type="earn" amount="50000" run="…" date="2086-03-01"/>
    <event … type="change" cost="-2500"><change key="item:it-knife" label="Knife" from=""/></event>
    <event … type="change" cost="6000"><change key="skill:stealth" label="Stealth" from="5" to="6"/></event>
    <event … type="advance" path="skills.stealth" from="5" to="6" cost="6000"/>  (before 0.5.5)
    <event … type="amp-modify" ampUid="…" cost="12000"><before><amp …/></before><after><amp …/></after></event>
    <event … type="knowledge-add" name="Corporate gossip" kind="knowledge" slot="skill:influence" cost="0"/>
    <event … type="void" eventId="…" reason="misclick"/>
  </career>
  <override code="attr.maxCount" path="attributes">GM: street legend campaign</override>
</ca2:character>
```

- **The summary lives on the root element** (names, metatype, level, `rev`),
  so a tool can list runners without parsing the whole file. `gender` is optional, as the player writes it.
- **`rev`** is the server's revision counter. A save sends the revision it
  started from (the `If-Match` header). The server refuses a stale save with
  409, and the app then offers overwrite, save as a new file, or reload.
  Exports carry no `rev`.
- **`<snapshot>`** holds a copy of the catalog entry in the data files' own
  format (`amps.xsd` / `items.xsd`). That way a runner still loads and
  prints if the entry is later removed from the data. On a book sample's own amp (no `catalogId`, 0.5.6) it is the
  amp as printed: its type, name, `printedRating`, `source` and `page`. Where the rules rate the amp otherwise, Review
  notes it ("the book prints rating 9; the rules give 11"); the file keeps the book's number.
- **`<effect>`** on an amp is a pick (an Amp effect, or a narrative effect kind at rating 0: data-format.md); on an item,
  the player's or GM's own effects, which replace the catalog item's. Either may say how it is turned on and whether it
  counts: `switch` and `when` (counted in the bracketed total), `confidence="low"` (shown, not counted), `from` and
  `affects` (data-format.md, How an effect is turned on). The Amp Builder and the Gear tab set them ("Counts").
- **`<chassis>`** (a vehicle amp whose chassis is a GM compendium's): a copy of that `<vehicle>` (`vehicles.xsd`), so
  the vehicle keeps its stats when the compendium is unshared or deleted. A snapshot or chassis whose source the catalog
  no longer has (or a compendium's entry that is gone) stands in for it, and Review notes "its source … is no longer
  available; the runner keeps its own copy".
- **`<knowledge>`** is a knowledge skill or language (`kind="knowledge"` or `kind="language"`). Each keyword and each
  skill at rating 4+ is a free entry and needs no element; one is written only when the player renames it or changes
  its kind, with `from` naming the slot: `skill:<id>` (any name related to the skill) or `keyword:<the keyword>` (the
  entry keeps the keyword's name). Every other entry costs the pricing file's `knowledge` price, and so does a
  `from="skill:…"` entry while that skill is below 4, or a `from="keyword:…"` entry once that keyword is gone
  (Review flags both). Before 0.5.2 an entry was plain text and a
  language was written `Language: X`: such a file loads with those as paid knowledge, and `Language: X` as the
  language X.
- **`native="true"`** marks the runner's native language: the first language entry with it is free (one per runner;
  the app's reading of the rules, as knowledge skills cover foreign languages). A second one costs the knowledge price
  and Review notes it. Files before 0.5.3 have none.
- **`<knowledgeOrder>`** and **`<knowledgeHidden>`** hold row keys: a free entry's slot (`from`), else
  the entry's `id` (paid entries get one when added; older ones on load). The order lists rows top to bottom (either list; rows not in it follow A–Z); a hidden row is left off
  the printed sheet but still counts. Neither changes a price.
- **`starting`** on an item marks free gear no one buys: `commlink` and `fake-sin` (every runner, CRB p.85) and
  `real-sin`. It costs nothing and can't be removed or sold; `note` is the player's description. Reading any file adds
  a missing commlink or fake SIN (uids `start-commlink`, `start-fake-sin`). On a draft, an unpriced gear entry named
  exactly `Commlink`, `Commlink (with trodes)`, `Commlink with trodes` or `Fake SIN` (any case or spacing) becomes it
  instead, so there's never a second one; a finalized runner's items are never changed by reading it.
- **`over`** on an armor item: an add-on worn over the armor item with that uid (a mask, a helmet, a rigger
  cocoon). Its `armor` is the points it adds, and all it costs; worn as main or alternate armor it counts on top of
  that item's armor. Review notes it (armor doesn't stack, CRB p.148). The importer no longer writes it (0.5.6).
- **Book samples are the book as printed** (0.5.6, the owner's rule): an imported sample holds no `<override>`, no
  `note="book drawback"`, no `starting` or `over` marker. What its book prints against the rules shows on Review like
  on any runner, unapproved. A `note="book drawback"` on a runner's own amp no longer approves anything (0.5.4 files
  had them): only a catalog amp's own printed drawback, unchanged, needs no GM.
- **`realSin="true"`** on an amp: added by the "Has a real SIN" box (before 0.5.7; since then a player adds the SINner
  quality by hand and the free Real SIN entry follows it) with the catalog's SINner quality (named exactly
  "SINner", any case). House rule (0.5.5): every SINner quality, from the box or added by hand, is free and never
  takes the first-Quality slot; files from before simply price that way when read. A SINner is a Quality that is the
  catalog's SINner entry with that entry's effects, or a hand-built Quality named SINner with no effects at all:
  another amp renamed SINner, or a SINner given any other effect (a narrative one too), is priced like any amp and counts for the first-Quality rule. The box works before and after
  Finalize (after, the change is logged). The box is on when an item has `starting="real-sin"` or the runner has a SINner quality (that catalog entry,
  or an amp or snapshot of that name); reading a file with such a quality adds the missing `real-sin` item. Unticking
  removes the item and every SINner quality (the app asks first about one the player added).
- **`knowledge-add`** events: without `slot`, a new paid entry; with `slot` and `cost="0"`, a rename or kind change of
  that free slot; with `slot` and a cost, that slot's entry becomes a paid one (after its skill dropped below 4 or its keyword was removed).
- **The ledger (0.5.5).** Finalize writes `finalizedAt`, `finalRemaining` (what creation left) and a `finalize`
  event with the same `remaining`. Nothing is locked afterwards: `<build>` is always the runner as it stands, and
  every change to it appends a `change` event (the app writes these itself). Each `<change>` names one thing by `key`
  (`attr:agi`, `skill:stealth`, `spec:<skill>:<spec>`, `knowledge:<row key>`, `amp:<uid>`, `item:<uid>`); no `from`
  means added, no `to` means removed. `cost` is what the change charged: today's price for anything added or
  raised; for anything removed, minus what was paid for it, and for a lowering, minus that share. What was paid is
  kept as `<price key="…" value="…"/>` children: every thing's price on the `finalize` event, the things a `change`
  touched on it (keys as in `<change>`, `skill:<id>` for the points). Consecutive changes to one thing within ten minutes share one
  event. The balance is the ledger's running total: the last `finalize` event's `remaining`, + each non-voided `earn`,
  − each later recorded `cost`. Prices are the ones recorded, so a later catalog or price change never moves it.
- **`carry`** (a reopened runner only): reopening creation (only while no earnings are recorded) drops `finalizedAt`
  and `finalRemaining`, adds a note (the log stays) and keeps as `carry` whatever the balance held beyond budget −
  build price (an old sale that wasn't refunded, a price changed since). It counts in what's left to spend, and the
  next Finalize uses it up, so reopening never makes or loses nuyen.
- **Runners finalized before 0.5.5** have no `finalize` event: their `<build>` was the creation baseline and the
  `advance`, `buy`, `sell`, `amp-add`, `amp-modify`, `spec-add` and `knowledge-add` events applied on top. Opened in
  0.5.5, those events are folded into `<build>` once and kept as history after a `finalize` event (id `finalized`,
  `remaining` = `finalRemaining`); their recorded costs keep the balance exactly where the old ledger had it.
- **Career events** are never edited. A wrong `earn` is undone with a `void`
  event, so the history stays complete.
- **`allowNonCanon="false"`** on the root (before 0.5.7; read and kept, no longer used: the GM's table setting on the
  Rules page decides since 0.5.7) marked a runner as canon only: the
  Review tab flags each non-canon amp, item or specialization. Missing means
  non-canon content is allowed.
- **`<optionalRule id="…" on="true|false"/>`** (after the `<override>`s, any number): the runner's own switch for a
  book's optional rule, by its rules id (the core rulebook's import seeds them into Table rules: `optional-vehicle-damage-for-all`,
  CRB p.68; `optional-extended-social-tests`, p.139; …). It wins over the GM's Table setup; with none, the table's
  switch holds, off unless the GM switched it on. Set on the Review tab.
- **`origin`** on a sample runner names the source it was built from
  (`CRB`, `PREGENS`), so the library can badge non-canon samples.
- **`sampleKey`** on a runner loaded with "Load example characters" names the example character it copies: its name
  slug and whether that version is canon (`test-face|canon`, `test-face|noncanon`). Each account gets copies with ids
  of its own, and loading again skips every key already in that account's library, so a re-import that gives a sample
  a new file or id, or a second book with the same character, adds no copy. Older copies count too: a 0.4.1 key
  (`pregens.test-face`: the source gives the canon-ness), a copy with only an `origin` (its source and name), and a
  first-release built-in runner (id `sample-…`, no `origin`: canon). The load also sets `lastExportedAt` to the
  example's `updatedAt`, which is how the library tells an unchanged copy. When a library holds more than one copy
  under a key, the library offers to move the extra ones to that account's trash: a copy someone changed (saved again,
  or dated after it was loaded) always stays; otherwise the preferred version stays (a book's over an example set's,
  the newest import).
- **`backdrop`** is drawn behind the portrait: `white`, `grey`, `dark`, or a built-in pattern (`grid`, `halftone`,
  `neon`, `rain`). The transparent parts of a PNG or WebP portrait show it; an opaque image covers it. Missing (every
  file before 0.5.4) or unknown means none: the portrait as it always looked. It shows in the builder, the runner list
  and on the printed sheet, where a dark one (`dark`, `neon`, `rain`) prints as white to save ink.
- **`<npc kind tier fightingSpirit?/>`**, the root's first child when present, makes the file an NPC (absent: a
  runner). `kind`: `npc`, `critter` or `spirit`; `tier`: `prime` (managed like a runner, with Edge) or `regular` (no
  Edge, average hits); `fightingSpirit` (optional): `null`, `low`, `high` or `extreme`. A critter or spirit may have
  `metatype=""` (shown as "Critter" / "Spirit") and attributes outside metatype ranges.
- **`campaign`** names the campaign the runner plays in (`custom/campaigns.xml`, see data-format.md). Only the server
  sets it (`/api/campaigns`); a save keeps the stored value whatever the body says, a new file (a copy, an import, a
  restored copy) gets none, and it counts only while the runner's owner is a GM or member of that campaign.
- **Text** is escaped as XML needs; a carriage return is written `&#13;`, and a tab or line break inside an attribute
  `&#9;` / `&#10;`, so each reads back as typed. Characters XML 1.0 can't hold (control characters other than tab,
  line feed and carriage return; U+FFFE, U+FFFF; half a surrogate pair) are dropped when writing. A blank value is
  written as an empty attribute (`metatype=""` on a draft), not left out.
- Older `.ca2.json` exports still import.

## Server API

| Request | Result |
|---|---|
| `GET /api/health` | `{ ok: true, storage: "server" }` |
| `GET /api/characters` | `[{ file, rev, xml, owner, ownerName }]`: your runners; the admin also gets everyone else's, an editor those in the campaigns they GM (read only) |
| `PUT /api/characters/:id` (body: XML, `If-Match: rev`) | `201`/`200 { rev, file }`, or `409 { rev, file, updatedAt }` |
| `PUT …?force=1` | overwrite regardless of `rev` |
| `PUT …?filename=Name` | file name for a new runner (default: its street name) |
| `DELETE /api/characters/:id` | `204`; the file moves to `characters/<username>/.trash/` |
| `GET /api/trash` | `{ user, name, items: [{ file, id, name, deletedAt }] }`: your trash, newest first |
| `POST /api/trash/:file/restore` | `{ file, id, name, copy }`: back in the library; `copy`: its id was taken, so it came back with a new id and "(restored copy)" |
| `DELETE /api/trash/:file` | `204`; deleted for good |
| `DELETE /api/trash` (body `{ files: [...] }`, optional) | `{ deleted }`: those files (the page sends the ones it showed), or the whole trash; `deleted` is how many went |
| `…/api/trash…?user=<username>` | the admin: another account's trash (anyone else: `403`) |

Every request needs a signed-in session (`server/auth.mjs`). `PUT` and `DELETE` act on your own runners only: a
runner id another account holds is refused with `403`. The trash routes take only a `*.xml` file name with no separators
or leading dot; like every write, they're refused (`409`) while a restore runs.

Writes go to a temporary file and are renamed into place, so a crash never
leaves a half-written runner.

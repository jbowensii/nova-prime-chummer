# Character file format

A runner is one XML file. That's what the server stores in
`characters/<username>/`, one folder per account (on Unraid: `/mnt/user/appdata/chummer-anarchy2/characters`), and
what **Export** downloads. The schema is `public/data/schema/character.xsd`
(namespace `urn:chummer-anarchy2:character:1`). A later Foundry VTT export
will convert from this format; the format itself is ours and stays stable.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" rev="4" id="…"
    streetName="Slick" name="Jan Novak" metatype="dwarf" level="runner" package="free"
    lifestyle="low" finalizedAt="…" finalRemaining="0" updatedAt="…">
  <portrait>data:image/jpeg;base64,…</portrait>
  <background>…</background>
  <notes>…</notes>
  <keyword>Dwarf</keyword> …            (5)
  <disposition>Lucky</disposition> …    (4)
  <cue>…</cue> …                        (4)
  <build mainArmor="it-coat" altArmor="it-clothes">
    <attributes str="2" agi="3" wil="2" log="3" cha="4"/>
    <skill id="influence" rating="5"><spec>influence.bluff</spec></skill>
    <knowledge>Language: Japanese</knowledge>
    <amp uid="amp-3" type="adept" name="Silver tongue" catalogId="…" linkedItem="…" vehicle="…">
      <narrative>…</narrative>
      <effect ref="rr-spec" param="influence.impersonation"/>
      <snapshot><amp id="…" type="adept" …>…</amp></snapshot>
    </amp>
    <item uid="it-coat" kind="armor" name="Lined coat" catalogId="light-armor" armor="3">
      <snapshot><item id="light-armor" kind="armor" …>…</item></snapshot>
    </item>
  </build>
  <career>
    <event id="…" at="…" type="earn" amount="50000" run="…" date="2086-03-01"/>
    <event … type="advance" path="skills.stealth" from="5" to="6" cost="6000"/>
    <event … type="amp-modify" ampUid="…" cost="12000"><before><amp …/></before><after><amp …/></after></event>
    <event … type="void" eventId="…" reason="misclick"/>
  </career>
  <override code="attr.maxCount" path="attributes">GM: street legend campaign</override>
</ca2:character>
```

- **The summary lives on the root element** (names, metatype, level, `rev`),
  so a tool can list runners without parsing the whole file.
- **`rev`** is the server's revision counter. A save sends the revision it
  started from (the `If-Match` header). The server refuses a stale save with
  409, and the app then offers overwrite, save as a new file, or reload.
  Exports carry no `rev`.
- **`<snapshot>`** holds a copy of the catalog entry in the data files' own
  format (`amps.xsd` / `items.xsd`). That way a runner still loads and
  prints if the entry is later removed from the data.
- **Career events** are never edited. A mistake is undone with a `void`
  event, so the history stays complete.
- **`allowNonCanon="false"`** on the root marks a runner as canon only: the
  Review tab flags each non-canon amp, item or specialization. Missing means
  non-canon content is allowed.
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
- Older `.ca2.json` exports still import.

## Server API

| Request | Result |
|---|---|
| `GET /api/health` | `{ ok: true, storage: "server" }` |
| `GET /api/characters` | `[{ file, rev, xml, owner }]`: your runners; an admin or editor also gets everyone else's (read only) |
| `PUT /api/characters/:id` (body: XML, `If-Match: rev`) | `201`/`200 { rev, file }`, or `409 { rev, file, updatedAt }` |
| `PUT …?force=1` | overwrite regardless of `rev` |
| `PUT …?filename=Name` | file name for a new runner (default: its street name) |
| `DELETE /api/characters/:id` | `204`; the file moves to `characters/<username>/.trash/` |

Every request needs a signed-in session (`server/auth.mjs`). `PUT` and `DELETE` act on your own runners only: a
runner id another account holds is refused with `403`.

Writes go to a temporary file and are renamed into place, so a crash never
leaves a half-written runner.

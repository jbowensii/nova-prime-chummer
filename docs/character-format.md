# Character file format

A runner is one XML file. That's what the server stores in
`characters/` (on Unraid: `/mnt/user/appdata/chummer-anarchy2/characters`) and
what **Export** downloads. The schema is `public/data/schema/character.xsd`
(namespace `urn:chummer-anarchy2:character:1`). A later Foundry VTT export
will convert from this format; the format itself is ours and stays stable.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" rev="4" id="…"
    streetName="Hercules" name="Arthur Pitchford" metatype="dwarf" level="runner" package="free"
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
    <amp uid="amp-3" type="adept" name="Vocal Control" catalogId="…" linkedItem="…" vehicle="…">
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
    <event … type="advance" path="skills.stealth" from="5" to="6" cost="5000"/>
    <event … type="amp-modify" ampUid="…" cost="15000"><before><amp …/></before><after><amp …/></after></event>
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
- Older `.ca2.json` exports still import.

## Server API

| Request | Result |
|---|---|
| `GET /api/health` | `{ ok: true, storage: "server" }` |
| `GET /api/characters` | `[{ file, rev, xml }]` |
| `PUT /api/characters/:id` (body: XML, `If-Match: rev`) | `201`/`200 { rev, file }`, or `409 { rev, file, updatedAt }` |
| `PUT …?force=1` | overwrite regardless of `rev` |
| `PUT …?filename=Name` | file name for a new runner (default: its street name) |
| `DELETE /api/characters/:id` | `204`; the file moves to `characters/.trash/` |

Writes go to a temporary file and are renamed into place, so a crash never
leaves a half-written runner.

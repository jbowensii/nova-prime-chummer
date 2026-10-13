// common.xsd's Effect `affects`: caster, target and others validate (others: what others get against the entry, owner
// decision #16); anything else is refused. Made-up entry, no book data.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'

const SCHEMA = 'public/data/sr6/schema/'
const schema = (f: string) => ({ fileName: f, contents: readFileSync(SCHEMA + f, 'utf8') })
const errors = async (affects: string) =>
  (
    await validateXML({
      xml: {
        fileName: 'q.xml',
        contents: `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualities" version="1"><quality id="t.q" source="CRB" page="1" kind="positive" karma="1"><name>Q</name><effect target="derived:defense" op="add" value="1" affects="${affects}"/><text/></quality></sr6:data>`,
      },
      schema: schema('qualities.xsd'),
      preload: [schema('common.xsd')],
    })
  ).errors.map(e => e.message)

test.each(['caster', 'target', 'others'])('affects="%s" validates', async a => {
  expect(await errors(a)).toEqual([])
})
test('an unknown affects value is refused', async () => {
  expect((await errors('everyone')).length).toBeGreaterThan(0)
})

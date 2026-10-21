// Reading an old Anarchy file brings its free starting gear (and a hand-added SINner's Real SIN) through file.ts alone:
// the golden below was taken from the build before the SINner lookups moved out of amps.ts (architecture step 8).
import { expect, test } from 'vitest'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'

test('an old file with no starting gear and a hand-typed SINner reads to the same build as before', () => {
  const ch = blankCharacter()
  ch.build.items = [{ uid: 'pistol', kind: 'gear', name: 'Fake SIN, Commlink' }]
  ch.build.amps = [{ uid: 'mine', type: 'quality', name: ' sinner ', narrative: '', effects: [] }]
  const back = xmlToCharacter(characterToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.build.amps.map(a => [a.uid, a.name])).toEqual([['mine', ' sinner ']])
  expect(back.character.build.items.map(i => [i.uid, i.name, i.starting])).toMatchInlineSnapshot(`
    [
      [
        "start-fake-sin",
        "Fake SIN",
        "fake-sin",
      ],
      [
        "start-commlink",
        "Commlink (with trodes)",
        "commlink",
      ],
      [
        "pistol",
        "Fake SIN, Commlink",
        undefined,
      ],
      [
        "real-sin",
        "Real SIN",
        "real-sin",
      ],
    ]
  `)
})

// The printable Anarchy sheets (the app's own and the official layout) render a whole runner: name, attributes, skills,
// amps with their effects, gear, the Risk table. A made-up sample runner with a few extras added to reach the optional parts.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { xmlToCharacter } from '../../../src/ca2/formats/domain/charxml'
import { derive } from '../../../src/ca2/runner-builder/domain/derive'
import { price } from '../../../src/ca2/runner-builder/domain/price'
import { validate } from '../../../src/ca2/runner-builder/domain/validate'
import { Editor, type EditorCtx } from '../../../src/ca2/runner-builder/ui/editor'
import { Sheet } from '../../../src/ca2/print/ui/Sheet'
import { OfficialSheet } from '../../../src/ca2/print/ui/OfficialSheet'
import type { Character } from '../../../src/ca2/formats/domain/types'
import { cat } from '../../helpers'
import { mount, pageText } from '../../ui/dom'

const r = xmlToCharacter(readFileSync('tests/fixtures/mini/custom/imported/pregens/samples/pregens.test-face.xml', 'utf8'))
if (!r.ok) throw new Error(r.reason)

const ctx = (ch: Character, career = false): EditorCtx => {
  const d = derive(cat, ch)
  return {
    c: cat,
    ch,
    d,
    v: validate(cat, ch),
    p: price(cat, ch),
    balance: 0,
    career,
    edit: () => {},
    update: () => {},
    record: async () => true,
    replace: () => {},
    approve: null,
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
  }
}
const runner = (over: (ch: Character) => void = () => {}) => {
  const ch = structuredClone(r.character)
  over(ch)
  return ch
}
const render = (Sheet_: () => ReturnType<typeof Sheet>, ch: Character, career = false) =>
  mount(createElement(Editor.Provider, { value: ctx(ch, career) }, createElement(Sheet_)))

for (const [label, S] of [
  ['app sheet', Sheet],
  ['official sheet', OfficialSheet],
] as const) {
  test(`the ${label} shows the runner’s name, their amps and the Risk table`, async () => {
    await render(S, runner())
    const t = pageText()
    expect(t).toContain('Test Face')
    expect(t).toContain('Big Grin')
    expect(t).toMatch(/dice/)
  })

  test(`the ${label} shows a real name, gender, portrait, narrative and notes when the runner has them`, async () => {
    await render(
      S,
      runner(ch => {
        ch.identity.name = 'Jane Roe'
        ch.identity.gender = 'female'
        ch.identity.portrait = 'data:image/png;base64,AAAA'
        ch.identity.backdrop = 'dark'
        ch.identity.background = 'Grew up in the stacks.'
        ch.identity.notes = 'Owes a fixer.'
        ch.narrative.keywords = ['one', 'two', 'three', 'four', 'five']
        ch.narrative.cues = ['a cue', '', '', '']
      }),
    )
    const t = pageText()
    expect(t).toContain('Jane Roe')
    expect(document.querySelector('img')).not.toBeNull()
    expect(t).toMatch(/Grew up in the stacks|Owes a fixer|a cue/)
  })

  test(`the ${label} still prints a runner with nothing but the basics`, async () => {
    await render(
      S,
      runner(ch => {
        ch.build.amps = []
        ch.build.items = []
        ch.build.skills = []
        ch.build.knowledge = []
        ch.identity.streetName = ''
        ch.identity.name = ''
      }),
    )
    expect(pageText()).toContain('Unnamed runner')
  })
}

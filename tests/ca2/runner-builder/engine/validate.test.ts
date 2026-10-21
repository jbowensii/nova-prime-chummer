import { test, expect } from 'vitest'
import { blankCharacter } from '../../../../src/ca2/formats/domain/file'
import { ampCtx, ampRating } from '../../../../src/ca2/runner-builder/domain/amps'
import { canFinalize, validate } from '../../../../src/ca2/runner-builder/domain/validate'
import { finalize, makeAmpAdd } from '../../../../src/ca2/runner-builder/domain/career'
import type { AmpEntry, Character } from '../../../../src/ca2/formats/domain/types'
import { cat, legacy } from '../../../helpers'

const amp = (uid: string, type: string, effects: AmpEntry['effects'], extra: Partial<AmpEntry> = {}): AmpEntry => ({
  uid,
  type,
  name: uid,
  narrative: '',
  effects,
  ...extra,
})
const codes = (ch: Character) => validate(cat, ch).map(v => v.code)
const count = (ch: Character, code: string) => codes(ch).filter(c => c === code).length
const base = () => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 2, log: 2, cha: 2 }
  return ch
}

test.each<[string, (ch: Character) => void]>([
  [
    'budget.over',
    ch => {
      ch.build.attributes = { str: 4, agi: 4, wil: 4, log: 4, cha: 4 }
      ch.build.skills = [
        'athletics',
        'stealth',
        'perception',
        'influence',
        'network',
        'survival',
        'piloting',
        'electronics',
        'engineering',
        'close-combat',
        'ranged-weapons',
      ].map(id => ({ id, rating: 5, specs: [] }))
      ch.level = 'ganger'
    },
  ],
  [
    'attr.range',
    ch => {
      ch.build.attributes.str = 6
    },
  ], // made-up human max 5
  [
    'attr.maxCount',
    ch => {
      ch.build.attributes.str = 5
      ch.build.attributes.agi = 5
      ch.build.attributes.wil = 5
    },
  ], // made-up runner: 2 at max
  [
    'skill.cap',
    ch => {
      ch.build.skills = [{ id: 'stealth', rating: 6, specs: [] }]
    },
  ],
  [
    'spec.noSkill',
    ch => {
      ch.build.skills = [{ id: 'stealth', rating: 0, specs: ['stealth.palming'] }]
    },
  ],
  [
    'rr.cap',
    ch => {
      ch.build.skills = [{ id: 'stealth', rating: 2, specs: [] }]
      ch.build.amps = ['q', 'c', 'b'].map(u => amp(u, u === 'q' ? 'quality' : u === 'c' ? 'cyberware' : 'bioware', [{ ref: 'rr-skill', param: 'stealth' }]))
    },
  ], // made-up runner: RR 2 on a Skill
  [
    'amp.effectMax',
    ch => {
      ch.build.amps = [amp('c', 'cyberware', [{ ref: 'armor-plus' }, { ref: 'armor-plus' }, { ref: 'armor-plus' }])]
    },
  ],
  [
    'amp.requires',
    ch => {
      ch.build.amps = [amp('c', 'cyberware', [{ ref: 'init-2' }])]
    },
  ],
  [
    'amp.typeIllegal',
    ch => {
      ch.build.amps = [amp('c', 'contact', [{ ref: 'vcr' }])]
    },
  ],
  [
    'amp.negative',
    ch => {
      ch.build.amps = [amp('c', 'cyberware', [{ ref: 'negative', value: 2 }])]
    },
  ],
  [
    'amp.param',
    ch => {
      ch.build.amps = [amp('c', 'contact', [{ ref: 'rr-spec' }])]
    },
  ],
  [
    'amp.noItem',
    ch => {
      ch.build.amps = [amp('e', 'equipment', [{ ref: 'dv-plus' }])]
    },
  ],
  [
    'adept.requiresAwakened',
    ch => {
      ch.build.amps = [amp('p', 'adept', [])]
    },
  ],
  [
    'skill.requiresAwakened',
    ch => {
      ch.build.skills = [{ id: 'sorcery', rating: 1, specs: [] }]
    },
  ],
  [
    'skill.requiresDeck',
    ch => {
      ch.build.skills = [{ id: 'cracking', rating: 1, specs: [] }]
    },
  ],
  // a deck but no DNI (CRB p.212)
  [
    'skill.requiresDni',
    ch => {
      ch.build.skills = [{ id: 'cracking', rating: 1, specs: [] }]
      ch.build.amps = [amp('d', 'cyberdeck', [])]
    },
  ],
  // an RCC without VR access from cyberware (CRB p.62)
  // spells aren't equipment (CRB p.178)
  [
    'amp.spellItem',
    ch => {
      ch.build.items = [{ uid: 's', kind: 'spell', name: 'Zap' }]
      ch.build.amps = [{ ...amp('e', 'equipment', []), linkedItem: 's' }]
    },
  ],
  [
    'rig.requiresVr',
    ch => {
      ch.build.amps = [amp('r', 'cyberware', [{ ref: 'rcc', value: 2 }])]
    },
  ],
  [
    'essence.dead',
    ch => {
      ch.build.amps = [1, 2, 3, 4, 5, 6].map(i => amp(`c${i}`, 'cyberware', []))
    },
  ],
  [
    'vehicle.armor',
    ch => {
      ch.build.amps = [amp('v', 'vehicle', [{ ref: 'vehicle-armor' }, { ref: 'vehicle-armor' }, { ref: 'vehicle-armor' }], { vehicle: 'small-drone' })]
    },
  ], // made-up body 2
  [
    'ref.unknown',
    ch => {
      ch.build.items = [{ uid: 'x', catalogId: 'no-such-thing', kind: 'gear', name: 'Ghost' }]
    },
  ],
  [
    'custom.content',
    ch => {
      ch.build.items = [{ uid: 'x', kind: 'gear', name: 'Ferrari', price: 50000 }]
    },
  ],
])('%s', (code, mutate) => {
  const ch = base()
  expect(count(ch, code)).toBe(0)
  mutate(ch)
  expect(count(ch, code)).toBeGreaterThanOrEqual(1)
})

test('narrative.count and runner.basics are warnings on a blank character', () => {
  const v = validate(cat, base())
  expect(v.find(x => x.code === 'narrative.count')!.severity).toBe('warning')
  expect(v.filter(x => x.code === 'runner.basics')).toHaveLength(5)
})

test('amp.qualityAfterCreation: a Quality a pre-0.5.5 ledger added needs a GM', () => {
  let ch = legacy(finalize(cat, blankCharacter()))
  ch = { ...ch, career: [...ch.career, makeAmpAdd(cat, ch, amp('q2', 'quality', [{ ref: 'narrative', param: 'lucky' }]))] }
  expect(codes(ch)).toContain('amp.qualityAfterCreation')
})

test('catalog-sanctioned negative effects need no approval', () => {
  const ch = base()
  const rush = cat.amps.get('test.rush')!
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  ch.build.amps = [amp('d', 'equipment', rush.effects, { catalogId: 'test.rush', linkedItem: 'i' })]
  expect(codes(ch)).not.toContain('amp.negative')
})

test('a negative effect on a runner’s own amp needs the GM, whatever its note says; a book sample’s, as printed, does not', () => {
  const ch = base()
  ch.build.amps = [
    amp('q', 'quality', [
      { ref: 'rr-skill', param: 'stealth' },
      { ref: 'negative', value: 1, note: 'book drawback' },
    ]),
  ]
  expect(codes(ch)).toContain('amp.negative')
  ch.origin = 'TEST'
  expect(codes(ch)).toContain('amp.negative')
  // a book sample's amp (its snapshot holds the printed rating) that rates exactly as printed: the book's own limitation
  const rating = ampRating(cat, ch.build.amps[0], ampCtx(ch.build, ch.build.amps[0]))
  ch.build.amps[0].snapshot = { id: 'test.x.q', type: 'quality', name: 'Q', effects: [], narrative: '', printedRating: rating, source: 'TEST', page: 7 }
  expect(codes(ch)).not.toContain('amp.negative')
  ch.build.amps[0].effects.push({ ref: 'negative', value: 1 }) // a player's further reduction: below the printed rating
  expect(count(ch, 'amp.negative')).toBe(2)
  ch.build.amps[0].effects.pop()
  ch.build.amps[0].catalogId = 'test.keen-eye' // a catalog amp's snapshot is the catalog entry, not a sample's printed amp
  expect(codes(ch)).toContain('amp.negative')
})

test('a book sample’s amp: Review notes where the printed rating isn’t the rules’ one', () => {
  const ch = base()
  ch.origin = 'TEST'
  const snap = (printedRating: number) => ({ id: 'test.x.q', type: 'quality', name: 'Q', effects: [], narrative: '', printedRating, source: 'TEST', page: 7 })
  ch.build.amps = [amp('q', 'quality', [{ ref: 'rr-skill', param: 'stealth' }], { snapshot: snap(1) })]
  const rating = ampRating(cat, ch.build.amps[0], ampCtx(ch.build, ch.build.amps[0]))
  const note = validate(cat, ch).find(v => v.code === 'amp.printedRating')!
  expect(note).toMatchObject({
    severity: 'warning',
    path: 'amps.q',
    source: 'TEST',
    page: 7,
    message: `q: the book prints rating 1; the rules give ${rating}.`,
  })
  ch.build.amps[0].snapshot = snap(rating)
  expect(codes(ch)).not.toContain('amp.printedRating')
  // a catalog amp's snapshot is the catalog entry, not what a runner's book printed: no note
  ch.build.amps[0] = { ...ch.build.amps[0], catalogId: 'test.x', snapshot: snap(1) }
  expect(codes(ch)).not.toContain('amp.printedRating')
})

test('a GM override approves the violation and unblocks Finalize', () => {
  const ch = base()
  ch.build.attributes.str = 5
  ch.build.attributes.agi = 5
  ch.build.attributes.wil = 5
  expect(canFinalize(validate(cat, ch))).toBe(false)
  ch.overrides = [{ code: 'attr.maxCount', path: 'attributes', note: 'GM: street legend campaign' }]
  const v = validate(cat, ch)
  expect(v.find(x => x.code === 'attr.maxCount')!.approved).toBe(true)
  expect(canFinalize(v)).toBe(true)
})

test('effects a catalog amp carries are sanctioned even when the effect table forbids them (book drug pattern)', () => {
  const ch = base()
  const rush = cat.amps.get('test.rush')!
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  ch.build.amps = [amp('d', 'equipment', rush.effects, { catalogId: 'test.rush', linkedItem: 'i' })]
  expect(codes(ch)).not.toContain('amp.typeIllegal')
  ch.build.amps[0].catalogId = undefined // the same effects on a home-made amp are not
  expect(codes(ch)).toContain('amp.typeIllegal')
  // named as the book's drug, of its type (a sample runner prints the book's Rush): what the book prints for it is sanctioned
  ch.build.amps[0].name = ' RUSH '
  expect(codes(ch)).not.toContain('amp.typeIllegal')
  ch.build.amps[0].effects = [...rush.effects, { ref: 'vcr' }] // an effect the book's entry doesn't print still isn't
  expect(count(ch, 'amp.typeIllegal')).toBe(1)
  ch.build.amps[0] = { ...ch.build.amps[0], type: 'contact', effects: rush.effects } // nor the name on another type
  expect(codes(ch)).toContain('amp.typeIllegal')
})

test('a sample’s amp named as the book’s catalog amp may carry that entry’s drawback; another value needs the GM', () => {
  const ch = base()
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  // the sample reader notes the printed line that limits it; the book's entry prints the same -2
  ch.build.amps = [
    amp('d', 'equipment', [{ ref: 'init-1' }, { ref: 'init-2' }, { ref: 'negative', value: 2, note: 'Crash after.' }], { name: 'Rush', linkedItem: 'i' }),
  ]
  expect(codes(ch)).not.toContain('amp.negative')
  ch.build.amps[0].effects[2].value = 1
  expect(codes(ch)).toContain('amp.negative')
})

test('an effect the books’ add-ons for a type print is one that type may carry (a deck’s Initiative in VR)', () => {
  const ch = base()
  ch.build.amps = [amp('k', 'cyberdeck', [{ ref: 'init-1' }, { ref: 'init-realm', param: 'vr' }])]
  expect(count(ch, 'amp.typeIllegal')).toBe(2) // the made-up effect table gives Initiative to no deck
  const boost = {
    ...cat.amps.get('test.static-shroud')!,
    id: 'test.deck-boost',
    type: 'cyberdeck',
    name: 'Deck Boost',
    effects: [{ ref: 'init-1' }, { ref: 'init-realm', param: 'vr' }],
  }
  const withMod = { ...cat, amps: new Map([...cat.amps, [boost.id, boost]]) }
  expect(validate(withMod, ch).map(v => v.code)).not.toContain('amp.typeIllegal')
  ch.build.amps[0].type = 'contact' // a mod for decks gives a contact nothing
  expect(validate(withMod, ch).map(v => v.code)).toContain('amp.typeIllegal')
})

test('an armor add-on stacked on other armor is noted (CRB p.148); a shield is not', () => {
  const ch = base()
  ch.build.items = [
    { uid: 'v', kind: 'armor', name: 'Made-up vest', armor: 2 },
    { uid: 'm', kind: 'armor', name: 'Made-up mask', armor: 1, over: 'v' },
  ]
  expect(count(ch, 'armor.stack')).toBe(1)
  ch.build.items[1].name = 'Made-up riot shield'
  expect(count(ch, 'armor.stack')).toBe(0)
})

test('a spell without Sorcery and a complex form without the Emerged amp are prerequisite errors a GM may approve', () => {
  const ch = base()
  ch.build.items = [
    { uid: 's', kind: 'spell', name: 'Made-up Bolt' },
    { uid: 'f', kind: 'complex-form', name: 'Made-up Loop' },
  ]
  const v = validate(cat, ch).filter(x => x.code === 'spell.noSorcery' || x.code === 'complexForm.noEmerged')
  expect(v.map(x => [x.code, x.severity, x.source, x.page])).toEqual([
    ['complexForm.noEmerged', 'error', 'CG', 9],
    ['spell.noSorcery', 'error', 'CRB', 58],
  ])
  expect(canFinalize(v)).toBe(false)
  ch.overrides = v.map(x => ({ code: x.code, path: x.path, note: 'GM ok' }))
  expect(canFinalize(validate(cat, ch).filter(x => x.code === 'spell.noSorcery' || x.code === 'complexForm.noEmerged'))).toBe(true)
})

test('a custom specialization is the runner’s to learn: no warning (CRB p.52)', () => {
  const ch = base()
  ch.build.skills = [{ id: 'stealth', rating: 2, specs: ['custom:Made-up trick'] }]
  expect(validate(cat, ch).filter(v => v.path === 'skills.stealth')).toEqual([])
})

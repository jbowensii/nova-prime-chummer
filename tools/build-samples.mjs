// Build the book pregens (CRB p.88-111) as sample characters, plus a fixture of every
// number the book prints for them (amp ratings, dice pools, thresholds, Essence).
// The sample files are what the app loads; tests/engine/pregens.test.ts checks the
// engine reproduces the printed numbers.   Usage: node tools/build-samples.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const ampsXml = readFileSync('public/data/amps.xml', 'utf8')
/** effects of a catalog amp, as the DSL below */
const fromCatalog = id => {
  const m = ampsXml.match(new RegExp(`<amp id="${id}"[^>]*>([\\s\\S]*?)</amp>`))
  if (!m) throw new Error(`no catalog amp ${id}`)
  return [...m[1].matchAll(/<effect ([^/]*)\/>/g)].map(e => {
    const a = Object.fromEntries([...e[1].matchAll(/(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]]))
    return { ref: a.ref, ...(a.param ? { param: a.param } : {}), ...(a.value ? { value: Number(a.value) } : {}), ...(a.note ? { note: a.note } : {}) }
  })
}
/** "rr-spec:perception.social*2 init-realm:vr rcc=3" -> EffectPick[] */
const fx = dsl => (dsl ? dsl.split(/\s+/) : []).flatMap(tok => {
  const [, ref, param, value, n] = tok.match(/^([a-z0-9-]+)(?::([^=*]+))?(?:=(\d+))?(?:\*(\d+))?$/)
  return Array.from({ length: Number(n ?? 1) }, () => ({ ref, ...(param ? { param } : {}), ...(value ? { value: Number(value) } : {}) }))
})
/** "athletics 3 ranged-defense; close-combat 5 custom:Whips" -> SkillEntry[] */
const skills = dsl => dsl.split(';').map(s => s.trim().split(/\s+/)).map(([id, r, ...specs]) =>
  ({ id, rating: Number(r), specs: specs.map(x => (x.startsWith('custom:') ? x : `${id}.${x}`)) }))
const attrs = s => { const [str, agi, wil, log, cha] = s.split(' ').map(Number); return { str, agi, wil, log, cha } }

const PREGENS = [
  { id: 'hercules', name: 'Arthur Pitchford', street: 'Hercules', meta: 'dwarf', page: 88, essence: 6,
    attrs: '2 3 2 3 4', // attribute row is missing from the book text; back-computed from the printed dice pools and thresholds
    skills: 'athletics 3 ranged-defense; close-combat 1; influence 5 bluff negotiation; network 4; perception 4; piloting 2; ranged-weapons 5 pistols; stealth 5; survival 2',
    knowledge: ['Language: Japanese', 'Pueblo Corporate Council'],
    items: [['coat', 'armor', 'Lined coat', { armor: 3, catalogId: 'light-armor' }], ['clothes', 'gear', 'Clothes'],
      ['pistol', 'weapon', 'Ares Light Fire', { catalogId: 'light-pistol' }], ['medkit', 'gear', 'Medkit'], ['infil', 'gear', 'Small infiltration kit']],
    main: 'coat', alt: 'clothes',
    amps: [['Awakened (adept)', 'awakened', 1, 'awk-adept'],
      ['Well-Stocked Closet', 'equipment', 2, 'armor-plus rr-spec:influence.etiquette', { linkedItem: 'clothes', narrative: 'Always have the appropriate apparel.' }],
      ['Vocal Control', 'adept', 3, 'rr-spec:influence.impersonation'],
      ['Danger Sense', 'adept', 1, '', { narrative: 'Sense an imminent threat without a Perception Test, with no further details.' }],
      ['Empathic Sense', 'adept', 5, 'rr-spec:perception.social*2'],
      ['Flashing Smile', 'adept', 3, 'rr-spec:influence.bluff'],
      ['Concealment', 'adept', 1, '', { narrative: 'Blend into the crowd during a scene.' }],
      ['Elton Hutchinson, lawyer', 'contact', 5, 'rr-skill:network'],
      ['Alicia Francetti, journalist', 'contact', 2, 'rr-spec:network.media']],
    keywords: ['Dwarf', 'Seattle / Downtown', 'Face adept', 'Player', 'Low lifestyle'],
    dispositions: ['Veteran sweet talker', 'Reckless arrogance', 'Lucky', 'Opportunistic'],
    cues: ['Every failure brings me closer to success. It’s a proven fact.', 'If we can’t beat them, we can convince them.',
      'I’ve seen worse. Once …', 'Nothing is lost. Nothing is created. Everything is transformed.'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=8 close-combat@agi=4 influence@cha=9 influence.bluff@cha=11 influence.negotiation@cha=11 network@cha=8 perception@log=7 piloting@agi=5 ranged-weapons@agi=8 ranged-weapons.pistols@agi=10 stealth@agi=8 survival@log=5',
    thresholds: { physicalNone: 2, physicalMain: 5, physicalAlt: 3, mental: 2 } },

  { id: 'wild-jane', name: 'Wild Jane', street: 'Wild Jane', meta: 'ork', page: 90, essence: 3.5, attrs: '3 4 2 2 3',
    skills: 'athletics 3 ranged-defense; close-combat 3 unarmed; influence 3 intimidation; network 3 government; perception 4 physical; piloting 2 cars; ranged-weapons 5 rifles; stealth 2 physical-sneaking',
    items: [['vest', 'armor', 'Kevlar vest', { armor: 3, catalogId: 'light-armor' }], ['gloves', 'weapon', 'Stun gloves', { catalogId: 'advanced-close-quarter' }],
      ['manhunter', 'weapon', 'Colt Manhunter', { catalogId: 'heavy-pistol' }], ['t250', 'weapon', 'Defiance T-250', { catalogId: 'shotgun' }],
      ['mgl', 'weapon', 'ArmTech MGL-12', { catalogId: 'grenade-launcher', specialist: true }], ['stims', 'gear', 'Stim patches']],
    main: 'vest',
    amps: [['Cybernetic eyes', 'cyberware', 8, 'rr-skill:ranged-weapons rr-spec:perception.physical', { narrative: 'Visual interface, camera, low-light vision, smartlink.' }],
      ['Wired reflexes', 'cyberware', 6, 'init-1 init-2'],
      ['Reflex recorders', 'bioware', 4, 'rr-spec:close-combat.unarmed'],
      ['Casey Bernardini, Lone Star inspector', 'contact', 2, 'rr-spec:network.government'],
      ['Defiance T-250 (customized stock)', 'equipment', 2, 'rr-spec:ranged-weapons.rifles', { linkedItem: 't250' }],
      ['Reinforced Ford Americar', 'vehicle', 2, 'vehicle-armor', { vehicle: 'sedan', narrative: 'Front-facing weapon mount.' }]],
    keywords: ['Ork', 'Austin, CAS', 'Street samurai', 'Lone Star', 'Low lifestyle'],
    dispositions: ['Woman of principle', 'Polite', 'Short fuse', 'Purposeful'],
    cues: ['As long as I have somewhere to hang my hat, I’ll be fine.', 'You’re really starting to get on my nerves, boy.',
      'Strangely, people are much more polite when I am armed.', 'Trust me, sir. I’ll get to the bottom of this.'],
    pools: 'athletics@str=6 athletics.ranged-defense@agi=9 close-combat@agi=7 close-combat.unarmed@agi=9 influence@cha=6 influence.intimidation@cha=8 network@cha=6 network.government@cha=8 perception@log=6 perception.physical@log=8 piloting@agi=6 piloting.cars@agi=8 ranged-weapons@agi=9 ranged-weapons.rifles@agi=11 stealth@agi=6 stealth.physical-sneaking@agi=8',
    thresholds: { physicalNone: 3, physicalMain: 6, mental: 2 } },

  { id: 'trash', name: 'Trash', street: 'Trash', meta: 'elf', page: 92, essence: 6, attrs: '2 3 4 2 4',
    skills: 'athletics 3 ranged-defense; close-combat 0; conjuring 5 spirits-of-beasts; influence 4 impersonation etiquette; network 2; perception 3 astral; ranged-weapons 2; stealth 3 palming; sorcery 5 manipulation-spells; survival 3',
    items: [['coat', 'armor', 'Lined coat', { armor: 3, catalogId: 'light-armor' }], ['taser', 'weapon', 'Defiance Super Shock', { catalogId: 'taser' }],
      ['kit', 'gear', 'Infiltration kit'], ['focus', 'gear', 'Sustaining focus'], ['lodge', 'gear', 'Magic lodge'],
      ['s1', 'spell', 'Lightning', { catalogId: 'spell-lightning-bolt' }], ['s2', 'spell', 'Detect Life', { catalogId: 'spell-detect-life' }],
      ['s3', 'spell', 'Phantasm', { catalogId: 'spell-phantasm' }], ['s4', 'spell', 'Control Thoughts', { catalogId: 'spell-control-thoughts' }],
      ['s5', 'spell', 'Shaping', { catalogId: 'spell-shaping' }], ['s6', 'spell', 'Magic Fingers', { catalogId: 'spell-magic-fingers' }]],
    main: 'coat',
    amps: [['Awakened (shaman)', 'awakened', 5, 'awk-astral-projection awk-sorcery awk-conjuring'],
      ['Raccoon mentor spirit', 'quality', 4, 'rr-spec:stealth.palming rr-spec:sorcery.manipulation-spells', { narrative: 'Curious (disposition).' }],
      ['Infiltration kit', 'equipment', 2, 'rr-spec:stealth.lockpicking', { linkedItem: 'kit', narrative: 'Autopicker, maglock passkey and magnetic card copier.' }],
      ['Sustaining focus', 'equipment', 2, 'sustain-spell', { linkedItem: 'focus' }],
      ['Sarah Carpenter, street doc', 'contact', 2, 'rr-spec:network.medical']],
    keywords: ['Elf', 'Seattle', 'Shaman', 'Noble of Tír Tairngire', 'Low lifestyle'],
    dispositions: ['Dilettante', 'Instinctive', 'Curious', 'Idealist'],
    cues: ['You can lose everything but your refinement.', 'Raccoon says, ‘if it’s poorly protected, it’s a gift.’',
      'A plan doesn’t go wrong; it’s just an ongoing improvisation.', 'Why run when you can just disappear?'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=8 conjuring@cha=9 conjuring.spirits-of-beasts@cha=11 influence@cha=8 influence.impersonation@cha=10 influence.etiquette@cha=10 network@cha=6 perception@log=5 perception.astral@log=7 ranged-weapons@agi=5 stealth@agi=6 stealth.palming@agi=8 sorcery@wil=9 sorcery.manipulation-spells@wil=11 survival@log=5',
    thresholds: { physicalNone: 2, physicalMain: 5, mental: 4 } },

  { id: 'gambit', name: 'Gambit', street: 'Gambit', meta: 'human', page: 94, essence: 5,
    attrs: '2 3 3 4 2', // attribute row missing from the book text; back-computed from dice pools
    skills: 'athletics 3 ranged-defense; cracking 5 brute-force; electronics 3 matrix-search; network 3 matrix; perception 3 matrix; piloting 2 bikes; ranged-weapons 2 pistols; stealth 3 matrix-sneaking',
    items: [['coat', 'armor', 'Lined coat', { armor: 3, catalogId: 'light-armor' }], ['pistol', 'weapon', 'Fichetti Security 600', { catalogId: 'light-pistol' }],
      ['jammer', 'gear', 'Signal jammer'], ['tags', 'gear', 'Stealth tags']],
    main: 'coat',
    amps: [['Cyberjack MCT Decker-Pro', 'cyberware', 7, 'vr-cold vr-hot init-1 init-2 init-realm:vr*2', { narrative: 'Direct neural interface.' }],
      ['MCT 260', 'cyberdeck', 12, 'firewall-plus*2 attack-plus*2 rr-skill:cracking rr-spec:cracking.brute-force'],
      ['Markus “The Finnish” Laitinen, Matrix supplier', 'contact', 2, 'rr-spec:network.matrix'],
      ['ShadowSea, Seattle data haven', 'contact', 4, 'rr-spec:network.matrix rr-spec:electronics.matrix-search'],
      ['Suzuki Mirage', 'vehicle', 1, '', { vehicle: 'race-motorbike' }]],
    keywords: ['Human', 'London', 'Decker', 'India', 'Low lifestyle'],
    dispositions: ['Ambitious', 'Vindictive', 'Spiteful', 'Planner'],
    cues: ['There are times when you have to lose a piece to win the game.', 'In chess as in the Matrix, I prefer to attack.',
      'My name is Gambit, not Gandhi. Get that through your head.', 'A goal without a plan is just a fraggin’ wish.'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=8 cracking@log=9 cracking.brute-force@log=11 electronics@log=7 electronics.matrix-search@log=9 network@cha=5 network.matrix@cha=7 perception@log=7 perception.matrix@log=9 piloting@agi=5 piloting.bikes@agi=7 ranged-weapons@agi=5 ranged-weapons.pistols@agi=7 stealth@agi=6 stealth.matrix-sneaking@log=9',
    thresholds: { physicalNone: 2, physicalMain: 5, mental: 3 } },

  { id: 'charon', name: 'Charon', street: 'Charon', meta: 'troll', page: 96, essence: 4, attrs: '3 4 2 3 2',
    skills: 'athletics 2 ranged-defense; close-combat 3; electronics 2; engineering 3 remote-controlled-weapons; influence 2 etiquette; network 3 corporate; perception 2 physical; piloting 5 cars; ranged-weapons 2 pistols; stealth 2; survival 1 navigation',
    items: [['suit', 'armor', 'Actioneer Business Suit', { armor: 1, catalogId: 'armored-clothes' }], ['heater', 'weapon', 'Krime Heater', { catalogId: 'heavy-pistol' }],
      ['praetor', 'weapon', 'FN P93 Praetor (on the Quadrotor)', { catalogId: 'submachine-gun' }], ['m23', 'weapon', 'Colt M23 (on the Northstar)', { catalogId: 'assault-rifle' }],
      ['workshop', 'gear', 'Vehicle repair workshop']],
    main: 'suit',
    amps: [['Plastic bone lacing', 'cyberware', 4, 'wound-light'],
      ['Vehicle control rig Dassault MilRig+', 'cyberware', 9, 'vcr vr-cold vr-hot init-1 init-2 init-realm:vr*2', { narrative: 'Jump into vehicles and drones.' }],
      ['Eurocar Northstar 20', 'vehicle', 6, 'vehicle-armor rr-spec:piloting.cars weapon-mount:hidden narrative:smuggling-compartment', { vehicle: 'suv' }],
      ['Actioneer Business Suit', 'equipment', 2, 'rr-spec:influence.etiquette', { linkedItem: 'suit' }],
      ['Cyberspace Design Quadrotor', 'vehicle', 4, 'flying rr-spec:perception.physical', { vehicle: 'small-drone' }]],
    keywords: ['Troll', 'Seattle', 'Rigger', 'Professional driver', 'Low lifestyle'],
    dispositions: ['Protective of his team and clients', 'Knows how to be discreet', 'Stays professional', 'Would rather avoid conflicts'],
    cues: ['A smooth drive can make all the difference.', 'I know a shortcut and I’m sure they will let us through.',
      'I am afraid I’ll have to interrupt.', 'Please keep your head down. Lead is about to fly.'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=8 close-combat@agi=7 electronics@log=5 engineering@log=6 engineering.remote-controlled-weapons@log=8 influence@cha=4 influence.etiquette@cha=6 network@cha=5 network.corporate@cha=7 perception@log=5 perception.physical@log=7 piloting@agi=9 piloting.cars@agi=11 ranged-weapons@agi=6 ranged-weapons.pistols@agi=8 stealth@agi=6 survival@log=4 survival.navigation@log=6',
    thresholds: { physicalNone: 3, physicalMain: 4, mental: 2 } },

  { id: 'luna', name: 'Luna', street: 'Luna', meta: 'ork', page: 98, essence: 6,
    attrs: '2 2 4 3 3', // attribute row missing from the book text; back-computed from dice pools and mental threshold
    skills: 'athletics 2 ranged-defense; close-combat 2 astral-combat; conjuring 3 banishing; influence 3 negotiation; network 4 magic; perception 4 astral; sorcery 5 detection-spells; stealth 2 astral-sneaking',
    items: [['coat', 'armor', 'Lined coat', { armor: 3, catalogId: 'light-armor' }],
      ['s1', 'spell', 'Mask', { catalogId: 'spell-mask' }], ['s2', 'spell', 'Chimera', { catalogId: 'spell-chimera' }],
      ['s3', 'spell', 'Detect Magic', { catalogId: 'spell-detect-magic' }], ['s4', 'spell', 'Analyze Magic', { catalogId: 'spell-analyze-magic' }],
      ['s5', 'spell', 'Heal', { catalogId: 'spell-heal' }]],
    main: 'coat',
    amps: [['Awakened (shaman)', 'awakened', 5, 'awk-astral-projection awk-sorcery awk-conjuring'],
      ['Quetzalcoatl mentor spirit', 'quality', 2, 'rr-spec:sorcery.detection-spells', { narrative: 'Stubborn (disposition).' }],
      ['Mystic tattoo focus', 'quality', 13, 'rr-spec:perception.astral*2 rr-spec:stealth.astral-sneaking rr-spec:close-combat.astral-combat rr-spec:conjuring.banishing'],
      ['Faba, owner of Good Vibes', 'contact', 2, 'rr-spec:network.magic']],
    keywords: ['Ork', 'Seattle / Snohomish', 'Occult investigator (shaman)', 'Aztlan', 'Low lifestyle'],
    dispositions: ['Wary of Aztechnology', 'Sea Dragon fan', 'Creative artist', 'Stubborn'],
    cues: ['Stay calm until the time for calm is over.', 'I can handle everything.',
      'It’s me, with my own two hands and two or three friends.', 'I am going to tattoo that thing on you!'],
    pools: 'athletics@str=4 athletics.ranged-defense@agi=6 close-combat@agi=4 close-combat.astral-combat@wil=8 conjuring@cha=6 conjuring.banishing@cha=8 influence@cha=6 influence.negotiation@cha=8 network@cha=7 network.magic@cha=9 perception@log=7 perception.astral@log=9 sorcery@wil=9 sorcery.detection-spells@wil=11 stealth@agi=4 stealth.astral-sneaking@agi=6',
    thresholds: { physicalNone: 2, physicalMain: 5, mental: 4 } },

  { id: 'casper', name: 'Casper', street: 'Casper', meta: 'human', page: 100, essence: 5, attrs: '2 4 3 3 2',
    skills: 'athletics 3 ranged-defense; close-combat 1 defense; engineering 5; influence 2 impersonation; network 2 engineering; perception 4 physical; piloting 5; stealth 5 physical-sneaking',
    items: [['coat', 'armor', 'Lined coat', { armor: 3, catalogId: 'light-armor' }], ['rcc', 'gear', 'Cobbled together rigger command console'],
      ['smg1', 'weapon', 'Submachine gun (Quadrotor 1)', { catalogId: 'submachine-gun' }], ['smg2', 'weapon', 'Submachine gun (Quadrotor 2)', { catalogId: 'submachine-gun' }],
      ['ar', 'weapon', 'Assault rifle (Roto-drone)', { catalogId: 'assault-rifle' }]],
    main: 'coat',
    amps: [['Unlocked datajack', 'cyberware', 4, 'vr-cold vr-hot', { narrative: 'Direct neural interface.' }],
      ['Cobbled together rigger command console', 'equipment', 7, 'rcc=3 rr-spec:piloting.flying-drones rr-spec:engineering.remote-controlled-weapons', { linkedItem: 'rcc' }],
      ['Van', 'vehicle', 2, 'narrative:drone-loading-bay', { vehicle: 'van' }],
      ['2 Cyberspace Design Quadrotors', 'vehicle', 6, 'flying rr-spec:perception.physical extra-drone', { vehicle: 'small-drone' }],
      ['Damaged MCT Gnat', 'vehicle', 2, 'flying', { vehicle: 'microdrone' }],
      ['Roto-drone', 'vehicle', 2, 'flying', { vehicle: 'medium-drone' }],
      ['Derek Prince, DocWagon officer', 'contact', 2, 'rr-spec:network.medical']],
    keywords: ['Teenager', 'Seattle / Renton', 'Drone rigger', 'Resourceful orphan', 'Low lifestyle'],
    dispositions: ['Introvert', 'Sweet tooth', 'Uses her drones to frighten people', 'Always leaves her signature'],
    cues: ['Trick or threat!', 'When exactly did you realize you were a dead man?', 'I’m hungry.', 'Memento mori, puta.'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=9 close-combat@agi=5 close-combat.defense@agi=7 engineering@log=8 influence@cha=4 influence.impersonation@cha=6 network@cha=4 network.engineering@cha=6 perception@log=7 perception.physical@log=9 piloting@agi=9 stealth@agi=9 stealth.physical-sneaking@agi=11',
    thresholds: { physicalNone: 2, physicalMain: 5, mental: 3 } },

  { id: 'echo', name: 'Echo', street: 'Echo', meta: 'human', page: 102, essence: 5, attrs: '2 3 3 3 4',
    skills: 'athletics 3 ranged-defense; close-combat 3 clubs; electronics 2; influence 5 impersonation; network 5; perception 5 social; ranged-weapons 4 pistols; stealth 5; survival 2 composure',
    knowledge: ['Politics', 'Sociology'],
    items: [['vest', 'armor', 'Kevlar vest', { armor: 3, catalogId: 'light-armor' }], ['clothes', 'gear', 'Clothes'],
      ['baton', 'weapon', 'Extendable baton', { catalogId: 'long-weapon' }], ['p60', 'weapon', 'HK P60 Tactical', { catalogId: 'heavy-pistol' }],
      ['makeup', 'gear', 'Nanopaste makeup'], ['infil', 'gear', 'Small infiltration kit'], ['tags', 'gear', 'Stealth tags'], ['sweeper', 'gear', 'Bug sweeper']],
    main: 'vest', alt: 'clothes',
    amps: [['Cross Biomedical Angel Eyes', 'cyberware', 5, 'rr-spec:perception.physical narrative:thermographic-vision narrative:customizable-irises', { narrative: 'Visual interface; camera.' }],
      ['Nanopaste makeup', 'equipment', 4, 'rr-spec:influence.impersonation*2', { linkedItem: 'makeup' }],
      ['Well-Stocked Closet', 'equipment', 2, 'armor-plus rr-spec:influence.etiquette', { linkedItem: 'clothes', narrative: 'Always have the appropriate apparel.' }],
      ['HK P60 Tactical', 'equipment', 4, 'rr-spec:stealth.physical-sneaking rr-spec:ranged-weapons.pistols', { linkedItem: 'p60', narrative: 'Dismountable; smartgun.' }],
      ['Vincent Terranova, undercover cop', 'contact', 2, 'rr-spec:network.government']],
    keywords: ['Boston bourgeoisie', 'Seattle', 'Face', 'Former CIA agent (UCAS)', 'Low lifestyle'],
    dispositions: ['Idealist', 'Protector of the people', 'Avoids violence as much as possible', 'Seeks attention'],
    cues: ['I’m sure we can come to an arrangement; tell me everything.', 'There’s always a way. I just need to find the right person who knows it.',
      'I know someone who knows someone.', 'Adaptation is the key to survive in the field.'],
    pools: 'athletics@str=5 athletics.ranged-defense@agi=8 close-combat@agi=6 close-combat.clubs@agi=8 electronics@log=5 influence@cha=9 influence.impersonation@cha=11 network@cha=9 perception@log=8 perception.social@log=10 ranged-weapons@agi=7 ranged-weapons.pistols@agi=9 stealth@agi=8 survival@log=5 survival.composure@wil=7',
    thresholds: { physicalNone: 2, physicalMain: 5, physicalAlt: 3, mental: 3 } },

  { id: 'drakk', name: 'Drakk', street: 'Drakk', meta: 'troll', page: 104, essence: 3, attrs: '5 3 3 2 2',
    skills: 'athletics 4 ranged-defense; close-combat 5 blades unarmed; influence 4 intimidation; network 2; perception 3; piloting 2 bikes; ranged-weapons 4; stealth 1; survival 4 navigation',
    items: [['armor', 'armor', 'Custom-made armor', { armor: 4, catalogId: 'heavy-armor' }],
      ['sword1', 'weapon', 'Sword', { catalogId: 'long-weapon' }], ['sword2', 'weapon', 'Sword', { catalogId: 'long-weapon' }],
      ['manhunter', 'weapon', 'Colt Manhunter', { catalogId: 'heavy-pistol' }], ['knife', 'weapon', 'Throwing knife', { catalogId: 'throwing-weapon' }],
      ['m23', 'weapon', 'Colt M23', { catalogId: 'assault-rifle' }],
      ['bliss', 'gear', 'Bliss'], ['jazz', 'gear', 'Jazz'], ['berserker', 'gear', 'Berserker (BTL)'], ['rpg', 'gear', 'Role-playing kit']],
    main: 'armor',
    amps: [['Two weapon combat style', 'quality', 2, 'rr-spec:close-combat.blades'],
      ['Bliss', 'equipment', 1, 'catalog:bliss', { linkedItem: 'bliss' }],
      ['Jazz', 'equipment', 3, 'catalog:jazz', { linkedItem: 'jazz' }],
      ['Berserker (BTL)', 'equipment', 4, 'catalog:berserker-btl', { linkedItem: 'berserker' }],
      ['Auto-injector', 'cyberware', 1, ''],
      ['Synthetic cyberarm with heavy pistol', 'cyberware', 4, 'rr-spec:ranged-weapons.pistols narrative:integrated-pistol'],
      ['Counterfeit datajack', 'cyberware', 2, 'narrative:btl-only-hot-sim', { narrative: 'Direct neural interface.' }],
      ['Combat bike', 'vehicle', 2, 'narrative:looks-like-a-unicorn', { vehicle: 'chopper' }],
      ['Herwick Strauber, antiquarian', 'contact', 2, 'rr-spec:network.street']],
    keywords: ['Troll', 'Seattle / Underground', 'Street samurai', 'Enforcer', 'Low lifestyle'],
    dispositions: ['Theatrical chivalry', 'Brutal dreamer', 'Obsessed with a quest', 'Seeking to socialize'],
    cues: ['Another deed they will sing tales of in taverns.', 'You will taste my blade, miserable felon.',
      'Sorcerers of the Matrix, bless me with your wisdom.', 'Fumbling valiantly toward victory!'],
    pools: 'athletics@str=9 athletics.ranged-defense@agi=9 close-combat@agi=8 close-combat.blades@agi=10 close-combat.unarmed@agi=10 influence@cha=6 influence.intimidation@cha=8 network@cha=4 perception@log=5 piloting@agi=5 piloting.bikes@agi=7 ranged-weapons@agi=7 stealth@agi=4 survival@log=6 survival.navigation@log=8',
    thresholds: { physicalNone: 5, physicalMain: 9, mental: 3 } },

  { id: 'white-rabbit', name: 'Dennis Freeman', street: 'White_Rabbit', meta: 'human', page: 106, essence: 3, attrs: '2 3 1 4 2',
    skills: 'athletics 2 ranged-defense; cracking 5 brute-force cybercombat; electronics 4 matrix-search; engineering 2; network 2 criminal; perception 1 matrix; ranged-weapons 5; stealth 2',
    items: [['vest', 'armor', 'Kevlar vest', { armor: 3, catalogId: 'light-armor' }], ['browning', 'weapon', 'Browning Ultra Power', { catalogId: 'heavy-pistol' }],
      ['t250', 'weapon', 'Defiance T-250', { catalogId: 'shotgun' }], ['stims', 'gear', 'Stim patches'], ['relay', 'gear', 'Satellite relay']],
    main: 'vest',
    amps: [['Cyberjack MCT Decker-Pro', 'cyberware', 7, 'vr-cold vr-hot init-1 init-2 init-realm:vr*2', { narrative: 'Direct neural interface.' }],
      ['Ares ProShooter cybernetic eyes', 'cyberware', 5, 'rr-spec:ranged-weapons.pistols*2', { narrative: 'Visual interface; camera.' }],
      ['Aluminum bone lacing', 'cyberware', 5, 'dv-plus wound-light'],
      ['MCT 360', 'cyberdeck', 12, 'firewall-plus*2 attack-plus*3 rr-skill:cracking narrative:biofeedback'],
      ['Duke, ganger', 'contact', 2, 'rr-spec:network.criminal']],
    keywords: ['Human', 'Seattle / Underground', 'Combat decker', 'Ork poser', 'High lifestyle'],
    dispositions: ['Loyal', 'Unstable identity', 'Reckless', 'Rejecting his past'],
    cues: ['I’ve gained admin access on my own life.', 'If you touch them, I’ll reformat you.', 'Orks, like myself, can …',
      'What do you want? A decker or a miracle?'],
    pools: 'athletics@str=4 athletics.ranged-defense@agi=7 cracking@log=9 cracking.brute-force@log=11 cracking.cybercombat@wil=8 electronics@log=8 electronics.matrix-search@log=10 engineering@log=6 network@cha=4 network.criminal@cha=6 perception@log=5 perception.matrix@log=7 ranged-weapons@agi=8 stealth@agi=5',
    thresholds: { physicalNone: 2, physicalMain: 5, mental: 1, matrix: 3 } },

  { id: 'mictlan', name: 'Mictlan', street: 'Mictlan', meta: 'elf', page: 108, essence: 5, attrs: '3 4 2 2 3',
    skills: 'athletics 5 parkour; close-combat 5 custom:Whips; influence 4 etiquette; perception 4 physical; network 4 corporate; stealth 5 physical-sneaking lockpicking',
    items: [['vest', 'armor', 'Lined vest', { armor: 2, catalogId: 'armored-clothes-coat' }], ['whip', 'weapon', 'Shen biao', { catalogId: 'advanced-close-quarter' }],
      ['kit', 'gear', 'Infiltration kit'], ['grapple', 'gear', 'Grapple launcher'], ['bino', 'gear', 'Binoculars']],
    main: 'vest',
    amps: [['Awakened (adept)', 'awakened', 2, 'awk-adept awk-astral-perception'],
      ['Cybernetic ears', 'cyberware', 5, 'rr-spec:athletics.parkour rr-spec:perception.physical'],
      ['Be one with the ropes', 'adept', 3, 'rr-spec:custom:Whips'],
      ['Light-footed', 'adept', 5, 'rr-spec:stealth.physical-sneaking*2'],
      ['Reflexes boost', 'adept', 3, 'init-1'],
      ['Weapon focus shen biao', 'equipment', 3, 'rr-spec:custom:Whips weapon-focus', { linkedItem: 'whip' }],
      ['Infiltration kit', 'equipment', 2, 'rr-spec:stealth.lockpicking', { linkedItem: 'kit' }],
      ['Salvatore Sepulveda, Aztechnology executive (father)', 'contact', 2, 'rr-spec:network.corporate']],
    keywords: ['Elf', 'Seattle / Downtown', 'Adept', 'Aztlaner nobility', 'High lifestyle'],
    dispositions: ['Ambiguous relationship with their family', 'Hungry for freedom', 'Predatory seduction', 'Everything has a price'],
    cues: ['Please resist a bit; I like it that way.', 'Whether by money, blood, sweat, or spit … every account is eventually paid in full.',
      'There’s no limit to my will, not even yours.', 'Each one hurts; the last one kills.'],
    pools: 'athletics@str=8 athletics.parkour@agi=11 close-combat@agi=9 close-combat.custom:Whips@agi=11 influence@cha=7 influence.etiquette@cha=9 perception@log=6 perception.physical@log=8 network@cha=7 network.corporate@cha=9 stealth@agi=9 stealth.physical-sneaking@agi=11 stealth.lockpicking@agi=11',
    thresholds: { physicalNone: 3, physicalMain: 5, mental: 2 } },

  { id: 'capitan', name: 'Capitán', street: 'Capitán', meta: 'dwarf', page: 110, essence: 6, attrs: '3 3 3 2 4',
    skills: 'athletics 3 ranged-defense; close-combat 4; influence 4 negotiation; perception 4; ranged-weapons 5; network 3; stealth 4 physical-sneaking; survival 5',
    items: [['vest', 'armor', 'Kevlar vest', { armor: 3, catalogId: 'light-armor' }], ['manhunter', 'weapon', 'Colt Manhunter', { catalogId: 'heavy-pistol' }],
      ['ak', 'weapon', 'AK-97', { catalogId: 'assault-rifle' }], ['medkit', 'gear', 'Medkit']],
    main: 'vest',
    amps: [['Awakened (adept)', 'awakened', 1, 'awk-adept'],
      ['Capybara mentor spirit', 'quality', 4, 'rr-spec:survival.composure rr-spec:stealth.physical-sneaking', { narrative: 'Social (disposition).' }],
      ['Vocal Control', 'adept', 8, 'rr-skill:influence rr-spec:influence.impersonation'],
      ['Combat Sense', 'adept', 8, 'rr-skill:close-combat rr-spec:athletics.ranged-defense'],
      ['AK-97 with detachable bayonet', 'equipment', 1, 'narrative:detachable-bayonet', { linkedItem: 'ak' }]],
    keywords: ['Dwarf', 'Amazonia', 'Combat face', 'Mercenary', 'Low lifestyle'],
    dispositions: ['', '', '', ''], // not printed in the book text
    cues: ['The end does not justify the means.', 'I am sure we can settle this like civilized people.',
      'How do we get out of this mess?', 'Close ranks and focus fire!'],
    pools: 'athletics@str=6 athletics.ranged-defense@agi=8 close-combat@agi=7 influence@cha=8 influence.negotiation@cha=10 perception@log=6 ranged-weapons@agi=8 network@cha=7 stealth@agi=7 stealth.physical-sneaking@agi=9 survival@log=7',
    thresholds: { physicalNone: 3, physicalMain: 6, mental: 3 } },
]

const printed = {}
const index = [{ file: 'lightning.ca2.json', name: 'Lightning', role: 'Shaman, male elf (creation example)', page: 85 }]
for (const p of PREGENS) {
  const ch = {
    formatVersion: 1, id: `sample-${p.id}`,
    identity: { name: p.name, streetName: p.street, metatype: p.meta, background: `Book pregen, CRB p.${p.page}.`, notes: '' },
    narrative: { keywords: p.keywords, dispositions: p.dispositions, cues: p.cues },
    level: 'runner', package: 'free',
    build: {
      attributes: attrs(p.attrs), skills: skills(p.skills), knowledge: p.knowledge ?? [],
      amps: p.amps.map(([name, type, , dsl, extra = {}], i) => ({
        uid: `amp-${i + 1}`, type, name, narrative: extra.narrative ?? '',
        effects: dsl.startsWith('catalog:') ? fromCatalog(dsl.slice(8)) : fx(dsl),
        ...(dsl.startsWith('catalog:') ? { catalogId: dsl.slice(8) } : {}),
        ...(extra.linkedItem ? { linkedItem: `it-${extra.linkedItem}` } : {}), ...(extra.vehicle ? { vehicle: extra.vehicle } : {}),
      })),
      items: p.items.map(([uid, kind, name, extra = {}]) => ({ uid: `it-${uid}`, kind, name, ...extra })),
      mainArmor: p.main ? `it-${p.main}` : undefined, altArmor: p.alt ? `it-${p.alt}` : undefined,
    },
    career: [], overrides: [], updatedAt: '2026-09-27T00:00:00.000Z',
  }
  writeFileSync(`public/samples/${p.id}.ca2.json`, JSON.stringify(ch, null, 2) + '\n')
  printed[p.id] = {
    page: p.page, essence: p.essence, thresholds: p.thresholds,
    amps: Object.fromEntries(p.amps.map(([, , rating], i) => [`amp-${i + 1}`, rating])),
    pools: p.pools.split(/\s+/).map(tok => {
      const [, key, attr, dp] = tok.match(/^(.+)@(\w+)=(\d+)$/)
      const skill = key.split('.')[0]
      const rest = key.slice(skill.length + 1)
      return { skill, spec: rest ? (rest.startsWith('custom:') ? rest : key) : null, attr, dp: Number(dp) }
    }),
  }
  index.push({ file: `${p.id}.ca2.json`, name: p.street, role: '', page: p.page })
}
writeFileSync('public/samples/index.json', JSON.stringify(index, null, 2) + '\n')
writeFileSync('tests/fixtures/pregens-printed.json', JSON.stringify(printed, null, 2) + '\n')
console.log(`wrote ${PREGENS.length} pregens + index`)

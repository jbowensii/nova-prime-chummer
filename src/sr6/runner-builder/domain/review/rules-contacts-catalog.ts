// Review rules, contacts, point buy, lifepath, leftovers, identities, catalog problems, vehicles and critters. Part of the rules table (rules.ts assembles it in order).
import { limbSnapshot } from '../assets/limbs'
import { augmentedRating, entryOf, licenceFee, priced, PURCHASE_TAB, ratingOf } from '../creation/budgets'
import { cite, flag, num } from '../../../table-setup/domain/creation'
import { uncovered } from '../creation/providers'
import { fittedParts, modsOf } from '../assets/vehiclemods'
import { critterView } from '../assets/critters'
import { capacityOf, capacityUsed, hostsOf, fitsHost } from '../../../catalog/domain/categories'
import { fit, mountSlots, requirementsOf, slotLabel, structureOf } from '../../../catalog/domain/structure'
import { activeRules, contactLoyalty } from '../creation/rule-markers'
import {
  type Hit,
  type Rule,
  A,
  kindLabel,
  article,
  fmt,
  n0,
  over,
  entryCite,
  lines,
  DESIGN_APPROVAL,
  PRICE_APPROVAL,
  CUSTOM_APPROVAL,
  printedHits,
  nameOf,
} from './context'

export const RULES_CONTACTS_CATALOG: Rule[] = [
  {
    code: 'contact.fastFriendCharisma',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      activeRules(c.b, c.data).has('CONTACTS_START_LOYAL2') && augmentedRating(c.b, c.data, 'cha', c.p) < 2
        ? { message: 'Fast Friend requires Charisma 2 or higher.' }
        : null,
  },
  // (CRB Hong Kong p. 67: Charisma × 6 points; with the expanded contacts, karma buys the rest)
  {
    code: 'contact.budget',
    severity: 'error',
    tab: 'contacts',
    setting: c => [c.p.contactPoints ? 'lifepath.contactRatingCap' : 'contactPointsPerCha'],
    check: c => over(c.budgets.contactPoints, 'Contact points'),
  },
  {
    code: 'contact.ratingCap',
    severity: 'error',
    tab: 'contacts',
    check: c => {
      const cap = c.budgets.contactPoints.ratingCap
      return c.b.contacts
        .filter(x => x.connection > cap || contactLoyalty(c.b, c.data, x.loyalty, augmentedRating(c.b, c.data, 'cha', c.p)) > cap)
        .map(x => ({ path: `contacts.${x.uid}`, message: `${x.name || 'A contact'}’s connection or loyalty is above ${cap}.` }))
    },
  },
  // SWC p. 31: karma buys contact ratings only up to Charisma: what a contact has above it must come from the points
  {
    code: 'contact.karmaCap',
    severity: 'error',
    tab: 'contacts',
    setting: c => (c.p.contactPools ? ['lifepath.contactKarma'] : []),
    check: c => {
      if (!c.p.contactPools || num(c.cr, 'lifepath.contactKarma') === undefined) return null
      const cha = augmentedRating(c.b, c.data, 'cha', c.p)
      const above = c.b.contacts.map(x => ({ x, types: x.types ?? [], need: Math.max(0, x.connection - cha) + Math.max(0, x.loyalty - cha) }))
      if (!uncovered(c.p.contactPools(c.b), above)) return null
      const names = above
        .filter(a => a.need)
        .map(a => a.x.name || 'a contact')
        .join(', ')
      return { message: `Karma can’t raise a contact’s connection or loyalty above your Charisma (${cha}): the contact points don’t cover ${names} above it.` }
    },
  },
  {
    code: 'knowledge.budget',
    severity: 'error',
    tab: 'skills',
    setting: c => (c.p.knowledgePoints ? [] : ['knowledgePerLog']),
    check: c => over(c.budgets.knowledgePoints, 'Knowledge points'),
  },

  {
    code: 'pointbuy.overspent',
    severity: 'error',
    tab: 'method',
    setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => (c.budgets.characterPoints ? over(c.budgets.characterPoints, 'Character points') : null),
  },
  {
    code: 'pointbuy.unspent',
    severity: 'error',
    tab: 'method',
    setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => {
      const left = c.budgets.characterPoints?.left ?? 0
      return left > 0 ? { message: `${left} character points left: spend them all.` } : null
    },
  },
  {
    code: 'pointbuy.poolCap',
    severity: 'error',
    tab: 'method',
    setting: c =>
      c.p.id === 'pointbuy' ? ['pointBuy.max.attribute', 'pointBuy.max.skill', 'pointBuy.max.adjustment', 'pointBuy.max.nuyen', 'pointBuy.nuyenPerCp'] : [],
    check: c => {
      if (c.p.id !== 'pointbuy') return null
      const hits: Hit[] = (['attribute', 'skill', 'adjustment'] as const)
        .filter(k => c.b.cp[k] > n0(c.cr, `pointBuy.max.${k}`))
        .map(k => ({ message: `${c.b.cp[k]} character points in ${k} points; the most is ${n0(c.cr, `pointBuy.max.${k}`)}.` }))
      const nuyen = c.b.cp.resources * n0(c.cr, 'pointBuy.nuyenPerCp'),
        maxN = n0(c.cr, 'pointBuy.max.nuyen')
      if (nuyen > maxN) hits.push({ message: `${fmt(nuyen)}¥ bought with character points; the most is ${fmt(maxN)}¥.` })
      return hits
    },
  },
  {
    code: 'pointbuy.oneSpecialization',
    severity: 'error',
    tab: 'skills',
    setting: c => (c.p.id === 'pointbuy' ? ['pointBuy.oneSpecialization'] : []),
    check: c => {
      const count = c.b.skills.reduce((t, s) => t + (s.spec ? 1 : 0) + (s.specs?.length ?? 0), 0)
      return c.p.id !== 'pointbuy' || !flag(c.cr, 'pointBuy.oneSpecialization') || count <= 1
        ? null
        : { message: `Only one specialization in point buy (${count} taken).` }
    },
  },

  {
    code: 'lifepath.moduleCount',
    severity: 'error',
    tab: 'method',
    setting: c => (c.p.id === 'lifepath' ? ['lifepath.moduleCount'] : []),
    check: c => {
      const need = n0(c.cr, 'lifepath.moduleCount'),
        have = c.b.lifepath.length
      return c.p.id !== 'lifepath' || have === need ? null : { message: `${have} adult life modules taken; take ${need}.` }
    },
  },
  // optional settings (unset: the rule is off, no unset warning)
  {
    code: 'lifepath.repeat',
    severity: 'error',
    tab: 'method',
    check: c => {
      if (c.p.id !== 'lifepath') return null
      const times = new Map<string, number>()
      for (const pk of c.b.lifepath) times.set(pk.id, (times.get(pk.id) ?? 0) + 1)
      const twice = [...times].filter(([, t]) => t > 1),
        most = num(c.cr, 'lifepath.repeatModules') ?? 0
      const name = (id: string) => c.data.lifemodules[id]?.name ?? id
      if (twice.some(([, t]) => t > 2) || twice.length > most)
        return {
          message: `${twice.map(([id, t]) => `${name(id)} (${t} times)`).join(', ')}: ${
            most === 0 ? 'no module may be taken twice' : `${most === 1 ? 'one module' : `${most} modules`} may be taken twice, none more`
          }.`,
          ...cite(c.cr, 'lifepath.repeatModules'),
        }
      return null
    },
  },
  {
    code: 'lifepath.bestAttr',
    severity: 'error',
    tab: 'method',
    check: c => {
      const bonus = num(c.cr, 'lifepath.bestAttributeBonus')
      if (c.p.id !== 'lifepath' || !bonus) return null
      if (!c.b.bestAttr) return { message: `Pick the best attribute (it goes up by ${bonus}).`, ...cite(c.cr, 'lifepath.bestAttributeBonus') }
      const used = c.p.attributeBonus?.(c.b, c.b.bestAttr) ?? 0
      return used < bonus && (!c.b.bestExtra || c.b.bestExtra === c.b.bestAttr)
        ? {
            message: `${A(c.b.bestAttr)} reaches its maximum: pick the attribute that takes the other ${bonus - used}.`,
            ...cite(c.cr, 'lifepath.bestAttributeBonus'),
          }
        : null
    },
  },
  {
    code: 'lifepath.mixedChoices',
    severity: 'error',
    tab: 'method',
    check: c =>
      c.p.id !== 'lifepath'
        ? null
        : c.b.lifepath.flatMap(pk => {
            const m = c.data.lifemodules[pk.id]
            return m && m.choices.some((_, i) => !pk.choices[i])
              ? [{ path: `method.${pk.id}`, message: `${m.name}: pick where its choice goes.`, ...entryCite(c.data.entry('lifemodules', pk.id)) }]
              : []
          }),
  },

  // an adult module printed for an awakened, emerged, adept or magician runner (`( Awakened only )`), taken by another
  {
    code: 'lifepath.requires',
    severity: 'error',
    tab: 'method',
    check: c =>
      (c.p.available?.(c.b) ?? [])
        .filter(m => m.taken && !m.fits)
        .map(m => ({
          path: `method.${m.id}`,
          message: `${m.name} is for ${article(m.requires!).toLowerCase()} ${m.requires} runner, not ${article(kindLabel(c.b)).toLowerCase()} ${kindLabel(c.b)}.`,
          ...entryCite(c.data.entry('lifemodules', m.id)),
        })),
  },

  // owner's decision L2 (2026-10-11): more left than carries over (CRB Hong Kong pp. 66, 68, or the GM's own with
  // ownCarryOver) is a problem a GM can approve. maxKarmaLeft optional: unset, no limit (and no unset warning)
  {
    code: 'leftover.karma',
    severity: 'error',
    tab: 'review',
    check: c => {
      const most = num(c.cr, 'maxKarmaLeft')
      return most === undefined || c.budgets.karma.left <= most
        ? null
        : { message: `${c.budgets.karma.left} karma left; at most ${most} carries over.`, ...cite(c.cr, 'maxKarmaLeft') }
    },
  },
  {
    code: 'leftover.nuyen',
    severity: 'error',
    tab: 'review',
    setting: ['maxNuyenLeft'],
    check: c =>
      c.budgets.nuyen.left <= n0(c.cr, 'maxNuyenLeft')
        ? null
        : { message: `${fmt(c.budgets.nuyen.left)}¥ left; at most ${fmt(n0(c.cr, 'maxNuyenLeft'))}¥ carries over.` },
  },

  // owner's decision 1 (2026-10-11): points left at finish are lost: a note, never a block
  {
    code: 'points.unspent',
    severity: 'warning',
    tab: 'review',
    check: c =>
      (
        [
          [c.budgets.attributePoints, 'attribute points', 'attributes'],
          [c.budgets.adjustmentPoints, 'adjustment points', 'attributes'],
          [c.budgets.skillPoints, 'skill points', 'skills'],
          [c.budgets.knowledgePoints, 'knowledge points', 'skills'],
        ] as const
      )
        .filter(([b]) => b.left > 0)
        .map(([b, what, path]) => ({
          path,
          message: `${fmt(b.left)} ${b.left === 1 ? what.replace(/s$/, '') : what} left: ${b.left === 1 ? 'it’s' : 'they’re'} lost when the runner is finalized.`,
        })),
  },
  // owner's decisions 7 and 8: no lifestyle, no name or alias: notes
  {
    code: 'lifestyle.none',
    severity: 'warning',
    tab: 'contacts',
    check: c => (c.b.sins.some(s => s.lifestyles?.length) ? null : { message: 'No lifestyle bought: the runner lives somewhere (a lifestyle goes on a SIN).' }),
  },
  {
    code: 'identity.name',
    severity: 'warning',
    tab: 'concept',
    check: c => {
      const gone = [!c.ch.identity.name.trim() && 'name', !c.ch.identity.streetName.trim() && 'alias'].filter(Boolean)
      return gone.length ? { message: `The runner has no ${gone.join(' and no ')}.` } : null
    },
  },
  // an older file's lifestyle on a runner with no SIN went on an unnamed placeholder (charxml.ts): a note, not a block
  {
    code: 'sin.placeholder',
    severity: 'warning',
    tab: 'contacts',
    check: c =>
      c.b.sins
        .filter(s => s.placeholder)
        .map(s => ({
          path: `contacts.sin.${s.uid}`,
          message:
            'An unnamed SIN holds the lifestyle from an older file: give it a name, kind and rating ' +
            '(once finalized: Ledger → Add or name a SIN), or move the lifestyle to a real or fake SIN and remove it.',
        })),
  },
  // an owned item whose Availability prints a licence fee, licensed on none of the runner's SINs: one note for them all
  // (owner 2026-10-16: licences are listed and warned, never enforced; assigned on Contacts, or on the Ledger once finalized)
  {
    code: 'licence.none',
    severity: 'warning',
    tab: 'contacts',
    check: c => {
      const on = new Set(c.b.sins.flatMap(s => s.licences.map(l => l.item)))
      const need = [...lines(c.b)].filter(({ x }) => !on.has(x.uid) && licenceFee(x, c.data) !== undefined).map(({ x }) => nameOf(c, x))
      return need.length ? { message: `Needs a licence on a SIN (none yet; or carried unlicensed, settle it with your GM): ${need.join(', ')}.` } : null
    },
  },
  {
    code: 'catalog.missing',
    severity: 'error',
    tab: 'review',
    check: c => {
      const gone = (path: string, name: string): Hit => ({ path, message: `${name} is no longer in the catalog.` })
      const hits: Hit[] = []
      for (const s of c.b.skills) if (!c.data.skills[s.id]) hits.push(gone(`skills.${s.id}`, s.id))
      for (const q of c.b.qualities) if (!c.data.qualities[q.id]) hits.push(gone(`qualities.${q.uid}`, q.name ?? q.id))
      for (const x of c.b.picks) if (!c.data.entry(x.kind, x.id)) hits.push(gone(`magic.${x.uid}`, x.name ?? x.id))
      for (const m of c.b.martialArts) {
        if (!c.data.entry('martialarts', m.id)) hits.push(gone(`martial.${m.uid}`, m.name ?? m.id))
        for (const t of m.techniques) if (!c.data.entry('martialtechniques', t.id)) hits.push(gone(`martial.${m.uid}`, t.name ?? t.id))
      }
      // (a design's line is no catalog entry: its snapshot is the vehicle)
      for (const { x, path } of lines(c.b))
        if (x.id && !x.design && !x.id.startsWith('custom.') && !c.data.entry(x.kind, x.id)) hits.push(gone(path, x.snapshot?.name ?? x.name ?? x.id))
      for (const s of c.b.sins) for (const l of s.lifestyles ?? []) if (!c.data.entry('lifestyles', l.id)) hits.push(gone(`contacts.lifestyle.${l.uid}`, l.id))
      for (const pk of c.b.lifepath) if (!c.data.lifemodules[pk.id]) hits.push(gone(`method.${pk.id}`, pk.id))
      return hits
    },
  },
  {
    code: 'catalog.bookValue',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path, host } of lines(c.b)) {
        if (priced({ ...x, accessories: [] }, c.data, c.cr, host && priced({ ...host, accessories: [] }, c.data, c.cr)).ok) continue
        const e = entryOf(x, c.data)
        hits.push({ path, message: `${nameOf(c, x)}: a cost, Availability or Essence the app can’t read counts as 0.`, ...entryCite(e) })
      }
      return hits
    },
  },
  // what a formula had to assume (no rating given: worked out at rating 1…)
  {
    code: 'catalog.formula',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path, host } of lines(c.b)) {
        const { notes } = priced({ ...x, accessories: [] }, c.data, c.cr, host && priced({ ...host, accessories: [] }, c.data, c.cr))
        if (notes.length) hits.push({ path, message: `${nameOf(c, x)}: ${notes.join('; ')}.`, ...entryCite(entryOf(x, c.data)) })
      }
      return hits
    },
  },
  // an accessory that doesn't fit its host (the one fit engine, structure.ts fit): no hook the host offers (with the
  // GM's added slots, less its removed ones), too big for the hook, or no room left in a host that prints no capacity;
  // one with no usage, by its category's host. A vehicle's weapons sit in mounts and its other lines with no usage
  // are metered by modsOf (vehicle.mods)
  {
    code: 'catalog.accessoryHost',
    severity: 'error',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x => {
        const he = entryOf(x, c.data)
        if (!he) return []
        const path = `${PURCHASE_TAB[x.kind]}.${x.uid}`,
          vehicle = x.kind === 'vehicles',
          rating = ratingOf(x, he),
          extra = x.addedSlots ?? []
        const lines = x.accessories.filter(a => !a.derived && !(vehicle && a.kind === 'weapons'))
        // (an accessory's qty is the line's whole: on a line of 2 guns, 2 smartguns are one a gun)
        const items = lines.map(a => ({ uid: a.uid, entry: entryOf(a, c.data), qty: Math.ceil((a.qty ?? 1) / Math.max(1, x.qty ?? 1)) }))
        const roomed = !vehicle && capacityOf(he, rating) === null
        const unplaced = roomed ? new Set(mountSlots(he, [...fittedParts(x, c.data), ...items], rating, extra).unplaced) : new Set<string>()
        return lines.flatMap(a => {
          const e = entryOf(a, c.data)
          if (!e || e.attrs.usage === 'carried' || (vehicle && !structureOf(e).usages.length)) return [] // (carried: catalog.carried)
          const f = fit(he, e, [], 1, extra)
          const hit = (why: string) => [{ path, message: `${nameOf(c, a)} ${why}, not ${nameOf(c, x)}.`, ...entryCite(e) }]
          if (f.ok === null) return fitsHost(c.data.categories, e, he, extra) === false ? hit(`is for ${hostsOf(c.data.categories, e).join(' or ')}`) : []
          if (f.reason === 'hook') return hit(`goes into ${f.hooks.map(slotLabel).join(' or ')}`)
          if (f.reason === 'size') return hit(`is too big for the ${f.hooks.map(slotLabel).join(' or ')} of`)
          return unplaced.has(a.uid) ? hit(`has no room left in ${structureOf(e).fits.map(slotLabel).join(' or ')}`) : []
        })
      }),
  },
  // an item Commlink6 has as stand-alone (usage="carried": ammunition, a tripod drone, a harness) fitted to a host, as an
  // older file may have it: kept, a warning (owner 2026-10-29); buy it on its own
  {
    code: 'catalog.carried',
    severity: 'warning',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x =>
        x.accessories.flatMap(a => {
          const e = entryOf(a, c.data),
            he = entryOf(x, c.data)
          // not fitted: an ammunition type under its ammunition line (the Ledger's per-type ammo), and a refill of its host
          // (a carried consumable of the host's own class under it: Medkit supplies under a Medkit, a nanotech refill)
          const refill = !!e?.attrs.class && e.attrs.class === he?.attrs.class && !structureOf(e).usages.length
          return e?.attrs.usage === 'carried' && a.kind !== 'ammotypes' && !refill
            ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`, message: `${nameOf(c, a)} is carried on its own, not fitted to ${nameOf(c, x)}.`, ...entryCite(e) }]
            : []
        }),
      ),
  },
  // an accessory whose host fails one of its requirements (structure.ts requirementsOf: Commlink6's DATA_ITEM tests and
  // selreq groups; a holster's weapon size, a silencer's weapon type): a warning for now (owner ruling 5, 2026-10-29),
  // to become an error once the owner has reviewed it on real runners
  {
    code: 'catalog.requirement',
    severity: 'warning',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x => {
        const he = entryOf(x, c.data)
        return x.accessories.flatMap(a => {
          const e = entryOf(a, c.data)
          const failed = e && he ? requirementsOf(e, he).failed : []
          return failed.length
            ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`, message: `${nameOf(c, a)} needs ${failed.join('; ')} (on ${nameOf(c, x)}).`, ...entryCite(e) }]
            : []
        })
      }),
  }, // the accessories' bracketed capacity ([2], [Rating]) comes out of the host's capacity
  {
    code: 'catalog.capacity',
    severity: 'error',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x => {
        const he = entryOf(x, c.data),
          cap = capacityOf(he, ratingOf(x, he))
        if (cap === null || !x.accessories.length) return []
        const used = x.accessories.reduce((t, a) => {
          const e = entryOf(a, c.data)
          return t + capacityUsed(e, ratingOf(a, e))
        }, 0)
        return used > cap
          ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`, message: `${nameOf(c, x)}: its accessories take ${used} capacity; it has ${cap}.`, ...entryCite(he) }]
          : []
      }),
  },
  // an owned vehicle's or drone's mods past its slots, hardpoints or mounts, a weapon in no mount or too big for it,
  // autosofts past its Pilot (vehiclemods.ts): listed, never enforced (owner 2026-10-16)
  {
    code: 'vehicle.mods',
    severity: 'warning',
    tab: 'vehicles',
    check: c => c.b.purchases.filter(x => x.kind === 'vehicles').flatMap(x => modsOf(x, c.data).warnings.map(w => ({ path: `vehicles.${x.uid}`, ...w }))),
  },
  // a vehicle or drone a player designed (the Designer) needs its GM's approval: a warning a GM approves, never blocking;
  // one a GM made or approved needs nothing (owner 2026-10-16, BUILDER Q8); a design's line by its `design` or its
  // `design.<id>` line or snapshot id, so a file with `design` taken out still asks
  {
    code: DESIGN_APPROVAL,
    severity: 'warning',
    tab: 'vehicles',
    check: c =>
      c.b.purchases
        .filter(x => (x.design || [x.id, x.snapshot?.id].some(i => i?.startsWith('design.'))) && x.snapshot?.attrs.approved !== 'true')
        .filter(x => x.kind === 'vehicles' || !x.approved)
        .map(x =>
          x.kind === 'vehicles'
            ? { path: `vehicles.${x.uid}`, message: `Custom design: needs GM approval (${nameOf(c, x)}).`, source: 'DC', page: 155 }
            : { path: `${PURCHASE_TAB[x.kind]}.${x.uid}`, message: `Saved design: needs GM approval (${nameOf(c, x)}).` },
        ),
  },
  // a player's own add-on (the item builders' custom add-on, owner ruling 6) or any other `custom.` line the app can't re-derive
  // (only the builders' limbs and their increases are, from the CYBERLIMBS table): a warning until a GM approves it
  {
    code: CUSTOM_APPROVAL,
    severity: 'warning',
    tab: 'gear',
    check: c =>
      [...lines(c.b)]
        .map(l => ({ ...l, line: l.own ?? l.x }))
        .filter(({ line }) => line.id?.startsWith('custom.') && !limbSnapshot(line))
        .map(({ x, host }) => ({
          path: `${PURCHASE_TAB[(host ?? x).kind]}.${x.uid}`,
          message: `Custom ${host ? 'add-on' : 'item'}: needs GM approval (${nameOf(c, x)}${host ? ` on ${nameOf(c, host)}` : ''}).`,
        })),
  },
  // a vehicle or drone bought at a price other than its catalog/design price (career Ledger gmPrice): needs a GM's approval
  {
    code: PRICE_APPROVAL,
    severity: 'warning',
    tab: 'vehicles',
    check: c =>
      c.b.purchases
        .filter(x => x.gmPrice !== undefined)
        .map(x => ({
          path: `vehicles.${x.uid}`,
          message: `Bought at an adjusted price, ${x.gmPrice!.toLocaleString('en-US')}¥: needs GM approval (${nameOf(c, x)}).`,
        })),
  },
  // an owned critter past its limits (critters.ts: commands, special training, qualities, taming, bonding, Body for
  // critterware, Essence), and bonded qualities without the runner's Critter Bond path (SWC p. 139): warned, never refused
  {
    code: 'critter.rules',
    severity: 'warning',
    tab: 'critters',
    check: c =>
      c.b.purchases
        .filter(x => x.kind === 'critters')
        .flatMap(x => {
          const v = critterView(x, c.data, priced(x, c.data, c.cr).essence),
            bond =
              x.critterQualities?.some(q => q.how === 'bonded') && !c.b.qualities.some(q => /critter bond/i.test(c.data.qualities[q.id]?.name ?? q.name ?? ''))
          return [
            ...v.warnings,
            ...(bond
              ? [{ message: `${v.name}: qualities bought by the bond need the runner’s Critter Bond path (Permanent Improvement).`, source: 'SWC', page: 139 }]
              : []),
          ].map(w => ({ path: `critters.${x.uid}`, ...w }))
        }),
  },
  // a book sample keeps the numbers its stat block prints; where the rules give others, say so (the book isn't corrected)
  { code: 'sample.printed', severity: 'warning', tab: 'review', check: c => printedHits(c) },
]

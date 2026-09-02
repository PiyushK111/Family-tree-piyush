import { describe, expect, it } from 'vitest'
import type { Gender, Link, ParentKind, Person, SpouseStatus } from '../types'
import { buildGraph, relationLabels, type FamilyGraph } from './index'

let seq = 0

function person(id: string, gender: Gender, extra: Partial<Person> = {}): Person {
  return { id, name: id, gender, deceased: false, hasPhoto: false, ...extra }
}

function kids(parentIds: string[], childIds: string[], kind: ParentKind = 'biological'): Link[] {
  return parentIds.flatMap((from) =>
    childIds.map((to): Link => ({ id: `p${seq++}`, type: 'parent', from, to, kind })),
  )
}

function married(a: string, b: string, status: SpouseStatus = 'married'): Link {
  return { id: `s${seq++}`, type: 'spouse', from: a, to: b, status }
}

/**
 * One tree exercising every branch of the engine: three generations up on both
 * sides, two down, cousins at two removes, a spouse's family, and step / half /
 * adopted / divorced edge cases.
 *
 * Note how step-parents are modelled: `stepmom` gets a *parent* link to `me`
 * with kind 'step'. That single fact is what lets the engine derive both
 * "Step-Mother" and "Step-Brother".
 */
function fixture(): FamilyGraph {
  seq = 0
  const people = [
    person('me', 'male'),
    // Paternal line
    person('ggfP', 'male'),
    person('gfP', 'male'),
    person('gmP', 'female'),
    person('guncle', 'male'),
    person('dadCousin', 'male'),
    person('secCousin', 'female'),
    person('dad', 'male'),
    person('uncle', 'male'),
    person('auntByMarriage', 'female'),
    person('cousinP', 'male'),
    person('cousinChild', 'female'),
    // Maternal line
    person('gfM', 'male'),
    person('gmM', 'female'),
    person('mom', 'female'),
    person('masi', 'female'),
    person('cousinM', 'female'),
    // Siblings and blended family
    person('bro', 'male'),
    person('sis', 'female'),
    person('sisHusband', 'male'),
    person('nephew', 'male'),
    person('stepmom', 'female'),
    person('stepBro', 'male'),
    person('otherWoman', 'female'),
    person('halfSis', 'female'),
    // Ego's own household
    person('wife', 'female'),
    person('exWife', 'female'),
    person('son', 'male'),
    person('sonWife', 'female'),
    person('grandson', 'male'),
    person('adoptedSon', 'male'),
    // Wife's family
    person('wgf', 'male'),
    person('wf', 'male'),
    person('wm', 'female'),
    person('wsis', 'female'),
    person('wuncle', 'male'),
    // No links at all
    person('stranger', 'other'),
  ]

  const links: Link[] = [
    ...kids(['ggfP'], ['gfP', 'guncle']),
    ...kids(['guncle'], ['dadCousin']),
    ...kids(['dadCousin'], ['secCousin']),
    ...kids(['gfP', 'gmP'], ['dad', 'uncle']),
    married('gfP', 'gmP'),
    ...kids(['uncle', 'auntByMarriage'], ['cousinP']),
    married('uncle', 'auntByMarriage'),
    ...kids(['cousinP'], ['cousinChild']),

    ...kids(['gfM', 'gmM'], ['mom', 'masi']),
    married('gfM', 'gmM'),
    ...kids(['masi'], ['cousinM']),

    ...kids(['dad', 'mom'], ['me', 'bro', 'sis']),
    married('dad', 'mom'),
    married('sis', 'sisHusband'),
    ...kids(['bro'], ['nephew']),

    married('dad', 'stepmom'),
    ...kids(['stepmom'], ['me'], 'step'),
    ...kids(['stepmom'], ['stepBro']),
    ...kids(['dad', 'otherWoman'], ['halfSis']),

    married('me', 'wife'),
    married('me', 'exWife', 'divorced'),
    ...kids(['me', 'wife'], ['son']),
    ...kids(['me', 'wife'], ['adoptedSon'], 'adopted'),
    married('son', 'sonWife'),
    ...kids(['son', 'sonWife'], ['grandson']),

    ...kids(['wgf'], ['wf', 'wuncle']),
    ...kids(['wf', 'wm'], ['wife', 'wsis']),
    married('wf', 'wm'),
  ]

  return buildGraph(people, links)
}

describe('relationLabels', () => {
  const labels = relationLabels(fixture(), 'me')
  const label = (id: string) => labels.get(id)

  it('anchors on ego', () => {
    expect(label('me')).toBe('Me')
  })

  it('names direct ancestors, with side beyond parents', () => {
    expect(label('dad')).toBe('Father')
    expect(label('mom')).toBe('Mother')
    expect(label('gfP')).toBe('Paternal Grandfather')
    expect(label('gmP')).toBe('Paternal Grandmother')
    expect(label('gfM')).toBe('Maternal Grandfather')
    expect(label('gmM')).toBe('Maternal Grandmother')
    expect(label('ggfP')).toBe('Paternal Great-Grandfather')
  })

  it('names direct descendants', () => {
    expect(label('son')).toBe('Son')
    expect(label('grandson')).toBe('Grandson')
  })

  it('names siblings and their children', () => {
    expect(label('bro')).toBe('Brother')
    expect(label('sis')).toBe('Sister')
    expect(label('nephew')).toBe('Nephew')
  })

  it('names aunts and uncles by blood, with side', () => {
    expect(label('uncle')).toBe('Paternal Uncle')
    expect(label('masi')).toBe('Maternal Aunt')
    expect(label('guncle')).toBe('Paternal Grand-Uncle')
  })

  it('distinguishes an aunt by marriage from one by blood', () => {
    expect(label('auntByMarriage')).toBe('Paternal Aunt (by marriage)')
  })

  it('computes cousin degree and remove count', () => {
    expect(label('cousinP')).toBe('First Cousin (paternal)')
    expect(label('cousinM')).toBe('First Cousin (maternal)')
    // My cousin's child and my father's cousin are the same relation.
    expect(label('cousinChild')).toBe('First Cousin Once Removed (paternal)')
    expect(label('dadCousin')).toBe('First Cousin Once Removed (paternal)')
    expect(label('secCousin')).toBe('Second Cousin (paternal)')
  })

  it('handles step, half and adopted links', () => {
    expect(label('stepmom')).toBe('Step-Mother')
    expect(label('stepBro')).toBe('Step-Brother')
    expect(label('halfSis')).toBe('Half-Sister')
    expect(label('adoptedSon')).toBe('Adopted Son')
  })

  it('names ego’s own marriages, including former ones', () => {
    expect(label('wife')).toBe('Wife')
    expect(label('exWife')).toBe('Ex-Wife')
  })

  it('names people who married into the family', () => {
    expect(label('sisHusband')).toBe('Brother-in-law')
    expect(label('sonWife')).toBe('Daughter-in-law')
  })

  it('names the spouse’s side of the family', () => {
    expect(label('wf')).toBe('Father-in-law')
    expect(label('wm')).toBe('Mother-in-law')
    expect(label('wsis')).toBe('Sister-in-law')
    // No English single word exists, so fall back to a possessive phrase.
    expect(label('wuncle')).toBe("Wife's Paternal Uncle")
  })

  it('falls back for people with no traceable connection', () => {
    expect(label('stranger')).toBe('Relative')
  })
})

describe('relationLabels edge cases', () => {
  it('prefers a manual override over the computed label', () => {
    const g = buildGraph(
      [person('me', 'male'), person('u', 'male', { relationOverride: 'Kaka' })],
      [
        ...kids(['gp'], ['me']),
        { id: 'x1', type: 'parent', from: 'gp', to: 'u', kind: 'biological' },
      ],
    )
    expect(relationLabels(g, 'me').get('u')).toBe('Kaka')
  })

  it('returns nothing when ego is not in the tree', () => {
    const g = buildGraph([person('a', 'male')], [])
    expect(relationLabels(g, 'ghost').size).toBe(0)
  })

  it('ignores links pointing at deleted people', () => {
    const g = buildGraph(
      [person('me', 'male'), person('dad', 'male')],
      [
        ...kids(['dad'], ['me']),
        { id: 'dangling', type: 'parent', from: 'vanished', to: 'me', kind: 'biological' },
      ],
    )
    expect(relationLabels(g, 'me').get('dad')).toBe('Father')
    expect(relationLabels(g, 'me').size).toBe(2)
  })

  it('uses gender-neutral terms when gender is unknown', () => {
    const g = buildGraph(
      [person('me', 'male'), person('p', 'unknown'), person('c', 'other')],
      [...kids(['p'], ['me']), ...kids(['me'], ['c'])],
    )
    const labels = relationLabels(g, 'me')
    expect(labels.get('p')).toBe('Parent')
    expect(labels.get('c')).toBe('Child')
  })
})

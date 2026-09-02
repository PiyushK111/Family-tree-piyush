import type { Gender, ParentKind, Person, SpouseStatus } from '../types'
import { children, parents, spouses, type FamilyGraph } from './graph'

export type Side = 'paternal' | 'maternal' | 'none'

export type Modifier = 'none' | 'step' | 'half' | 'adopted' | 'foster'

/**
 * A blood relationship expressed as coordinates rather than a word:
 * `up` generations to the closest common ancestor, then `down` generations to
 * the person. Every English (or regional) term is derived from this pair.
 */
export interface BloodRel {
  kind: 'blood'
  up: number
  down: number
  side: Side
  modifier: Modifier
  /** Gender of the person being described, needed to pick Father vs Mother. */
  gender: Gender
}

export type Relation =
  | { kind: 'self' }
  | BloodRel
  /** Ego's own husband/wife/partner. */
  | { kind: 'spouse'; status: SpouseStatus; gender: Gender }
  /** Married to one of ego's blood relatives, e.g. an uncle's wife. */
  | { kind: 'spouse-of'; via: BloodRel; status: SpouseStatus; gender: Gender }
  /** A blood relative of ego's spouse, e.g. a father-in-law. `via` describes
   *  the person relative to that spouse. */
  | { kind: 'spouse-side'; via: BloodRel; spouseStatus: SpouseStatus; spouseGender: Gender }
  | { kind: 'unrelated' }

interface AncestorInfo {
  up: number
  /** Which of the start person's own parents the path left through. */
  side: Side
  /** Kind of that very first hop, which is what makes a "Step-Father". */
  kind: ParentKind
}

function sideOf(gender: Gender | undefined): Side {
  if (gender === 'male') return 'paternal'
  if (gender === 'female') return 'maternal'
  return 'none'
}

/**
 * Every ancestor of `startId` with its generation distance. Breadth-first, so
 * the first time a person is reached is via the shortest path; parents are
 * ordered male-first in the graph, which makes the paternal line the tie-break.
 */
export function ancestorsOf(g: FamilyGraph, startId: string): Map<string, AncestorInfo> {
  const out = new Map<string, AncestorInfo>([
    [startId, { up: 0, side: 'none', kind: 'biological' }],
  ])
  const queue = [startId]

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    const info = out.get(current)!
    for (const edge of parents(g, current)) {
      if (out.has(edge.personId)) continue
      out.set(edge.personId, {
        up: info.up + 1,
        side: info.up === 0 ? sideOf(g.people.get(edge.personId)?.gender) : info.side,
        kind: info.up === 0 ? edge.kind : info.kind,
      })
      queue.push(edge.personId)
    }
  }
  return out
}

function modifierOf(
  g: FamilyGraph,
  fromId: string,
  target: Person,
  up: number,
  down: number,
  firstHop: ParentKind,
): Modifier {
  const fromKind = (kind: ParentKind): Modifier => (kind === 'biological' ? 'none' : kind)

  // A parent of ego.
  if (up === 1 && down === 0) return fromKind(firstHop)

  // A child of ego — the kind lives on ego's own link down to them.
  if (up === 0 && down === 1) {
    const edge = children(g, fromId).find((c) => c.personId === target.id)
    return fromKind(edge?.kind ?? 'biological')
  }

  // A sibling. Step wins over half: either side of the shared parent may be
  // the step link (my step-parent's child, or my parent's step-child).
  if (up === 1 && down === 1) {
    if (firstHop === 'step') return 'step'
    const mine = new Map(parents(g, fromId).map((p) => [p.personId, p.kind]))
    const theirs = parents(g, target.id)
    const shared = theirs.filter((p) => mine.has(p.personId))
    if (shared.some((p) => p.kind === 'step')) return 'step'
    if (shared.length === 1 && mine.size >= 2 && theirs.length >= 2) return 'half'
    return 'none'
  }

  return 'none'
}

/**
 * Closest common ancestor between two already-computed ancestor maps. Ties on
 * total distance are broken toward the smaller `up`, which prefers the reading
 * closer to ego (e.g. "Nephew" over a longer equivalent path).
 */
function bloodRelation(
  g: FamilyGraph,
  fromId: string,
  fromAnc: Map<string, AncestorInfo>,
  targetAnc: Map<string, AncestorInfo>,
  target: Person,
): BloodRel | null {
  let bestCost = Number.POSITIVE_INFINITY
  let up = 0
  let down = 0
  let side: Side = 'none'
  let firstHop: ParentKind = 'biological'

  for (const [ancestorId, info] of fromAnc) {
    const theirs = targetAnc.get(ancestorId)
    if (!theirs) continue
    const cost = info.up + theirs.up
    if (cost < bestCost || (cost === bestCost && info.up < up)) {
      bestCost = cost
      up = info.up
      down = theirs.up
      side = info.side
      firstHop = info.kind
    }
  }

  if (bestCost === Number.POSITIVE_INFINITY) return null
  return {
    kind: 'blood',
    up,
    down,
    side,
    modifier: modifierOf(g, fromId, target, up, down, firstHop),
    gender: target.gender,
  }
}

/**
 * How `target` is related to `egoId`. Resolution order is deliberate: blood
 * beats marriage, and being married to ego's relative beats being a relative of
 * ego's spouse, because the former is the closer connection.
 */
function relationTo(
  g: FamilyGraph,
  egoId: string,
  egoAnc: Map<string, AncestorInfo>,
  anc: (id: string) => Map<string, AncestorInfo>,
  target: Person,
): Relation {
  if (target.id === egoId) return { kind: 'self' }

  const egoSpouses = spouses(g, egoId)

  const direct = egoSpouses.find((s) => s.personId === target.id)
  if (direct) return { kind: 'spouse', status: direct.status, gender: target.gender }

  const blood = bloodRelation(g, egoId, egoAnc, anc(target.id), target)
  if (blood) return blood

  // Married into the family: closest blood relative of ego that they married.
  let best: Relation | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (const sp of spouses(g, target.id)) {
    const person = g.people.get(sp.personId)
    if (!person || sp.personId === egoId) continue
    const via = bloodRelation(g, egoId, egoAnc, anc(sp.personId), person)
    if (!via) continue
    const cost = via.up + via.down
    if (cost < bestCost) {
      bestCost = cost
      best = { kind: 'spouse-of', via, status: sp.status, gender: target.gender }
    }
  }
  if (best) return best

  // Ego's spouse's side of the family.
  for (const es of egoSpouses) {
    const spousePerson = g.people.get(es.personId)
    if (!spousePerson) continue
    const via = bloodRelation(g, es.personId, anc(es.personId), anc(target.id), target)
    if (!via) continue
    const cost = via.up + via.down
    if (cost < bestCost) {
      bestCost = cost
      best = {
        kind: 'spouse-side',
        via,
        spouseStatus: es.status,
        spouseGender: spousePerson.gender,
      }
    }
  }
  if (best) return best

  return { kind: 'unrelated' }
}

/** Relation descriptors for everyone in the tree, keyed by person id. */
export function computeRelations(g: FamilyGraph, egoId: string): Map<string, Relation> {
  const result = new Map<string, Relation>()
  if (!g.people.has(egoId)) return result

  const cache = new Map<string, Map<string, AncestorInfo>>()
  const anc = (id: string): Map<string, AncestorInfo> => {
    let found = cache.get(id)
    if (!found) {
      found = ancestorsOf(g, id)
      cache.set(id, found)
    }
    return found
  }

  const egoAnc = anc(egoId)
  for (const person of g.people.values()) {
    result.set(person.id, relationTo(g, egoId, egoAnc, anc, person))
  }
  return result
}

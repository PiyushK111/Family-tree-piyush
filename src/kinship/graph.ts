import type { Link, ParentKind, Person, SpouseStatus } from '../types'

export interface ParentEdge {
  personId: string
  kind: ParentKind
}

export interface SpouseEdge {
  personId: string
  status: SpouseStatus
  since?: string
}

/**
 * Adjacency view of the family. Built once per data change and consumed by the
 * kinship engine and the layout builder, both of which are pure functions of it.
 */
export interface FamilyGraph {
  people: Map<string, Person>
  /** child id -> its parents. Male parents come first so "paternal" wins ties. */
  parentsOf: Map<string, ParentEdge[]>
  /** parent id -> its children, ordered by birth date when known. */
  childrenOf: Map<string, ParentEdge[]>
  spousesOf: Map<string, SpouseEdge[]>
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

/** Sorts undated people last, otherwise oldest first. */
function byBirthDate(people: Map<string, Person>) {
  return (a: ParentEdge, b: ParentEdge): number => {
    const x = people.get(a.personId)?.birthDate
    const y = people.get(b.personId)?.birthDate
    if (x && y) return x.localeCompare(y)
    if (x) return -1
    if (y) return 1
    return 0
  }
}

export function buildGraph(people: Person[], links: Link[]): FamilyGraph {
  const byId = new Map(people.map((p) => [p.id, p]))
  const parentsOf = new Map<string, ParentEdge[]>()
  const childrenOf = new Map<string, ParentEdge[]>()
  const spousesOf = new Map<string, SpouseEdge[]>()

  for (const link of links) {
    // Skip dangling links so a half-deleted person can never crash the engine.
    if (!byId.has(link.from) || !byId.has(link.to)) continue

    if (link.type === 'parent') {
      push(parentsOf, link.to, { personId: link.from, kind: link.kind })
      push(childrenOf, link.from, { personId: link.to, kind: link.kind })
    } else {
      push(spousesOf, link.from, {
        personId: link.to,
        status: link.status,
        since: link.since,
      })
      push(spousesOf, link.to, {
        personId: link.from,
        status: link.status,
        since: link.since,
      })
    }
  }

  // Deterministic ordering. Parents male-first makes the paternal line the
  // tie-breaker when someone is reachable through both sides; children by age
  // keeps siblings in a natural left-to-right order on the canvas.
  for (const parents of parentsOf.values()) {
    parents.sort((a, b) => {
      const ga = byId.get(a.personId)?.gender
      const gb = byId.get(b.personId)?.gender
      if (ga === gb) return 0
      if (ga === 'male') return -1
      if (gb === 'male') return 1
      return 0
    })
  }
  for (const children of childrenOf.values()) children.sort(byBirthDate(byId))

  return { people: byId, parentsOf, childrenOf, spousesOf }
}

export const parents = (g: FamilyGraph, id: string): ParentEdge[] => g.parentsOf.get(id) ?? []
export const children = (g: FamilyGraph, id: string): ParentEdge[] => g.childrenOf.get(id) ?? []
export const spouses = (g: FamilyGraph, id: string): SpouseEdge[] => g.spousesOf.get(id) ?? []

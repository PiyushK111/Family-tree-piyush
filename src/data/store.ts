import type { Link, ParentLink, Person, SpouseLink, TreeMeta } from '../types'

export interface TreeSnapshot {
  meta: TreeMeta | null
  people: Person[]
  links: Link[]
  /** person id -> thumbnail data URL. Arrives after the tree, so cards paint fast. */
  photos: Map<string, string>
  loading: boolean
  /** Set when a listener failed, e.g. rules rejected the read. */
  error: string | null
}

export type NewParentLink = Omit<ParentLink, 'id'>
export type NewSpouseLink = Omit<SpouseLink, 'id'>

export interface Store {
  readonly mode: 'firebase' | 'local'
  /** Pushes a fresh snapshot on every change. Returns an unsubscribe function. */
  subscribe(onChange: (snapshot: TreeSnapshot) => void): () => void
  addPerson(person: Omit<Person, 'id'>, photo?: string): Promise<string>
  /** `photo: null` removes the existing photo; `undefined` leaves it alone. */
  updatePerson(id: string, patch: Partial<Person>, photo?: string | null): Promise<void>
  /** Also removes every link that referenced the person. */
  deletePerson(id: string): Promise<void>
  addLink(link: NewParentLink | NewSpouseLink): Promise<string>
  deleteLink(id: string): Promise<void>
  setRoot(personId: string): Promise<void>
  renameTree(name: string): Promise<void>
}

export const EMPTY_SNAPSHOT: TreeSnapshot = {
  meta: null,
  people: [],
  links: [],
  photos: new Map(),
  loading: true,
  error: null,
}

/** True when the same pair is already linked, so we never create a duplicate. */
export function linkExists(links: Link[], candidate: NewParentLink | NewSpouseLink): boolean {
  return links.some((link) => {
    if (link.type !== candidate.type) return false
    if (link.type === 'parent') {
      return link.from === candidate.from && link.to === candidate.to
    }
    // Spouse links are unordered.
    return (
      (link.from === candidate.from && link.to === candidate.to) ||
      (link.from === candidate.to && link.to === candidate.from)
    )
  })
}

/**
 * Guards against a cycle — someone becoming their own ancestor — which would
 * make the layout non-terminating and the kinship coordinates meaningless.
 */
export function wouldCreateCycle(links: Link[], parentId: string, childId: string): boolean {
  if (parentId === childId) return true
  const parentsOf = new Map<string, string[]>()
  for (const link of links) {
    if (link.type !== 'parent') continue
    const list = parentsOf.get(link.to)
    if (list) list.push(link.from)
    else parentsOf.set(link.to, [link.from])
  }
  // Walk up from the proposed parent; if we reach the child, it is a cycle.
  const seen = new Set<string>([parentId])
  const queue = [parentId]
  for (let i = 0; i < queue.length; i++) {
    for (const ancestor of parentsOf.get(queue[i]) ?? []) {
      if (ancestor === childId) return true
      if (seen.has(ancestor)) continue
      seen.add(ancestor)
      queue.push(ancestor)
    }
  }
  return false
}

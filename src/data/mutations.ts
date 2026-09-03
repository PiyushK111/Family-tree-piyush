import type { ParentKind, Person, SpouseStatus } from '../types'
import { parents, spouses, type FamilyGraph } from '../kinship'
import {
  linkExists,
  wouldCreateCycle,
  type NewParentLink,
  type NewSpouseLink,
  type Store,
  type TreeSnapshot,
} from './store'

export type Direction = 'parent' | 'child' | 'spouse' | 'sibling'

export interface NewRelative {
  person: Omit<Person, 'id'>
  photo?: string
  /** For parent/child: how they are related. */
  kind?: ParentKind
  /** For spouse. */
  status?: SpouseStatus
  since?: string
}

/** Thrown for rule violations the user can fix, so the UI can show the text. */
export class MutationError extends Error {}

function primaryParentIds(g: FamilyGraph, personId: string): string[] {
  const all = parents(g, personId)
  const primary = all.filter((p) => p.kind === 'biological' || p.kind === 'adopted')
  return (primary.length > 0 ? primary : all).map((p) => p.personId)
}

async function link(
  store: Store,
  snapshot: TreeSnapshot,
  candidate: NewParentLink | NewSpouseLink,
): Promise<void> {
  if (linkExists(snapshot.links, candidate)) return
  if (
    candidate.type === 'parent' &&
    wouldCreateCycle(snapshot.links, candidate.from, candidate.to)
  ) {
    throw new MutationError(
      'That would make someone their own ancestor. Check which way round the link goes.',
    )
  }
  await store.addLink(candidate)
}

/**
 * Adds a brand new person and connects them to `anchorId` in the given
 * direction. Returns the new person's id.
 *
 * Two conveniences are built in: a child added to someone with exactly one
 * spouse is attached to both of them, and a sibling is attached to every parent
 * the anchor already has.
 */
export async function addRelative(
  store: Store,
  snapshot: TreeSnapshot,
  graph: FamilyGraph,
  anchorId: string,
  direction: Direction,
  input: NewRelative,
): Promise<string> {
  const kind: ParentKind = input.kind ?? 'biological'

  if (direction === 'sibling') {
    const parentIds = primaryParentIds(graph, anchorId)
    if (parentIds.length === 0) {
      throw new MutationError(
        'Add a parent first — siblings are connected through a shared parent.',
      )
    }
    const newId = await store.addPerson(input.person, input.photo)
    for (const parentId of parentIds) {
      await link(store, snapshot, { type: 'parent', from: parentId, to: newId, kind })
    }
    return newId
  }

  const newId = await store.addPerson(input.person, input.photo)

  if (direction === 'parent') {
    await link(store, snapshot, { type: 'parent', from: newId, to: anchorId, kind })
    return newId
  }

  if (direction === 'child') {
    await link(store, snapshot, { type: 'parent', from: anchorId, to: newId, kind })
    const married = spouses(graph, anchorId).filter((s) => s.status !== 'divorced')
    if (married.length === 1) {
      await link(store, snapshot, {
        type: 'parent',
        from: married[0].personId,
        to: newId,
        kind,
      })
    }
    return newId
  }

  await link(store, snapshot, {
    type: 'spouse',
    from: anchorId,
    to: newId,
    status: input.status ?? 'married',
    since: input.since,
  })
  return newId
}

/** Connects two people who are both already in the tree. */
export async function connectExisting(
  store: Store,
  snapshot: TreeSnapshot,
  anchorId: string,
  otherId: string,
  direction: Exclude<Direction, 'sibling'>,
  options: { kind?: ParentKind; status?: SpouseStatus } = {},
): Promise<void> {
  if (anchorId === otherId) {
    throw new MutationError('Pick a different person.')
  }
  if (direction === 'spouse') {
    await link(store, snapshot, {
      type: 'spouse',
      from: anchorId,
      to: otherId,
      status: options.status ?? 'married',
    })
    return
  }
  const kind = options.kind ?? 'biological'
  const from = direction === 'parent' ? otherId : anchorId
  const to = direction === 'parent' ? anchorId : otherId
  await link(store, snapshot, { type: 'parent', from, to, kind })
}

export interface ImportSummary {
  people: number
  links: number
  photos: number
}

/**
 * Loads an exported tree into the current store.
 *
 * Person ids are remapped rather than reused: Firestore assigns its own
 * document ids, so a tree exported from the browser-only store cannot keep its
 * keys. Links are rewritten through that mapping, which is why people must all
 * be created first.
 */
export async function importTree(
  store: Store,
  json: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  let parsed: {
    meta?: { rootPersonId?: string; name?: string }
    people?: Person[]
    links?: Array<Record<string, string>>
    photos?: Record<string, string>
  }
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new MutationError('That file is not valid JSON.')
  }

  const people = parsed.people
  const links = parsed.links ?? []
  if (!Array.isArray(people) || people.length === 0) {
    throw new MutationError('That file has no people in it, so it is not a family tree export.')
  }

  const photos = parsed.photos ?? {}
  const idMap = new Map<string, string>()
  const total = people.length + links.length
  let done = 0
  let photoCount = 0

  for (const person of people) {
    const { id, ...fields } = person
    const photo = photos[id]
    if (photo) photoCount++
    const newId = await store.addPerson({ ...fields, hasPhoto: Boolean(photo) }, photo)
    idMap.set(id, newId)
    onProgress?.(++done, total)
  }

  for (const link of links) {
    const from = idMap.get(link.from)
    const to = idMap.get(link.to)
    // Silently skip links whose endpoints did not come through.
    if (from && to) {
      if (link.type === 'spouse') {
        await store.addLink({
          type: 'spouse',
          from,
          to,
          status: (link.status as SpouseStatus) ?? 'married',
          since: link.since,
        })
      } else {
        await store.addLink({
          type: 'parent',
          from,
          to,
          kind: (link.kind as ParentKind) ?? 'biological',
        })
      }
    }
    onProgress?.(++done, total)
  }

  const root = parsed.meta?.rootPersonId ? idMap.get(parsed.meta.rootPersonId) : undefined
  if (root) await store.setRoot(root)
  if (parsed.meta?.name) await store.renameTree(parsed.meta.name).catch(() => undefined)

  return { people: people.length, links: links.length, photos: photoCount }
}

/**
 * Deletes a person along with their links. Refuses to delete the person the
 * tree is centred on, since every relation label is computed from them.
 */
export async function removePerson(
  store: Store,
  snapshot: TreeSnapshot,
  personId: string,
): Promise<void> {
  if (snapshot.meta?.rootPersonId === personId) {
    throw new MutationError(
      'This is the person the tree is centred on. Centre it on someone else first.',
    )
  }
  await store.deletePerson(personId)
}

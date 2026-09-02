import type { Link, Person, TreeMeta } from '../types'
import {
  type NewParentLink,
  type NewSpouseLink,
  type Store,
  type TreeSnapshot,
} from './store'

const KEY = 'family-tree:local:v1'

interface Persisted {
  meta: TreeMeta
  people: Person[]
  links: Link[]
  photos: Record<string, string>
}

const id = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

function person(name: string, gender: Person['gender'], extra: Partial<Person> = {}): Person {
  return { id: id(), name, gender, deceased: false, hasPhoto: false, ...extra }
}

/**
 * A small starter family so the canvas is never empty on first run: three
 * generations, both sides, a spouse and a cousin. Enough to show what the
 * kinship labels do before any real data is entered.
 */
function seed(): Persisted {
  const me = person('You', 'male')
  const dad = person('Father', 'male')
  const mom = person('Mother', 'female')
  const gfP = person('Grandfather', 'male')
  const gmP = person('Grandmother', 'female')
  const gfM = person('Nana', 'male')
  const gmM = person('Nani', 'female')
  const bro = person('Brother', 'male')
  const uncle = person('Uncle', 'male')
  const cousin = person('Cousin', 'female')
  const wife = person('Wife', 'female')
  const son = person('Son', 'male')

  const people = [me, dad, mom, gfP, gmP, gfM, gmM, bro, uncle, cousin, wife, son]

  const parent = (from: Person, to: Person): Link => ({
    id: id(),
    type: 'parent',
    from: from.id,
    to: to.id,
    kind: 'biological',
  })
  const spouse = (a: Person, b: Person): Link => ({
    id: id(),
    type: 'spouse',
    from: a.id,
    to: b.id,
    status: 'married',
  })

  const links: Link[] = [
    spouse(gfP, gmP),
    parent(gfP, dad),
    parent(gmP, dad),
    parent(gfP, uncle),
    parent(gmP, uncle),
    spouse(gfM, gmM),
    parent(gfM, mom),
    parent(gmM, mom),
    spouse(dad, mom),
    parent(dad, me),
    parent(mom, me),
    parent(dad, bro),
    parent(mom, bro),
    parent(uncle, cousin),
    spouse(me, wife),
    parent(me, son),
    parent(wife, son),
  ]

  return {
    meta: {
      id: 'local',
      name: 'My Family',
      rootPersonId: me.id,
      ownerEmail: '',
      editors: [],
    },
    people,
    links,
    photos: {},
  }
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch {
    // Corrupt or unavailable storage falls through to a fresh seed.
  }
  const fresh = seed()
  write(fresh)
  return fresh
}

function write(data: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Private browsing or a full quota. The in-memory copy still works for
    // this session, so surface nothing and keep going.
  }
}

/**
 * Browser-only store used when Firebase is not configured. Keeps the app fully
 * usable offline and gives the UI something to render during development.
 */
export function createLocalStore(): Store {
  let data = read()
  const listeners = new Set<(s: TreeSnapshot) => void>()

  const snapshot = (): TreeSnapshot => ({
    meta: data.meta,
    people: [...data.people],
    links: [...data.links],
    photos: new Map(Object.entries(data.photos)),
    loading: false,
    error: null,
  })

  const commit = (): void => {
    write(data)
    const snap = snapshot()
    for (const listener of listeners) listener(snap)
  }

  // Keep two tabs of the same browser in step.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY || !event.newValue) return
    try {
      data = JSON.parse(event.newValue) as Persisted
      const snap = snapshot()
      for (const listener of listeners) listener(snap)
    } catch {
      // Ignore an unparseable write from another tab.
    }
  }

  return {
    mode: 'local',

    subscribe(onChange) {
      listeners.add(onChange)
      if (listeners.size === 1) window.addEventListener('storage', onStorage)
      onChange(snapshot())
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },

    async addPerson(newPerson, photo) {
      const created: Person = { ...newPerson, id: id(), hasPhoto: Boolean(photo) }
      data.people.push(created)
      if (photo) data.photos[created.id] = photo
      commit()
      return created.id
    },

    async updatePerson(personId, patch, photo) {
      data.people = data.people.map((p) => (p.id === personId ? { ...p, ...patch } : p))
      if (photo === null) {
        delete data.photos[personId]
      } else if (photo !== undefined) {
        data.photos[personId] = photo
      }
      const hasPhoto = Boolean(data.photos[personId])
      data.people = data.people.map((p) => (p.id === personId ? { ...p, hasPhoto } : p))
      commit()
    },

    async deletePerson(personId) {
      data.people = data.people.filter((p) => p.id !== personId)
      data.links = data.links.filter((l) => l.from !== personId && l.to !== personId)
      delete data.photos[personId]
      commit()
    },

    async addLink(link) {
      const created = { ...link, id: id() } as Link
      data.links.push(created)
      commit()
      return created.id
    },

    async deleteLink(linkId) {
      data.links = data.links.filter((l) => l.id !== linkId)
      commit()
    },

    async setRoot(personId) {
      data.meta = { ...data.meta, rootPersonId: personId }
      commit()
    },

    async renameTree(name) {
      data.meta = { ...data.meta, name }
      commit()
    },
  }
}

/** Wipes the local tree back to the starter family. */
export function resetLocalStore(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

export function exportLocalJson(): string {
  return JSON.stringify(read(), null, 2)
}

/** Restores a previously exported file. Throws if the shape is wrong. */
export function importLocalJson(json: string): void {
  const parsed = JSON.parse(json) as Partial<Persisted>
  if (!parsed.meta || !Array.isArray(parsed.people) || !Array.isArray(parsed.links)) {
    throw new Error('That file is not a family tree export.')
  }
  write({
    meta: parsed.meta as TreeMeta,
    people: parsed.people as Person[],
    links: parsed.links as Link[],
    photos: parsed.photos ?? {},
  })
}

export type { NewParentLink, NewSpouseLink }

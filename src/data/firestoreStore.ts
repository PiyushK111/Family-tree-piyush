import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Link, Person, TreeMeta } from '../types'
import { type NewParentLink, type NewSpouseLink, type Store, type TreeSnapshot } from './store'

/**
 * Firestore rejects `undefined` field values, and the person form produces them
 * for every field left blank. Blanks are dropped so the document stays sparse.
 */
function clean<T extends object>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined && v !== '') out[key] = v
  }
  return out
}

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied') {
    return 'Firestore rules rejected that. Check the tree exists and your email is in its editors list.'
  }
  if (code === 'unavailable') return 'Cannot reach Firestore. Check your connection.'
  return (error as Error)?.message ?? 'Something went wrong talking to Firestore.'
}

/**
 * Live Firestore-backed store. Four listeners (meta, people, links, photos) are
 * merged into one snapshot; photos are separate so the tree paints before the
 * images finish downloading.
 */
export function createFirestoreStore(db: Firestore, treeId: string): Store {
  const treeRef = doc(db, 'trees', treeId)
  const peopleRef = collection(db, 'trees', treeId, 'people')
  const linksRef = collection(db, 'trees', treeId, 'links')
  const photosRef = collection(db, 'trees', treeId, 'photos')

  let state: TreeSnapshot = {
    meta: null,
    people: [],
    links: [],
    photos: new Map(),
    loading: true,
    error: null,
  }
  const listeners = new Set<(s: TreeSnapshot) => void>()
  let ready = { meta: false, people: false, links: false }

  const emit = (): void => {
    for (const listener of listeners) listener(state)
  }
  const patch = (next: Partial<TreeSnapshot>): void => {
    state = { ...state, ...next }
    emit()
  }
  const settled = (): boolean => ready.meta && ready.people && ready.links

  return {
    mode: 'firebase',

    subscribe(onChange) {
      listeners.add(onChange)
      onChange(state)

      if (listeners.size > 1) {
        return () => {
          listeners.delete(onChange)
        }
      }

      ready = { meta: false, people: false, links: false }

      const unsubMeta = onSnapshot(
        treeRef,
        (snap) => {
          ready.meta = true
          const data = snap.data()
          patch({
            meta: snap.exists()
              ? ({ id: snap.id, ...data } as TreeMeta)
              : null,
            loading: !settled(),
            error: null,
          })
        },
        (error) => {
          ready.meta = true
          patch({ loading: !settled(), error: friendlyError(error) })
        },
      )

      const unsubPeople = onSnapshot(
        peopleRef,
        (snap) => {
          ready.people = true
          patch({
            people: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person),
            loading: !settled(),
          })
        },
        (error) => {
          ready.people = true
          patch({ loading: !settled(), error: friendlyError(error) })
        },
      )

      const unsubLinks = onSnapshot(
        linksRef,
        (snap) => {
          ready.links = true
          patch({
            links: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Link),
            loading: !settled(),
          })
        },
        (error) => {
          ready.links = true
          patch({ loading: !settled(), error: friendlyError(error) })
        },
      )

      const unsubPhotos = onSnapshot(
        photosRef,
        (snap) => {
          const photos = new Map<string, string>()
          for (const d of snap.docs) {
            const url = (d.data() as { dataUrl?: string }).dataUrl
            if (url) photos.set(d.id, url)
          }
          patch({ photos })
        },
        // A photo read failure is not fatal — placeholders are fine.
        () => undefined,
      )

      return () => {
        listeners.delete(onChange)
        if (listeners.size > 0) return
        unsubMeta()
        unsubPeople()
        unsubLinks()
        unsubPhotos()
      }
    },

    async addPerson(person, photo) {
      const created = await addDoc(peopleRef, clean({ ...person, hasPhoto: Boolean(photo) }))
      if (photo) {
        await setDoc(doc(photosRef, created.id), { dataUrl: photo })
      }
      return created.id
    },

    async updatePerson(id, changes, photo) {
      if (photo === null) {
        await deleteDoc(doc(photosRef, id)).catch(() => undefined)
      } else if (photo !== undefined) {
        await setDoc(doc(photosRef, id), { dataUrl: photo })
      }

      // Blank fields must be actively removed, not just omitted, or an old value
      // lingers after the user clears the input.
      const update: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(changes)) {
        update[key] = value === undefined || value === '' ? null : value
      }
      if (photo !== undefined) update.hasPhoto = photo !== null
      if (Object.keys(update).length > 0) {
        await updateDoc(doc(peopleRef, id), update)
      }
    },

    async deletePerson(id) {
      const batch = writeBatch(db)
      batch.delete(doc(peopleRef, id))
      batch.delete(doc(photosRef, id))
      for (const link of state.links) {
        if (link.from === id || link.to === id) batch.delete(doc(linksRef, link.id))
      }
      await batch.commit()
    },

    async addLink(link: NewParentLink | NewSpouseLink) {
      const created = await addDoc(linksRef, clean(link))
      return created.id
    },

    async deleteLink(id) {
      await deleteDoc(doc(linksRef, id))
    },

    async setRoot(personId) {
      await updateDoc(treeRef, { rootPersonId: personId })
    },

    async renameTree(name) {
      await updateDoc(treeRef, { name })
    },
  }
}

import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { firebaseConfigured, getFirebase, googleProvider, TREE_ID } from '../firebase'
import { buildGraph, relationLabels, type FamilyGraph } from '../kinship'
import { createFirestoreStore } from './firestoreStore'
import { createLocalStore } from './localStore'
import { EMPTY_SNAPSHOT, type Store, type TreeSnapshot } from './store'

export interface TreeContextValue {
  store: Store
  snapshot: TreeSnapshot
  graph: FamilyGraph
  /** person id -> kinship label, computed from `egoId`. */
  relations: Map<string, string>
  /** Whose point of view the labels are from. */
  egoId: string
  /** The canonical "me" stored on the tree. */
  rootId: string
  viewFrom: string | null
  setViewFrom: (personId: string | null) => void
  user: User | null
  authReady: boolean
  canEdit: boolean
  /** Why editing is unavailable, or null when it is available. */
  editBlockedReason: string | null
  signIn: () => Promise<void>
  signOutNow: () => Promise<void>
}

const TreeContext = createContext<TreeContextValue | null>(null)

export function TreeProvider({ children }: { children: ReactNode }) {
  const store = useMemo<Store>(() => {
    const handles = getFirebase()
    return handles ? createFirestoreStore(handles.db, TREE_ID) : createLocalStore()
  }, [])

  const [snapshot, setSnapshot] = useState<TreeSnapshot>(EMPTY_SNAPSHOT)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [viewFrom, setViewFrom] = useState<string | null>(null)

  useEffect(() => store.subscribe(setSnapshot), [store])

  useEffect(() => {
    const handles = getFirebase()
    if (!handles) return
    return onAuthStateChanged(handles.auth, (next) => {
      setUser(next)
      setAuthReady(true)
    })
  }, [])

  const graph = useMemo(
    () => buildGraph(snapshot.people, snapshot.links),
    [snapshot.people, snapshot.links],
  )

  // Fall back to any person so a tree with no root set still renders.
  const rootId = snapshot.meta?.rootPersonId ?? snapshot.people[0]?.id ?? ''
  const egoId = viewFrom && graph.people.has(viewFrom) ? viewFrom : rootId

  const relations = useMemo(() => relationLabels(graph, egoId), [graph, egoId])

  const { canEdit, editBlockedReason } = useMemo(() => {
    if (store.mode === 'local') return { canEdit: true, editBlockedReason: null }
    if (!user) return { canEdit: false, editBlockedReason: 'Sign in to edit this tree.' }
    if (!snapshot.meta) {
      return {
        canEdit: false,
        editBlockedReason: `No tree document at /trees/${TREE_ID}. Create it in the Firebase console.`,
      }
    }
    const email = user.email ?? ''
    if (!snapshot.meta.editors?.includes(email)) {
      return {
        canEdit: false,
        editBlockedReason: `${email} is not in this tree's editors list. Add it in the Firebase console.`,
      }
    }
    return { canEdit: true, editBlockedReason: null }
  }, [store.mode, user, snapshot.meta])

  const value: TreeContextValue = {
    store,
    snapshot,
    graph,
    relations,
    egoId,
    rootId,
    viewFrom,
    setViewFrom,
    user,
    authReady,
    canEdit,
    editBlockedReason,
    async signIn() {
      const handles = getFirebase()
      if (!handles) return
      await signInWithPopup(handles.auth, googleProvider)
    },
    async signOutNow() {
      const handles = getFirebase()
      if (!handles) return
      await signOut(handles.auth)
    },
  }

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>
}

export function useTree(): TreeContextValue {
  const value = useContext(TreeContext)
  if (!value) throw new Error('useTree must be used inside <TreeProvider>')
  return value
}

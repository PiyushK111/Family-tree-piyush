import { createContext, useContext } from 'react'
import type { Direction } from '../data/mutations'

/**
 * Node components are rendered by React Flow from plain data, so callbacks reach
 * them through context rather than through node props. Keeping the actions out
 * of node data also stops every node from re-rendering when a handler changes.
 */
export interface CanvasActions {
  openPerson: (personId: string) => void
  addRelative: (anchorId: string, direction: Direction) => void
  canEdit: boolean
  /** Person ids that have at least one parent, so "add sibling" can be disabled. */
  hasParents: (personId: string) => boolean
}

const noop = (): void => undefined

export const CanvasActionsContext = createContext<CanvasActions>({
  openPerson: noop,
  addRelative: noop,
  canEdit: false,
  hasParents: () => false,
})

export const useCanvasActions = (): CanvasActions => useContext(CanvasActionsContext)

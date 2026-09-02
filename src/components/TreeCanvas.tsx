import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef } from 'react'
import { useTree } from '../data/TreeProvider'
import type { Direction } from '../data/mutations'
import {
  buildFlowGraph,
  PERSON_HEIGHT,
  PERSON_WIDTH,
  type LabelMode,
} from '../layout/buildFlowGraph'
import { parents } from '../kinship'
import { CanvasActionsContext } from './canvasActions'
import { PersonNode } from './PersonNode'
import { UnionNode } from './UnionNode'

// Must be module-level: a fresh object each render makes React Flow warn and
// remount every node.
const nodeTypes = { person: PersonNode, union: UnionNode }

interface Props {
  labelMode: LabelMode
  onOpenPerson: (personId: string) => void
  onAddRelative: (anchorId: string, direction: Direction) => void
  /** Bumping this re-centres the view on ego. */
  recentreToken: number
}

export function TreeCanvas({
  labelMode,
  onOpenPerson,
  onAddRelative,
  recentreToken,
}: Props) {
  const { graph, egoId, relations, snapshot, canEdit } = useTree()
  const { setCenter } = useReactFlow()

  const { nodes, edges } = useMemo(
    () => buildFlowGraph(graph, egoId, relations, snapshot.photos, labelMode),
    [graph, egoId, relations, snapshot.photos, labelMode],
  )

  // The whole tree is fitted on first paint via ReactFlow's own `fitView` prop
  // below, rather than an effect here — calling it imperatively on mount runs
  // before React Flow has registered the nodes, and silently clamps to maxZoom.
  //
  // Changing whose point of view we use — or pressing "Centre on
  // me" — pans to that person, since being at the centre is the premise of the
  // tree. Guarded by the last handled key rather than by ordering, so React's
  // double-invoked effects in development cannot turn the initial fit into a pan.
  const lastFocus = useRef<string | null>(null)
  useEffect(() => {
    const key = `${egoId}:${recentreToken}`
    if (lastFocus.current === key) return
    const isFirst = lastFocus.current === null
    lastFocus.current = key
    if (isFirst) return

    const ego = nodes.find((node) => node.id === egoId)
    if (!ego) return
    setCenter(ego.position.x + PERSON_WIDTH / 2, ego.position.y + PERSON_HEIGHT / 2, {
      zoom: 0.85,
      duration: 600,
    })
    // `nodes` is deliberately not a dependency: re-centring on every edit would
    // yank the viewport away while someone is working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egoId, recentreToken, setCenter])

  const actions = useMemo(
    () => ({
      openPerson: onOpenPerson,
      addRelative: onAddRelative,
      canEdit,
      hasParents: (personId: string) => parents(graph, personId).length > 0,
    }),
    [onOpenPerson, onAddRelative, canEdit, graph],
  )

  if (!snapshot.loading && snapshot.people.length === 0) {
    return (
      <div className="canvas-empty">
        <h2>No one here yet</h2>
        <p>Add the first person to start the tree.</p>
      </div>
    )
  }

  return (
    <CanvasActionsContext.Provider value={actions}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        // Positions come from dagre on every change, so dragging a node would
        // only be undone on the next edit.
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          // Custom node types carry no colour of their own. Ego is picked out so
          // you can see where you sit relative to the rest of the tree.
          nodeColor={(node) =>
            node.type === 'union' ? 'transparent' : node.id === egoId ? '#2f6b4f' : '#b3a894'
          }
        />
      </ReactFlow>
    </CanvasActionsContext.Provider>
  )
}

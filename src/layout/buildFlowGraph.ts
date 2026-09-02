import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { Person, SpouseStatus } from '../types'
import { children, parents, spouses, type FamilyGraph } from '../kinship'

export const PERSON_WIDTH = 156
export const PERSON_HEIGHT = 158
const UNION_SIZE = 14

/** Where the kinship label is drawn. */
export type LabelMode = 'branch' | 'card' | 'both'

// React Flow v12 requires node data to be assignable to Record<string, unknown>,
// which TypeScript grants to type aliases but not to interfaces.
export type PersonNodeData = {
  person: Person
  /** Kinship label, e.g. "Paternal Uncle". */
  relation: string
  isEgo: boolean
  /** True when nothing connects from above, so the label has no branch to sit on. */
  showChip: boolean
  photoUrl?: string
}

export type UnionNodeData = {
  note?: string
  status: SpouseStatus
}

export type FlowNode = Node<PersonNodeData, 'person'> | Node<UnionNodeData, 'union'>

const unionId = (parentIds: string[]): string => `union:${[...parentIds].sort().join('~')}`

const isPrimary = (kind: string): boolean => kind === 'biological' || kind === 'adopted'

/**
 * The parents a child is drawn as descending from. Step and foster parents are
 * excluded so they don't merge into the couple that produced the child; they get
 * their own dashed edge instead. A child with only step parents falls back to
 * them so they still hang somewhere sensible.
 */
function primaryParents(g: FamilyGraph, childId: string): string[] {
  const all = parents(g, childId)
  const primary = all.filter((p) => isPrimary(p.kind))
  return (primary.length > 0 ? primary : all).map((p) => p.personId)
}

function marriageNote(status: SpouseStatus, since?: string): string | undefined {
  if (status === 'divorced') return since ? `m. ${since} — divorced` : 'divorced'
  if (status === 'partner') return 'partners'
  return since ? `m. ${since}` : undefined
}

/**
 * Converts the family graph into React Flow nodes and edges.
 *
 * Couples are joined through a small invisible "union" node and children hang
 * off that union rather than off an individual parent. This is what produces a
 * family-tree shape — spouses side by side, children centred beneath the pair —
 * instead of a generic org chart. It also gives dagre a clean DAG, so spouses
 * land on the same rank without any explicit constraint.
 */
export function buildFlowGraph(
  g: FamilyGraph,
  egoId: string,
  relations: Map<string, string>,
  photos: Map<string, string>,
  labelMode: LabelMode,
): { nodes: FlowNode[]; edges: Edge[] } {
  const unions = new Map<string, { parentIds: string[]; data: UnionNodeData }>()
  const ensureUnion = (parentIds: string[], data?: UnionNodeData): string => {
    const id = unionId(parentIds)
    const existing = unions.get(id)
    if (existing) {
      // A marriage record is richer than one inferred from a child's parents.
      if (data) existing.data = data
      return id
    }
    unions.set(id, { parentIds: [...parentIds].sort(), data: data ?? { status: 'married' } })
    return id
  }

  // Marriages first, so a couple is drawn together even with no children.
  const seenCouple = new Set<string>()
  for (const [personId, edges] of g.spousesOf) {
    for (const edge of edges) {
      const key = unionId([personId, edge.personId])
      if (seenCouple.has(key)) continue
      seenCouple.add(key)
      ensureUnion([personId, edge.personId], {
        status: edge.status,
        note: marriageNote(edge.status, edge.since),
      })
    }
  }

  // Then a union per distinct parent set, which merges into the marriage above
  // when the parents are exactly that couple.
  const childrenByUnion = new Map<string, string[]>()
  for (const person of g.people.values()) {
    const ps = primaryParents(g, person.id)
    if (ps.length === 0) continue
    const id = ensureUnion(ps)
    const list = childrenByUnion.get(id)
    if (list) list.push(person.id)
    else childrenByUnion.set(id, [person.id])
  }

  const hasIncoming = new Set(
    [...childrenByUnion.values()].flat(),
  )

  const nodes: FlowNode[] = []
  const edges: Edge[] = []

  for (const person of g.people.values()) {
    // Ego always wears the badge; otherwise the chip only fills in for people
    // whose label has no branch above them to sit on.
    const showChip =
      person.id === egoId ||
      labelMode === 'card' ||
      labelMode === 'both' ||
      !hasIncoming.has(person.id)
    nodes.push({
      id: person.id,
      type: 'person',
      position: { x: 0, y: 0 },
      // Stated explicitly rather than measured from the DOM: dagre needs the
      // dimensions anyway, and without them the MiniMap renders nothing.
      width: PERSON_WIDTH,
      height: PERSON_HEIGHT,
      data: {
        person,
        relation: relations.get(person.id) ?? 'Relative',
        isEgo: person.id === egoId,
        showChip,
        photoUrl: photos.get(person.id),
      },
    })
  }

  for (const [id, union] of unions) {
    nodes.push({
      id,
      type: 'union',
      position: { x: 0, y: 0 },
      width: UNION_SIZE,
      height: UNION_SIZE,
      data: union.data,
      selectable: false,
      draggable: false,
    })

    for (const parentId of union.parentIds) {
      edges.push({
        id: `e:${parentId}->${id}`,
        source: parentId,
        target: id,
        type: 'smoothstep',
        className: union.data.status === 'married' ? 'edge-spouse' : 'edge-spouse edge-dashed',
      })
    }

    for (const childId of childrenByUnion.get(id) ?? []) {
      edges.push({
        id: `e:${id}->${childId}`,
        source: id,
        target: childId,
        type: 'smoothstep',
        className: 'edge-descent',
        // The requirement: the relation is written on the branch that reaches
        // the person, so the segment above any face names who they are to you.
        label: labelMode === 'card' ? undefined : relations.get(childId),
        labelShowBg: true,
      })
    }
  }

  // Step and foster links bypass unions entirely.
  for (const [childId, parentEdges] of g.parentsOf) {
    const primary = new Set(primaryParents(g, childId))
    for (const edge of parentEdges) {
      if (primary.has(edge.personId)) continue
      edges.push({
        id: `e:step:${edge.personId}->${childId}`,
        source: edge.personId,
        target: childId,
        type: 'smoothstep',
        className: 'edge-descent edge-dashed',
        label: edge.kind === 'step' ? 'step-child' : 'foster child',
        labelShowBg: true,
      })
    }
  }

  // Couples, so the layout can be told to keep each pair side by side.
  const couples = [...unions.values()]
    .filter((u) => u.parentIds.length === 2)
    .map((u) => u.parentIds)

  return { nodes: layout(nodes, edges, couples), edges }
}

/** Runs dagre and converts its centre-based coordinates to React Flow's top-left. */
function layout(nodes: FlowNode[], edges: Edge[], couples: string[][]): FlowNode[] {
  const d = new dagre.graphlib.Graph({ compound: true })
  // The couple clusters below make dagre insert border ranks, which multiplies
  // the effective gap by about three. These values are chosen post-inflation to
  // land on a ~300px row pitch; raising them looks far airier than it reads.
  d.setGraph({ rankdir: 'TB', ranksep: 16, nodesep: 20, edgesep: 10, marginx: 60, marginy: 60 })
  d.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const isUnion = node.type === 'union'
    d.setNode(node.id, {
      width: isUnion ? UNION_SIZE : PERSON_WIDTH,
      height: isUnion ? UNION_SIZE : PERSON_HEIGHT,
    })
  }

  // Spouses have no shared neighbour above them, so when no edge crossings are
  // at stake dagre is free to leave them at opposite ends of their generation.
  // A compound "cluster" per couple forces the pair to stay contiguous. A person
  // can only belong to one cluster, so on remarriage the first couple wins.
  const clustered = new Set<string>()
  couples.forEach((pair, index) => {
    if (pair.some((id) => clustered.has(id))) return
    const clusterId = `couple:${index}`
    d.setNode(clusterId, {})
    for (const id of pair) {
      clustered.add(id)
      d.setParent(id, clusterId)
    }
  })
  for (const edge of edges) {
    // Weighting spouse edges keeps couples tight against their union node.
    d.setEdge(edge.source, edge.target, {
      weight: edge.className?.includes('edge-spouse') ? 3 : 1,
    })
  }

  dagre.layout(d)

  return nodes.map((node) => {
    const placed = d.node(node.id)
    if (!placed) return node
    return {
      ...node,
      position: {
        x: placed.x - placed.width / 2,
        y: placed.y - placed.height / 2,
      },
    }
  }) as FlowNode[]
}

/** Everyone reachable from ego, used to warn about accidentally orphaned people. */
export function connectedTo(g: FamilyGraph, egoId: string): Set<string> {
  const seen = new Set<string>([egoId])
  const queue = [egoId]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    const neighbours = [
      ...parents(g, current).map((p) => p.personId),
      ...children(g, current).map((c) => c.personId),
      ...spouses(g, current).map((s) => s.personId),
    ]
    for (const next of neighbours) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

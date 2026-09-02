import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { UnionNodeData } from '../layout/buildFlowGraph'

/**
 * The small joint between a couple and their children. It carries no content of
 * its own beyond an optional marriage note; its job is to give the layout a
 * single point for children to descend from.
 */
export function UnionNode({ data }: NodeProps<Node<UnionNodeData, 'union'>>) {
  return (
    <div className={`union union--${data.status}`}>
      <Handle type="target" position={Position.Top} />
      {data.note && <span className="union__note">{data.note}</span>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

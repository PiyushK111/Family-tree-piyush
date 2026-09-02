import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type { PersonNodeData } from '../layout/buildFlowGraph'
import type { Person } from '../types'
import { useCanvasActions } from './canvasActions'

/** "1952 – 2019", "b. 1985", or nothing when no dates are known. */
function lifespan(person: Person): string {
  const year = (value?: string) => value?.slice(0, 4)
  const born = year(person.birthDate)
  const died = year(person.deathDate)
  if (born && died) return `${born} – ${died}`
  if (born) return person.deceased ? `b. ${born}` : `b. ${born}`
  if (died) return `d. ${died}`
  return person.deceased ? 'deceased' : ''
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Stable pastel per person so placeholders are distinguishable but calm. */
function hueFor(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

export function PersonNode({ data }: NodeProps<Node<PersonNodeData, 'person'>>) {
  const { person, relation, isEgo, showChip, photoUrl } = data
  const actions = useCanvasActions()
  const dates = lifespan(person)

  return (
    <div
      className={`person${isEgo ? ' person--ego' : ''}${person.deceased ? ' person--deceased' : ''}`}
    >
      <Handle type="target" position={Position.Top} />

      <button
        type="button"
        className="person__body nodrag"
        onClick={() => actions.openPerson(person.id)}
        title={`${person.name} — ${relation}`}
      >
        <span className="person__photo" style={{ '--hue': hueFor(person.name) } as React.CSSProperties}>
          {photoUrl ? (
            <img src={photoUrl} alt="" loading="lazy" />
          ) : (
            <span className="person__initials">{initials(person.name)}</span>
          )}
        </span>

        <span className="person__name">{person.name || 'Unnamed'}</span>
        {dates && <span className="person__dates">{dates}</span>}
        {showChip && (
          <span className={`person__chip${isEgo ? ' person__chip--ego' : ''}`}>{relation}</span>
        )}
      </button>

      {actions.canEdit && (
        <div className="person__adders nodrag">
          <button
            type="button"
            title="Add parent above"
            onClick={() => actions.addRelative(person.id, 'parent')}
          >
            ↑
          </button>
          <button
            type="button"
            title="Add spouse beside"
            onClick={() => actions.addRelative(person.id, 'spouse')}
          >
            ⇔
          </button>
          <button
            type="button"
            title={
              actions.hasParents(person.id)
                ? 'Add sibling beside'
                : 'Add a parent first — siblings share a parent'
            }
            disabled={!actions.hasParents(person.id)}
            onClick={() => actions.addRelative(person.id, 'sibling')}
          >
            ⇄
          </button>
          <button
            type="button"
            title="Add child below"
            onClick={() => actions.addRelative(person.id, 'child')}
          >
            ↓
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { children, parents, spouses } from '../kinship'
import { useTree } from '../data/TreeProvider'
import {
  addRelative,
  connectExisting,
  MutationError,
  removePerson,
  type Direction,
} from '../data/mutations'
import { resizeImage } from '../lib/resizeImage'
import type { Gender, ParentKind, Person, SpouseStatus } from '../types'

export type DialogTarget =
  | { mode: 'add'; anchorId: string; direction: Direction }
  | { mode: 'edit'; personId: string }
  /** A person with no links yet — the first in an empty tree, or one to connect later. */
  | { mode: 'new' }

interface Props {
  target: DialogTarget
  onClose: () => void
  /**
   * Switches this dialog to adding a relative of the person being edited. The
   * only way to add a new relative on a touch screen, where the canvas's `+`
   * buttons are hidden.
   */
  onRetarget?: (target: DialogTarget) => void
}

interface FormState {
  name: string
  gender: Gender
  birthDate: string
  deathDate: string
  deceased: boolean
  birthPlace: string
  currentCity: string
  phone: string
  email: string
  notes: string
  relationOverride: string
}

const BLANK: FormState = {
  name: '',
  gender: 'unknown',
  birthDate: '',
  deathDate: '',
  deceased: false,
  birthPlace: '',
  currentCity: '',
  phone: '',
  email: '',
  notes: '',
  relationOverride: '',
}

function toForm(person: Person): FormState {
  return {
    name: person.name ?? '',
    gender: person.gender ?? 'unknown',
    birthDate: person.birthDate ?? '',
    deathDate: person.deathDate ?? '',
    deceased: person.deceased ?? false,
    birthPlace: person.birthPlace ?? '',
    currentCity: person.currentCity ?? '',
    phone: person.phone ?? '',
    email: person.email ?? '',
    notes: person.notes ?? '',
    relationOverride: person.relationOverride ?? '',
  }
}

/** Order matches the tree: above, beside, beside, below. */
const ADD_DIRECTIONS: Array<{ direction: Direction; label: string }> = [
  { direction: 'parent', label: '↑ Parent' },
  { direction: 'spouse', label: '♡ Spouse' },
  { direction: 'sibling', label: '⇄ Sibling' },
  { direction: 'child', label: '↓ Child' },
]

const DIRECTION_TITLES: Record<Direction, string> = {
  parent: 'Add a parent',
  child: 'Add a child',
  spouse: 'Add a spouse or partner',
  sibling: 'Add a sibling',
}

export function PersonDialog({ target, onClose, onRetarget }: Props) {
  const { store, snapshot, graph, relations, rootId, setViewFrom, canEdit } = useTree()

  const existing =
    target.mode === 'edit' ? (graph.people.get(target.personId) ?? null) : null
  const anchor = target.mode === 'add' ? graph.people.get(target.anchorId) : undefined

  const [form, setForm] = useState<FormState>(existing ? toForm(existing) : BLANK)
  // undefined = leave alone, null = remove, string = replace.
  const [photoDraft, setPhotoDraft] = useState<string | null | undefined>(undefined)
  const [kind, setKind] = useState<ParentKind>('biological')
  const [status, setStatus] = useState<SpouseStatus>('married')
  const [since, setSince] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Retargeting the dialog throws the form away, so warn if it has been touched.
  const dirty =
    photoDraft !== undefined ||
    JSON.stringify(form) !== JSON.stringify(existing ? toForm(existing) : BLANK)

  const currentPhoto =
    photoDraft !== undefined
      ? photoDraft
      : (existing && snapshot.photos.get(existing.id)) || null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function onPickPhoto(file: File | undefined): Promise<void> {
    if (!file) return
    setError(null)
    try {
      setPhotoDraft(await resizeImage(file))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)

    const personFields = {
      name: form.name.trim(),
      gender: form.gender,
      birthDate: form.birthDate || undefined,
      deathDate: form.deathDate || undefined,
      deceased: form.deceased || Boolean(form.deathDate),
      birthPlace: form.birthPlace.trim() || undefined,
      currentCity: form.currentCity.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      relationOverride: form.relationOverride.trim() || undefined,
    }

    try {
      if (target.mode === 'edit') {
        await store.updatePerson(target.personId, personFields, photoDraft)
      } else if (target.mode === 'new') {
        await store.addPerson(
          { ...personFields, hasPhoto: Boolean(photoDraft) },
          photoDraft ?? undefined,
        )
      } else {
        await addRelative(store, snapshot, graph, target.anchorId, target.direction, {
          person: { ...personFields, hasPhoto: Boolean(photoDraft) },
          photo: photoDraft ?? undefined,
          kind,
          status,
          since: since || undefined,
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof MutationError ? e.message : ((e as Error).message ?? 'Failed to save.'))
      setBusy(false)
    }
  }

  const title =
    target.mode === 'edit'
      ? existing?.name || 'Edit person'
      : target.mode === 'new'
        ? 'Add a person'
        : `${DIRECTION_TITLES[target.direction]}${anchor ? ` of ${anchor.name}` : ''}`

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__backdrop" onClick={onClose} />
      <form className="modal__panel" onSubmit={onSubmit}>
        <header className="modal__head">
          <h2>{title}</h2>
          {target.mode === 'edit' && existing && (
            <span className="modal__relation">{relations.get(existing.id)}</span>
          )}
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal__body">
          <div className="photo-row">
            <div className="photo-row__preview">
              {currentPhoto ? <img src={currentPhoto} alt="" /> : <span>No photo</span>}
            </div>
            <div className="photo-row__actions">
              <label className="btn btn--soft">
                Choose photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                />
              </label>
              {currentPhoto && (
                <button type="button" className="btn btn--ghost" onClick={() => setPhotoDraft(null)}>
                  Remove
                </button>
              )}
              <p className="hint">Cropped to a square and shrunk to 256px before saving.</p>
            </div>
          </div>

          <label className="field">
            <span>Name</span>
            <input
              ref={nameRef}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder="Full name"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Gender</span>
              <select
                value={form.gender}
                onChange={(e) => set('gender', e.target.value as Gender)}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unknown">Prefer not to say</option>
              </select>
            </label>
            <label className="field">
              <span>Born</span>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Died</span>
              <input
                type="date"
                value={form.deathDate}
                onChange={(e) => set('deathDate', e.target.value)}
              />
            </label>
          </div>

          <label className="field field--check">
            <input
              type="checkbox"
              checked={form.deceased}
              onChange={(e) => set('deceased', e.target.checked)}
            />
            <span>Deceased</span>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Native place</span>
              <input
                value={form.birthPlace}
                onChange={(e) => set('birthPlace', e.target.value)}
                placeholder="Village or city of birth"
              />
            </label>
            <label className="field">
              <span>Lives in</span>
              <input
                value={form.currentCity}
                onChange={(e) => set('currentCity', e.target.value)}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Stories, occupation, anything worth remembering"
            />
          </label>

          <label className="field">
            <span>Relation label override</span>
            <input
              value={form.relationOverride}
              onChange={(e) => set('relationOverride', e.target.value)}
              placeholder={
                target.mode === 'edit' && existing
                  ? `Computed: ${relations.get(existing.id) ?? ''}`
                  : 'Leave blank to compute automatically'
              }
            />
            <span className="hint">
              Use a family term like “Kaka” or “Mama” instead of the computed one.
            </span>
          </label>

          {target.mode === 'add' && target.direction !== 'spouse' && (
            <label className="field">
              <span>Type of link</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as ParentKind)}>
                <option value="biological">Biological</option>
                <option value="adopted">Adopted</option>
                <option value="step">Step</option>
                <option value="foster">Foster</option>
              </select>
            </label>
          )}

          {target.mode === 'add' && target.direction === 'spouse' && (
            <div className="field-row">
              <label className="field">
                <span>Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SpouseStatus)}
                >
                  <option value="married">Married</option>
                  <option value="partner">Partner</option>
                  <option value="divorced">Divorced</option>
                </select>
              </label>
              <label className="field">
                <span>Since</span>
                <input
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  placeholder="1998"
                />
              </label>
            </div>
          )}

          {target.mode === 'edit' && existing && canEdit && onRetarget && (
            <section className="add-relative">
              <h3>Add a new relative</h3>
              <div className="add-relative__row">
                {ADD_DIRECTIONS.map(({ direction, label }) => {
                  const needsParent =
                    direction === 'sibling' && parents(graph, existing.id).length === 0
                  return (
                    <button
                      key={direction}
                      type="button"
                      className="btn btn--soft"
                      disabled={needsParent}
                      title={
                        needsParent
                          ? 'Add a parent first — siblings are connected through a shared parent'
                          : undefined
                      }
                      onClick={() => {
                        if (
                          dirty &&
                          !window.confirm(
                            `Discard your unsaved changes to ${existing.name || 'this person'}?`,
                          )
                        ) {
                          return
                        }
                        onRetarget({ mode: 'add', anchorId: existing.id, direction })
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {target.mode === 'edit' && existing && (
            <Connections personId={existing.id} onError={setError} />
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <footer className="modal__foot">
          {target.mode === 'edit' && existing && (
            <div className="modal__foot-left">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setViewFrom(existing.id === rootId ? null : existing.id)
                  onClose()
                }}
              >
                {existing.id === rootId ? 'View from me' : 'View relations from here'}
              </button>
              {canEdit && existing.id !== rootId && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void store.setRoot(existing.id).then(onClose)}
                >
                  Make this “me”
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    if (!window.confirm(`Delete ${existing.name} and all their links?`)) return
                    void removePerson(store, snapshot, existing.id)
                      .then(onClose)
                      .catch((e) => setError((e as Error).message))
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
          <div className="modal__foot-right">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy || !canEdit}>
              {busy ? 'Saving…' : target.mode === 'edit' ? 'Save' : 'Add person'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

/** Existing links for one person, with unlink and link-to-existing controls. */
function Connections({
  personId,
  onError,
}: {
  personId: string
  onError: (message: string | null) => void
}) {
  const { store, snapshot, graph, canEdit } = useTree()
  const [otherId, setOtherId] = useState('')
  const [direction, setDirection] = useState<'parent' | 'child' | 'spouse'>('parent')

  const others = useMemo(
    () =>
      [...graph.people.values()]
        .filter((p) => p.id !== personId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [graph.people, personId],
  )

  const rows = [
    { title: 'Parents', ids: parents(graph, personId).map((p) => p.personId), type: 'parent' as const, incoming: true },
    { title: 'Spouses', ids: spouses(graph, personId).map((s) => s.personId), type: 'spouse' as const, incoming: false },
    { title: 'Children', ids: children(graph, personId).map((c) => c.personId), type: 'child' as const, incoming: false },
  ]

  function unlink(otherPersonId: string, type: 'parent' | 'child' | 'spouse'): void {
    const link = snapshot.links.find((l) => {
      if (type === 'spouse') {
        return (
          l.type === 'spouse' &&
          ((l.from === personId && l.to === otherPersonId) ||
            (l.from === otherPersonId && l.to === personId))
        )
      }
      const from = type === 'parent' ? otherPersonId : personId
      const to = type === 'parent' ? personId : otherPersonId
      return l.type === 'parent' && l.from === from && l.to === to
    })
    if (!link) return
    void store.deleteLink(link.id).catch((e) => onError((e as Error).message))
  }

  return (
    <section className="connections">
      <h3>Connections</h3>
      {rows.map((row) => (
        <div key={row.title} className="connections__row">
          <span className="connections__label">{row.title}</span>
          <div className="connections__chips">
            {row.ids.length === 0 && <span className="hint">none</span>}
            {row.ids.map((id) => (
              <span key={id} className="chip">
                {graph.people.get(id)?.name ?? id}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Unlink ${graph.people.get(id)?.name ?? id}`}
                    onClick={() => unlink(id, row.type)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}

      {canEdit && others.length > 0 && (
        <div className="connections__add">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="parent">Add existing parent</option>
            <option value="spouse">Add existing spouse</option>
            <option value="child">Add existing child</option>
          </select>
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            <option value="">Choose a person…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Unnamed'}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--soft"
            disabled={!otherId}
            onClick={() => {
              onError(null)
              void connectExisting(store, snapshot, personId, otherId, direction)
                .then(() => setOtherId(''))
                .catch((e) => onError((e as Error).message))
            }}
          >
            Link
          </button>
        </div>
      )}
    </section>
  )
}

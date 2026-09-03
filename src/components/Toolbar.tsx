import { useMemo, useState } from 'react'
import { useTree } from '../data/TreeProvider'
import { importLocalJson } from '../data/localStore'
import { importTree } from '../data/mutations'
import type { LabelMode } from '../layout/buildFlowGraph'

interface Props {
  labelMode: LabelMode
  onLabelModeChange: (mode: LabelMode) => void
  onRecentre: () => void
  onOpenPerson: (personId: string) => void
  onAddPerson: () => void
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function Toolbar({
  labelMode,
  onLabelModeChange,
  onRecentre,
  onOpenPerson,
  onAddPerson,
}: Props) {
  const {
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
    signIn,
    signOutNow,
  } = useTree()

  const [query, setQuery] = useState('')
  // Doubles as the button label while a Firestore import is streaming.
  const [importing, setImporting] = useState<string | null>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return [...graph.people.values()]
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, graph.people])

  const egoName = graph.people.get(egoId)?.name

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo" aria-hidden="true">
          🌳
        </span>
        <div>
          <strong>{snapshot.meta?.name ?? 'Family Tree'}</strong>
          <span className="toolbar__count">
            {snapshot.people.length} {snapshot.people.length === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      <div className="toolbar__search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a person…"
          aria-label="Search for a person"
        />
        {matches.length > 0 && (
          <ul className="toolbar__results">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    onOpenPerson(p.id)
                  }}
                >
                  <span>{p.name || 'Unnamed'}</span>
                  <em>{relations.get(p.id)}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="toolbar__actions">
        <label className="toolbar__select">
          <span>Relations on</span>
          <select
            value={labelMode}
            onChange={(e) => onLabelModeChange(e.target.value as LabelMode)}
          >
            <option value="branch">Branches</option>
            <option value="card">Cards</option>
            <option value="both">Both</option>
          </select>
        </label>

        <button type="button" className="btn btn--soft" onClick={onRecentre}>
          Centre on {viewFrom ? egoName : 'me'}
        </button>

        {canEdit && (
          <button type="button" className="btn" onClick={onAddPerson}>
            Add person
          </button>
        )}

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            download(
              'family-tree.json',
              JSON.stringify(
                {
                  meta: snapshot.meta,
                  people: snapshot.people,
                  links: snapshot.links,
                  photos: Object.fromEntries(snapshot.photos),
                },
                null,
                2,
              ),
            )
          }
        >
          Export
        </button>

        {canEdit && (
          <label className={`btn btn--ghost${importing ? ' btn--busy' : ''}`}>
            {importing ?? 'Import'}
            <input
              type="file"
              accept="application/json"
              hidden
              disabled={importing !== null}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (
                  snapshot.people.length > 0 &&
                  !window.confirm(
                    `This tree already has ${snapshot.people.length} people. Importing adds to them rather than replacing them, which will create duplicates. Continue?`,
                  )
                ) {
                  return
                }
                try {
                  const text = await file.text()
                  if (store.mode === 'local') {
                    // Fast path: swap the whole payload in one write. The local
                    // store reads storage once at startup, hence the reload.
                    importLocalJson(text)
                    window.location.reload()
                    return
                  }
                  setImporting('Importing…')
                  const summary = await importTree(store, text, (done, total) =>
                    setImporting(`Importing ${done}/${total}…`),
                  )
                  setImporting(null)
                  window.alert(
                    `Imported ${summary.people} people, ${summary.links} links and ${summary.photos} photos.`,
                  )
                } catch (err) {
                  setImporting(null)
                  window.alert((err as Error).message)
                }
              }}
            />
          </label>
        )}

        {store.mode === 'local' ? (
          <span className="badge badge--warn" title="No Firebase project configured yet">
            Local only
          </span>
        ) : !authReady ? (
          <span className="badge">…</span>
        ) : user ? (
          <span className="toolbar__user">
            <span title={user.email ?? ''}>{user.displayName ?? user.email}</span>
            <button type="button" className="btn btn--ghost" onClick={() => void signOutNow()}>
              Sign out
            </button>
          </span>
        ) : (
          <button type="button" className="btn" onClick={() => void signIn()}>
            Sign in with Google
          </button>
        )}
      </div>

      {viewFrom && viewFrom !== rootId && (
        <div className="toolbar__notice">
          Showing relations from <strong>{egoName}</strong>’s point of view.
          <button type="button" className="btn btn--ghost" onClick={() => setViewFrom(null)}>
            Back to me
          </button>
        </div>
      )}

      {!canEdit && editBlockedReason && (
        <div className="toolbar__notice toolbar__notice--warn">{editBlockedReason}</div>
      )}

      {snapshot.error && (
        <div className="toolbar__notice toolbar__notice--warn">{snapshot.error}</div>
      )}
    </header>
  )
}

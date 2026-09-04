import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { PersonDialog, type DialogTarget } from './components/PersonDialog'
import { Toolbar } from './components/Toolbar'
import { TreeCanvas } from './components/TreeCanvas'
import { useTree } from './data/TreeProvider'
import type { Direction } from './data/mutations'
import type { LabelMode } from './layout/buildFlowGraph'

export function App() {
  const { snapshot, setViewFrom } = useTree()
  const [labelMode, setLabelMode] = useState<LabelMode>('branch')
  const [dialog, setDialog] = useState<DialogTarget | null>(null)
  // Incremented to ask the canvas to pan back to ego.
  const [recentreToken, setRecentreToken] = useState(0)

  const openPerson = useCallback((personId: string) => {
    setDialog({ mode: 'edit', personId })
  }, [])

  const addRelative = useCallback((anchorId: string, direction: Direction) => {
    setDialog({ mode: 'add', anchorId, direction })
  }, [])

  return (
    <div className="app">
      <Toolbar
        labelMode={labelMode}
        onLabelModeChange={setLabelMode}
        onRecentre={() => {
          setViewFrom(null)
          setRecentreToken((n) => n + 1)
        }}
        onOpenPerson={openPerson}
        onAddPerson={() => setDialog({ mode: 'new' })}
      />

      <main className="app__canvas">
        {snapshot.loading ? (
          <div className="canvas-empty">
            <h2>Loading the tree…</h2>
          </div>
        ) : (
          <ReactFlowProvider>
            <TreeCanvas
              labelMode={labelMode}
              onOpenPerson={openPerson}
              onAddRelative={addRelative}
              recentreToken={recentreToken}
            />
          </ReactFlowProvider>
        )}
      </main>

      {dialog && (
        <PersonDialog
          // Keyed so retargeting remounts: the form is seeded on mount, and
          // without this an "add spouse" jump would inherit the edited
          // person's own name and dates.
          key={JSON.stringify(dialog)}
          target={dialog}
          onClose={() => setDialog(null)}
          onRetarget={setDialog}
        />
      )}
    </div>
  )
}

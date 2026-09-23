/**
 * Workspace tab strip.
 *
 * Each tab is an independent bench. Renaming happens inline (double-click or
 * the pencil affordance) so the strip stays a single row instead of opening a
 * modal for a one-word change.
 */
import { useEffect, useRef, useState } from 'react'

import { Button, IconButton, cx } from '@/components/ui'
import { disposeEngine } from '@/engine/useSimulation'
import { useLabStore } from '@/store/labStore'
import { useWorkspaceTabs } from '@/store/hooks'

export function WorkspaceTabs() {
  const tabs = useWorkspaceTabs()
  const activeId = useLabStore((state) => state.activeId)
  const setActive = useLabStore((state) => state.setActiveWorkspace)
  const createWorkspace = useLabStore((state) => state.createWorkspace)
  const duplicateWorkspace = useLabStore((state) => state.duplicateWorkspace)
  const deleteWorkspace = useLabStore((state) => state.deleteWorkspace)
  const renameWorkspace = useLabStore((state) => state.renameWorkspace)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.select()
  }, [editingId])

  const startRename = (id: string, name: string) => {
    setEditingId(id)
    setDraft(name)
  }

  const commitRename = () => {
    if (editingId) renameWorkspace(editingId, draft)
    setEditingId(null)
  }

  const removeWorkspace = (id: string) => {
    disposeEngine(id)
    deleteWorkspace(id)
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-lab-border bg-lab-panel px-3">
      <div className="flex items-center gap-2 pr-1">
        <span className="font-mono text-sm font-bold tracking-[0.22em] text-lab-accent">
          LAVOISIER
        </span>
        <span className="hidden text-[10px] text-lab-faint sm:inline">化学模拟实验室</span>
      </div>

      <div className="lab-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              className={cx(
                'group flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 transition-colors',
                active
                  ? 'border-lab-accent/50 bg-lab-accent/12 text-lab-text'
                  : 'border-lab-border-soft bg-lab-panel-2/50 text-lab-muted hover:border-lab-border hover:text-lab-text',
              )}
            >
              {editingId === tab.id ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                  className="h-5 w-24 rounded border border-lab-accent/50 bg-lab-void px-1 text-xs text-lab-text focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActive(tab.id)}
                  onDoubleClick={() => startRename(tab.id, tab.name)}
                  title="单击切换，双击重命名"
                  className="max-w-[140px] cursor-pointer truncate text-xs"
                >
                  {tab.name}
                </button>
              )}

              {tab.apparatusCount > 0 && (
                <span className="rounded bg-lab-void/60 px-1 font-mono text-[9px] text-lab-faint">
                  {tab.apparatusCount}
                </span>
              )}

              {active && editingId !== tab.id && (
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="重命名"
                    onClick={() => startRename(tab.id, tab.name)}
                    className="h-5 w-5 text-[10px]"
                  >
                    ✎
                  </IconButton>
                  <IconButton
                    label="复制实验台"
                    onClick={() => duplicateWorkspace(tab.id)}
                    className="h-5 w-5 text-[10px]"
                  >
                    ⧉
                  </IconButton>
                  <IconButton
                    label={tabs.length > 1 ? '删除实验台' : '至少保留一个实验台'}
                    tone="danger"
                    disabled={tabs.length <= 1}
                    onClick={() => removeWorkspace(tab.id)}
                    className="h-5 w-5 text-[10px] disabled:opacity-30"
                  >
                    ✕
                  </IconButton>
                </div>
              )}
            </div>
          )
        })}

        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2"
          onClick={() => createWorkspace()}
          title="新建实验台"
        >
          + 新建
        </Button>
      </div>
    </div>
  )
}

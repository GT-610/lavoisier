/**
 * Left-hand library: instruments and reagents.
 *
 * Dragging is implemented with raw pointer events (see `interaction/dragStore`)
 * because the shelf and the canvas are siblings with no shared ancestor that
 * owns the in-flight payload. A press starts a drag; the release is handled by
 * the canvas, which knows where the pointer landed.
 */
import { useMemo, useState } from 'react'

import { ApparatusThumb } from '@/components/ApparatusThumb'
import { Button, TextInput } from '@/components/ui'
import { cx } from '@/utils/cx'
import { APPARATUS_SHELF, getApparatusDef, SHELF_GROUPS, findReagent } from '@/data/reagents'
import { useDragStore } from '@/interaction/dragStore'
import { useLabStore } from '@/store/labStore'
import { useActiveWorkspaceId } from '@/store/hooks'
import { clamp } from '@/utils/math'

type Tab = 'apparatus' | 'reagent'

export function Shelf() {
  const [tab, setTab] = useState<Tab>('apparatus')
  const [query, setQuery] = useState('')
  const [doseAmount, setDoseAmount] = useState(1)
  const workspaceId = useActiveWorkspaceId()
  const beginDrag = useDragStore((state) => state.begin)

  const normalizedQuery = query.trim().toLowerCase()

  const filteredReagents = useMemo(() => {
    if (!normalizedQuery) return SHELF_GROUPS
    return SHELF_GROUPS.map((group) => ({
      title: group.title,
      ids: group.ids.filter((id) => {
        const reagent = findReagent(id)
        if (!reagent) return false
        return (
          reagent.name.includes(query.trim()) ||
          reagent.formula.toLowerCase().includes(normalizedQuery) ||
          reagent.id.includes(normalizedQuery)
        )
      }),
    })).filter((group) => group.ids.length > 0)
  }, [normalizedQuery, query])

  /** Adds a reagent straight to the selected vessel (keyboard/mouse fallback). */
  const quickAdd = (reagentId: string) => {
    const state = useLabStore.getState()
    const workspace = state.workspaces[workspaceId]
    const selectedId = workspace?.selectedId
    if (!selectedId) {
      state.log(workspaceId, 'warn', '请先在实验台中选择一个容器，再加入试剂。')
      return
    }
    state.addReagent(workspaceId, selectedId, reagentId, doseAmount)
  }

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-lab-border bg-lab-panel">
      <div className="flex shrink-0 gap-1 border-b border-lab-border-soft p-2">
        {(
          [
            ['apparatus', '仪器库'],
            ['reagent', '试剂库'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cx(
              'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
              tab === value
                ? 'bg-lab-accent/15 text-lab-accent'
                : 'text-lab-muted hover:bg-lab-panel-2 hover:text-lab-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'reagent' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-lab-border-soft px-2 py-2">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索试剂 / 化学式"
            aria-label="搜索试剂"
          />
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-lab-faint">
            剂量
            <input
              type="number"
              min={0.5}
              max={5}
              step={0.5}
              value={doseAmount}
              onChange={(event) => setDoseAmount(clamp(Number(event.target.value) || 1, 0.5, 5))}
              className="h-8 w-14 rounded-md border border-lab-border bg-lab-void px-1.5 text-center text-xs text-lab-text focus:border-lab-accent/70 focus:outline-none"
            />
          </label>
        </div>
      )}

      <div className="lab-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'apparatus' ? (
          <div className="space-y-4">
            {APPARATUS_SHELF.map((group) => (
              <div key={group.title}>
                <h3 className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.14em] text-lab-faint uppercase">
                  {group.title}
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.kinds.map((kind) => {
                    const def = getApparatusDef(kind)
                    return (
                      <button
                        key={kind}
                        type="button"
                        title={`${def.name} — ${def.description}`}
                        onPointerDown={(event) => {
                          // Keep the browser from starting a text selection.
                          event.preventDefault()
                          beginDrag(
                            { type: 'apparatus', kind, label: def.name },
                            event.clientX,
                            event.clientY,
                          )
                        }}
                        className={cx(
                          'group flex cursor-grab flex-col items-center gap-1 rounded-lg border border-lab-border-soft',
                          'bg-lab-panel-2/60 px-1 py-2 transition-colors hover:border-lab-accent/50 hover:bg-lab-panel-2',
                          'active:cursor-grabbing',
                        )}
                      >
                        <ApparatusThumb kind={kind} size={42} />
                        <span className="text-[10px] leading-none text-lab-muted group-hover:text-lab-text">
                          {def.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReagents.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-lab-faint">没有匹配的试剂</p>
            )}
            {filteredReagents.map((group) => (
              <div key={group.title}>
                <h3 className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.14em] text-lab-faint uppercase">
                  {group.title}
                </h3>
                <ul className="space-y-1">
                  {group.ids.map((id) => {
                    const reagent = findReagent(id)
                    if (!reagent) return null
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          title={`${reagent.name}（${reagent.formula}）— ${reagent.note ?? ''}`}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            beginDrag(
                            { type: 'reagent', reagentId: id, label: reagent.name, color: reagent.color },
                            event.clientX,
                            event.clientY,
                            doseAmount,
                          )
                          }}
                          onDoubleClick={() => quickAdd(id)}
                          className={cx(
                            'flex w-full cursor-grab items-center gap-2 rounded-lg border border-lab-border-soft',
                            'bg-lab-panel-2/50 px-2 py-1.5 text-left transition-colors',
                            'hover:border-lab-accent/50 hover:bg-lab-panel-2 active:cursor-grabbing',
                          )}
                        >
                          <span
                            className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/12"
                            style={{
                              backgroundColor:
                                reagent.colorStrength < 0.12
                                  ? 'rgba(255,255,255,0.12)'
                                  : reagent.color,
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-lab-text">
                              {reagent.name}
                            </span>
                            <span className="block font-mono text-[10px] text-lab-faint">
                              {reagent.formula}
                              {reagent.phase === 'solid' ? ' · 固' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 space-y-1.5 border-t border-lab-border-soft p-2">
        <p className="text-[11px] leading-snug text-lab-faint">
          拖拽到实验台放置；选中容器后双击试剂可快速加入。
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => {
            const state = useLabStore.getState()
            state.log(workspaceId, 'info', '提示：把酒精灯放在容器下方可以加热，玻璃棒碰到容器即可搅拌。')
          }}
        >
          操作提示
        </Button>
      </footer>
    </aside>
  )
}

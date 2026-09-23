/**
 * Bench toolbar: import/export, reset, and quick presets.
 *
 * The presets exist because a blank bench plus a 30-item reagent shelf is a
 * cold start. Each preset drops a small scene that demonstrates one classic
 * phenomenon, which doubles as living documentation of the rule engine.
 */
import { useRef, useState } from 'react'

import { Button, cx } from '@/components/ui'
import { useActiveWorkspaceId } from '@/store/hooks'
import { createApparatus, createLogEntry, useLabStore } from '@/store/labStore'
import type { Apparatus, LogLevel, Workspace, WorkspaceSnapshot } from '@/types'

interface Preset {
  id: string
  name: string
  note: string
  build: (originX: number, originY: number) => { apparatus: Apparatus[]; logs: { level: LogLevel; text: string }[] }
}

/** Places a vessel and doses it, keeping preset definitions declarative. */
function vessel(
  kind: Parameters<typeof createApparatus>[0],
  x: number,
  y: number,
  dose: [string, number][] = [],
  rotation = 0,
): Apparatus {
  const apparatus = createApparatus(kind, x, y)
  apparatus.rotation = rotation
  apparatus.contents = dose.map(([reagentId, amount]) => ({ reagentId, amount }))
  return apparatus
}

const PRESETS: Preset[] = [
  {
    id: 'zinc-acid',
    name: '锌与稀盐酸',
    note: '气泡演示：金属与酸反应放出氢气',
    build: (x, y) => ({
      apparatus: [
        vessel('beaker', x, y, [
          ['hcl', 3],
          ['zn', 2],
        ]),
      ],
      logs: [{ level: 'info', text: '预设：在烧杯中加入锌粒与稀盐酸，观察气泡逸出。' }],
    }),
  },
  {
    id: 'neutralisation',
    name: '中和放热',
    note: '温度演示：盐酸与氢氧化钠中和',
    build: (x, y) => ({
      apparatus: [
        vessel('beaker', x, y, [
          ['naoh', 3],
          ['hcl', 3],
        ]),
        vessel('glass-rod', x + 3, y - 2),
      ],
      logs: [{ level: 'info', text: '预设：酸碱中和会放热，注意检视器里的温度变化。' }],
    }),
  },
  {
    id: 'precipitate',
    name: '蓝色沉淀',
    note: '沉淀演示：硫酸铜与氢氧化钠',
    build: (x, y) => ({
      apparatus: [
        vessel('test-tube', x, y, [
          ['cuso4', 2],
          ['naoh', 2],
        ]),
      ],
      logs: [{ level: 'info', text: '预设：硫酸铜与氢氧化钠生成蓝色絮状沉淀。' }],
    }),
  },
  {
    id: 'catalyst',
    name: '催化分解',
    note: '催化演示：二氧化锰催化过氧化氢',
    build: (x, y) => ({
      apparatus: [
        vessel('flask', x, y, [
          ['h2o2', 3],
          ['mno2', 1],
        ]),
      ],
      logs: [{ level: 'info', text: '预设：二氧化锰催化过氧化氢分解，产生大量氧气。' }],
    }),
  },
  {
    id: 'indicator',
    name: '指示剂变色',
    note: '指示剂演示：酚酞遇碱变红',
    build: (x, y) => ({
      apparatus: [
        vessel('beaker', x, y, [
          ['water', 3],
          ['phenolphthalein', 1],
          ['naoh', 2],
        ]),
      ],
      logs: [{ level: 'info', text: '预设：无色酚酞在碱性溶液中变为红色。' }],
    }),
  },
  {
    id: 'explosion',
    name: '氢氧爆鸣',
    note: '危险演示：氢气与氧气遇火爆炸',
    build: (x, y) => ({
      apparatus: [
        vessel('test-tube', x, y, [
          ['h2o2', 2],
          ['mno2', 1],
        ]),
        vessel('test-tube', x + 90, y, [['water', 2]]),
        createApparatus('alcohol-lamp', x, y + 110),
      ],
      logs: [
        {
          level: 'warn',
          text: '预设：先点燃酒精灯加热，再加入收集到的氢气与氧气即可看到爆鸣（需自行加入 h2/o2）。',
        },
      ],
    }),
  },
]

export function Toolbar() {
  const workspaceId = useActiveWorkspaceId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  /* ------------------------------ export ------------------------------- */
  const exportWorkspace = () => {
    const state = useLabStore.getState()
    const snapshot = state.exportWorkspace(workspaceId)
    if (!snapshot) return
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeName = snapshot.workspace.name.replace(/[\\/:*?"<>|\s]+/g, '_')
    anchor.href = url
    anchor.download = `lavoisier-${safeName}-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    state.log(workspaceId, 'info', `已导出实验台「${snapshot.workspace.name}」。`)
  }

  /* ------------------------------ import ------------------------------- */
  const importFile = async (file: File) => {
    const state = useLabStore.getState()
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as WorkspaceSnapshot
      if (parsed?.format !== 'lavoisier.workspace') {
        state.log(workspaceId, 'danger', '导入失败：该文件不是 Lavoisier 实验台存档。')
        return
      }
      const newId = state.importWorkspace(parsed)
      if (!newId) {
        state.log(workspaceId, 'danger', '导入失败：存档内容不完整或已损坏。')
      }
    } catch (error) {
      state.log(
        workspaceId,
        'danger',
        `导入失败：无法解析 JSON（${error instanceof Error ? error.message : '未知错误'}）。`,
      )
    }
  }

  /* ------------------------------ presets ------------------------------ */
  const applyPreset = (preset: Preset) => {
    const state = useLabStore.getState()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    // Lay the scene out relative to the current bench size, using a sensible
    // default when the canvas has not been measured yet.
    const originX = 320
    const originY = 300
    const { apparatus, logs } = preset.build(originX, originY)

    const next: Workspace = {
      ...workspace,
      apparatus: [...workspace.apparatus, ...apparatus],
      selectedId: apparatus[0]?.id ?? null,
      log: [
        ...workspace.log,
        ...logs.map((entry) => createLogEntry(entry.level, entry.text)),
      ].slice(-120),
      contentsRevision: workspace.contentsRevision + 1,
    }

    useLabStore.setState((prev) => ({
      workspaces: { ...prev.workspaces, [workspaceId]: next },
    }))
    setMenuOpen(false)
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-lab-border bg-lab-panel px-3">
      <div className="relative">
        <Button size="sm" variant="outline" onClick={() => setMenuOpen((open) => !open)}>
          ⚗ 实验预设
        </Button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-8 left-0 z-20 w-64 rounded-lg border border-lab-border bg-lab-panel p-1.5 shadow-xl shadow-black/50">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cx(
                    'block w-full rounded-md px-2 py-1.5 text-left transition-colors',
                    'hover:bg-lab-panel-2',
                  )}
                >
                  <span className="block text-xs text-lab-text">{preset.name}</span>
                  <span className="block text-[10px] text-lab-faint">{preset.note}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-lab-border" />

      <Button size="sm" variant="outline" onClick={exportWorkspace}>
        ↧ 导出 JSON
      </Button>
      <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
        ↥ 导入 JSON
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importFile(file)
          // Reset so re-selecting the same file fires `change` again.
          event.target.value = ''
        }}
      />

      <div className="mx-1 h-5 w-px bg-lab-border" />

      <Button
        size="sm"
        variant="danger"
        onClick={() => {
          if (window.confirm('确定要清空当前实验台的所有仪器吗？')) {
            useLabStore.getState().resetWorkspace(workspaceId)
          }
        }}
      >
        ⌫ 清空实验台
      </Button>

      <div className="flex-1" />

      <span className="hidden font-mono text-[10px] text-lab-faint md:inline">
        规则引擎 v1 · 全部模拟在本地浏览器完成
      </span>
    </div>
  )
}

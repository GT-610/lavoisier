/**
 * Root laboratory store.
 *
 * Design decision (Step 1 research): rather than creating one free-standing
 * Zustand store per workspace and juggling a store registry, the bench state
 * for *every* workspace lives in a single store under `workspaces[id]`.
 *
 * Why: a single store keeps import/export, undo-friendly snapshots and the
 * simulation loop trivial, while isolation is still guaranteed because every
 * action is keyed by `workspaceId` and every selector is scoped to one id.
 * Components subscribe through `useWorkspace(selector)` which closes over the
 * active id, so switching benches re-renders only what changed — the same
 * behaviour a per-instance store factory would give, without the registry.
 */
import { create } from 'zustand'

import { getApparatusDef, getReagent, REAGENT_MAP } from '@/data/reagents'
import type {
  Apparatus,
  ApparatusContent,
  ApparatusKind,
  LogEntry,
  LogLevel,
  Reagent,
  Workspace,
  WorkspaceSnapshot,
} from '@/types'
import { blendColors, clamp } from '@/utils/math'
import { uid } from '@/utils/id'

/** Maximum number of log lines kept per workspace. */
const LOG_LIMIT = 120
/** Default bench name pattern, e.g. `实验台 3`. */
const WORKSPACE_NAME = (index: number) => `实验台 ${index}`

export interface LabState {
  workspaces: Record<string, Workspace>
  /** Display order of the workspace tab strip. */
  order: string[]
  activeId: string

  /* ---------------------------- workspace CRUD ---------------------------- */
  createWorkspace: (name?: string) => string
  duplicateWorkspace: (id: string) => string | null
  deleteWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  setActiveWorkspace: (id: string) => void

  /* ----------------------------- apparatus -------------------------------- */
  addApparatus: (
    workspaceId: string,
    kind: ApparatusKind,
    x: number,
    y: number,
  ) => string | null
  moveApparatus: (workspaceId: string, id: string, x: number, y: number) => void
  rotateApparatus: (workspaceId: string, id: string, rotation: number) => void
  removeApparatus: (workspaceId: string, id: string) => void
  selectApparatus: (workspaceId: string, id: string | null) => void
  toggleFlame: (workspaceId: string, id: string) => void
  clearApparatus: (workspaceId: string, id: string) => void

  /* ------------------------------- contents ------------------------------- */
  addReagent: (
    workspaceId: string,
    apparatusId: string,
    reagentId: string,
    amount: number,
  ) => void
  /** Removes `amount` units of one reagent; used by the reaction engine. */
  consumeReagent: (
    workspaceId: string,
    apparatusId: string,
    reagentId: string,
    amount: number,
  ) => void

  /* --------------------------- simulation commit --------------------------- */
  /**
   * Batched write-back from the simulation loop. Called at a low frequency
   * (a few times per second) so that per-frame particle work never touches
   * React state.
   */
  commitSimulation: (
    workspaceId: string,
    patches: { id: string; temperature?: number; mixtureColor?: string | null; mixtureOpacity?: number }[],
  ) => void

  /* --------------------------------- logging ------------------------------- */
  log: (workspaceId: string, level: LogLevel, text: string) => void
  clearLog: (workspaceId: string) => void

  /* ------------------------------- snapshots ------------------------------ */
  exportWorkspace: (id: string) => WorkspaceSnapshot | null
  importWorkspace: (snapshot: WorkspaceSnapshot) => string | null
  resetWorkspace: (id: string) => void
}

/* -------------------------------------------------------------------------- */
/*  Factories                                                                  */
/* -------------------------------------------------------------------------- */

export function createApparatus(kind: ApparatusKind, x: number, y: number): Apparatus {
  const def = getApparatusDef(kind)
  return {
    id: uid('ap'),
    kind,
    x,
    y,
    rotation: 0,
    contents: [],
    temperature: 22,
    lit: def.emitsHeat,
    mixtureColor: null,
    mixtureOpacity: 0,
  }
}

function createWorkspace(name: string): Workspace {
  return {
    id: uid('ws'),
    name,
    createdAt: Date.now(),
    apparatus: [],
    selectedId: null,
    log: [],
  }
}

function createLogEntry(level: LogLevel, text: string): LogEntry {
  return { id: uid('log'), at: Date.now(), level, text }
}

/**
 * Recomputes the cached mixture appearance from the current contents.
 * Called after every content mutation so the renderer never has to blend
 * colours on the hot path.
 */
function recomputeMixture(apparatus: Apparatus): Apparatus {
  const visible = apparatus.contents.filter((content) => {
    const reagent = REAGENT_MAP[content.reagentId]
    return reagent && reagent.phase !== 'gas' && content.amount > 0
  })
  if (visible.length === 0) {
    return { ...apparatus, mixtureColor: null, mixtureOpacity: 0 }
  }
  const color = blendColors(
    visible.map((content) => {
      const reagent = REAGENT_MAP[content.reagentId]
      return { color: reagent.color, weight: content.amount * reagent.colorStrength }
    }),
  )
  const total = visible.reduce((sum, content) => sum + content.amount, 0)
  // A fuller vessel reads as more opaque, capped so glass stays visible.
  const strength = visible.reduce((sum, content) => {
    const reagent = REAGENT_MAP[content.reagentId]
    return sum + content.amount * reagent.colorStrength
  }, 0)
  const opacity = clamp(0.16 + (strength / Math.max(total, 1)) * 0.5 + total * 0.02, 0.12, 0.92)
  return { ...apparatus, mixtureColor: color, mixtureOpacity: opacity }
}

/** Immutably patch one apparatus inside one workspace. */
function patchApparatus(
  state: LabState,
  workspaceId: string,
  apparatusId: string,
  patch: (apparatus: Apparatus) => Apparatus,
): Partial<LabState> {
  const workspace = state.workspaces[workspaceId]
  if (!workspace) return {}
  let changed = false
  const apparatus = workspace.apparatus.map((item) => {
    if (item.id !== apparatusId) return item
    changed = true
    return patch(item)
  })
  if (!changed) return {}
  return {
    workspaces: {
      ...state.workspaces,
      [workspaceId]: { ...workspace, apparatus },
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                      */
/* -------------------------------------------------------------------------- */

const firstWorkspace = createWorkspace(WORKSPACE_NAME(1))

export const useLabStore = create<LabState>()((set, get) => ({
  workspaces: { [firstWorkspace.id]: firstWorkspace },
  order: [firstWorkspace.id],
  activeId: firstWorkspace.id,

  /* ---------------------------- workspace CRUD ---------------------------- */
  createWorkspace: (name) => {
    const state = get()
    const workspace = createWorkspace(name?.trim() || WORKSPACE_NAME(state.order.length + 1))
    set({
      workspaces: { ...state.workspaces, [workspace.id]: workspace },
      order: [...state.order, workspace.id],
      activeId: workspace.id,
    })
    return workspace.id
  },

  duplicateWorkspace: (id) => {
    const state = get()
    const source = state.workspaces[id]
    if (!source) return null
    const copy: Workspace = {
      ...source,
      id: uid('ws'),
      name: `${source.name} 副本`,
      createdAt: Date.now(),
      // Instruments need fresh ids, otherwise the two benches share identities.
      apparatus: source.apparatus.map((item) => ({ ...item, id: uid('ap') })),
      selectedId: null,
      log: [createLogEntry('info', `已从「${source.name}」复制实验台。`)],
    }
    const index = state.order.indexOf(id)
    const order = [...state.order]
    order.splice(index + 1, 0, copy.id)
    set({
      workspaces: { ...state.workspaces, [copy.id]: copy },
      order,
      activeId: copy.id,
    })
    return copy.id
  },

  deleteWorkspace: (id) => {
    const state = get()
    if (state.order.length <= 1) return
    const { [id]: _removed, ...rest } = state.workspaces
    const order = state.order.filter((item) => item !== id)
    const activeId = state.activeId === id ? order[0] : state.activeId
    set({ workspaces: rest, order, activeId })
  },

  renameWorkspace: (id, name) => {
    const state = get()
    const workspace = state.workspaces[id]
    const trimmed = name.trim()
    if (!workspace || !trimmed || trimmed === workspace.name) return
    set({
      workspaces: { ...state.workspaces, [id]: { ...workspace, name: trimmed } },
    })
  },

  setActiveWorkspace: (id) => {
    if (!get().workspaces[id]) return
    set({ activeId: id })
  },

  /* ----------------------------- apparatus -------------------------------- */
  addApparatus: (workspaceId, kind, x, y) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return null
    const apparatus = createApparatus(kind, x, y)
    const def = getApparatusDef(kind)
    set({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          ...workspace,
          apparatus: [...workspace.apparatus, apparatus],
          selectedId: apparatus.id,
          log: [
            ...workspace.log,
            createLogEntry('info', `放置了${def.name}。`),
          ].slice(-LOG_LIMIT),
        },
      },
    })
    return apparatus.id
  },

  moveApparatus: (workspaceId, id, x, y) =>
    set((state) => patchApparatus(state, workspaceId, id, (item) => ({ ...item, x, y }))),

  rotateApparatus: (workspaceId, id, rotation) =>
    set((state) =>
      patchApparatus(state, workspaceId, id, (item) => ({
        ...item,
        // Keep the stored angle in [0, 360) so exports stay readable.
        rotation: ((rotation % 360) + 360) % 360,
      })),
    ),

  removeApparatus: (workspaceId, id) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    const target = workspace.apparatus.find((item) => item.id === id)
    if (!target) return
    const name = getApparatusDef(target.kind).name
    set({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          ...workspace,
          apparatus: workspace.apparatus.filter((item) => item.id !== id),
          selectedId: workspace.selectedId === id ? null : workspace.selectedId,
          log: [...workspace.log, createLogEntry('info', `移除了${name}。`)].slice(-LOG_LIMIT),
        },
      },
    })
  },

  selectApparatus: (workspaceId, id) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace || workspace.selectedId === id) return
    set({
      workspaces: { ...state.workspaces, [workspaceId]: { ...workspace, selectedId: id } },
    })
  },

  toggleFlame: (workspaceId, id) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    const target = workspace.apparatus.find((item) => item.id === id)
    if (!target || !getApparatusDef(target.kind).emitsHeat) return
    const lit = !target.lit
    const next = patchApparatus(state, workspaceId, id, (item) => ({ ...item, lit })) as {
      workspaces: Record<string, Workspace>
    }
    const updated = next.workspaces[workspaceId]
    set({
      workspaces: {
        ...next.workspaces,
        [workspaceId]: {
          ...updated,
          log: [
            ...updated.log,
            createLogEntry('info', lit ? '点燃了酒精灯。' : '熄灭了酒精灯。'),
          ].slice(-LOG_LIMIT),
        },
      },
    })
  },

  clearApparatus: (workspaceId, id) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    set({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          ...workspace,
          apparatus: workspace.apparatus.map((item) =>
            item.id === id
              ? recomputeMixture({ ...item, contents: [], temperature: 22 })
              : item,
          ),
          log: [...workspace.log, createLogEntry('info', '清空了容器。')].slice(-LOG_LIMIT),
        },
      },
    })
  },

  /* ------------------------------- contents ------------------------------- */
  addReagent: (workspaceId, apparatusId, reagentId, amount) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    const target = workspace.apparatus.find((item) => item.id === apparatusId)
    if (!target) return
    const def = getApparatusDef(target.kind)
    if (def.capacity <= 0 || amount <= 0) return

    const reagent: Reagent = getReagent(reagentId)
    const total = target.contents.reduce((sum, content) => sum + content.amount, 0)
    if (total >= def.capacity) {
      set({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: {
            ...workspace,
            log: [
              ...workspace.log,
              createLogEntry('warn', `${def.name}已经装满了，无法继续加入${reagent.name}。`),
            ].slice(-LOG_LIMIT),
          },
        },
      })
      return
    }
    const accepted = Math.min(amount, def.capacity - total)

    const existing = target.contents.find((content) => content.reagentId === reagentId)
    const contents: ApparatusContent[] = existing
      ? target.contents.map((content) =>
          content.reagentId === reagentId
            ? { ...content, amount: content.amount + accepted }
            : content,
        )
      : [...target.contents, { reagentId, amount: accepted }]

    const unit = reagent.phase === 'solid' ? 'g' : 'mL'
    const next = patchApparatus(state, workspaceId, apparatusId, (item) =>
      recomputeMixture({ ...item, contents }),
    ) as { workspaces: Record<string, Workspace> }
    const updated = next.workspaces[workspaceId]
    set({
      workspaces: {
        ...next.workspaces,
        [workspaceId]: {
          ...updated,
          log: [
            ...updated.log,
            createLogEntry(
              'info',
              `向${def.name}中加入了 ${accepted.toFixed(1)} ${unit} ${reagent.name}（${reagent.formula}）。`,
            ),
          ].slice(-LOG_LIMIT),
        },
      },
    })
  },

  consumeReagent: (workspaceId, apparatusId, reagentId, amount) =>
    set((state) =>
      patchApparatus(state, workspaceId, apparatusId, (item) => {
        const contents = item.contents
          .map((content) =>
            content.reagentId === reagentId
              ? { ...content, amount: Math.max(0, content.amount - amount) }
              : content,
          )
          .filter((content) => content.amount > 0.0001)
        return recomputeMixture({ ...item, contents })
      }),
    ),

  /* --------------------------- simulation commit --------------------------- */
  commitSimulation: (workspaceId, patches) => {
    if (patches.length === 0) return
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    const index = new Map(patches.map((patch) => [patch.id, patch]))
    set({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          ...workspace,
          apparatus: workspace.apparatus.map((item) => {
            const patch = index.get(item.id)
            if (!patch) return item
            return {
              ...item,
              temperature: patch.temperature ?? item.temperature,
              mixtureColor:
                patch.mixtureColor === undefined ? item.mixtureColor : patch.mixtureColor,
              mixtureOpacity: patch.mixtureOpacity ?? item.mixtureOpacity,
            }
          }),
        },
      },
    })
  },

  /* --------------------------------- logging ------------------------------- */
  log: (workspaceId, level, text) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    const last = workspace.log[workspace.log.length - 1]
    // Reactions repeat every frame; collapse identical consecutive lines.
    if (last && last.text === text) return
    set({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          ...workspace,
          log: [...workspace.log, createLogEntry(level, text)].slice(-LOG_LIMIT),
        },
      },
    })
  },

  clearLog: (workspaceId) => {
    const state = get()
    const workspace = state.workspaces[workspaceId]
    if (!workspace) return
    set({ workspaces: { ...state.workspaces, [workspaceId]: { ...workspace, log: [] } } })
  },

  /* ------------------------------- snapshots ------------------------------ */
  exportWorkspace: (id) => {
    const workspace = get().workspaces[id]
    if (!workspace) return null
    return {
      format: 'lavoisier.workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace,
    }
  },

  importWorkspace: (snapshot) => {
    const state = get()
    const source = snapshot?.workspace
    if (!source || !Array.isArray(source.apparatus)) return null

    // Rebuild every instrument through the factories so malformed fields in a
    // hand-edited file cannot poison the simulation.
    const apparatus = source.apparatus.flatMap((item) => {
      if (!item || typeof item.kind !== 'string') return []
      try {
        getApparatusDef(item.kind)
      } catch {
        return []
      }
      const def = getApparatusDef(item.kind)
      const built = createApparatus(
        item.kind,
        Number.isFinite(item.x) ? item.x : 200,
        Number.isFinite(item.y) ? item.y : 200,
      )
      const contents = (item.contents ?? []).filter(
        (content) => content && REAGENT_MAP[content.reagentId] && content.amount > 0,
      )
      return [
        recomputeMixture({
          ...built,
          id: typeof item.id === 'string' ? item.id : built.id,
          rotation: Number.isFinite(item.rotation) ? item.rotation : 0,
          temperature: Number.isFinite(item.temperature) ? item.temperature : 22,
          contents: contents.map((content) => ({
            reagentId: content.reagentId,
            amount: clamp(content.amount, 0, def.capacity),
          })),
          lit: def.emitsHeat ? item.lit !== false : false,
        }),
      ]
    })

    const workspace: Workspace = {
      id: uid('ws'),
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : '导入的实验台',
      createdAt: Date.now(),
      apparatus,
      selectedId: null,
      log: [
        createLogEntry(
          'info',
          `已导入实验台，共恢复 ${apparatus.length} 件仪器与 ${apparatus.reduce(
            (sum, item) => sum + item.contents.length,
            0,
          )} 项试剂。`,
        ),
      ],
    }

    set({
      workspaces: { ...state.workspaces, [workspace.id]: workspace },
      order: [...state.order, workspace.id],
      activeId: workspace.id,
    })
    return workspace.id
  },

  resetWorkspace: (id) => {
    const state = get()
    const workspace = state.workspaces[id]
    if (!workspace) return
    set({
      workspaces: {
        ...state.workspaces,
        [id]: {
          ...workspace,
          apparatus: [],
          selectedId: null,
          log: [createLogEntry('info', '实验台已清空。')],
        },
      },
    })
  },
}))

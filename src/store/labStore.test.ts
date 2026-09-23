/**
 * Store tests.
 *
 * The store is module-level state, so every test resets it to a known shape
 * first. What matters here is the multi-workspace contract (isolation, order,
 * the "always keep one bench" rule) and the import sanitiser, which is the only
 * place untrusted JSON enters the app.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { createApparatus, recomputeMixture, useLabStore } from '@/store/labStore'
import type { WorkspaceSnapshot } from '@/types'

/** The store's getState, named short for readability in assertions. */
const store = () => useLabStore.getState()

/** Collapses the store back to exactly one empty bench. */
function resetToSingleBench(): string {
  const state = store()
  for (const id of [...state.order].slice(1)) state.deleteWorkspace(id)
  const first = store().order[0]
  store().resetWorkspace(first)
  return first
}

beforeEach(() => {
  resetToSingleBench()
})

describe('workspace lifecycle', () => {
  it('starts with exactly one bench that is active', () => {
    const state = store()
    expect(state.order).toHaveLength(1)
    expect(state.activeId).toBe(state.order[0])
    expect(state.workspaces[state.activeId]).toBeDefined()
  })

  it('creates a bench, appends it last and makes it active', () => {
    const before = store().order.length
    const id = store().createWorkspace('新台')

    expect(store().order).toHaveLength(before + 1)
    expect(store().order[store().order.length - 1]).toBe(id)
    expect(store().activeId).toBe(id)
    expect(store().workspaces[id].name).toBe('新台')
  })

  it('falls back to a generated name when given only whitespace', () => {
    const id = store().createWorkspace('   ')
    expect(store().workspaces[id].name.trim().length).toBeGreaterThan(0)
  })

  it('renames a bench and ignores a blank or unchanged name', () => {
    const id = store().activeId
    store().renameWorkspace(id, '  酸碱滴定  ')
    expect(store().workspaces[id].name).toBe('酸碱滴定')

    store().renameWorkspace(id, '   ')
    expect(store().workspaces[id].name).toBe('酸碱滴定')

    store().renameWorkspace(id, '酸碱滴定')
    expect(store().workspaces[id].name).toBe('酸碱滴定')
  })

  it('refuses to delete the last remaining bench', () => {
    const only = store().activeId
    store().deleteWorkspace(only)
    expect(store().order).toHaveLength(1)
    expect(store().workspaces[only]).toBeDefined()
  })

  it('deletes a bench and moves the selection off it', () => {
    const first = store().activeId
    const second = store().createWorkspace('第二台')
    expect(store().activeId).toBe(second)

    store().deleteWorkspace(second)
    expect(store().order).not.toContain(second)
    expect(store().workspaces[second]).toBeUndefined()
    expect(store().activeId).toBe(first)
  })

  it('keeps the active bench when a different one is deleted', () => {
    const first = store().activeId
    const second = store().createWorkspace('第二台')
    store().setActiveWorkspace(first)

    store().deleteWorkspace(second)
    expect(store().activeId).toBe(first)
  })

  it('duplicates a bench with fresh instrument ids and inserts it next door', () => {
    const source = store().activeId
    const vesselId = store().addApparatus(source, 'beaker', 100, 100)!
    store().addReagent(source, vesselId, 'hcl', 2)

    const copyId = store().duplicateWorkspace(source)!
    const copy = store().workspaces[copyId]

    expect(copy.name).toContain('副本')
    expect(copy.apparatus).toHaveLength(1)
    expect(copy.apparatus[0].contents).toEqual([{ reagentId: 'hcl', amount: 2 }])
    // Identity must not be shared, or editing one bench would edit the other.
    expect(copy.apparatus[0].id).not.toBe(vesselId)
    // Inserted directly after the source, not at the end.
    expect(store().order.indexOf(copyId)).toBe(store().order.indexOf(source) + 1)
  })

  it('does not share contents between a bench and its duplicate', () => {
    const source = store().activeId
    const vesselId = store().addApparatus(source, 'beaker', 100, 100)!
    store().addReagent(source, vesselId, 'hcl', 2)

    const copyId = store().duplicateWorkspace(source)!
    store().addReagent(copyId, store().workspaces[copyId].apparatus[0].id, 'zn', 1)

    expect(store().workspaces[source].apparatus[0].contents).toHaveLength(1)
    expect(store().workspaces[copyId].apparatus[0].contents).toHaveLength(2)
  })

  it('rejects switching to an unknown bench', () => {
    const current = store().activeId
    store().setActiveWorkspace('ws_does_not_exist')
    expect(store().activeId).toBe(current)
  })
})

describe('workspace isolation', () => {
  it('keeps instruments separate per bench', () => {
    const a = store().activeId
    const b = store().createWorkspace('B')

    store().addApparatus(a, 'beaker', 100, 100)
    store().addApparatus(b, 'test-tube', 200, 200)
    store().addApparatus(b, 'flask', 300, 300)

    expect(store().workspaces[a].apparatus.map((item) => item.kind)).toEqual(['beaker'])
    expect(store().workspaces[b].apparatus.map((item) => item.kind)).toEqual([
      'test-tube',
      'flask',
    ])
  })

  it('keeps logs separate per bench', () => {
    const a = store().activeId
    const b = store().createWorkspace('B')

    store().log(a, 'info', '甲台的事件')
    store().log(b, 'info', '乙台的事件')

    expect(store().workspaces[a].log.map((entry) => entry.text)).toContain('甲台的事件')
    expect(store().workspaces[a].log.map((entry) => entry.text)).not.toContain('乙台的事件')
  })

  it('bounds the log so a long session cannot grow without limit', () => {
    const id = store().activeId
    for (let i = 0; i < 400; i++) store().log(id, 'info', `事件 ${i}`)
    expect(store().workspaces[id].log.length).toBeLessThanOrEqual(120)
  })

  it('collapses an identical consecutive log line', () => {
    const id = store().activeId
    store().log(id, 'info', '重复的一行')
    const afterFirst = store().workspaces[id].log.length
    store().log(id, 'info', '重复的一行')
    expect(store().workspaces[id].log.length).toBe(afterFirst)
  })
})

describe('apparatus mutations', () => {
  it('places an instrument, selects it and logs it', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 250, 260)!
    const workspace = store().workspaces[id]

    expect(workspace.apparatus).toHaveLength(1)
    expect(workspace.selectedId).toBe(vesselId)
    expect(workspace.apparatus[0]).toMatchObject({ x: 250, y: 260, rotation: 0 })
    expect(workspace.log.some((entry) => entry.text.includes('烧杯'))).toBe(true)
  })

  it('arrives with a heat source already lit but a vessel not lit', () => {
    const id = store().activeId
    store().addApparatus(id, 'alcohol-lamp', 10, 10)
    store().addApparatus(id, 'beaker', 20, 20)
    const [lamp, beaker] = store().workspaces[id].apparatus
    expect(lamp.lit).toBe(true)
    expect(beaker.lit).toBe(false)
  })

  it('normalises rotation into [0, 360)', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().rotateApparatus(id, vesselId, -30)
    expect(store().workspaces[id].apparatus[0].rotation).toBe(330)
    store().rotateApparatus(id, vesselId, 450)
    expect(store().workspaces[id].apparatus[0].rotation).toBe(90)
  })

  it('moves an instrument without touching its contents', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'hcl', 2)
    store().moveApparatus(id, vesselId, 500, 400)

    const item = store().workspaces[id].apparatus[0]
    expect([item.x, item.y]).toEqual([500, 400])
    expect(item.contents).toEqual([{ reagentId: 'hcl', amount: 2 }])
  })

  it('clears the selection when the selected instrument is removed', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    expect(store().workspaces[id].selectedId).toBe(vesselId)
    store().removeApparatus(id, vesselId)
    expect(store().workspaces[id].selectedId).toBeNull()
  })

  it('toggles a flame only on an instrument that can emit heat', () => {
    const id = store().activeId
    const lampId = store().addApparatus(id, 'alcohol-lamp', 0, 0)!
    const vesselId = store().addApparatus(id, 'beaker', 50, 0)!

    store().toggleFlame(id, lampId)
    expect(store().workspaces[id].apparatus.find((a) => a.id === lampId)!.lit).toBe(false)

    // A vessel has no flame to toggle; the call must be a no-op.
    store().toggleFlame(id, vesselId)
    expect(store().workspaces[id].apparatus.find((a) => a.id === vesselId)!.lit).toBe(false)
  })

  it('empties a vessel and resets its temperature when cleared', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'cuso4', 3)
    store().commitSimulation(
      id,
      [
        {
          id: vesselId,
          temperature: 150,
          mixtureColor: '#2f9be0',
          mixtureOpacity: 0.8,
          contents: [{ reagentId: 'cuso4', amount: 3 }],
        },
      ],
      [],
    )
    expect(store().workspaces[id].apparatus[0].temperature).toBe(150)

    store().clearApparatus(id, vesselId)
    const item = store().workspaces[id].apparatus[0]
    expect(item.contents).toEqual([])
    expect(item.temperature).toBe(22)
    expect(item.mixtureColor).toBeNull()
  })
})

describe('reagent dosing', () => {
  it('adds a reagent and recomputes the mixture appearance', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'cuso4', 2)

    const item = store().workspaces[id].apparatus[0]
    expect(item.contents).toEqual([{ reagentId: 'cuso4', amount: 2 }])
    expect(item.mixtureColor).toBeTruthy()
    expect(item.mixtureOpacity).toBeGreaterThan(0)
  })

  it('stacks repeated doses of the same reagent instead of duplicating the entry', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'hcl', 1)
    store().addReagent(id, vesselId, 'hcl', 2)

    expect(store().workspaces[id].apparatus[0].contents).toEqual([
      { reagentId: 'hcl', amount: 3 },
    ])
  })

  it('clamps a dose to the vessel capacity and warns', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    // A beaker holds 12 units; ask for far more.
    store().addReagent(id, vesselId, 'water', 100)

    const total = store()
      .workspaces[id].apparatus[0].contents.reduce((sum, c) => sum + c.amount, 0)
    expect(total).toBe(12)
  })

  it('refuses to dose a vessel that is already full and logs a warning', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'water', 12)
    store().addReagent(id, vesselId, 'hcl', 1)

    const workspace = store().workspaces[id]
    expect(workspace.apparatus[0].contents.map((c) => c.reagentId)).toEqual(['water'])
    expect(workspace.log.some((entry) => entry.level === 'warn')).toBe(true)
  })

  it('ignores a dose aimed at an instrument that holds nothing', () => {
    const id = store().activeId
    const rodId = store().addApparatus(id, 'glass-rod', 0, 0)!
    store().addReagent(id, rodId, 'hcl', 2)
    expect(store().workspaces[id].apparatus[0].contents).toEqual([])
  })

  it('bumps the contents revision on a user dose but not on an engine write', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    const before = store().workspaces[id].contentsRevision

    store().addReagent(id, vesselId, 'hcl', 2)
    const afterDose = store().workspaces[id].contentsRevision
    expect(afterDose).toBeGreaterThan(before)

    // The engine's own write-back must not bump it, or the two would fight.
    store().commitSimulation(
      id,
      [
        {
          id: vesselId,
          temperature: 40,
          mixtureColor: '#ffffff',
          mixtureOpacity: 0.5,
          contents: [{ reagentId: 'hcl', amount: 1 }],
        },
      ],
      [],
    )
    expect(store().workspaces[id].contentsRevision).toBe(afterDose)
  })
})

describe('simulation commit', () => {
  it('replaces contents, temperature and appearance in one write', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().addReagent(id, vesselId, 'hcl', 2)

    store().commitSimulation(
      id,
      [
        {
          id: vesselId,
          temperature: 88,
          mixtureColor: '#112233',
          mixtureOpacity: 0.42,
          contents: [{ reagentId: 'zncl2', amount: 1.5 }],
        },
      ],
      [],
    )

    const item = store().workspaces[id].apparatus[0]
    expect(item.temperature).toBe(88)
    expect(item.mixtureColor).toBe('#112233')
    expect(item.mixtureOpacity).toBeCloseTo(0.42)
    expect(item.contents).toEqual([{ reagentId: 'zncl2', amount: 1.5 }])
  })

  it('is a no-op for an empty batch', () => {
    const id = store().activeId
    const before = store().workspaces[id]
    store().commitSimulation(id, [], [])
    expect(store().workspaces[id]).toBe(before)
  })

  it('ignores a patch for an instrument that no longer exists', () => {
    const id = store().activeId
    store().addApparatus(id, 'beaker', 0, 0)
    store().commitSimulation(
      id,
      [
        {
          id: 'ap_ghost',
          temperature: 99,
          mixtureColor: null,
          mixtureOpacity: 0,
          contents: [],
        },
      ],
      [],
    )
    expect(store().workspaces[id].apparatus[0].temperature).not.toBe(99)
  })

  it('appends engine log lines', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 0, 0)!
    store().commitSimulation(
      id,
      [
        {
          id: vesselId,
          temperature: 30,
          mixtureColor: null,
          mixtureOpacity: 0,
          contents: [],
        },
      ],
      [{ id: 'log_x', at: 0, level: 'react', text: '发生了反应' }],
    )
    expect(store().workspaces[id].log.some((entry) => entry.text === '发生了反应')).toBe(true)
  })
})

describe('export and import', () => {
  it('round-trips a bench through JSON', () => {
    const id = store().activeId
    const vesselId = store().addApparatus(id, 'beaker', 123, 456)!
    store().addReagent(id, vesselId, 'cuso4', 2)
    store().rotateApparatus(id, vesselId, 45)

    const snapshot = store().exportWorkspace(id)!
    const text = JSON.stringify(snapshot)
    const parsed = JSON.parse(text) as WorkspaceSnapshot

    expect(parsed.format).toBe('lavoisier.workspace')
    expect(parsed.version).toBe(1)

    const newId = store().importWorkspace(parsed)!
    const imported = store().workspaces[newId]
    expect(imported.name).toBe(snapshot.workspace.name)
    expect(imported.apparatus).toHaveLength(1)
    expect(imported.apparatus[0]).toMatchObject({ x: 123, y: 456, rotation: 45 })
    expect(imported.apparatus[0].contents).toEqual([{ reagentId: 'cuso4', amount: 2 }])
  })

  it('returns null when exporting an unknown bench', () => {
    expect(store().exportWorkspace('ws_missing')).toBeNull()
  })

  it('rejects a snapshot that is not a Lavoisier archive', () => {
    // @ts-expect-error deliberately malformed input
    expect(store().importWorkspace({ format: 'something-else', workspace: {} })).toBeNull()
    // @ts-expect-error deliberately malformed input
    expect(store().importWorkspace(null)).toBeNull()
    // @ts-expect-error deliberately malformed input
    expect(store().importWorkspace({ format: 'lavoisier.workspace' })).toBeNull()
    expect(store().importWorkspace({} as WorkspaceSnapshot)).toBeNull()
  })

  it('drops instruments it does not recognise and keeps the valid ones', () => {
    const id = store().importWorkspace({
      format: 'lavoisier.workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: {
        id: 'ws_x',
        name: '半坏存档',
        createdAt: 0,
        selectedId: null,
        log: [],
        contentsRevision: 0,
        apparatus: [
          // @ts-expect-error unknown kind must be skipped, not crash the import
          { kind: 'not-a-real-instrument', x: 1, y: 1, contents: [] },
          {
            id: 'ap_ok',
            kind: 'beaker',
            x: 10,
            y: 20,
            rotation: 0,
            contents: [{ reagentId: 'water', amount: 2 }],
            temperature: 22,
            lit: false,
            mixtureColor: null,
            mixtureOpacity: 0,
          },
        ],
      },
    })!

    expect(store().workspaces[id].apparatus).toHaveLength(1)
    expect(store().workspaces[id].apparatus[0].kind).toBe('beaker')
  })

  it('drops unknown reagents and clamps an over-capacity dose', () => {
    const id = store().importWorkspace({
      format: 'lavoisier.workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: {
        id: 'ws_x',
        name: '坏试剂',
        createdAt: 0,
        selectedId: null,
        log: [],
        contentsRevision: 0,
        apparatus: [
          {
            id: 'ap_1',
            kind: 'beaker',
            x: 0,
            y: 0,
            rotation: 0,
            temperature: 22,
            lit: false,
            mixtureColor: null,
            mixtureOpacity: 0,
            contents: [
              { reagentId: 'unobtainium', amount: 5 },
              { reagentId: 'water', amount: 9999 },
            ],
          },
        ],
      },
    })!

    const item = store().workspaces[id].apparatus[0]
    // Unknown reagent gone; the known one clamped to the beaker's 12 units.
    expect(item.contents).toEqual([{ reagentId: 'water', amount: 12 }])
  })

  it('repairs non-numeric geometry rather than importing NaN', () => {
    const id = store().importWorkspace({
      format: 'lavoisier.workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: {
        id: 'ws_x',
        name: '坏坐标',
        createdAt: 0,
        selectedId: null,
        log: [],
        contentsRevision: 0,
        apparatus: [
          {
            id: 'ap_1',
            kind: 'beaker',
            // @ts-expect-error deliberately invalid coordinates
            x: 'left',
            // @ts-expect-error deliberately invalid coordinates
            y: null,
            // @ts-expect-error deliberately invalid rotation
            rotation: undefined,
            temperature: 22,
            lit: false,
            mixtureColor: null,
            mixtureOpacity: 0,
            contents: [],
          },
        ],
      },
    })!

    const item = store().workspaces[id].apparatus[0]
    expect(Number.isFinite(item.x)).toBe(true)
    expect(Number.isFinite(item.y)).toBe(true)
    expect(item.rotation).toBe(0)
  })

  it('imports as a new bench and makes it active', () => {
    const before = store().order.length
    const snapshot = store().exportWorkspace(store().activeId)!
    const newId = store().importWorkspace(snapshot)!

    expect(store().order).toHaveLength(before + 1)
    expect(store().activeId).toBe(newId)
  })

  it('resets the contents revision on import so the engine re-mirrors', () => {
    const snapshot = store().exportWorkspace(store().activeId)!
    const newId = store().importWorkspace(snapshot)!
    expect(store().workspaces[newId].contentsRevision).toBeGreaterThan(0)
  })
})

describe('reset', () => {
  it('removes every instrument and clears the selection', () => {
    const id = store().activeId
    store().addApparatus(id, 'beaker', 0, 0)
    store().addApparatus(id, 'flask', 10, 10)

    store().resetWorkspace(id)
    expect(store().workspaces[id].apparatus).toEqual([])
    expect(store().workspaces[id].selectedId).toBeNull()
  })
})

describe('mixture appearance helpers', () => {
  it('reports no colour for an empty vessel', () => {
    const empty = createApparatus('beaker', 0, 0)
    const result = recomputeMixture(empty)
    expect(result.mixtureColor).toBeNull()
    expect(result.mixtureOpacity).toBe(0)
  })

  it('ignores gases when blending the mixture colour', () => {
    const withGas = recomputeMixture({
      ...createApparatus('beaker', 0, 0),
      contents: [{ reagentId: 'o2', amount: 3 }],
    })
    // A gas is not part of the liquid fill, so the vessel stays colourless.
    expect(withGas.mixtureColor).toBeNull()
  })

  it('tints the mixture using the reagent colour strength', () => {
    const result = recomputeMixture({
      ...createApparatus('beaker', 0, 0),
      contents: [{ reagentId: 'cuso4', amount: 2 }],
    })
    // Copper sulfate is a strong blue; the blend must land in the blue range.
    expect(result.mixtureColor).toBeTruthy()
    const hex = result.mixtureColor!.replace('#', '')
    const b = Number.parseInt(hex.slice(4, 6), 16)
    const r = Number.parseInt(hex.slice(0, 2), 16)
    expect(b).toBeGreaterThan(r)
  })
})

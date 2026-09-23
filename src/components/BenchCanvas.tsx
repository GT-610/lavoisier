/**
 * The bench canvas.
 *
 * Owns every pointer gesture on the bench:
 *  - drop from the shelf (instrument placement, reagent dosing)
 *  - move an instrument
 *  - rotate via the handle above the selection
 *  - select / deselect
 *
 * Gestures live in a ref-held state machine, so dragging never re-renders this
 * component; only the store sees the moves, and the render loop reads positions
 * from there once per frame.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApparatusDef } from '@/data/reagents'
import type { ReactionEngine } from '@/engine/reactionEngine'
import { dragRef, hoverRef, useSimulation } from '@/engine/useSimulation'
import { useDragStore } from '@/interaction/dragStore'
import {
  angleFromCenter,
  hitsHandle,
  pickApparatus,
  pickVessel,
  toWorld,
} from '@/interaction/hitTest'
import { useLabStore } from '@/store/labStore'
import { useActiveWorkspaceId } from '@/store/hooks'

type Gesture =
  | { mode: 'idle' }
  | { mode: 'move'; id: string; offsetX: number; offsetY: number }
  | { mode: 'rotate'; id: string }

export interface BenchCanvasProps {
  /**
   * Called once the engine is attached, with a function that spawns a spark
   * burst at a world position. Lets the inspector celebrate a manual reaction
   * without importing the engine itself.
   */
  onBurstReady?: (burst: ((x: number, y: number) => void) | null) => void
}

export function BenchCanvas({ onBurstReady }: BenchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<ReactionEngine | null>(null)
  const gestureRef = useRef<Gesture>({ mode: 'idle' })
  const workspaceId = useActiveWorkspaceId()
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default')

  // A single render/simulation loop for the whole app shell.
  useSimulation({
    canvasRef,
    onFrame: (engine) => {
      engineRef.current = engine
    },
  })

  useEffect(() => {
    if (!onBurstReady) return
    onBurstReady((x, y) => engineRef.current?.burst(x, y, '#4fd1c5', 26, 200))
    return () => onBurstReady(null)
  }, [onBurstReady])

  const rectOf = useCallback((): DOMRect | null => {
    return canvasRef.current?.getBoundingClientRect() ?? null
  }, [])

  /* ---------------------------------------------------------------------- */
  /*  Pointer handling                                                       */
  /* ---------------------------------------------------------------------- */

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const rect = rectOf()
      if (!canvas || !rect) return
      canvas.setPointerCapture(event.pointerId)

      const point = toWorld(event.clientX, event.clientY, rect)
      const state = useLabStore.getState()
      const workspace = state.workspaces[workspaceId]
      if (!workspace) return

      // 1. The rotation handle wins over everything else.
      const selected = workspace.apparatus.find((item) => item.id === workspace.selectedId)
      if (selected && hitsHandle(selected, point)) {
        gestureRef.current = { mode: 'rotate', id: selected.id }
        setCursor('grabbing')
        return
      }

      // 2. Instrument under the pointer.
      const hit = pickApparatus(workspace.apparatus, point)
      if (hit) {
        state.selectApparatus(workspaceId, hit.id)
        gestureRef.current = {
          mode: 'move',
          id: hit.id,
          offsetX: point.x - hit.x,
          offsetY: point.y - hit.y,
        }
        dragRef.current = hit.id
        setCursor('grabbing')
        return
      }

      // 3. Empty bench: clear the selection.
      state.selectApparatus(workspaceId, null)
      gestureRef.current = { mode: 'idle' }
    },
    [rectOf, workspaceId],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = rectOf()
      if (!rect) return
      const point = toWorld(event.clientX, event.clientY, rect)
      const state = useLabStore.getState()
      const workspace = state.workspaces[workspaceId]
      if (!workspace) return
      const gesture = gestureRef.current

      if (gesture.mode === 'rotate') {
        const target = workspace.apparatus.find((item) => item.id === gesture.id)
        if (target) state.rotateApparatus(workspaceId, target.id, angleFromCenter(target, point))
        return
      }

      if (gesture.mode === 'move') {
        const nextX = point.x - gesture.offsetX
        const nextY = point.y - gesture.offsetY
        state.moveApparatus(workspaceId, gesture.id, nextX, nextY)
        return
      }

      // Hover feedback only when idle.
      const hit = pickApparatus(workspace.apparatus, point)
      const nextHover = hit?.id ?? null
      if (hoverRef.current !== nextHover) hoverRef.current = nextHover

      const selected = workspace.apparatus.find((item) => item.id === workspace.selectedId)
      const onHandle = selected ? hitsHandle(selected, point) : false
      setCursor(onHandle || hit ? 'grab' : 'default')
    },
    [rectOf, workspaceId],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    gestureRef.current = { mode: 'idle' }
    dragRef.current = null
    setCursor('default')
  }, [])

  /**
   * Handles a release that carries a shelf payload. The canvas is the only
   * component that knows its own coordinate system, so the drop is resolved
   * here rather than in the shelf.
   */
  const handleShelfDrop = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = useDragStore.getState()
      const payload = drag.payload
      if (!payload) return
      const rect = rectOf()
      if (!rect) return
      const point = toWorld(event.clientX, event.clientY, rect)
      const state = useLabStore.getState()

      if (payload.type === 'apparatus') {
        state.addApparatus(workspaceId, payload.kind, point.x, point.y)
        state.log(
          workspaceId,
          'info',
          `${payload.label}已放置，拖动可移动，选中后拖动上方圆点可旋转。`,
        )
      } else {
        const workspace = state.workspaces[workspaceId]
        const vessel = pickVessel(workspace.apparatus, point)
        if (vessel) {
          state.addReagent(workspaceId, vessel.id, payload.reagentId, drag.dose ?? 1)
        } else {
          state.log(workspaceId, 'warn', '请把试剂滴入烧杯、试管等容器中。')
        }
      }
      drag.end()
    },
    [rectOf, workspaceId],
  )

  // A shelf drag that ends anywhere else must still be cancelled.
  const dragPayload = useDragStore((store) => store.payload)
  useEffect(() => {
    if (!dragPayload) return
    const cancel = () => useDragStore.getState().end()
    window.addEventListener('pointerup', cancel)
    return () => window.removeEventListener('pointerup', cancel)
  }, [dragPayload])

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          handleShelfDrop(event)
          handlePointerUp(event)
        }}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          hoverRef.current = null
        }}
      />
      {dragPayload && (
        <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-lab-accent/40">
          <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md border border-lab-border bg-lab-panel/95 px-3 py-1 text-xs text-lab-text">
            释放以放置「{dragPayload.label}」
          </span>
        </div>
      )}
      <CanvasLegend />
    </div>
  )
}

/** Small always-visible cheat sheet for the region detection rules. */
function CanvasLegend() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 max-w-[260px] rounded-lg border border-lab-border-soft bg-lab-panel/90 p-2.5 backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-lab-faint uppercase">
          反应条件
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-lab-faint hover:text-lab-text"
        >
          收起
        </button>
      </div>
      <ul className="space-y-0.5 text-[11px] leading-snug text-lab-muted">
        <li>· 试剂需在同一个容器内</li>
        <li>· 酒精灯火焰接触容器底部 → 加热</li>
        <li>· 玻璃棒接触容器 → 搅拌</li>
        <li>· 颜色、气泡与沉淀由规则表驱动</li>
      </ul>
    </div>
  )
}

/** Kept exported for the toolbar: names the instrument kinds on the bench. */
export function describeApparatus(kind: Parameters<typeof getApparatusDef>[0]): string {
  return getApparatusDef(kind).name
}


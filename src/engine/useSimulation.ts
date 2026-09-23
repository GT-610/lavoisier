/**
 * React bridge for the simulation engine.
 *
 * The canvas loop deliberately lives outside React: it reads the active
 * workspace once per frame from the store's imperative API, advances a
 * per-workspace `ReactionEngine`, and paints. Only two things travel back into
 * React — the rate-limited `commitSimulation` write-back and nothing else — so
 * the component tree re-renders roughly ten times per second while the canvas
 * runs at display refresh rate.
 */
import { useEffect, useRef } from 'react'

import { ReactionEngine } from '@/engine/reactionEngine'
import { drawScene } from '@/render/scene'
import { useLabStore } from '@/store/labStore'

/** One engine per workspace, kept alive across tab switches. */
const engines = new Map<string, ReactionEngine>()

function engineFor(workspaceId: string): ReactionEngine {
  let engine = engines.get(workspaceId)
  if (!engine) {
    engine = new ReactionEngine(workspaceId)
    engines.set(workspaceId, engine)
  }
  return engine
}

/** Drops the engine of a deleted workspace so particles do not leak. */
export function disposeEngine(workspaceId: string) {
  engines.delete(workspaceId)
}

export function getEngine(workspaceId: string): ReactionEngine {
  return engineFor(workspaceId)
}

export interface CanvasMetrics {
  width: number
  height: number
}

export interface UseSimulationOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** Called once per animation frame with the live engine for overlay drawing. */
  onFrame?: (engine: ReactionEngine) => void
}

/**
 * Starts the render/simulation loop for whichever workspace is active.
 * The loop survives workspace switches — it simply reads the new active id.
 */
export function useSimulation({ canvasRef, onFrame }: UseSimulationOptions) {
  const frameCallback = useRef(onFrame)

  // Keep the latest callback in the ref *after* the render commits, never
  // during it. The loop below reads the ref on each frame, so a new callback
  // takes effect on the very next frame without restarting the loop.
  useEffect(() => {
    frameCallback.current = onFrame
  }, [onFrame])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let mounted = true

    const tick = (now: number) => {
      if (!mounted) return
      frame = requestAnimationFrame(tick)

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clamp dt so that returning to a backgrounded tab does not fast-forward
      // the simulation through a huge single step.
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (dt === 0) return

      const state = useLabStore.getState()
      const workspace = state.workspaces[state.activeId]
      if (!workspace) return

      const engine = engineFor(workspace.id)
      const due = engine.step({ workspace, dt })
      if (due) {
        const { patches, logs } = engine.buildCommit()
        state.commitSimulation(workspace.id, patches, logs)
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const interaction = useLabStore.getState()
      const current = interaction.workspaces[interaction.activeId]
      if (!current) return

      drawScene({
        ctx,
        width,
        height,
        apparatus: current.apparatus,
        selectedId: current.selectedId,
        hoveredId: hoverRef.current,
        draggingId: dragRef.current,
        time: now / 1000,
        effects: engine.runtimeEffects,
        particles: engine.particleSystem,
      })

      frameCallback.current?.(engine)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      mounted = false
      cancelAnimationFrame(frame)
    }
  }, [canvasRef])
}

/**
 * Hover/drag identity shared between the pointer handlers and the render loop.
 * Kept as module-level refs so neither side has to re-render to communicate.
 */
export const hoverRef: { current: string | null } = { current: null }
export const dragRef: { current: string | null } = { current: null }

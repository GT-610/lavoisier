/**
 * Drag-and-drop payload store.
 *
 * The shelf and the canvas are siblings, so a drag that starts on one and ends
 * on the other has no common React parent to hold the in-flight state. Rather
 * than thread callbacks through the tree, the payload lives in a tiny store
 * that both sides read.
 *
 * Pointer events are used instead of the native HTML5 drag-and-drop API so the
 * same code path works for touch and pen, and so the drop target can be
 * resolved against the canvas's own coordinate system.
 */
import { create } from 'zustand'

import type { ApparatusKind } from '@/types'

export type DragPayload =
  | { type: 'apparatus'; kind: ApparatusKind; label: string }
  | { type: 'reagent'; reagentId: string; label: string; color: string }

export interface DragState {
  payload: DragPayload | null
  /** Viewport coordinates of the pointer. */
  x: number
  y: number
  /** Reagent dose carried by the current drag. */
  dose: number
  begin: (payload: DragPayload, x: number, y: number, dose?: number) => void
  update: (x: number, y: number) => void
  end: () => void
}

export const useDragStore = create<DragState>()((set) => ({
  payload: null,
  x: 0,
  y: 0,
  dose: 1,
  begin: (payload, x, y, dose = 1) => set({ payload, x, y, dose }),
  update: (x, y) => set({ x, y }),
  end: () => set({ payload: null }),
}))

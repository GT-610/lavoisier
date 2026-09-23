/**
 * Geometry helpers for pointer interaction.
 *
 * Hit testing runs on every pointer move, so it works on the *local* bounding
 * box of the rotated instrument rather than a polygon: the pointer is rotated
 * into the instrument's own frame first, then compared against the silhouette
 * box. A handful of instruments get an extra refinement because their
 * silhouette is not a rectangle (the flask's neck, the cylinder's stem).
 */
import { getApparatusDef } from '@/data/reagents'
import type { Apparatus } from '@/types'
import { rotatePoint } from '@/utils/math'

/** Radius of the rotation handle above a selected instrument. */
export const HANDLE_RADIUS = 9
/** Distance from the instrument's top edge to the handle centre. */
export const HANDLE_OFFSET = 30

export interface Vec2 {
  x: number
  y: number
}

/** Converts a viewport point to canvas-local world coordinates. */
export function toWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): Vec2 {
  return { x: clientX - rect.left, y: clientY - rect.top }
}

/** Local-space point inside the instrument's own unrotated frame. */
function toLocal(apparatus: Apparatus, point: Vec2): Vec2 {
  return rotatePoint(point.x - apparatus.x, point.y - apparatus.y, -apparatus.rotation)
}

/**
 * Whether a world point lands on the instrument's silhouette.
 * `padding` widens the target, which makes thin instruments like the glass rod
 * comfortably grabbable.
 */
export function hitsApparatus(apparatus: Apparatus, point: Vec2, padding = 0): boolean {
  const def = getApparatusDef(apparatus.kind)
  const local = toLocal(apparatus, point)
  const hw = def.width / 2 + padding
  const hh = def.height / 2 + padding

  if (Math.abs(local.x) > hw || Math.abs(local.y) > hh) return false

  switch (apparatus.kind) {
    case 'glass-rod':
      // A rod is a thick line, so keep the relaxed padding box.
      return true
    case 'flask': {
      // Above the shoulder only the narrow neck is solid.
      const shoulder = -hh + def.height * 0.44
      if (local.y < shoulder) return Math.abs(local.x) <= def.width * 0.17 + padding
      return true
    }
    case 'measuring-cylinder': {
      // Below the base grading the silhouette tapers into a narrow foot.
      if (local.y > hh - 6) return Math.abs(local.x) <= def.width * 0.28 + padding
      return true
    }
    case 'test-tube': {
      // Round bottom: reject the two corners below the arc centre.
      const centre = hh - hw
      if (local.y > centre) {
        const dx = local.x
        const dy = local.y - centre
        return dx * dx + dy * dy <= hw * hw
      }
      return true
    }
    case 'alcohol-lamp': {
      // Only the glass body is interactive, not the flame.
      return local.y > -hh + def.height * 0.2
    }
    case 'funnel': {
      const stem = def.width * 0.07 + padding
      if (local.y > -hh + def.height * 0.42) return Math.abs(local.x) <= stem
      return true
    }
    default:
      return true
  }
}

/** Whether a world point is inside a vessel's cavity (i.e. would receive a drop). */
export function hitsCavity(apparatus: Apparatus, point: Vec2): boolean {
  const def = getApparatusDef(apparatus.kind)
  if (def.capacity <= 0) return false
  return hitsApparatus(apparatus, point, 0)
}

/**
 * Topmost instrument under the pointer. Later entries win, which matches the
 * paint order in `drawScene` closely enough for interaction purposes.
 */
export function pickApparatus(apparatus: Apparatus[], point: Vec2): Apparatus | null {
  for (let i = apparatus.length - 1; i >= 0; i--) {
    const item = apparatus[i]
    // Heat sources sit behind vessels, so they lose ties.
    if (item.kind === 'alcohol-lamp' && apparatus.length > 1) {
      if (hitsApparatus(item, point, 0)) {
        const above = apparatus.some(
          (other) => other.id !== item.id && hitsApparatus(other, point, 2),
        )
        if (above) continue
      }
    }
    if (hitsApparatus(item, point, 2)) return item
  }
  return null
}

/** Finds the vessel that should receive a reagent dropped at `point`. */
export function pickVessel(apparatus: Apparatus[], point: Vec2): Apparatus | null {
  for (let i = apparatus.length - 1; i >= 0; i--) {
    const item = apparatus[i]
    if (hitsCavity(item, point)) return item
  }
  return null
}

/**
 * Position of the rotation handle in world space: a fixed offset above the
 * instrument's top edge, following its rotation.
 */
export function handlePosition(apparatus: Apparatus): Vec2 {
  const def = getApparatusDef(apparatus.kind)
  const local = { x: 0, y: -def.height / 2 - HANDLE_OFFSET }
  const rotated = rotatePoint(local.x, local.y, apparatus.rotation)
  return { x: apparatus.x + rotated.x, y: apparatus.y + rotated.y }
}

export function hitsHandle(apparatus: Apparatus, point: Vec2): boolean {
  const handle = handlePosition(apparatus)
  const dx = point.x - handle.x
  const dy = point.y - handle.y
  return dx * dx + dy * dy <= (HANDLE_RADIUS + 6) ** 2
}

/**
 * Angle in degrees from an instrument's centre to a world point, offset so that
 * dragging the handle puts "up" at 0°.
 */
export function angleFromCenter(apparatus: Apparatus, point: Vec2): number {
  const dx = point.x - apparatus.x
  const dy = point.y - apparatus.y
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
  return ((degrees + 90) % 360 + 360) % 360
}

/**
 * Scene composition.
 *
 * Owns the draw order and the coordinate system. World coordinates are CSS
 * pixels with the origin at the canvas top-left, so an exported file refers to
 * the same positions the user sees regardless of device pixel ratio.
 */
import { drawApparatus } from '@/render/apparatus'
import { getApparatusDef } from '@/data/reagents'
import type { ParticleSystem } from '@/engine/particles'
import type { Apparatus } from '@/types'
import { withAlpha } from '@/utils/math'

/** Per-apparatus visual overrides produced by the simulation engine. */
export interface RuntimeEffect {
  /** Sustained glow colour, e.g. burning magnesium. */
  glow?: string
  /** Mixture tint override (winning colour after a reaction). */
  color?: string | null
  opacity?: number
  /** 0..1 strength of the heat shimmer under the vessel. */
  heat?: number
}

export interface SceneInput {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  apparatus: Apparatus[]
  selectedId: string | null
  hoveredId: string | null
  draggingId: string | null
  time: number
  effects: Map<string, RuntimeEffect>
  particles: ParticleSystem
  /** Pointer position in world space, used by the placement ghost. */
  ghost?: { x: number; y: number; kind: Apparatus['kind'] } | null
}

/** Heat sources sit behind vessels; stirring tools sit in front. */
function zIndex(apparatus: Apparatus): number {
  switch (apparatus.kind) {
    case 'alcohol-lamp':
      return 0
    case 'funnel':
    case 'glass-rod':
      return 2
    default:
      return 1
  }
}

export function drawScene(input: SceneInput) {
  const { ctx, width, height, time } = input

  ctx.clearRect(0, 0, width, height)
  drawBackground(ctx, width, height)

  const ordered = [...input.apparatus].sort((a, b) => zIndex(a) - zIndex(b))

  // Bench shadows for everything that emits heat, so flames look grounded.
  for (const item of ordered) {
    const effect = input.effects.get(item.id)
    if (effect?.heat) drawHeatHaze(ctx, item, effect.heat, time)
  }

  for (const item of ordered) {
    const effect = input.effects.get(item.id)
    drawApparatus(ctx, item, {
      selected: item.id === input.selectedId,
      hovered: item.id === input.hoveredId,
      time,
      color: effect?.color,
      opacity: effect?.opacity,
    })
    if (effect?.glow) drawGlow(ctx, item, effect.glow, time)
  }

  input.particles.draw(ctx)

  // The rotation handle is drawn last so it is never occluded by a vessel that
  // happens to overlap it.
  const selected = input.apparatus.find((item) => item.id === input.selectedId)
  if (selected) drawRotationHandle(ctx, selected, time)

  if (input.ghost) drawGhost(ctx, input.ghost.x, input.ghost.y, time)
}

/* -------------------------------------------------------------------------- */
/*  Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, '#0d111c')
  base.addColorStop(0.55, '#0b0e16')
  base.addColorStop(1, '#080a11')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  // Bench grid.
  const cell = 28
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.032)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0.5; x < width; x += cell) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = 0.5; y < height; y += cell) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()

  // Emphasised major grid lines every five cells.
  ctx.strokeStyle = 'rgba(120, 180, 200, 0.05)'
  ctx.beginPath()
  for (let x = 0.5; x < width; x += cell * 5) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = 0.5; y < height; y += cell * 5) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawHeatHaze(
  ctx: CanvasRenderingContext2D,
  apparatus: Apparatus,
  strength: number,
  time: number,
) {
  const def = getApparatusDef(apparatus.kind)
  const pulse = 0.85 + Math.sin(time * 3.4 + apparatus.x * 0.02) * 0.15
  const radius = def.width * 1.5
  const gradient = ctx.createRadialGradient(
    apparatus.x,
    apparatus.y + def.height * 0.4,
    2,
    apparatus.x,
    apparatus.y + def.height * 0.4,
    radius,
  )
  gradient.addColorStop(0, withAlpha('#ff7a3c', 0.2 * strength * pulse))
  gradient.addColorStop(1, withAlpha('#ff7a3c', 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(apparatus.x, apparatus.y + def.height * 0.4, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  apparatus: Apparatus,
  color: string,
  time: number,
) {
  const def = getApparatusDef(apparatus.kind)
  const pulse = 0.78 + Math.sin(time * 7.5) * 0.22
  const radius = Math.max(def.width, def.height) * 1.05
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const gradient = ctx.createRadialGradient(
    apparatus.x,
    apparatus.y,
    1,
    apparatus.x,
    apparatus.y,
    radius,
  )
  gradient.addColorStop(0, withAlpha(color, 0.55 * pulse))
  gradient.addColorStop(0.5, withAlpha(color, 0.18 * pulse))
  gradient.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(apparatus.x, apparatus.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Rotation handle: a stem plus a round grip above the instrument. Its position
 * mirrors `handlePosition` in `interaction/hitTest`, which is what makes the
 * grab target line up with what the user sees.
 */
function drawRotationHandle(ctx: CanvasRenderingContext2D, apparatus: Apparatus, time: number) {
  const def = getApparatusDef(apparatus.kind)
  const gripDistance = def.height / 2 + 30

  ctx.save()
  ctx.translate(apparatus.x, apparatus.y)
  ctx.rotate((apparatus.rotation * Math.PI) / 180)

  // Stem.
  ctx.beginPath()
  ctx.moveTo(0, -def.height / 2 - 4)
  ctx.lineTo(0, -gripDistance + 8)
  ctx.strokeStyle = 'rgba(79, 209, 197, 0.6)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // Grip.
  const pulse = 1 + Math.sin(time * 3.2) * 0.06
  ctx.beginPath()
  ctx.arc(0, -gripDistance, 9 * pulse, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(79, 209, 197, 0.9)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(11, 14, 22, 0.9)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Rotation glyph inside the grip.
  ctx.beginPath()
  ctx.arc(0, -gripDistance, 4, 0.5, Math.PI * 1.75)
  ctx.strokeStyle = 'rgba(11, 14, 22, 0.85)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(2.4, -gripDistance - 4.4)
  ctx.lineTo(4.6, -gripDistance - 0.6)
  ctx.lineTo(0.4, -gripDistance - 0.9)
  ctx.closePath()
  ctx.fillStyle = 'rgba(11, 14, 22, 0.85)'
  ctx.fill()

  ctx.restore()
}

/** Dashed placement preview shown while dragging from the shelf. */
function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.setLineDash([6, 6])
  ctx.lineDashOffset = -time * 18
  ctx.strokeStyle = 'rgba(79, 209, 197, 0.85)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, 0, 26, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()
  ctx.restore()
}

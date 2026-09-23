/**
 * Canvas renderer for laboratory apparatus.
 *
 * Every instrument is drawn from scratch with the 2D context — no sprite
 * atlas, no image decoding — so the whole scene stays sharp at any zoom and
 * the bundle carries no binary assets. Shapes are declared as `Path2D`
 * factories in a unit box centred on the origin, then scaled to the
 * instrument's declared footprint.
 *
 * Rendering is intentionally stateless: the function receives an apparatus and
 * a few view flags and paints it. All animation comes from the `time` argument
 * so the same code path serves the static export preview.
 */
import { getApparatusDef } from '@/data/reagents'
import type { Apparatus, ApparatusKind } from '@/types'
import { darken, withAlpha } from '@/utils/math'

export interface DrawFlags {
  selected: boolean
  hovered: boolean
  /** Seconds since the scene started; drives flame flicker and shimmer. */
  time: number
  /** Mixture tint override coming from the live simulation. */
  color?: string | null
  opacity?: number
  /** 0..1 progress used to draw the contents sloshing while dragging. */
  tilt?: number
}

const GLASS_STROKE = 'rgba(198, 224, 240, 0.72)'
const GLASS_HIGHLIGHT = 'rgba(255, 255, 255, 0.22)'

/* -------------------------------------------------------------------------- */
/*  Silhouettes                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Outer glass silhouettes, expressed in a box of `w` x `h` centred on the
 * origin. Kept as plain functions so both the outline and a scaled cavity can
 * reuse them.
 */
function outlinePath(kind: ApparatusKind, w: number, h: number): Path2D {
  const path = new Path2D()
  const hw = w / 2
  const hh = h / 2
  const r = Math.min(w, h) * 0.09

  switch (kind) {
    case 'beaker': {
      path.moveTo(-hw, -hh)
      path.lineTo(hw, -hh)
      path.lineTo(hw, hh - r)
      path.quadraticCurveTo(hw, hh, hw - r, hh)
      path.lineTo(-hw + r, hh)
      path.quadraticCurveTo(-hw, hh, -hw, hh - r)
      path.closePath()
      break
    }
    case 'test-tube': {
      // Straight walls that close into a full round bottom.
      path.moveTo(-hw, -hh)
      path.lineTo(-hw, hh - hw)
      path.arc(0, hh - hw, hw, Math.PI, 0, true)
      path.lineTo(hw, -hh)
      path.closePath()
      break
    }
    case 'flask': {
      // Narrow neck flaring into a conical body.
      const neck = w * 0.17
      const shoulder = hh - h * 0.42
      path.moveTo(-neck, -hh)
      path.lineTo(neck, -hh)
      path.lineTo(neck, shoulder)
      path.lineTo(hw, hh - r)
      path.quadraticCurveTo(hw, hh, hw - r, hh)
      path.lineTo(-hw + r, hh)
      path.quadraticCurveTo(-hw, hh, -hw, hh - r)
      path.closePath()
      break
    }
    case 'measuring-cylinder': {
      const foot = w * 0.28
      path.moveTo(-hw, -hh)
      path.lineTo(hw, -hh)
      path.lineTo(hw, hh - 6)
      path.lineTo(foot, hh)
      path.lineTo(-foot, hh)
      path.lineTo(-hw, hh - 6)
      path.closePath()
      break
    }
    case 'evaporating-dish': {
      path.moveTo(-hw, -hh + 4)
      path.quadraticCurveTo(-hw * 0.86, hh, 0, hh)
      path.quadraticCurveTo(hw * 0.86, hh, hw, -hh + 4)
      path.closePath()
      break
    }
    case 'alcohol-lamp': {
      const bodyW = hw * 0.78
      path.moveTo(-bodyW, -hh + h * 0.3)
      path.quadraticCurveTo(-hw, hh * 0.55, 0, hh * 0.72)
      path.quadraticCurveTo(hw, hh * 0.55, bodyW, -hh + h * 0.3)
      path.lineTo(hw * 0.34, -hh + h * 0.24)
      path.lineTo(hw * 0.34, -hh)
      path.lineTo(-hw * 0.34, -hh)
      path.lineTo(-hw * 0.34, -hh + h * 0.24)
      path.closePath()
      break
    }
    case 'glass-rod': {
      path.moveTo(-hw, 0)
      path.lineTo(hw, 0)
      break
    }
    case 'funnel': {
      const stem = w * 0.07
      path.moveTo(-hw, -hh)
      path.lineTo(hw, -hh)
      path.lineTo(stem, -hh + h * 0.42)
      path.lineTo(stem, hh)
      path.lineTo(-stem, hh)
      path.lineTo(-stem, -hh + h * 0.42)
      path.closePath()
      break
    }
  }
  return path
}

/**
 * Cavity used to clip the liquid fill. It is the outline pulled inwards so the
 * glass wall stays visible around the contents.
 */
function cavityPath(kind: ApparatusKind, w: number, h: number): Path2D {
  const wall = kind === 'glass-rod' ? 0 : Math.max(2.5, Math.min(w, h) * 0.055)
  const cw = Math.max(1, w - wall * 2)
  const ch = Math.max(1, h - wall * 2)
  return outlinePath(kind, cw, ch)
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Paints one instrument. The caller is responsible for translating to the
 * instrument centre and applying the rotation transform.
 */
export function drawApparatus(ctx: CanvasRenderingContext2D, apparatus: Apparatus, flags: DrawFlags) {
  const def = getApparatusDef(apparatus.kind)
  const { width: w, height: h } = def

  ctx.save()
  ctx.translate(apparatus.x, apparatus.y)
  if (apparatus.rotation) ctx.rotate((apparatus.rotation * Math.PI) / 180)

  drawShadow(ctx, apparatus.kind, w, h)

  switch (apparatus.kind) {
    case 'alcohol-lamp':
      drawAlcoholLamp(ctx, w, h, apparatus.lit, flags.time)
      break
    case 'glass-rod':
      drawGlassRod(ctx, w, h)
      break
    default:
      drawVessel(ctx, apparatus, flags, w, h)
      break
  }

  if (apparatus.kind !== 'glass-rod') {
    drawGlassOverlay(ctx, apparatus.kind, w, h)
  }

  ctx.restore()

  // Selection affordances are drawn unrotated so the handles stay upright.
  ctx.save()
  ctx.translate(apparatus.x, apparatus.y)
  if (flags.selected || flags.hovered) drawSelectionRing(ctx, w, h, flags.selected, flags.time)
  ctx.restore()
}

/* -------------------------------------------------------------------------- */
/*  Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function drawShadow(ctx: CanvasRenderingContext2D, kind: ApparatusKind, w: number, h: number) {
  if (kind === 'glass-rod') return
  const gradient = ctx.createRadialGradient(0, h / 2 - 2, 2, 0, h / 2 - 2, w * 0.62)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.42)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, h / 2 - 1, w * 0.55, h * 0.055 + 3, 0, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.restore()
}

function drawVessel(
  ctx: CanvasRenderingContext2D,
  apparatus: Apparatus,
  flags: DrawFlags,
  w: number,
  h: number,
) {
  const def = getApparatusDef(apparatus.kind)
  const outline = outlinePath(apparatus.kind, w, h)

  // Contents sit inside the cavity, anchored to the bottom of the vessel.
  const total = apparatus.contents.reduce((sum, content) => sum + content.amount, 0)
  const fill = def.capacity > 0 ? Math.min(1, total / def.capacity) : 0
  const color = flags.color ?? apparatus.mixtureColor
  const opacity = flags.opacity ?? apparatus.mixtureOpacity

  if (fill > 0 && color) {
    ctx.save()
    ctx.clip(cavityPath(apparatus.kind, w, h))
    drawLiquid(ctx, apparatus.kind, w, h, fill, color, opacity, flags.time)
    ctx.restore()
  }

  // A glowing rim sells the "something is happening" state.
  if (apparatus.temperature > 70) {
    const heat = Math.min(1, (apparatus.temperature - 70) / 130)
    ctx.save()
    ctx.clip(outline)
    ctx.fillStyle = withAlpha('#ff6b3d', heat * 0.3)
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }

  ctx.fillStyle = 'rgba(150, 190, 215, 0.09)'
  ctx.fill(outline)
  ctx.lineWidth = 2
  ctx.strokeStyle = GLASS_STROKE
  ctx.stroke(outline)
}

function drawLiquid(
  ctx: CanvasRenderingContext2D,
  kind: ApparatusKind,
  w: number,
  h: number,
  fill: number,
  color: string,
  opacity: number,
  time: number,
) {
  const top = h / 2 - h * fill
  // Gentle surface wave; two sine terms keep it from looking like a metronome.
  const amplitude = kind === 'evaporating-dish' ? 0.6 : 1.6
  const steps = 14

  ctx.beginPath()
  ctx.moveTo(-w / 2, h / 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = -w / 2 + w * t
    const wave =
      Math.sin(t * Math.PI * 2 + time * 1.6) * amplitude +
      Math.sin(t * Math.PI * 5 - time * 2.4) * amplitude * 0.35
    ctx.lineTo(x, top + wave)
  }
  ctx.lineTo(w / 2, h / 2)
  ctx.closePath()

  const gradient = ctx.createLinearGradient(0, top, 0, h / 2)
  gradient.addColorStop(0, withAlpha(color, opacity * 0.78))
  gradient.addColorStop(1, withAlpha(darken(color, 0.32), opacity))
  ctx.fillStyle = gradient
  ctx.fill()

  // Meniscus highlight along the surface.
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = -w / 2 + w * t
    const wave =
      Math.sin(t * Math.PI * 2 + time * 1.6) * amplitude +
      Math.sin(t * Math.PI * 5 - time * 2.4) * amplitude * 0.35
    if (i === 0) ctx.moveTo(x, top + wave)
    else ctx.lineTo(x, top + wave)
  }
  ctx.strokeStyle = withAlpha(color, Math.min(1, opacity + 0.25))
  ctx.lineWidth = 1.4
  ctx.stroke()
}

function drawGlassOverlay(ctx: CanvasRenderingContext2D, kind: ApparatusKind, w: number, h: number) {
  const hw = w / 2
  const hh = h / 2

  // Vertical specular streak down the left wall.
  ctx.save()
  ctx.clip(outlinePath(kind, w, h))
  const streak = ctx.createLinearGradient(-hw, 0, hw, 0)
  streak.addColorStop(0, 'rgba(255, 255, 255, 0)')
  streak.addColorStop(0.16, GLASS_HIGHLIGHT)
  streak.addColorStop(0.3, 'rgba(255, 255, 255, 0.04)')
  streak.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = streak
  ctx.fillRect(-hw, -hh, w, h)
  ctx.restore()

  // Graduation marks for the instruments that are supposed to have them.
  if (kind === 'measuring-cylinder' || kind === 'beaker') {
    const marks = kind === 'beaker' ? 3 : 6
    const inset = kind === 'beaker' ? 0.34 : 0.28
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.36)'
    ctx.lineWidth = 1
    for (let i = 1; i <= marks; i++) {
      const y = hh - (h * i) / (marks + 1)
      const len = i % 2 === 0 ? w * 0.3 : w * 0.2
      ctx.beginPath()
      ctx.moveTo(hw - w * inset, y)
      ctx.lineTo(hw - w * inset + len, y)
      ctx.stroke()
    }
  }

  // Lip rim across the actual mouth, not the full silhouette width: a flask's
  // neck is much narrower than its body, while a test tube and a funnel really
  // are as wide at the top as they are overall.
  if (kind === 'test-tube' || kind === 'flask' || kind === 'funnel') {
    const halfMouth = kind === 'flask' ? w * 0.17 : hw
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-halfMouth, -hh)
    ctx.lineTo(halfMouth, -hh)
    ctx.stroke()
  }
}

function drawAlcoholLamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lit: boolean,
  time: number,
) {
  const bodyW = w * 0.39
  const bodyTop = -h / 2 + h * 0.3
  const bodyBottom = h / 2 - h * 0.06

  // Glass reservoir with alcohol inside.
  ctx.beginPath()
  ctx.moveTo(-bodyW, bodyTop)
  ctx.quadraticCurveTo(-w / 2, h * 0.09, 0, h * 0.18)
  ctx.quadraticCurveTo(w / 2, h * 0.09, bodyW, bodyTop)
  ctx.closePath()
  const body = ctx.createLinearGradient(0, bodyTop, 0, bodyBottom)
  body.addColorStop(0, 'rgba(190, 220, 235, 0.26)')
  body.addColorStop(1, 'rgba(120, 160, 185, 0.34)')
  ctx.fillStyle = body
  ctx.fill()
  ctx.strokeStyle = GLASS_STROKE
  ctx.lineWidth = 2
  ctx.stroke()

  // Fuel.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-bodyW * 0.94, bodyTop + h * 0.11)
  ctx.quadraticCurveTo(-w * 0.46, h * 0.09, 0, h * 0.17)
  ctx.quadraticCurveTo(w * 0.46, h * 0.09, bodyW * 0.94, bodyTop + h * 0.11)
  ctx.closePath()
  ctx.fillStyle = 'rgba(120, 190, 220, 0.5)'
  ctx.fill()
  ctx.restore()

  // Collar and wick.
  ctx.fillStyle = '#5d6880'
  ctx.beginPath()
  ctx.roundRect(-w * 0.19, -h / 2 + h * 0.2, w * 0.38, h * 0.11, 2)
  ctx.fill()
  ctx.fillStyle = '#2b3040'
  ctx.fillRect(-w * 0.045, -h / 2 + h * 0.06, w * 0.09, h * 0.15)

  if (lit) drawFlame(ctx, w, h, time)
}

/** Layered teardrop flame with a slight flicker driven by `time`. */
function drawFlame(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const flicker = Math.sin(time * 9) * 0.06 + Math.sin(time * 21.3) * 0.03
  const baseY = -h / 2 + h * 0.06
  const height = h * (0.42 + flicker)
  const width = w * (0.2 + flicker * 0.4)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // Outer haze.
  const haze = ctx.createRadialGradient(0, baseY - height * 0.42, 2, 0, baseY - height * 0.42, width * 3.4)
  haze.addColorStop(0, 'rgba(255, 168, 76, 0.34)')
  haze.addColorStop(1, 'rgba(255, 120, 40, 0)')
  ctx.fillStyle = haze
  ctx.beginPath()
  ctx.arc(0, baseY - height * 0.42, width * 3.4, 0, Math.PI * 2)
  ctx.fill()

  const teardrop = (scale: number, color: string) => {
    ctx.beginPath()
    ctx.moveTo(0, baseY - height * scale)
    ctx.bezierCurveTo(
      width * scale,
      baseY - height * scale * 0.52,
      width * scale * 0.74,
      baseY,
      0,
      baseY + 1,
    )
    ctx.bezierCurveTo(-width * scale * 0.74, baseY, -width * scale, baseY - height * scale * 0.52, 0, baseY - height * scale)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  teardrop(1, 'rgba(255, 146, 44, 0.72)')
  teardrop(0.66, 'rgba(255, 208, 96, 0.85)')
  teardrop(0.34, 'rgba(190, 232, 255, 0.92)')

  ctx.restore()
}

function drawGlassRod(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const hw = w / 2
  ctx.beginPath()
  ctx.moveTo(-hw, 0)
  ctx.lineTo(hw, 0)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(4, h * 0.5)
  const rod = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  rod.addColorStop(0, 'rgba(255, 255, 255, 0.34)')
  rod.addColorStop(0.45, 'rgba(186, 216, 235, 0.5)')
  rod.addColorStop(1, 'rgba(120, 158, 180, 0.5)')
  ctx.strokeStyle = rod
  ctx.stroke()

  ctx.lineWidth = 1
  ctx.strokeStyle = GLASS_STROKE
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/** Dashed ring + corner handles around the selected instrument. */
function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selected: boolean,
  time: number,
) {
  const pad = 8
  const radius = Math.max(w, h) * 0.12
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, radius)
  if (selected) {
    ctx.setLineDash([7, 6])
    ctx.lineDashOffset = -time * 22
    ctx.strokeStyle = 'rgba(79, 209, 197, 0.95)'
    ctx.lineWidth = 1.6
  } else {
    ctx.strokeStyle = 'rgba(139, 150, 173, 0.5)'
    ctx.lineWidth = 1
  }
  ctx.stroke()
  ctx.restore()
}

/** Small numeric helpers shared by the engine and the renderer. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Frame-rate independent exponential approach towards `target`. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt))
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Rotate a point around the origin by `degrees`. */
export function rotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  if (degrees === 0) return { x, y }
  const rad = degToRad(degrees)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/**
 * Axis-aligned distance between two rotated rectangles, used by the region
 * detector. Returns `0` when the rectangles overlap.
 *
 * This is a cheap separating-axis test on the *unrotated* bounding boxes of
 * the rotated shapes — precise enough for "is the glass rod touching the
 * beaker" and far cheaper than a full polygon test every frame.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rotatedBounds(
  cx: number,
  cy: number,
  width: number,
  height: number,
  rotation: number,
): Rect {
  const rad = degToRad(rotation)
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const w = width * cos + height * sin
  const h = width * sin + height * cos
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** Shrink a rectangle towards its centre; used for forgiving touch targets. */
export function insetRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  }
}

/**
 * Blend a list of weighted colours into a single hex colour.
 * Weights are `amount * colorStrength`, so dilute reagents barely tint a
 * mixture while dyes dominate it.
 */
export function blendColors(entries: { color: string; weight: number }[]): string {
  const usable = entries.filter((entry) => entry.weight > 0)
  if (usable.length === 0) return '#000000'

  let r = 0
  let g = 0
  let b = 0
  let total = 0
  for (const entry of usable) {
    const rgb = hexToRgb(entry.color)
    if (!rgb) continue
    r += rgb.r * entry.weight
    g += rgb.g * entry.weight
    b += rgb.b * entry.weight
    total += entry.weight
  }
  if (total === 0) return '#000000'
  return rgbToHex(r / total, g / total, b / total)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  if (full.length !== 6) return null
  const value = Number.parseInt(full, 16)
  if (Number.isNaN(value)) return null
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (channel: number) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Convert a hex colour to an `rgba()` string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${clamp(alpha, 0, 1)})`
}

/** Darken a hex colour by a `0..1` factor without touching other channels. */
export function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb.r * (1 - factor), rgb.g * (1 - factor), rgb.b * (1 - factor))
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

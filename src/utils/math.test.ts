/**
 * Utility tests.
 *
 * Colour blending and the rotated-bounds maths are the two pieces the engine's
 * region detection and the renderer's tinting both depend on, so they get the
 * most attention here. A subtle error in `rectsOverlap` or `rotatedBounds`
 * would silently break flame and glass-rod contact.
 */
import { describe, expect, it } from 'vitest'

import {
  approach,
  blendColors,
  clamp,
  darken,
  degToRad,
  formatTime,
  hexToRgb,
  insetRect,
  lerp,
  rectsOverlap,
  rgbToHex,
  rotatePoint,
  rotatedBounds,
  withAlpha,
} from '@/utils/math'
import { uid } from '@/utils/id'
import { cx } from '@/utils/cx'

describe('numeric helpers', () => {
  it('clamps on both sides and passes values through in range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('interpolates linearly and hits both endpoints', () => {
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
    expect(lerp(0, 10, 0.5)).toBe(5)
  })

  it('approaches a target monotonically without overshooting', () => {
    // `approach` is frame-rate independent, so it must never pass the target.
    let value = 0
    for (let i = 0; i < 200; i++) value = approach(value, 10, 4, 1 / 60)
    expect(value).toBeGreaterThan(9.9)
    expect(value).toBeLessThanOrEqual(10)

    let down = 10
    for (let i = 0; i < 200; i++) down = approach(down, 0, 4, 1 / 60)
    expect(down).toBeLessThan(0.1)
    expect(down).toBeGreaterThanOrEqual(0)
  })

  it('converts degrees to radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI)
    expect(degToRad(0)).toBe(0)
  })

  it('formats a timestamp without throwing', () => {
    expect(typeof formatTime(Date.now())).toBe('string')
    expect(formatTime(Date.now()).length).toBeGreaterThan(0)
  })
})

describe('rotatePoint', () => {
  it('returns the point unchanged at zero degrees', () => {
    expect(rotatePoint(3, 4, 0)).toEqual({ x: 3, y: 4 })
  })

  it('rotates a quarter turn clockwise in screen coordinates', () => {
    const rotated = rotatePoint(10, 0, 90)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(10)
  })

  it('round-trips through opposite rotations', () => {
    const there = rotatePoint(7, -3, 37)
    const back = rotatePoint(there.x, there.y, -37)
    expect(back.x).toBeCloseTo(7)
    expect(back.y).toBeCloseTo(-3)
  })

  it('preserves distance from the origin', () => {
    const rotated = rotatePoint(30, 40, 63)
    expect(Math.hypot(rotated.x, rotated.y)).toBeCloseTo(50)
  })
})

describe('rotatedBounds', () => {
  it('keeps an unrotated box exactly as declared', () => {
    expect(rotatedBounds(0, 0, 100, 40, 0)).toEqual({
      x: -50,
      y: -20,
      width: 100,
      height: 40,
    })
  })

  it('centres the box on the given point', () => {
    const box = rotatedBounds(200, 300, 80, 60, 0)
    expect(box.x + box.width / 2).toBe(200)
    expect(box.y + box.height / 2).toBe(300)
  })

  it('swaps extents at a quarter turn', () => {
    const box = rotatedBounds(0, 0, 100, 40, 90)
    expect(box.width).toBeCloseTo(40)
    expect(box.height).toBeCloseTo(100)
  })

  it('grows the axis-aligned extent as the shape turns', () => {
    const upright = rotatedBounds(0, 0, 100, 20, 0)
    const tilted = rotatedBounds(0, 0, 100, 20, 45)
    // A tilted long box needs a taller axis-aligned container.
    expect(tilted.height).toBeGreaterThan(upright.height)
  })
})

describe('rectsOverlap', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 }

  it('detects a clear overlap', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
  })

  it('detects full containment either way round', () => {
    expect(rectsOverlap(a, { x: 2, y: 2, width: 1, height: 1 })).toBe(true)
    expect(rectsOverlap({ x: 2, y: 2, width: 1, height: 1 }, a)).toBe(true)
  })

  it('reports no overlap for separated boxes', () => {
    expect(rectsOverlap(a, { x: 20, y: 20, width: 5, height: 5 })).toBe(false)
  })

  it('treats edge-touching boxes as not overlapping', () => {
    // Touching exactly is not contact; this keeps the flame test from firing on
    // a lamp that merely shares an edge with the heated region.
    expect(rectsOverlap(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
  })

  it('is symmetric', () => {
    const b = { x: 3, y: -4, width: 9, height: 9 }
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a))
  })
})

describe('insetRect', () => {
  it('shrinks the box towards its centre', () => {
    const inset = insetRect({ x: 0, y: 0, width: 20, height: 20 }, 5)
    expect(inset).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })

  it('never produces a negative size', () => {
    const inset = insetRect({ x: 0, y: 0, width: 4, height: 4 }, 100)
    expect(inset.width).toBe(0)
    expect(inset.height).toBe(0)
  })
})

describe('colour conversion', () => {
  it('parses six-digit hex', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('parses shorthand hex', () => {
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('accepts a hex string without the hash', () => {
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('returns null for input that is not a colour', () => {
    expect(hexToRgb('not-a-colour')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
  })

  it('round-trips through rgbToHex', () => {
    expect(rgbToHex(255, 136, 0)).toBe('#ff8800')
  })

  it('rounds and clamps out-of-range channels', () => {
    expect(rgbToHex(300, -20, 127.6)).toBe('#ff0080')
  })

  it('renders an rgba string with the given alpha', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('clamps alpha into range', () => {
    expect(withAlpha('#ff0000', 5)).toBe('rgba(255, 0, 0, 1)')
    expect(withAlpha('#ff0000', -2)).toBe('rgba(255, 0, 0, 0)')
  })

  it('passes a non-colour through untouched rather than emitting NaN', () => {
    expect(withAlpha('rebeccapurple', 0.5)).toBe('rebeccapurple')
  })

  it('darkens towards black', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080')
    expect(darken('#ffffff', 0)).toBe('#ffffff')
  })

  it('returns the input unchanged when darkening a non-colour', () => {
    expect(darken('rebeccapurple', 0.5)).toBe('rebeccapurple')
  })
})

describe('blendColors', () => {
  it('returns black for an empty list', () => {
    expect(blendColors([])).toBe('#000000')
  })

  it('ignores entries with no weight', () => {
    const blended = blendColors([
      { color: '#ff0000', weight: 0 },
      { color: '#0000ff', weight: 1 },
    ])
    expect(blended).toBe('#0000ff')
  })

  it('returns the sole colour when only one has weight', () => {
    expect(blendColors([{ color: '#123456', weight: 3 }])).toBe('#123456')
  })

  it('mixes two colours evenly at equal weight', () => {
    const blended = blendColors([
      { color: '#000000', weight: 1 },
      { color: '#ffffff', weight: 1 },
    ])
    expect(blended).toBe('#808080')
  })

  it('is dominated by the heavier entry', () => {
    const blended = blendColors([
      { color: '#ff0000', weight: 100 },
      { color: '#0000ff', weight: 1 },
    ])
    const rgb = hexToRgb(blended)!
    expect(rgb.r).toBeGreaterThan(200)
    expect(rgb.b).toBeLessThan(60)
  })

  it('skips malformed colours instead of poisoning the result', () => {
    const blended = blendColors([
      { color: 'nonsense', weight: 5 },
      { color: '#00ff00', weight: 1 },
    ])
    expect(blended).toBe('#00ff00')
  })

  it('falls back to black when every entry is malformed', () => {
    expect(blendColors([{ color: 'nonsense', weight: 5 }])).toBe('#000000')
  })

  it('always emits a valid six-digit hex', () => {
    const blended = blendColors([
      { color: '#1b2f8f', weight: 0.4 },
      { color: '#e8386f', weight: 0.7 },
      { color: '#2f9be0', weight: 1.3 },
    ])
    expect(blended).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('uid', () => {
  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid('ap')))
    expect(ids.size).toBe(500)
  })

  it('uses the given prefix', () => {
    expect(uid('ws')).toMatch(/^ws_/)
    expect(uid()).toMatch(/^id_/)
  })
})

describe('cx', () => {
  it('joins truthy class names', () => {
    expect(cx('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, null, undefined)).toBe('')
  })
})

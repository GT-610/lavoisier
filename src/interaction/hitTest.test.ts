/**
 * Hit-testing tests.
 *
 * These cover the geometry that decides what the pointer grabbed and, more
 * importantly, which vessel sits in a flame's plume. A regression here shows up
 * as "I placed the lamp right under the beaker and nothing happened", which is
 * exactly the class of bug found by hand during development.
 */
import { describe, expect, it } from 'vitest'

import { createApparatus } from '@/store/labStore'
import {
  HANDLE_OFFSET,
  angleFromCenter,
  handlePosition,
  hitsApparatus,
  hitsCavity,
  hitsHandle,
  pickApparatus,
  pickVessel,
  toWorld,
} from '@/interaction/hitTest'
import type { Apparatus } from '@/types'

function at(kind: Parameters<typeof createApparatus>[0], x: number, y: number): Apparatus {
  return createApparatus(kind, x, y)
}

describe('toWorld', () => {
  it('converts viewport coordinates into canvas-local space', () => {
    const rect = { left: 100, top: 50 } as DOMRect
    expect(toWorld(150, 80, rect)).toEqual({ x: 50, y: 30 })
  })

  it('handles a canvas that is not at the origin', () => {
    const rect = { left: 264, top: 84 } as DOMRect
    expect(toWorld(264, 84, rect)).toEqual({ x: 0, y: 0 })
  })
})

describe('hitsApparatus', () => {
  it('hits the centre', () => {
    const beaker = at('beaker', 200, 200)
    expect(hitsApparatus(beaker, { x: 200, y: 200 })).toBe(true)
  })

  it('misses a point well outside the silhouette', () => {
    const beaker = at('beaker', 200, 200)
    expect(hitsApparatus(beaker, { x: 500, y: 500 })).toBe(false)
  })

  it('misses just beyond the width boundary', () => {
    const beaker = at('beaker', 200, 200)
    // A beaker is 96 wide, so 200 + 49 is the first pixel outside.
    expect(hitsApparatus(beaker, { x: 200 + 47, y: 200 })).toBe(true)
    expect(hitsApparatus(beaker, { x: 200 + 55, y: 200 })).toBe(false)
  })

  it('widens the target when padding is supplied', () => {
    const rod = at('glass-rod', 200, 200)
    const justOutside = { x: 200 + 44, y: 200 }
    expect(hitsApparatus(rod, justOutside, 0)).toBe(false)
    expect(hitsApparatus(rod, justOutside, 10)).toBe(true)
  })

  it('follows the instrument as it rotates', () => {
    const rod = at('glass-rod', 200, 200)
    // A horizontal rod is wide and short...
    expect(hitsApparatus(rod, { x: 200 + 35, y: 200 })).toBe(true)
    // ...but once turned 90° that point falls outside the thin profile.
    const turned: Apparatus = { ...rod, rotation: 90 }
    expect(hitsApparatus(turned, { x: 200 + 35, y: 200 })).toBe(false)
    // while a point along the new long axis does hit.
    expect(hitsApparatus(turned, { x: 200, y: 200 + 35 })).toBe(true)
  })

  it('rejects the bare corners of a test tube', () => {
    const tube = at('test-tube', 200, 200)
    // The tube has a rounded bottom, so the bottom corners are not solid.
    const def = { halfWidth: 20, halfHeight: 62 }
    const cornerX = 200 + def.halfWidth - 2
    const cornerY = 200 + def.halfHeight - 2
    expect(hitsApparatus(tube, { x: cornerX, y: cornerY })).toBe(false)
  })

  it('treats only the collar of an alcohol lamp as solid, not the flame', () => {
    const lamp = at('alcohol-lamp', 200, 200)
    // High above the lamp body is flame, which must not be clickable.
    expect(hitsApparatus(lamp, { x: 200, y: 200 - 40 })).toBe(false)
    expect(hitsApparatus(lamp, { x: 200, y: 200 + 30 })).toBe(true)
  })

  it('restricts a flask above the shoulder to its neck', () => {
    const flask = at('flask', 200, 200)
    // Near the top, only the narrow neck is solid.
    expect(hitsApparatus(flask, { x: 200, y: 200 - 50 })).toBe(true)
    expect(hitsApparatus(flask, { x: 200 + 40, y: 200 - 50 })).toBe(false)
  })

  it('restricts a funnel below the cone to its stem', () => {
    const funnel = at('funnel', 200, 200)
    expect(hitsApparatus(funnel, { x: 200, y: 200 + 40 })).toBe(true)
    expect(hitsApparatus(funnel, { x: 200 + 30, y: 200 + 40 })).toBe(false)
  })
})

describe('hitsCavity', () => {
  it('accepts a point inside a vessel', () => {
    expect(hitsCavity(at('beaker', 100, 100), { x: 100, y: 100 })).toBe(true)
  })

  it('rejects instruments that hold nothing', () => {
    expect(hitsCavity(at('glass-rod', 100, 100), { x: 100, y: 100 })).toBe(false)
    expect(hitsCavity(at('alcohol-lamp', 100, 100), { x: 100, y: 110 })).toBe(false)
  })
})

describe('pickApparatus', () => {
  it('returns null for an empty bench', () => {
    expect(pickApparatus([], { x: 0, y: 0 })).toBeNull()
  })

  it('prefers the instrument drawn later when two overlap', () => {
    const under = at('beaker', 200, 200)
    const over = at('flask', 200, 200)
    expect(pickApparatus([under, over], { x: 200, y: 200 })!.id).toBe(over.id)
    expect(pickApparatus([over, under], { x: 200, y: 200 })!.id).toBe(under.id)
  })

  it('lets a vessel win over a heat source at the same point', () => {
    // The lamp is painted behind vessels, so a click should select the vessel.
    const lamp = at('alcohol-lamp', 200, 210)
    const beaker = at('beaker', 200, 200)
    const picked = pickApparatus([lamp, beaker], { x: 200, y: 205 })
    expect(picked!.id).toBe(beaker.id)
  })

  it('still selects a lone heat source', () => {
    const lamp = at('alcohol-lamp', 200, 200)
    expect(pickApparatus([lamp], { x: 200, y: 210 })!.id).toBe(lamp.id)
  })

  it('returns null when the point misses everything', () => {
    expect(pickApparatus([at('beaker', 100, 100)], { x: 900, y: 900 })).toBeNull()
  })
})

describe('pickVessel', () => {
  it('finds the vessel that should receive a dropped reagent', () => {
    const beaker = at('beaker', 300, 300)
    expect(pickVessel([beaker], { x: 300, y: 300 })!.id).toBe(beaker.id)
  })

  it('refuses to accept a drop on a tool that holds nothing', () => {
    const rod = at('glass-rod', 300, 300)
    expect(pickVessel([rod], { x: 300, y: 300 })).toBeNull()
  })

  it('chooses the topmost vessel when several overlap', () => {
    const lower = at('beaker', 300, 300)
    const upper = at('flask', 300, 300)
    expect(pickVessel([lower, upper], { x: 300, y: 300 })!.id).toBe(upper.id)
  })
})

describe('rotation handle', () => {
  it('sits above the instrument by the declared offset', () => {
    const beaker = at('beaker', 400, 400)
    const handle = handlePosition(beaker)
    expect(handle.x).toBeCloseTo(400)
    // Beaker is 100 tall, so the handle is 50 + offset above centre.
    expect(handle.y).toBeCloseTo(400 - 50 - HANDLE_OFFSET)
  })

  it('orbits with the instrument', () => {
    const beaker = at('beaker', 400, 400)
    const turned: Apparatus = { ...beaker, rotation: 90 }
    const handle = handlePosition(turned)
    // A quarter turn clockwise moves the handle to the right of centre.
    expect(handle.x).toBeGreaterThan(400)
    expect(handle.y).toBeCloseTo(400)
  })

  it('is hit at its own position', () => {
    const beaker = at('beaker', 400, 400)
    expect(hitsHandle(beaker, handlePosition(beaker))).toBe(true)
  })

  it('is missed a comfortable distance away', () => {
    const beaker = at('beaker', 400, 400)
    const handle = handlePosition(beaker)
    expect(hitsHandle(beaker, { x: handle.x + 60, y: handle.y })).toBe(false)
  })

  it('is still grabbable with a small inaccuracy, as a real drag would be', () => {
    const beaker = at('beaker', 400, 400)
    const handle = handlePosition(beaker)
    expect(hitsHandle(beaker, { x: handle.x + 5, y: handle.y + 5 })).toBe(true)
  })
})

describe('angleFromCenter', () => {
  it('reads zero when the pointer is straight above the instrument', () => {
    const beaker = at('beaker', 400, 400)
    expect(angleFromCenter(beaker, { x: 400, y: 300 })).toBeCloseTo(0)
  })

  it('reads 90 to the right and 270 to the left', () => {
    const beaker = at('beaker', 400, 400)
    expect(angleFromCenter(beaker, { x: 500, y: 400 })).toBeCloseTo(90)
    expect(angleFromCenter(beaker, { x: 300, y: 400 })).toBeCloseTo(270)
  })

  it('reads 180 directly below', () => {
    const beaker = at('beaker', 400, 400)
    expect(angleFromCenter(beaker, { x: 400, y: 500 })).toBeCloseTo(180)
  })

  it('always returns an angle in [0, 360)', () => {
    const beaker = at('beaker', 400, 400)
    for (let deg = -720; deg <= 720; deg += 17) {
      const rad = (deg * Math.PI) / 180
      const angle = angleFromCenter(beaker, {
        x: 400 + Math.cos(rad) * 50,
        y: 400 + Math.sin(rad) * 50,
      })
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(360)
    }
  })
})

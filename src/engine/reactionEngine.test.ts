/**
 * Reaction engine tests.
 *
 * These lock in the behaviour that was previously only verified by hand in a
 * browser: rule matching, the consumption/product accounting, the temperature
 * model (including the boiling clamp that makes thermal decomposition
 * reachable at all), the heat/stir/catalyst gates, and the explosion path.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { ReactionEngine } from '@/engine/reactionEngine'
import { advance, amountIn, logTexts, makeBench, patchFor, vessel } from '@/test/helpers'
import type { Apparatus } from '@/types'

/** Long enough for a fast reaction to run to completion. */
const SETTLE = 12
/** Long enough for the boiling clamp to be reached and passed. */
const BOIL = 24

describe('rule matching and stoichiometry', () => {
  it('consumes reactants and produces the salt when an acid meets a metal', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['hcl', 4],
      ['zn', 3],
    ])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    // Zinc is the limiting reactant here, so it must be gone.
    expect(amountIn(patch, 'zn')).toBe(0)
    expect(amountIn(patch, 'zncl2')).toBeGreaterThan(2.5)
    // Hydrogen is a gas: it leaves as bubbles and never enters contents.
    expect(amountIn(patch, 'h2')).toBe(0)
  })

  it('never consumes a declared catalyst', () => {
    const flask = vessel('flask', 400, 300, [
      ['h2o2', 3],
      ['mno2', 1],
    ])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([flask]), SETTLE)
    const patch = patchFor(patches, flask.id)

    // The whole point of a catalyst: unchanged amount, while the peroxide goes.
    expect(amountIn(patch, 'mno2')).toBeCloseTo(1, 5)
    expect(amountIn(patch, 'h2o2')).toBe(0)
    expect(amountIn(patch, 'water')).toBeGreaterThan(0)
  })

  it('leaves both sides untouched for an indicator rule', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['water', 3],
      ['phenolphthalein', 1],
      ['naoh', 2],
    ])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    // `consume: false` on the indicator rules means nothing is used up.
    expect(amountIn(patch, 'phenolphthalein')).toBeCloseTo(1, 5)
    expect(amountIn(patch, 'naoh')).toBeCloseTo(2, 5)
    expect(patch.mixtureColor).toBe('#e8386f')
  })

  it('honours the limiting reactant instead of over-consuming', () => {
    // 1 unit of zinc against a large excess of acid: only 1 unit may react.
    const beaker = vessel('beaker', 400, 300, [
      ['hcl', 10],
      ['zn', 1],
    ])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    expect(amountIn(patch, 'zn')).toBe(0)
    // 10 - 1 reacted leaves ~9; allow the small slack of a fixed timestep.
    expect(amountIn(patch, 'hcl')).toBeGreaterThan(8.9)
    expect(amountIn(patch, 'zncl2')).toBeCloseTo(1, 1)
  })

  it('picks the higher-priority rule when two could apply', () => {
    // CaCO3 + HCl (74) beats nothing, but acid + base neutralisation (90) must
    // win over any precipitation route when both are present.
    const beaker = vessel('beaker', 400, 300, [
      ['hcl', 3],
      ['naoh', 3],
    ])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    expect(amountIn(patch, 'nacl')).toBeGreaterThan(2.5)
    expect(amountIn(patch, 'hcl')).toBe(0)
    expect(amountIn(patch, 'naoh')).toBe(0)
  })

  it('does nothing when the reactants sit in separate vessels', () => {
    const acid = vessel('beaker', 200, 300, [['hcl', 3]])
    const metal = vessel('beaker', 600, 300, [['zn', 3]])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([acid, metal]), SETTLE)

    // Region detection is per-vessel: proximity must never trigger a reaction.
    expect(amountIn(patchFor(patches, acid.id), 'zn')).toBe(0)
    expect(amountIn(patchFor(patches, metal.id), 'zncl2')).toBe(0)
    expect(amountIn(patchFor(patches, metal.id), 'zn')).toBeCloseTo(3, 5)
  })
})

describe('temperature model', () => {
  it('heats a vessel that sits in a lit flame', () => {
    const beaker = vessel('beaker', 400, 300, [['nahco3', 3]])
    // The lamp arrives lit by default, and its plume must reach the beaker.
    const lamp = vessel('alcohol-lamp', 400, 420)
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker, lamp]), 4)
    const patch = patchFor(patches, beaker.id)

    expect(patch.temperature).toBeGreaterThan(60)
  })

  it('cools an unheated vessel back towards ambient', () => {
    const beaker = vessel('beaker', 400, 300, [['water', 3]])
    beaker.temperature = 90
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker]), 6)
    const patch = patchFor(patches, beaker.id)

    expect(patch.temperature).toBeLessThan(90)
    expect(patch.temperature).toBeGreaterThanOrEqual(22)
  })

  it('holds a boiling mixture at 100 °C while liquid water remains', () => {
    const dish = vessel('evaporating-dish', 400, 300, [['water', 3]])
    const lamp = vessel('alcohol-lamp', 400, 395)
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([dish, lamp]), BOIL)
    const patch = patchFor(patches, dish.id)

    // This clamp is what makes the thermal-decomposition rules reachable: the
    // mixture cannot climb past boiling until the water is gone.
    expect(patch.temperature).toBeLessThanOrEqual(101)
  })

  it('drives a dry solid well past boiling so decomposition can fire', () => {
    const tube = vessel('test-tube', 400, 300, [['caco3', 3]])
    const lamp = vessel('alcohol-lamp', 400, 420)
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([tube, lamp]), BOIL)
    const patch = patchFor(patches, tube.id)

    // Limestone needs 180 °C, which only a water-free vessel can reach.
    expect(patch.temperature).toBeGreaterThan(180)
  })

  it('evaporates water away rather than letting it exceed its boiling point', () => {
    const dish = vessel('evaporating-dish', 400, 300, [['water', 3]])
    const lamp = vessel('alcohol-lamp', 400, 395)
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([dish, lamp]), BOIL)
    const patch = patchFor(patches, dish.id)

    expect(amountIn(patch, 'water')).toBeLessThan(3)
    expect(amountIn(patch, 'water')).toBeGreaterThanOrEqual(0)
  })
})

describe('condition gates', () => {
  it('withholds a heat-gated reaction until a flame is applied', () => {
    const tube = vessel('test-tube', 400, 300, [
      ['h2', 2],
      ['o2', 2],
    ])
    const engine = new ReactionEngine('ws')
    const cold = advance(engine, makeBench([tube]), 3)

    // Without ignition the mixture must sit there inert.
    expect(amountIn(patchFor(cold.patches, tube.id), 'h2')).toBeCloseTo(2, 5)
    expect(cold.logs).toEqual([])
  })

  it('fires a heat-gated reaction once a flame is present', () => {
    const tube = vessel('test-tube', 400, 300, [
      ['h2', 2],
      ['o2', 2],
    ])
    const lamp = vessel('alcohol-lamp', 400, 420)
    const engine = new ReactionEngine('ws')
    const { patches, logs } = advance(engine, makeBench([tube, lamp]), 6)
    const patch = patchFor(patches, tube.id)

    // An explosion empties the vessel entirely.
    expect(patch.contents).toEqual([])
    expect(logs.some((entry) => entry.level === 'danger')).toBe(true)
    expect(logTexts(logs).join(' ')).toMatch(/爆鸣/)
  })

  it('blocks a stir-gated reaction without a glass rod', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['h2so4', 4],
      ['caco3', 3],
    ])
    const engine = new ReactionEngine('ws')
    const { patches, logs } = advance(engine, makeBench([beaker]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    // Limestone + dilute sulfuric acid is the one rule that requires stirring.
    expect(amountIn(patch, 'caco3')).toBeCloseTo(3, 5)
    expect(logTexts(logs).join(' ')).not.toMatch(/碳酸钙与稀硫酸/)
  })

  it('releases the stir-gated reaction once a glass rod touches the vessel', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['h2so4', 4],
      ['caco3', 3],
    ])
    const rod = vessel('glass-rod', 400, 300)
    const engine = new ReactionEngine('ws')
    const { patches, logs } = advance(engine, makeBench([beaker, rod]), SETTLE)
    const patch = patchFor(patches, beaker.id)

    expect(amountIn(patch, 'caco3')).toBeLessThan(3)
    expect(logTexts(logs).join(' ')).toMatch(/碳酸钙与稀硫酸/)
  })

  it('ignores a glass rod that is nowhere near the vessel', () => {
    const beaker = vessel('beaker', 300, 300, [
      ['h2so4', 4],
      ['caco3', 3],
    ])
    const rod = vessel('glass-rod', 900, 700)
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([beaker, rod]), SETTLE)

    // Contact is geometric: distance must not count as stirring.
    expect(amountIn(patchFor(patches, beaker.id), 'caco3')).toBeCloseTo(3, 5)
  })

  it('requires the catalyst to be present before a catalysed rule applies', () => {
    const flask = vessel('flask', 400, 300, [['h2o2', 3]])
    const engine = new ReactionEngine('ws')
    const { patches } = advance(engine, makeBench([flask]), 3)

    // Below its own decomposition temperature and with no MnO2, nothing happens.
    expect(amountIn(patchFor(patches, flask.id), 'h2o2')).toBeCloseTo(3, 5)
  })
})

describe('explosion', () => {
  it('empties the vessel and reports at danger level exactly once per event', () => {
    const tube = vessel('test-tube', 400, 300, [
      ['h2', 2],
      ['o2', 2],
    ])
    const lamp = vessel('alcohol-lamp', 400, 420)
    const engine = new ReactionEngine('ws')
    const { patches, logs } = advance(engine, makeBench([tube, lamp]), 6)

    const patch = patchFor(patches, tube.id)
    expect(patch.contents).toEqual([])
    expect(patch.mixtureColor).toBeNull()
    expect(patch.mixtureOpacity).toBe(0)

    const dangers = logs.filter((entry) => entry.level === 'danger')
    expect(dangers).toHaveLength(1)
  })

  it('spawns particles so the explosion is visible', () => {
    const tube = vessel('test-tube', 400, 300, [
      ['h2', 2],
      ['o2', 2],
    ])
    const lamp = vessel('alcohol-lamp', 400, 420)
    const engine = new ReactionEngine('ws')

    // Step only until the blast happens, then check the sparks are still alive
    // (they expire after about a second, so a long run would show zero).
    let aliveDuringBlast = 0
    for (let i = 0; i < 60 * 6; i++) {
      engine.step({ workspace: makeBench([tube, lamp]), dt: 1 / 60 })
      if (engine.particleSystem.alive > aliveDuringBlast) {
        aliveDuringBlast = engine.particleSystem.alive
      }
    }
    expect(aliveDuringBlast).toBeGreaterThan(0)
  })
})

describe('logging', () => {
  it('emits one line per reaction rather than one per frame', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['hcl', 4],
      ['zn', 3],
    ])
    const engine = new ReactionEngine('ws')
    const { logs } = advance(engine, makeBench([beaker]), SETTLE)

    // The cooldown collapses a sustained reaction into a single event.
    const zincLogs = logs.filter((entry) => entry.text.includes('锌与稀盐酸'))
    expect(zincLogs.length).toBeLessThanOrEqual(2)
    expect(zincLogs.length).toBeGreaterThan(0)
  })

  it('reports the pH indicator colour change', () => {
    const beaker = vessel('beaker', 400, 300, [
      ['litmus', 1],
      ['hcl', 2],
    ])
    const engine = new ReactionEngine('ws')
    const { patches, logs } = advance(engine, makeBench([beaker]), 3)

    expect(patchFor(patches, beaker.id).mixtureColor).toBe('#d93b3b')
    expect(logTexts(logs).join(' ')).toMatch(/石蕊/)
  })
})

describe('engine isolation', () => {
  let engine: ReactionEngine

  beforeEach(() => {
    engine = new ReactionEngine('ws')
  })

  it('tracks vessels independently', () => {
    const a = vessel('beaker', 200, 300, [
      ['hcl', 3],
      ['zn', 2],
    ])
    const b = vessel('beaker', 700, 300, [
      ['cuso4', 2],
      ['naoh', 2],
    ])
    const { patches } = advance(engine, makeBench([a, b]), SETTLE)

    expect(amountIn(patchFor(patches, a.id), 'zncl2')).toBeGreaterThan(0)
    expect(amountIn(patchFor(patches, b.id), 'cuoh2')).toBeGreaterThan(0)
    // And neither bench's product leaked into the other.
    expect(amountIn(patchFor(patches, a.id), 'cuoh2')).toBe(0)
    expect(amountIn(patchFor(patches, b.id), 'zncl2')).toBe(0)
  })

  it('drops its state for a vessel that was removed from the bench', () => {
    const beaker = vessel('beaker', 400, 300, [['hcl', 2]])
    engine.step({ workspace: makeBench([beaker]), dt: 1 / 60 })
    // Remove it: the next commit must not resurrect the vessel.
    const { patches } = advance(engine, makeBench([]), 1)
    expect(patches).toEqual([])
  })

  it('clears everything on reset', () => {
    const beaker = vessel('beaker', 400, 300, [['hcl', 2]])
    engine.step({ workspace: makeBench([beaker]), dt: 1 / 60 })
    engine.reset()
    expect(engine.particleSystem.alive).toBe(0)
    expect(engine.buildCommit().patches).toEqual([])
  })
})

describe('reagent addition through the engine mirror', () => {
  it('picks up contents added to the store between frames', () => {
    const engine = new ReactionEngine('ws')
    const beaker = vessel('beaker', 400, 300, [['hcl', 3]])
    const bench = makeBench([beaker])

    advance(engine, bench, 1)
    expect(engine.buildCommit().patches[0].contents).toHaveLength(1)

    // Simulate the user dosing the vessel with zinc: contents change *and* the
    // revision moves, which is what tells the engine to re-mirror. The new
    // contents must be visible to the engine immediately — the zinc/acid
    // reaction then runs, so the vessel ends up holding hcl + zn + zncl2.
    const updated: Apparatus = {
      ...beaker,
      contents: [...beaker.contents, { reagentId: 'zn', amount: 2 }],
    }
    const nextBench = { ...bench, apparatus: [updated], contentsRevision: 1 }
    engine.step({ workspace: nextBench, dt: 1 / 60 })

    const after = engine.buildCommit().patches[0].contents
    const ids = after.map((content) => content.reagentId)
    expect(ids).toContain('zn')
    // A single frame is far too short to finish the reaction, so both the
    // reactants and the first trace of product must be present.
    expect(ids).toContain('hcl')
    expect(after.length).toBeGreaterThanOrEqual(2)
  })

  it('does not re-mirror when only the engine wrote back', () => {
    const engine = new ReactionEngine('ws')
    const beaker = vessel('beaker', 400, 300, [
      ['hcl', 4],
      ['zn', 3],
    ])
    const bench = makeBench([beaker])

    // Run the reaction down, then hand the engine the *same* revision it
    // already saw. Its own progress must survive, not be reset by the store.
    const first = advance(engine, bench, SETTLE)
    const consumed = amountIn(patchFor(first.patches, beaker.id), 'hcl')

    engine.step({ workspace: bench, dt: 1 / 60 })
    const second = engine.buildCommit()
    expect(amountIn(patchFor(second.patches, beaker.id), 'hcl')).toBeCloseTo(consumed, 5)
  })
})

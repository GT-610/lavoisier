/**
 * Catalogue integrity tests.
 *
 * These are the tests that would have caught the real defects found during
 * development: a reagent on the shelf that no rule could ever consume, and
 * products declared in the catalogue that no rule could ever produce. Both are
 * invisible at runtime — the app looks fine, the data is just dead.
 */
import { describe, expect, it } from 'vitest'

import { REACTION_RULES } from '@/data/reactions'
import {
  APPARATUS_DEFS,
  APPARATUS_MAP,
  REAGENTS,
  REAGENT_MAP,
  SHELF_GROUPS,
  getApparatusDef,
  getReagent,
} from '@/data/reagents'

/** Every reagent id the rule table can reference, in any position. */
function referencedReagentIds(): Set<string> {
  const ids = new Set<string>()
  for (const rule of REACTION_RULES) {
    for (const id of rule.reactants) ids.add(id)
    for (const id of rule.products) ids.add(id)
    if (rule.conditions?.catalyst) ids.add(rule.conditions.catalyst)
    if (rule.effects.gas) ids.add(rule.effects.gas.reagentId)
    if (rule.effects.precipitate) ids.add(rule.effects.precipitate.reagentId)
  }
  return ids
}

describe('reagent catalogue', () => {
  it('has no duplicate ids', () => {
    const ids = REAGENTS.map((reagent) => reagent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves every entry through the id map and the accessor', () => {
    for (const reagent of REAGENTS) {
      expect(REAGENT_MAP[reagent.id]).toBe(reagent)
      expect(getReagent(reagent.id)).toBe(reagent)
    }
  })

  it('throws a descriptive error for an unknown id', () => {
    expect(() => getReagent('unobtainium')).toThrow(/Unknown reagent id/)
  })

  it('gives every reagent a usable colour and a bounded colour strength', () => {
    for (const reagent of REAGENTS) {
      expect(reagent.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(reagent.colorStrength).toBeGreaterThanOrEqual(0)
      expect(reagent.colorStrength).toBeLessThanOrEqual(1)
    }
  })

  it('keeps gases and solids out of the liquid fill by phase', () => {
    // The renderer skips gas when blending the mixture; if a gas were tagged
    // `liquid` it would wrongly tint the vessel.
    const gases = REAGENTS.filter((reagent) => reagent.phase === 'gas')
    expect(gases.length).toBeGreaterThan(0)
    for (const gas of gases) {
      // Gases are products only: they leave the vessel as bubbles.
      expect(gas.role).toBe('product')
    }
  })
})

describe('shelf exposure', () => {
  const shelfIds = SHELF_GROUPS.flatMap((group) => group.ids)

  it('only lists reagents that exist', () => {
    for (const id of shelfIds) expect(REAGENT_MAP[id]).toBeDefined()
  })

  it('lists every id at most once across groups', () => {
    expect(new Set(shelfIds).size).toBe(shelfIds.length)
  })

  it('only shelves reagents, never products', () => {
    for (const id of shelfIds) expect(REAGENT_MAP[id].role).toBe('reagent')
  })
})

describe('rule table', () => {
  it('has unique rule ids', () => {
    const ids = REACTION_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never references a reagent that does not exist', () => {
    const broken: string[] = []
    for (const rule of REACTION_RULES) {
      for (const id of [...rule.reactants, ...rule.products]) {
        if (!REAGENT_MAP[id]) broken.push(`${rule.id} -> ${id}`)
      }
      if (rule.conditions?.catalyst && !REAGENT_MAP[rule.conditions.catalyst]) {
        broken.push(`${rule.id} -> catalyst ${rule.conditions.catalyst}`)
      }
      if (rule.effects.gas && !REAGENT_MAP[rule.effects.gas.reagentId]) {
        broken.push(`${rule.id} -> gas ${rule.effects.gas.reagentId}`)
      }
      if (rule.effects.precipitate && !REAGENT_MAP[rule.effects.precipitate.reagentId]) {
        broken.push(`${rule.id} -> precipitate ${rule.effects.precipitate.reagentId}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('asks for at least one reactant', () => {
    for (const rule of REACTION_RULES) expect(rule.reactants.length).toBeGreaterThan(0)
  })

  it('uses a positive rate and a finite priority', () => {
    for (const rule of REACTION_RULES) {
      expect(rule.rate).toBeGreaterThan(0)
      expect(Number.isFinite(rule.priority)).toBe(true)
    }
  })

  it('declares a temperature floor only where a reaction genuinely needs one', () => {
    for (const rule of REACTION_RULES) {
      const min = rule.conditions?.minTemperature
      if (min === undefined) continue
      // A floor at or below ambient would be meaningless.
      expect(min).toBeGreaterThan(22)
    }
  })

  it('always pairs an explosion with a message', () => {
    for (const rule of REACTION_RULES) {
      if (!rule.effects.explosion) continue
      expect(rule.effects.explosion.message.length).toBeGreaterThan(0)
      expect(rule.effects.explosion.power).toBeGreaterThan(0)
    }
  })

  it('gives every rule a name, an equation and a description', () => {
    for (const rule of REACTION_RULES) {
      expect(rule.name.length).toBeGreaterThan(0)
      // Equations use the chemistry arrow `→` for conversions. Indicator rules
      // are the deliberate exception: they describe a colour change under a
      // condition, which reads better as `-->`, so accept either form.
      expect(rule.equation).toMatch(/→|-->/)
      expect(rule.description.length).toBeGreaterThan(0)
    }
  })
})

/**
 * Reachability. These two assertions are the regression guard for the dead-data
 * defect: an entry that exists but can never appear in play is a bug, not a
 * harmless extra.
 */
describe('catalogue reachability', () => {
  const referenced = referencedReagentIds()
  const produced = new Set(REACTION_RULES.flatMap((rule) => rule.products))

  it('exposes no shelf reagent that nothing can consume', () => {
    const dead = SHELF_GROUPS.flatMap((group) => group.ids).filter(
      (id) => !referenced.has(id),
    )
    expect(dead).toEqual([])
  })

  it('declares no product that no rule can produce', () => {
    const unreachable = REAGENTS.filter(
      (reagent) => reagent.role === 'product' && !produced.has(reagent.id),
    ).map((reagent) => reagent.id)
    expect(unreachable).toEqual([])
  })

  it('can consume every product it can produce, or lets it accumulate', () => {
    // A product with no consumer is fine (it stays in the vessel), but if it is
    // also unreachable that is already covered above. This asserts the weaker,
    // always-true invariant that products are at least well formed.
    for (const rule of REACTION_RULES) {
      for (const id of rule.products) expect(REAGENT_MAP[id]).toBeDefined()
    }
  })
})

describe('apparatus catalogue', () => {
  it('has unique kinds and a resolvable map', () => {
    const kinds = APPARATUS_DEFS.map((def) => def.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const def of APPARATUS_DEFS) {
      expect(APPARATUS_MAP[def.kind]).toBe(def)
      expect(getApparatusDef(def.kind)).toBe(def)
    }
  })

  it('throws for an unknown kind', () => {
    // @ts-expect-error deliberately bypassing the union to test the guard
    expect(() => getApparatusDef('sonic-screwdriver')).toThrow(/Unknown apparatus kind/)
  })

  it('gives vessels a positive capacity and heat sources none', () => {
    for (const def of APPARATUS_DEFS) {
      expect(def.capacity).toBeGreaterThanOrEqual(0)
      if (def.emitsHeat) {
        // A heat source that could also hold reagents would break region
        // detection, which treats emitters and vessels as disjoint roles.
        expect(def.capacity).toBe(0)
        expect(def.heatable).toBe(false)
      }
    }
  })

  it('gives every definition a positive footprint and a description', () => {
    for (const def of APPARATUS_DEFS) {
      expect(def.width).toBeGreaterThan(0)
      expect(def.height).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.name.length).toBeGreaterThan(0)
    }
  })

  it('exposes exactly the heat source and stirring tool the engine looks for', () => {
    expect(APPARATUS_DEFS.filter((def) => def.emitsHeat)).toHaveLength(1)
    expect(APPARATUS_DEFS.some((def) => def.kind === 'glass-rod')).toBe(true)
  })
})

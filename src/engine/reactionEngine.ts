/**
 * Reaction simulation engine.
 *
 * Model: **macro state machine + region detection**. There is no fluid solver
 * and no per-molecule physics. Each tick the engine:
 *
 *  1. syncs its private mirror of every vessel with the store (only when the
 *     store's `contentsRevision` moved, i.e. after a user action);
 *  2. runs region detection — which vessels are over a lit flame, which are
 *     being stirred by a glass rod, which mixtures touch;
 *  3. integrates temperature (heating, cooling towards ambient, reaction
 *     enthalpy);
 *  4. matches the highest-priority rule whose reactants all sit in one vessel
 *     and whose conditions hold, then advances it by `rate * dt`;
 *  5. applies effects: colour, opacity, gas, precipitate, glow, explosion.
 *
 * The engine owns all numbers while it runs. It writes back to React state on
 * a timer (`commitIntervalMs`) rather than every frame, which is what keeps the
 * canvas at 60 fps even with a dozen vessels reacting at once.
 */
import { REACTION_RULES } from '@/data/reactions'
import { findReagent, getApparatusDef, REAGENT_MAP } from '@/data/reagents'
import type {
  Apparatus,
  ApparatusContent,
  LogLevel,
  ReactionEffects,
  ReactionRule,
  SimulationPatch,
  Workspace,
} from '@/types'
import { clamp, rectsOverlap, insetRect, rotatedBounds, withAlpha } from '@/utils/math'
import { createLogEntry, recomputeMixture } from '@/store/labStore'
import { ParticleSystem } from '@/engine/particles'
import type { RuntimeEffect } from '@/render/scene'

/** Ambient bench temperature in °C. */
const AMBIENT = 22
/** How fast a vessel drifts back to ambient, in "fraction per second". */
const COOLING_RATE = 0.16
/**
 * Hottest a single alcohol flame can drive a vessel. This has to sit well above
 * the highest `minTemperature` in the rule table (180 °C for limestone
 * decomposition) or those rules could never fire.
 */
const FLAME_TARGET = 420
/** Degrees per second a flame adds while the vessel is far below its target. */
const FLAME_HEATING_RATE = 46
/** Cap so a runaway reaction cannot melt the UI. */
const MAX_TEMPERATURE = 620
/** Water boils here; while liquid water remains the mixture cannot get hotter. */
const BOILING_POINT = 100
/**
 * Water evaporated per second per degree of overshoot above boiling. The
 * mixture is held at the boiling point until the water is gone, which is what
 * lets a *dry* solid reach the 110–180 °C that thermal decomposition needs.
 */
const EVAPORATION_PER_DEGREE = 0.02
/** Ignition threshold for rules that only ask for `heat: true`. */
const IGNITION_TEMPERATURE = 70
/**
 * Seconds before the same rule may log the same event again in the same
 * vessel. Long enough that a sustained reaction reads as one event, short
 * enough that a genuinely new burst still shows up.
 */
const LOG_COOLDOWN = 8

/** A vessel as tracked by the engine, decoupled from React state. */
interface Vessel {
  id: string
  kind: Apparatus['kind']
  x: number
  y: number
  rotation: number
  contents: ApparatusContent[]
  temperature: number
  lit: boolean
  color: string | null
  opacity: number
  /** Accumulated colour override applied by an indicator/reaction effect. */
  lockedColor: string | null
  /** Remaining lifetime of a one-shot glow, in seconds. */
  glow: { color: string; life: number } | null
  /** Set when an explosion must be reported exactly once. */
  exploded: boolean
}

interface VesselConditions {
  heated: boolean
  stirred: boolean
}

export interface EngineLog {
  level: LogLevel
  text: string
}

export interface EngineFrameInput {
  workspace: Workspace
  dt: number
}

/**
 * Per-workspace simulation. One instance exists per open bench and is disposed
 * when the bench is deleted.
 */
export class ReactionEngine {
  private readonly workspaceId: string
  private vessels = new Map<string, Vessel>()
  private mirrorRevision = -1
  private readonly particles = new ParticleSystem()
  private readonly effects = new Map<string, RuntimeEffect>()
  private pendingLogs: EngineLog[] = []
  private commitAccumulator = 0
  /** Monotonic counter used to give every explosion message a unique id. */
  private explosionCount = 0
  /**
   * Simulated clock in seconds. Advanced by `dt` rather than by wall time so a
   * throttled or paused tab cannot skew the cooldowns.
   */
  private clock = 0
  /**
   * Last time a given `vessel:rule` pair was logged. A reaction that runs for
   * several seconds would otherwise append an identical line every tick.
   */
  private logCooldown = new Map<string, number>()

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
  }

  /** The bench this engine simulates; handy when debugging from the console. */
  get id(): string {
    return this.workspaceId
  }

  get particleSystem(): ParticleSystem {
    return this.particles
  }

  get runtimeEffects(): Map<string, RuntimeEffect> {
    return this.effects
  }

  /** Discards all runtime state; used when a bench is reset or reloaded. */
  reset() {
    this.vessels.clear()
    this.mirrorRevision = -1
    this.pendingLogs = []
    this.effects.clear()
    this.particles.clear()
  }

  /* ---------------------------------------------------------------------- */
  /*  Main loop                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Advances the simulation and returns whether React state must be written
   * back this frame.
   */
  step(input: EngineFrameInput): boolean {
    const { workspace, dt } = input
    this.syncMirror(workspace)
    this.clock += dt

    // 1. Region detection.
    const conditions = this.detectConditions()

    // 2. Temperature integration, then reaction matching.
    for (const vessel of this.vessels.values()) {
      const def = getApparatusDef(vessel.kind)
      if (def.capacity <= 0) continue
      const condition = conditions.get(vessel.id) ?? { heated: false, stirred: false }
      this.integrateTemperature(vessel, condition, dt)
      this.applyReaction(vessel, condition, dt)
    }

    // 3. Particles.
    const temperatures = new Map<string, number>()
    for (const vessel of this.vessels.values()) temperatures.set(vessel.id, vessel.temperature)
    this.particles.update(dt, temperatures)

    // 4. Effects bookkeeping (glow decay).
    for (const vessel of this.vessels.values()) {
      if (!vessel.glow) continue
      vessel.glow.life -= dt
      if (vessel.glow.life <= 0) vessel.glow = null
    }
    this.rebuildEffects()

    // 5. Rate-limited write-back.
    this.commitAccumulator += dt
    const due = this.commitAccumulator >= 0.12
    if (due) this.commitAccumulator = 0
    return due
  }

  /** Creates the payload for `commitSimulation`. */
  buildCommit(): { patches: SimulationPatch[]; logs: ReturnType<typeof createLogEntry>[] } {
    const patches: SimulationPatch[] = []
    for (const vessel of this.vessels.values()) {
      const def = getApparatusDef(vessel.kind)
      if (def.capacity <= 0) continue
      patches.push({
        id: vessel.id,
        temperature: vessel.temperature,
        mixtureColor: vessel.color,
        mixtureOpacity: vessel.opacity,
        contents: vessel.contents.map((content) => ({ ...content })),
      })
    }
    const logs = this.pendingLogs.map((entry) => createLogEntry(entry.level, entry.text))
    this.pendingLogs = []
    return { patches, logs }
  }

  /**
   * Emits a burst of sparks, e.g. when a vessel is dropped or an explosion
   * happens. `clear` wipes every particle first.
   */
  burst(x: number, y: number, color: string, count = 40, speed = 220, clear = false) {
    if (clear) this.particles.clear()
    this.particles.emitSparks(x, y, color, count, Math.PI, speed)
  }

  /* ---------------------------------------------------------------------- */
  /*  Mirror                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Rebuilds the engine's mirror only when the store changed from a *user*
   * action. Continuous engine-driven writes do not bump `contentsRevision`, so
   * after the first sync the two sides never overwrite each other.
   */
  private syncMirror(workspace: Workspace) {
    if (workspace.contentsRevision === this.mirrorRevision) {
      // Positions and flame state can still change without a revision bump.
      for (const item of workspace.apparatus) {
        const vessel = this.vessels.get(item.id)
        if (!vessel) continue
        vessel.x = item.x
        vessel.y = item.y
        vessel.rotation = item.rotation
        vessel.lit = item.lit
      }
      // Drop vessels whose instrument was removed.
      const live = new Set(workspace.apparatus.map((item) => item.id))
      for (const id of [...this.vessels.keys()]) {
        if (live.has(id)) continue
        this.vessels.delete(id)
        this.effects.delete(id)
        this.particles.clearApparatus(id)
      }
      return
    }

    this.mirrorRevision = workspace.contentsRevision
    const next = new Map<string, Vessel>()
    for (const item of workspace.apparatus) {
      const previous = this.vessels.get(item.id)
      next.set(item.id, {
        id: item.id,
        kind: item.kind,
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        contents: item.contents.map((content) => ({ ...content })),
        // Keep the engine's temperature across a revision bump so that adding a
        // drop of reagent does not reset a vessel that is already at 90 °C.
        temperature: previous?.temperature ?? item.temperature,
        lit: item.lit,
        color: item.mixtureColor,
        opacity: item.mixtureOpacity,
        lockedColor: previous?.lockedColor ?? null,
        glow: previous?.glow ?? null,
        exploded: previous?.exploded ?? false,
      })
    }
    this.vessels = next
  }

  /* ---------------------------------------------------------------------- */
  /*  Region detection                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Determines, for every vessel, whether it is being heated and/or stirred.
   *
   * "Region detection" here means geometry only: a lit lamp whose flame box
   * overlaps the vessel's lower half heats it, and a glass rod whose box
   * overlaps the vessel stirs it. No fluid coupling, no contact physics.
   */
  private detectConditions(): Map<string, VesselConditions> {
    const result = new Map<string, VesselConditions>()
    const all = [...this.vessels.values()]

    for (const vessel of all) {
      const def = getApparatusDef(vessel.kind)
      if (def.capacity <= 0) continue

      const body = rotatedBounds(vessel.x, vessel.y, def.width, def.height, vessel.rotation)
      // Heat enters through the bottom, so shrink the box from the top.
      const heatedRegion = {
        x: body.x,
        y: body.y + body.height * 0.35,
        width: body.width,
        height: body.height * 0.65,
      }
      const stirRegion = insetRect(body, 6)

      let heated = false
      let stirred = false

      for (const other of all) {
        if (other.id === vessel.id) continue
        const otherDef = getApparatusDef(other.kind)

        if (otherDef.emitsHeat && other.lit) {
          /**
           * The flame is modelled as a plume rising from the wick rather than a
           * tight box around the visible teardrop: a real flame heats whatever
           * sits in the column of hot gas above it, and a strict box would
           * demand pixel-perfect placement before anything happened at all.
           */
          const plume = rotatedBounds(
            other.x,
            other.y - otherDef.height * 0.55,
            otherDef.width * 0.8,
            otherDef.height * 1.3,
            other.rotation,
          )
          if (rectsOverlap(plume, heatedRegion)) heated = true
        }

        if (other.kind === 'glass-rod') {
          const rod = rotatedBounds(other.x, other.y, otherDef.width, otherDef.height, other.rotation)
          if (rectsOverlap(rod, stirRegion)) stirred = true
        }

        // A very hot neighbouring vessel also warms this one (water bath).
        if (other.temperature > vessel.temperature + 25) {
          const near = rotatedBounds(
            other.x,
            other.y,
            otherDef.width * 1.4,
            otherDef.height * 1.4,
            other.rotation,
          )
          if (rectsOverlap(near, body)) heated = true
        }
      }

      result.set(vessel.id, { heated, stirred })
    }

    return result
  }

  /* ---------------------------------------------------------------------- */
  /*  Temperature                                                            */
  /* ---------------------------------------------------------------------- */

  private integrateTemperature(vessel: Vessel, condition: VesselConditions, dt: number) {
    // A lit flame is a heat reservoir: it drives the vessel towards its own
    // temperature instead of adding a fixed number of degrees, which looks
    // physical and keeps a long experiment from heating without bound.
    if (condition.heated) {
      const gap = FLAME_TARGET - vessel.temperature
      if (gap > 0) vessel.temperature += Math.min(gap, FLAME_HEATING_RATE * dt)
    }

    // Newton cooling towards ambient, slower while a flame is applied.
    const above = vessel.temperature - AMBIENT
    if (above > 0) {
      const rate = COOLING_RATE * (condition.heated ? 0.35 : 1)
      vessel.temperature -= above * rate * dt
    }

    // Stirring homogenises the mixture, which spreads the flame's heat into it.
    if (condition.stirred) {
      vessel.temperature += (FLAME_TARGET * 0.25 - vessel.temperature) * 0.05 * dt
    }

    vessel.temperature = clamp(vessel.temperature, -20, MAX_TEMPERATURE)

    // Boiling: while liquid water is present the mixture cannot exceed 100 °C,
    // because the surplus energy goes into vaporising it. Only once the water
    // is gone can a vessel reach the temperatures that thermal decomposition
    // rules ask for. This is the mechanism that makes "dry the solid, then
    // heat it hard" work the way it does at a real bench.
    this.boilOffWater(vessel, dt)
  }

  /**
   * Vaporises water to absorb any heat above the boiling point. Returns the
   * energy (in degrees) that actually went into evaporation, so the caller can
   * reason about how hot the vessel really is.
   */
  private boilOffWater(vessel: Vessel, dt: number): number {
    if (vessel.temperature <= BOILING_POINT) return 0
    const water = vessel.contents.find((content) => content.reagentId === 'water')
    if (!water || water.amount <= 0) return 0

    const overshoot = vessel.temperature - BOILING_POINT
    // Boil away at most `overshoot` degrees worth of water this tick.
    const evaporated = Math.min(water.amount, overshoot * EVAPORATION_PER_DEGREE * dt)
    water.amount -= evaporated
    if (water.amount <= 0.0001) {
      vessel.contents = vessel.contents.filter((content) => content.reagentId !== 'water')
    }
    // The heat that went into evaporation no longer shows up as temperature.
    vessel.temperature -= overshoot
    if (vessel.temperature < BOILING_POINT) vessel.temperature = BOILING_POINT
    this.recompute(vessel)
    return overshoot
  }

  /* ---------------------------------------------------------------------- */
  /*  Reaction matching                                                      */
  /* ---------------------------------------------------------------------- */

  private applyReaction(
    vessel: Vessel,
    condition: VesselConditions,
    dt: number,
  ) {
    if (vessel.exploded) return
    const rule = this.matchRule(vessel, condition)
    if (!rule) return

    // How much of each reactant is available? The rule advances by the smallest
    // available amount, scaled by `rate` and clamped so a single frame cannot
    // consume more than the vessel holds.
    const available = rule.reactants.map((id) => this.amountOf(vessel, id))
    const limiting = Math.min(...available)
    if (limiting <= 0) return

    // Reactions run faster when hot and when stirred, which is what makes the
    // flame and the glass rod feel like they matter rather than being a gate.
    const temperatureFactor = 1 + clamp((vessel.temperature - AMBIENT) / 120, 0, 2.5)
    const stirFactor = condition.stirred ? 1.6 : 1
    const step = Math.min(limiting, rule.rate * temperatureFactor * stirFactor * dt)
    if (step <= 0) return

    const produces = this.applyEffects(vessel, rule, step, dt)
    if (!produces) return

    // Consumption. Catalysts and indicators survive.
    if (rule.consume !== false) {
      const catalyst = rule.conditions?.catalyst
      for (const id of rule.reactants) {
        if (id === catalyst) continue
        const content = vessel.contents.find((item) => item.reagentId === id)
        if (!content) continue
        content.amount = Math.max(0, content.amount - step)
      }
    }

    // Products.
    for (const id of rule.products) {
      const reagent = findReagent(id)
      if (!reagent) continue
      // Gases leave the vessel immediately; they only exist as bubbles.
      if (reagent.phase === 'gas') continue
      this.addContent(vessel, id, step * this.stoichiometryOf(rule))
    }

    vessel.contents = vessel.contents.filter((content) => content.amount > 0.0001)
    this.recompute(vessel)

    if (vessel.exploded) return

    this.pushLog(
      vessel.id,
      rule.id,
      rule.effects.explosion ? 'danger' : 'react',
      `${rule.name}：${rule.description}`,
    )
  }

  /**
   * Appends a log line unless the same rule fired in the same vessel within
   * `LOG_COOLDOWN` seconds. Without this a single long reaction would produce
   * one identical line per simulation tick.
   */
  private pushLog(vesselId: string, ruleId: string, level: LogLevel, text: string) {
    const key = `${vesselId}:${ruleId}`
    const last = this.logCooldown.get(key)
    if (last !== undefined && this.clock - last < LOG_COOLDOWN) return
    this.logCooldown.set(key, this.clock)
    this.pendingLogs.push({ level, text })
  }

  /**
   * Returns the highest-priority rule that applies to this vessel.
   * Rules are pre-sorted by `priority` descending in the data module order, but
   * sorting here keeps the guarantee local and obvious.
   */
  private matchRule(vessel: Vessel, condition: VesselConditions): ReactionRule | null {
    const present = new Set(vessel.contents.map((content) => content.reagentId))
    if (present.size === 0) return null

    let best: ReactionRule | null = null
    for (const rule of REACTION_RULES) {
      if (best && rule.priority <= best.priority) continue
      if (!rule.reactants.every((id) => present.has(id))) continue
      if (!this.conditionsMet(rule, vessel, condition)) continue
      best = rule
    }
    return best
  }

  private conditionsMet(
    rule: ReactionRule,
    vessel: Vessel,
    condition: VesselConditions,
  ): boolean {
    const needs = rule.conditions
    if (!needs) return true

    if (needs.heat) {
      // Either an actual flame, or the mixture is already hot enough to ignite.
      if (!condition.heated && vessel.temperature < IGNITION_TEMPERATURE) return false
    }
    if (needs.stir && !condition.stirred) return false
    if (needs.minTemperature !== undefined && vessel.temperature < needs.minTemperature) {
      return false
    }
    if (needs.catalyst && this.amountOf(vessel, needs.catalyst) <= 0) return false
    return true
  }

  /**
   * Ratio in which each product appears relative to the limiting reactant.
   * Derived from the rule's own reactant/product counts so that a rule like
   * `2NaHCO₃ → Na₂CO₃ + H₂O + CO₂` does not invent mass out of nothing.
   */
  private stoichiometryOf(rule: ReactionRule): number {
    const reactantCount = Math.max(1, rule.reactants.length)
    const productCount = Math.max(1, rule.products.length)
    return clamp(reactantCount / productCount, 0.34, 2)
  }

  /* ---------------------------------------------------------------------- */
  /*  Effects                                                                */
  /* ---------------------------------------------------------------------- */

  /** Applies a rule's effects; returns `false` when the reaction stalls. */
  private applyEffects(
    vessel: Vessel,
    rule: ReactionRule,
    step: number,
    dt: number,
  ): boolean {
    const effects: ReactionEffects = rule.effects
    const def = getApparatusDef(vessel.kind)

    if (effects.explosion) {
      this.explode(vessel, effects)
      return false
    }

    if (effects.temperatureDelta !== undefined) {
      vessel.temperature = clamp(
        vessel.temperature + effects.temperatureDelta * step * 3,
        -20,
        MAX_TEMPERATURE,
      )
    }

    if (effects.colorChange !== undefined && effects.colorChange !== null) {
      vessel.lockedColor = effects.colorChange
    }
    if (effects.opacityChange !== undefined) {
      vessel.opacity = clamp(effects.opacityChange, 0, 1)
    }
    if (effects.colorChange || effects.opacityChange !== undefined) {
      this.recompute(vessel)
    }

    if (effects.glow) {
      vessel.glow = { color: effects.glow, life: 0.6 }
      if (Math.random() < step * 0.9) {
        this.particles.emitSparks(
          vessel.x,
          vessel.y - def.height * 0.3,
          effects.glow,
          2,
          Math.PI * 0.65,
          130,
        )
      }
    }

    if (effects.gas) {
      const gas = effects.gas
      this.particles.emitBubbles(
        vessel.id,
        vessel.kind,
        vessel.x,
        vessel.y,
        gas.color ?? findReagent(gas.reagentId)?.color ?? '#ffffff',
        gas.intensity * clamp(step * 3, 0.4, 3),
        gas.label,
        dt,
      )
    }

    if (effects.precipitate) {
      const reagent = findReagent(effects.precipitate.reagentId)
      if (reagent) {
        this.particles.emitPrecipitate(
          vessel.id,
          vessel.kind,
          vessel.x,
          vessel.y,
          reagent.color,
          1,
          dt,
        )
      }
    }

    return true
  }

  private explode(vessel: Vessel, effects: ReactionEffects) {
    const def = getApparatusDef(vessel.kind)
    const power = effects.explosion?.power ?? 1
    vessel.exploded = true
    vessel.contents = []
    vessel.color = null
    vessel.opacity = 0
    vessel.lockedColor = null
    vessel.temperature = AMBIENT + 30
    this.particles.clearApparatus(vessel.id)
    this.particles.emitSparks(
      vessel.x,
      vessel.y - def.height * 0.15,
      '#ffb347',
      Math.round(70 * power),
      Math.PI,
      240 + 160 * power,
    )
    this.particles.emitSparks(
      vessel.x,
      vessel.y - def.height * 0.15,
      '#ff5c45',
      Math.round(30 * power),
      Math.PI,
      320 * power,
    )
    this.explosionCount += 1
    // An explosion is a one-shot event and must always be reported, so it
    // bypasses the per-rule cooldown in `pushLog`.
    this.pendingLogs.push({
      level: 'danger',
      text: `💥 ${effects.explosion?.message ?? '容器发生了爆炸！'}（第 ${this.explosionCount} 次）`,
    })
  }

  /* ---------------------------------------------------------------------- */
  /*  Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  private amountOf(vessel: Vessel, reagentId: string): number {
    let total = 0
    for (const content of vessel.contents) {
      if (content.reagentId === reagentId) total += content.amount
    }
    return total
  }

  private addContent(vessel: Vessel, reagentId: string, amount: number) {
    const def = getApparatusDef(vessel.kind)
    const current = vessel.contents.reduce((sum, content) => sum + content.amount, 0)
    if (current >= def.capacity) return
    const accepted = Math.min(amount, def.capacity - current)
    const existing = vessel.contents.find((content) => content.reagentId === reagentId)
    if (existing) existing.amount += accepted
    else vessel.contents.push({ reagentId, amount: accepted })
  }

  /** Recomputes colour/opacity, honouring a colour locked in by a reaction. */
  private recompute(vessel: Vessel) {
    const reactivated = recomputeMixture({
      ...(vessel as unknown as Apparatus),
      contents: vessel.contents,
    })
    if (vessel.lockedColor) {
      const visible = vessel.contents.filter((content) => {
        const reagent = REAGENT_MAP[content.reagentId]
        return reagent && reagent.phase !== 'gas' && content.amount > 0
      })
      if (visible.length === 0) {
        vessel.lockedColor = null
        vessel.color = null
        vessel.opacity = 0
        return
      }
      vessel.color = vessel.lockedColor
      // Keep the depth cue from the computed opacity but never let an indicator
      // wash out to invisibility.
      vessel.opacity = Math.max(vessel.opacity, reactivated.mixtureOpacity ?? 0.6, 0.55)
      return
    }
    vessel.color = reactivated.mixtureColor
    vessel.opacity = reactivated.mixtureOpacity
  }

  private rebuildEffects() {
    this.effects.clear()
    for (const vessel of this.vessels.values()) {
      const effect: RuntimeEffect = {
        color: vessel.color,
        opacity: vessel.opacity,
      }
      if (vessel.glow) effect.glow = vessel.glow.color
      if (vessel.temperature > 55) {
        effect.heat = clamp((vessel.temperature - 55) / 120, 0, 1)
      }
      if (effect.glow || effect.heat) this.effects.set(vessel.id, effect)
      else if (vessel.lockedColor) this.effects.set(vessel.id, effect)
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Debug helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Renders a mixture swatch for tooltips; shared with the inspector panel. */
export function mixtureSwatch(color: string | null, opacity: number): string {
  if (!color) return 'transparent'
  return withAlpha(color, clamp(opacity, 0.1, 1))
}

/** Convenience re-export so callers do not import the particle module twice. */
export { ParticleSystem }

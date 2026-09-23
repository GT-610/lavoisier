/**
 * Particle pool for the visual effects layer.
 *
 * Bubbles, sparks and precipitate flecks are pure decoration: they never feed
 * back into the simulation, so they are kept in a flat structure-of-arrays
 * pool that is mutated in place and never enters React state. Capacity is
 * fixed, and the oldest particle is recycled when the pool is full, which
 * keeps memory flat no matter how violent a reaction gets.
 */
import type { ApparatusKind } from '@/types'
import { getApparatusDef } from '@/data/reagents'
import { clamp, withAlpha } from '@/utils/math'

export type ParticleKind = 'bubble' | 'spark' | 'precipitate' | 'smoke'

export interface Particle {
  active: boolean
  kind: ParticleKind
  /** Owning vessel; a particle dies with its vessel. */
  apparatusId: string
  x: number
  y: number
  vx: number
  vy: number
  /** Remaining lifetime in seconds. */
  life: number
  /** Total lifetime, used to normalise `life` into 0..1. */
  maxLife: number
  size: number
  color: string
  /** Label drawn inside the bubble, e.g. `H₂`. */
  label?: string
  rotation: number
  spin: number
}

const MAX_PARTICLES = 1400
/** Emission budgets per second, per effect kind. */
const EMIT_RATE = {
  bubble: 34,
  spark: 80,
  precipitate: 12,
  smoke: 20,
}

export class ParticleSystem {
  private readonly pool: Particle[] = []
  private cursor = 0
  /** Fractional emission carry-over so low rates still fire steadily. */
  private carry: Record<ParticleKind, number> = {
    bubble: 0,
    spark: 0,
    precipitate: 0,
    smoke: 0,
  }

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false,
        kind: 'bubble',
        apparatusId: '',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: '#ffffff',
        rotation: 0,
        spin: 0,
      })
    }
  }

  /** Number of particles currently alive; useful for the debug overlay. */
  get alive(): number {
    let count = 0
    for (const particle of this.pool) if (particle.active) count++
    return count
  }

  clear() {
    for (const particle of this.pool) particle.active = false
  }

  /** Drops every particle belonging to a vessel (e.g. it was deleted). */
  clearApparatus(apparatusId: string) {
    for (const particle of this.pool) {
      if (particle.apparatusId === apparatusId) particle.active = false
    }
  }

  private spawn(): Particle {
    // Round-robin recycling; a live particle is simply overwritten.
    for (let attempt = 0; attempt < this.pool.length; attempt++) {
      const candidate = this.pool[this.cursor]
      this.cursor = (this.cursor + 1) % this.pool.length
      if (!candidate.active) return candidate
    }
    const recycled = this.pool[this.cursor]
    this.cursor = (this.cursor + 1) % this.pool.length
    return recycled
  }

  /**
   * Emits bubbles for a vessel. `intensity` scales both the emission rate and
   * how fast the bubbles rise.
   */
  emitBubbles(
    apparatusId: string,
    kind: ApparatusKind,
    x: number,
    y: number,
    color: string,
    intensity: number,
    label: string | undefined,
    dt: number,
  ) {
    const def = getApparatusDef(kind)
    if (def.capacity <= 0) return
    const rate = EMIT_RATE.bubble * clamp(intensity, 0, 4)
    this.carry.bubble += rate * dt
    let count = Math.floor(this.carry.bubble)
    this.carry.bubble -= count
    count = Math.min(count, 12)

    const halfW = def.width * 0.34
    const bottom = def.height * 0.44
    for (let i = 0; i < count; i++) {
      const particle = this.spawn()
      particle.active = true
      particle.kind = 'bubble'
      particle.apparatusId = apparatusId
      particle.x = x + (Math.random() * 2 - 1) * halfW
      particle.y = y + bottom - Math.random() * def.height * 0.22
      particle.vx = (Math.random() * 2 - 1) * 12
      particle.vy = -(26 + Math.random() * 34) * clamp(intensity, 0.5, 3)
      particle.maxLife = 0.7 + Math.random() * 0.9
      particle.life = particle.maxLife
      particle.size = 1.6 + Math.random() * 3.4
      particle.color = color
      particle.label = label
      particle.rotation = 0
      particle.spin = 0
    }
  }

  /** Sparks and smoke for combustion or an explosion. */
  emitSparks(
    x: number,
    y: number,
    color: string,
    count: number,
    spread: number,
    speed: number,
  ) {
    for (let i = 0; i < count; i++) {
      const particle = this.spawn()
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * spread
      const velocity = speed * (0.4 + Math.random() * 0.9)
      particle.active = true
      particle.kind = Math.random() < 0.72 ? 'spark' : 'smoke'
      particle.apparatusId = ''
      particle.x = x
      particle.y = y
      particle.vx = Math.cos(angle) * velocity
      particle.vy = Math.sin(angle) * velocity
      particle.maxLife = particle.kind === 'spark' ? 0.4 + Math.random() * 0.6 : 0.9 + Math.random() * 1.3
      particle.life = particle.maxLife
      particle.size = particle.kind === 'spark' ? 1.2 + Math.random() * 2.4 : 5 + Math.random() * 12
      particle.color = particle.kind === 'spark' ? color : '#6a6f7d'
      particle.label = undefined
      particle.rotation = Math.random() * Math.PI
      particle.spin = (Math.random() * 2 - 1) * 4
    }
  }

  /** Slow-settling solids: a precipitate falling through the mixture. */
  emitPrecipitate(
    apparatusId: string,
    kind: ApparatusKind,
    x: number,
    y: number,
    color: string,
    amount: number,
    dt: number,
  ) {
    const def = getApparatusDef(kind)
    if (def.capacity <= 0) return
    this.carry.precipitate += EMIT_RATE.precipitate * clamp(amount, 0, 3) * dt
    let count = Math.floor(this.carry.precipitate)
    this.carry.precipitate -= count
    count = Math.min(count, 8)

    for (let i = 0; i < count; i++) {
      const particle = this.spawn()
      particle.active = true
      particle.kind = 'precipitate'
      particle.apparatusId = apparatusId
      particle.x = x + (Math.random() * 2 - 1) * def.width * 0.32
      particle.y = y - def.height * 0.12 + Math.random() * def.height * 0.2
      particle.vx = (Math.random() * 2 - 1) * 8
      particle.vy = 12 + Math.random() * 20
      particle.maxLife = 1.6 + Math.random() * 1.6
      particle.life = particle.maxLife
      particle.size = 1.4 + Math.random() * 2.6
      particle.color = color
      particle.label = undefined
      particle.rotation = Math.random() * Math.PI
      particle.spin = (Math.random() * 2 - 1) * 1.6
    }
  }

  /**
   * Integrates every live particle. `temperatureByApparatus` lets gases rise
   * faster in a hot vessel, which reads as a stronger reaction.
   */
  update(dt: number, temperatureByApparatus: Map<string, number>) {
    for (const particle of this.pool) {
      if (!particle.active) continue
      particle.life -= dt
      if (particle.life <= 0) {
        particle.active = false
        continue
      }

      switch (particle.kind) {
        case 'bubble': {
          const heat = temperatureByApparatus.get(particle.apparatusId) ?? 22
          const boost = 1 + clamp((heat - 22) / 120, 0, 1.1)
          particle.vy -= 34 * boost * dt
          particle.vx += Math.sin(particle.y * 0.06 + particle.life * 3) * 12 * dt
          particle.vx *= 1 - 1.2 * dt
          break
        }
        case 'precipitate': {
          particle.vy += 26 * dt
          particle.vx *= 1 - 2.4 * dt
          break
        }
        case 'spark': {
          particle.vy += 46 * dt
          particle.vx *= 1 - 2.6 * dt
          break
        }
        case 'smoke': {
          particle.vy -= 10 * dt
          particle.vx += Math.sin(particle.life * 2.2) * 16 * dt
          particle.size += 9 * dt
          break
        }
      }

      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.rotation += particle.spin * dt
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    for (const particle of this.pool) {
      if (!particle.active) continue
      const t = clamp(particle.life / particle.maxLife, 0, 1)

      switch (particle.kind) {
        case 'bubble': {
          const alpha = clamp(t * 1.4, 0, 0.85)
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          ctx.fillStyle = withAlpha('#ffffff', alpha * 0.16)
          ctx.fill()
          ctx.strokeStyle = withAlpha(particle.color, alpha)
          ctx.lineWidth = 1.1
          ctx.stroke()
          // Highlight pip makes small bubbles read as spheres.
          ctx.beginPath()
          ctx.arc(
            particle.x - particle.size * 0.3,
            particle.y - particle.size * 0.34,
            Math.max(0.6, particle.size * 0.26),
            0,
            Math.PI * 2,
          )
          ctx.fillStyle = withAlpha('#ffffff', alpha * 0.8)
          ctx.fill()

          if (particle.label && particle.size > 3) {
            ctx.font = `600 ${Math.round(particle.size * 1.5)}px ui-monospace, monospace`
            ctx.fillStyle = withAlpha(particle.color, alpha * 0.95)
            ctx.textAlign = 'center'
            ctx.fillText(particle.label, particle.x + particle.size * 2.6, particle.y + 3)
          }
          break
        }
        case 'spark': {
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          const alpha = clamp(t, 0, 1)
          const gradient = ctx.createRadialGradient(
            particle.x,
            particle.y,
            0,
            particle.x,
            particle.y,
            particle.size * 3,
          )
          gradient.addColorStop(0, withAlpha(particle.color, alpha))
          gradient.addColorStop(1, withAlpha(particle.color, 0))
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          break
        }
        case 'precipitate': {
          ctx.save()
          ctx.translate(particle.x, particle.y)
          ctx.rotate(particle.rotation)
          ctx.fillStyle = withAlpha(particle.color, clamp(t * 1.6, 0, 0.95))
          ctx.fillRect(-particle.size, -particle.size * 0.7, particle.size * 2, particle.size * 1.4)
          ctx.restore()
          break
        }
        case 'smoke': {
          const alpha = clamp(t * 0.32, 0, 0.32)
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          ctx.fillStyle = withAlpha(particle.color, alpha)
          ctx.fill()
          break
        }
      }
    }
    ctx.restore()
  }
}

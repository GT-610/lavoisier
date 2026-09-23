/**
 * Domain model for the Lavoisier chemistry sandbox.
 *
 * The simulation deliberately avoids fluid dynamics: reagents are discrete
 * amounts that live inside a vessel, and a rule engine decides what happens
 * based on *which* reagents share a vessel plus the vessel's local conditions
 * (temperature, stirring, catalyst). Everything in this file is plain data so
 * that a whole bench can be serialised to JSON and back.
 */

/* -------------------------------------------------------------------------- */
/*  Reagents                                                                   */
/* -------------------------------------------------------------------------- */

/** Physical state of a reagent under ambient conditions. */
export type ReagentPhase = 'liquid' | 'solid' | 'gas'

/**
 * Semantic markers the rule engine matches on. Using a tag set instead of a
 * handful of booleans keeps the catalogue extensible: adding "amphoteric" or
 * "radioactive" later costs one union member and no schema migration.
 */
export type ReagentTag =
  | 'acid'
  | 'base'
  | 'indicator'
  | 'active-metal'
  | 'carbonate'
  | 'oxidizer'
  | 'reducing-agent'
  | 'salt'
  | 'water'
  | 'flammable'
  | 'catalyst'
  | 'insoluble-base'
  | 'metal-oxide'

export interface Reagent {
  id: string
  /** Chinese display name shown on the shelf, e.g. 稀盐酸. */
  name: string
  /** Chemical formula rendered under the name, e.g. HCl. */
  formula: string
  /** Base colour used when the reagent is drawn. */
  color: string
  /**
   * How strongly `color` tints a mixture, in `[0, 1]`.
   * `0` is a perfectly colourless solution (water, dilute acids) and `1` is an
   * opaque pigment. The engine blends vessel contents by `amount * colorStrength`
   * so that a drop of dye still recolours a beaker of water.
   */
  colorStrength: number
  phase: ReagentPhase
  tags: ReagentTag[]
  /**
   * `reagent` entries are offered on the left-hand shelf.
   * `product` entries only ever appear as the outcome of a reaction.
   */
  role: 'reagent' | 'product'
  /** Short note surfaced in tooltips. */
  note?: string
}

/* -------------------------------------------------------------------------- */
/*  Apparatus                                                                  */
/* -------------------------------------------------------------------------- */

export type ApparatusKind =
  | 'beaker'
  | 'test-tube'
  | 'flask'
  | 'measuring-cylinder'
  | 'evaporating-dish'
  | 'alcohol-lamp'
  | 'glass-rod'
  | 'funnel'

/** Static blueprint of an instrument; instances are `Apparatus`. */
export interface ApparatusDef {
  kind: ApparatusKind
  name: string
  /** Footprint in canvas units, before rotation. */
  width: number
  height: number
  /** Maximum total reagent units; `0` means the instrument holds nothing. */
  capacity: number
  /** A flame in contact with it can raise its temperature. */
  heatable: boolean
  /** A glass rod in contact with it enables stirring. */
  stirrable: boolean
  /** Heat sources default to a lit flame when dropped on the bench. */
  emitsHeat: boolean
  description: string
}

/** One reagent inside a vessel. */
export interface ApparatusContent {
  reagentId: string
  /** Arbitrary units; the UI presents them as millilitres or grams. */
  amount: number
}

export interface Apparatus {
  id: string
  kind: ApparatusKind
  /** Centre of the instrument, in canvas coordinates. */
  x: number
  y: number
  /** Clockwise rotation in degrees. */
  rotation: number
  contents: ApparatusContent[]
  /** Mixture temperature in °C, integrated by the engine. */
  temperature: number
  /** Flame state; only meaningful for heat sources. */
  lit: boolean
  /** Cached mixture colour, or `null` when the vessel is empty. */
  mixtureColor: string | null
  /** Cached mixture opacity in `[0, 1]`. */
  mixtureOpacity: number
}

/* -------------------------------------------------------------------------- */
/*  Reaction rules                                                             */
/* -------------------------------------------------------------------------- */

export interface ReactionConditions {
  /**
   * Requires an effective temperature: either a lit flame in contact with the
   * vessel, or a mixture already above the ignition threshold.
   */
  heat?: boolean
  /** Requires a glass rod in contact with the vessel. */
  stir?: boolean
  /** Requires the mixture to be at least this hot, in °C. */
  minTemperature?: number
  /** Requires this reagent to be present; the catalyst is never consumed. */
  catalyst?: string
}

export interface ReactionEffects {
  /** New mixture colour, or `null` to keep the computed colour. */
  colorChange?: string | null
  /** New mixture opacity in `[0, 1]`. */
  opacityChange?: number
  /** Bubbles escaping the vessel. */
  gas?: {
    reagentId: string
    label: string
    color?: string
    /** Units of gas produced per unit of reaction. */
    amount: number
    /** Bubble spawn rate multiplier. */
    intensity: number
  }
  /** Solid settling out of the mixture. */
  precipitate?: {
    reagentId: string
    amount: number
  }
  /** Heat released (positive) or absorbed (negative) per unit of reaction, in °C. */
  temperatureDelta?: number
  /** Sustained glow colour, e.g. burning magnesium. */
  glow?: string
  /** One-shot event that empties the vessel and shakes the bench. */
  explosion?: {
    power: number
    message: string
  }
}

export interface ReactionRule {
  id: string
  /** Chinese name, e.g. 锌与稀盐酸反应. */
  name: string
  /** Human-readable equation, e.g. `Zn + 2HCl → ZnCl₂ + H₂↑`. */
  equation: string
  /** Reagent ids that must all be present in the same vessel. */
  reactants: string[]
  conditions?: ReactionConditions
  /** Reagent ids the reaction produces, for display purposes. */
  products: string[]
  /**
   * When `false` no reactant is consumed at all — used by indicator rules that
   * only recolour the mixture. Defaults to `true`. An id listed in
   * `conditions.catalyst` is always preserved, even when `consume` is `true`.
   */
  consume?: boolean
  /** Units of reaction per second; higher means a faster reaction. */
  rate: number
  /** Higher priority rules are matched first when several could apply. */
  priority: number
  effects: ReactionEffects
  /** One-line Chinese explanation shown in the log. */
  description: string
}

/* -------------------------------------------------------------------------- */
/*  Workspaces                                                                 */
/* -------------------------------------------------------------------------- */

export type LogLevel = 'info' | 'react' | 'warn' | 'danger'

export interface LogEntry {
  id: string
  /** Epoch milliseconds. */
  at: number
  level: LogLevel
  text: string
}

/** One bench: an independent canvas with its own instruments and history. */
export interface Workspace {
  id: string
  name: string
  createdAt: number
  apparatus: Apparatus[]
  selectedId: string | null
  log: LogEntry[]
  /**
   * Bumped whenever a *user action* changes vessel contents (adding a reagent,
   * clearing a vessel, importing a file).
   *
   * The simulation engine keeps its own mutable mirror of every vessel so the
   * 60 fps hot path never touches React state. It compares this revision to
   * decide whether the store holds newer contents than its mirror; the engine's
   * own periodic write-back deliberately does *not* bump it, which is what
   * stops the two from fighting over the same numbers.
   */
  contentsRevision: number
}

/**
 * One vessel's authoritative state as produced by the simulation engine.
 * `contents` is the full replacement list — the engine, not the component
 * tree, decides how much of each reagent is left.
 */
export interface SimulationPatch {
  id: string
  temperature: number
  mixtureColor: string | null
  mixtureOpacity: number
  contents: ApparatusContent[]
}

/* -------------------------------------------------------------------------- */
/*  Serialisation                                                              */
/* -------------------------------------------------------------------------- */

/** Shape of the exported `.json` bench file. */
export interface WorkspaceSnapshot {
  /** Format discriminator, bumped when the schema changes incompatibly. */
  format: 'lavoisier.workspace'
  version: 1
  exportedAt: string
  workspace: Workspace
}

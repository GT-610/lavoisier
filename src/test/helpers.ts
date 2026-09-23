/**
 * Shared fixtures for the unit tests.
 *
 * Engine tests build a bench by hand rather than going through the store: a
 * plain `Workspace` with `contentsRevision: 0` is enough for the engine to
 * mirror, and keeping the store out of the loop makes each test independent of
 * whatever a previous test happened to leave behind.
 */
import { createApparatus } from '@/store/labStore'
import type { ReactionEngine } from '@/engine/reactionEngine'
import type { Apparatus, ApparatusKind, SimulationPatch, Workspace } from '@/types'

/** A bench with no history, sized for direct engine consumption. */
export function makeBench(apparatus: Apparatus[] = []): Workspace {
  return {
    id: 'ws_test',
    name: '测试台',
    createdAt: 0,
    apparatus,
    selectedId: null,
    log: [],
    contentsRevision: 0,
  }
}

/**
 * A vessel pre-loaded with reagents. Uses the real `createApparatus` factory so
 * that defaults like "an alcohol lamp arrives lit" match production behaviour.
 */
export function vessel(
  kind: ApparatusKind,
  x: number,
  y: number,
  dose: [string, number][] = [],
): Apparatus {
  const apparatus = createApparatus(kind, x, y)
  apparatus.contents = dose.map(([reagentId, amount]) => ({ reagentId, amount }))
  return apparatus
}

/**
 * Advances the engine by wall-clock seconds worth of fixed-timestep frames and
 * returns its output without writing anything back to the bench.
 */
export function advance(
  engine: ReactionEngine,
  bench: Workspace,
  seconds: number,
  dt = 1 / 60,
): ReturnType<ReactionEngine['buildCommit']> {
  const frames = Math.round(seconds / dt)
  for (let i = 0; i < frames; i++) engine.step({ workspace: bench, dt })
  return engine.buildCommit()
}

/** How much of one reagent a patch reports. */
export function amountIn(patch: SimulationPatch, reagentId: string): number {
  return patch.contents.find((content) => content.reagentId === reagentId)?.amount ?? 0
}

/** Fetches the patch for a vessel id, failing loudly if it is missing. */
export function patchFor(patches: SimulationPatch[], id: string): SimulationPatch {
  const patch = patches.find((item) => item.id === id)
  if (!patch) throw new Error(`no simulation patch produced for apparatus ${id}`)
  return patch
}

/** All log texts produced by one advance, deduplicated. */
export function logTexts(logs: { text: string }[]): string[] {
  return [...new Set(logs.map((entry) => entry.text))]
}

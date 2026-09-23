/**
 * Scoped selector hooks.
 *
 * `useLabStore` is the raw store; components should prefer the hooks below so
 * that (a) they never accidentally subscribe to *every* workspace, and (b) the
 * `workspaceId` plumbing stays out of the component tree.
 *
 * Rule of thumb enforced here: a selector must return a *stable* reference.
 * Selecting an existing array/object out of the store is fine; building a new
 * array or object inside the selector is not, because Zustand's snapshot check
 * will see a fresh value on every render and loop forever. Derived collections
 * are therefore assembled with `useMemo` in the component instead.
 */
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useLabStore, type LabState } from '@/store/labStore'
import type { Workspace } from '@/types'

/** The id of the workspace currently shown on screen. */
export function useActiveWorkspaceId(): string {
  return useLabStore((state) => state.activeId)
}

/** The workspace currently shown on screen. */
export function useActiveWorkspace(): Workspace {
  return useLabStore((state) => state.workspaces[state.activeId])
}

/**
 * Subscribe to a slice of one workspace (defaults to the active one).
 *
 * The selector must return a stable reference — typically one of the
 * workspace's own fields, or an element found inside one of them.
 */
export function useWorkspace<T>(
  selector: (workspace: Workspace, state: LabState) => T,
  workspaceId?: string,
): T {
  return useLabStore(
    useShallow((state) => {
      const workspace = state.workspaces[workspaceId ?? state.activeId]
      return selector(workspace, state)
    }),
  )
}

/** The instruments of one workspace, in draw order. */
export function useApparatus(workspaceId?: string) {
  return useWorkspace((workspace) => workspace.apparatus, workspaceId)
}

/** Currently selected instrument (or `null`). */
export function useSelectedApparatus(workspaceId?: string) {
  return useWorkspace(
    (workspace) => workspace.apparatus.find((item) => item.id === workspace.selectedId) ?? null,
    workspaceId,
  )
}

export interface WorkspaceTab {
  id: string
  name: string
  apparatusCount: number
}

/**
 * Tab strip metadata.
 *
 * `order` and `workspaces` are both stable store references, so subscribing to
 * them keeps the snapshot identity intact; the tab objects are derived with
 * `useMemo` and only rebuilt when one of those two references actually changes.
 */
export function useWorkspaceTabs(): WorkspaceTab[] {
  const order = useLabStore((state) => state.order)
  const workspaces = useLabStore((state) => state.workspaces)

  return useMemo(
    () =>
      order.flatMap((id) => {
        const workspace = workspaces[id]
        if (!workspace) return []
        return [{ id, name: workspace.name, apparatusCount: workspace.apparatus.length }]
      }),
    [order, workspaces],
  )
}

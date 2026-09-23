/**
 * Scoped selector hooks.
 *
 * `useLabStore` is the raw store; components should prefer the hooks below so
 * that (a) they never accidentally subscribe to *every* workspace, and (b) the
 * `workspaceId` plumbing stays out of the component tree.
 */
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
 * Subscribe to a derived slice of one workspace (defaults to the active one).
 * `useShallow` keeps object/array selectors from re-rendering on every commit.
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

/** Tab strip metadata: id + name only, so renames do not re-render on content. */
export function useWorkspaceTabs() {
  return useLabStore(
    useShallow((state) =>
      state.order.map((id) => {
        const workspace = state.workspaces[id]
        return {
          id,
          name: workspace?.name ?? '未命名',
          apparatusCount: workspace?.apparatus.length ?? 0,
        }
      }),
    ),
  )
}

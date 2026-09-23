/**
 * Application shell.
 *
 * Layout: tab strip on top, then a three-column bench — library, canvas,
 * inspector + log. The canvas column is the only flexible one; side columns
 * keep fixed widths so the bench coordinate system stays predictable.
 */
import { useCallback, useRef, useState } from 'react'

import { BenchCanvas } from '@/components/BenchCanvas'
import { Inspector } from '@/components/Inspector'
import { LogPanel } from '@/components/LogPanel'
import { Shelf } from '@/components/Shelf'
import { Toolbar } from '@/components/Toolbar'
import { WorkspaceTabs } from '@/components/WorkspaceTabs'

export default function App() {
  /**
   * The burst callback is produced by the canvas after the engine attaches, so
   * it is mirrored into state rather than read out of a ref during render —
   * a ref would still be `null` on the first pass and the inspector would
   * never see the function.
   */
  const burstRef = useRef<((x: number, y: number) => void) | null>(null)
  const [burst, setBurst] = useState<((x: number, y: number) => void) | null>(null)
  const handleBurstReady = useCallback((fn: ((x: number, y: number) => void) | null) => {
    burstRef.current = fn
    setBurst(() => fn)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-lab-void text-lab-text">
      <WorkspaceTabs />
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Shelf />
        <main className="flex min-w-0 flex-1 flex-col">
          <BenchCanvas onBurstReady={handleBurstReady} />
        </main>
        <aside className="flex h-full w-[312px] shrink-0 flex-col border-l border-lab-border bg-lab-panel">
          <div className="min-h-0 flex-[3] border-b border-lab-border">
            <Inspector burst={burst} />
          </div>
          <div className="min-h-0 flex-[2]">
            <LogPanel />
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * Event log.
 *
 * The engine batches its log lines into the same store write as its physics, so
 * this panel re-renders at most ~10 times per second no matter how busy the
 * bench is. Lines are collapse-deduplicated in the store.
 */
import { useEffect, useRef } from 'react'

import { IconButton, Panel } from '@/components/ui'
import { cx } from '@/utils/cx'
import { useActiveWorkspaceId, useWorkspace } from '@/store/hooks'
import { useLabStore } from '@/store/labStore'
import type { LogLevel } from '@/types'
import { formatTime } from '@/utils/math'

const LEVEL_STYLE: Record<LogLevel, { dot: string; text: string }> = {
  info: { dot: 'bg-lab-faint', text: 'text-lab-muted' },
  react: { dot: 'bg-lab-accent', text: 'text-lab-text' },
  warn: { dot: 'bg-lab-warn', text: 'text-lab-warn' },
  danger: { dot: 'bg-lab-danger', text: 'text-lab-danger' },
}

export function LogPanel() {
  const workspaceId = useActiveWorkspaceId()
  const log = useWorkspace((workspace) => workspace.log)
  const clearLog = useLabStore((state) => state.clearLog)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  // Follow the tail unless the user has scrolled up to read history.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !pinnedRef.current) return
    element.scrollTop = element.scrollHeight
  }, [log])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    pinnedRef.current = distance < 24
  }

  return (
    <Panel
      title="实验记录"
      className="h-full"
      actions={
        <IconButton label="清空记录" onClick={() => clearLog(workspaceId)}>
          ⌫
        </IconButton>
      }
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="lab-scroll h-full overflow-y-auto px-2 py-1.5 font-mono text-[11px] leading-relaxed"
      >
        {log.length === 0 ? (
          <p className="px-1 py-2 text-lab-faint">暂无记录。放置仪器并加入试剂开始实验。</p>
        ) : (
          <ul className="space-y-0.5">
            {log.map((entry) => {
              const style = LEVEL_STYLE[entry.level]
              return (
                <li key={entry.id} className="flex gap-2">
                  <span className="shrink-0 text-lab-faint/70">{formatTime(entry.at)}</span>
                  <span className={cx('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
                  <span className={cx('min-w-0 flex-1 break-words', style.text)}>{entry.text}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}

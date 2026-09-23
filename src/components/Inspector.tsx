/**
 * Right-hand inspector: everything about the current selection.
 *
 * Shows the vessel's cached appearance and temperature, lets the user dose
 * reagents or empty the vessel, and — most usefully — lists the reaction rules
 * that the current mixture is *close* to triggering. That turns the rule table
 * into a discoverable hint system instead of a hidden oracle.
 */
import { useMemo } from 'react'

import { Badge, Button, Hint, IconButton, Panel, cx } from '@/components/ui'
import { findReagent, getApparatusDef } from '@/data/reagents'
import { REACTION_RULES } from '@/data/reactions'
import { useLabStore } from '@/store/labStore'
import { useSelectedApparatus, useActiveWorkspaceId } from '@/store/hooks'
import type { Apparatus, ReactionRule } from '@/types'

export function Inspector({
  burst,
}: {
  /** Spawns a spark burst at a world position; supplied by the bench canvas. */
  burst?: ((x: number, y: number) => void) | null
}) {
  const workspaceId = useActiveWorkspaceId()
  const selected = useSelectedApparatus()

  if (!selected) {
    return (
      <Panel title="检视器" className="h-full">
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="text-2xl opacity-40">⌬</div>
          <p className="text-xs leading-relaxed text-lab-faint">
            在实验台中选择一件仪器，
            <br />
            这里会显示它的温度、内容物与可触发的反应。
          </p>
        </div>
      </Panel>
    )
  }

  const def = getApparatusDef(selected.kind)
  const isHeatSource = def.emitsHeat
  const totalVolume = selected.contents.reduce((sum, content) => sum + content.amount, 0)

  return (
    <Panel
      title="检视器"
      className="h-full"
      actions={
        <IconButton
          label="移除该仪器"
          tone="danger"
          onClick={() => useLabStore.getState().removeApparatus(workspaceId, selected.id)}
        >
          ✕
        </IconButton>
      }
    >
      <div className="lab-scroll flex h-full flex-col gap-3 overflow-y-auto p-3">
        {/* ------------------------------- header ------------------------------ */}
        <div className="rounded-lg border border-lab-border-soft bg-lab-panel-2/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-lab-text">{def.name}</h3>
              <p className="mt-0.5 text-[11px] leading-snug text-lab-faint">{def.description}</p>
            </div>
            {selected.mixtureColor && (
              <span
                className="mt-0.5 h-7 w-7 shrink-0 rounded-md ring-1 ring-white/15"
                style={{
                  backgroundColor: selected.mixtureColor,
                  opacity: Math.max(0.3, selected.mixtureOpacity),
                }}
                title="当前混合物颜色"
              />
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge>容量 {def.capacity > 0 ? `${totalVolume.toFixed(1)} / ${def.capacity}` : '—'}</Badge>
            <TemperatureBadge temperature={selected.temperature} />
            {def.heatable && <Badge>可加热</Badge>}
            {def.stirrable && <Badge>可搅拌</Badge>}
            {isHeatSource && (
              <Badge className={selected.lit ? 'text-lab-warn' : undefined}>
                {selected.lit ? '已点燃' : '未点燃'}
              </Badge>
            )}
          </div>

          {isHeatSource ? (
            <Button
              size="sm"
              variant={selected.lit ? 'danger' : 'primary'}
              className="mt-2.5 w-full"
              onClick={() => useLabStore.getState().toggleFlame(workspaceId, selected.id)}
            >
              {selected.lit ? '熄灭酒精灯' : '点燃酒精灯'}
            </Button>
          ) : (
            <div className="mt-2.5 flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={selected.rotation === 0}
                onClick={() => useLabStore.getState().rotateApparatus(workspaceId, selected.id, selected.rotation - 15)}
              >
                ↺ 左转 15°
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => useLabStore.getState().rotateApparatus(workspaceId, selected.id, selected.rotation + 15)}
              >
                ↻ 右转 15°
              </Button>
            </div>
          )}
        </div>

        {/* ------------------------------ contents ---------------------------- */}
        {def.capacity > 0 && (
          <section>
            <SectionTitle
              title="容器内容物"
              action={
                selected.contents.length > 0 ? (
                  <button
                    type="button"
                    className="text-[10px] text-lab-faint hover:text-lab-danger"
                    onClick={() => useLabStore.getState().clearApparatus(workspaceId, selected.id)}
                  >
                    清空
                  </button>
                ) : null
              }
            />
            {selected.contents.length === 0 ? (
              <Hint>容器是空的。从左侧试剂库拖入试剂，或双击试剂快速加入。</Hint>
            ) : (
              <ul className="space-y-1">
                {selected.contents.map((content) => {
                  const reagent = findReagent(content.reagentId)
                  if (!reagent) return null
                  const unit = reagent.phase === 'solid' ? 'g' : 'mL'
                  return (
                    <li
                      key={content.reagentId}
                      className="flex items-center gap-2 rounded-md border border-lab-border-soft bg-lab-panel-2/40 px-2 py-1.5"
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/12"
                        style={{ backgroundColor: reagent.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-lab-text">
                        {reagent.name}
                      </span>
                      <span className="font-mono text-[10px] text-lab-muted">
                        {content.amount.toFixed(1)} {unit}
                      </span>
                      <IconButton
                        label={`移除 1 单位 ${reagent.name}`}
                        tone="danger"
                        className="h-5 w-5"
                        onClick={() => {
                          const state = useLabStore.getState()
                          // Reuse the engine write path for a manual removal.
                          state.commitSimulation(
                            workspaceId,
                            [
                              {
                                id: selected.id,
                                temperature: selected.temperature,
                                mixtureColor: selected.mixtureColor,
                                mixtureOpacity: selected.mixtureOpacity,
                                contents: selected.contents
                                  .map((item) =>
                                    item.reagentId === content.reagentId
                                      ? { ...item, amount: Math.max(0, item.amount - 1) }
                                      : item,
                                  )
                                  .filter((item) => item.amount > 0.0001),
                              },
                            ],
                            [],
                          )
                          // Force the engine to re-read from the store.
                          useLabStore.setState((prev) => ({
                            workspaces: {
                              ...prev.workspaces,
                              [workspaceId]: {
                                ...prev.workspaces[workspaceId],
                                contentsRevision: prev.workspaces[workspaceId].contentsRevision + 1,
                              },
                            },
                          }))
                        }}
                      >
                        −
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {/* ---------------------------- reaction hints ------------------------ */}
        {def.capacity > 0 && <ReactionHints apparatus={selected} onSpark={burst} />}
      </div>
    </Panel>
  )
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <h4 className="text-[10px] font-semibold tracking-[0.14em] text-lab-faint uppercase">
        {title}
      </h4>
      {action}
    </div>
  )
}

function TemperatureBadge({ temperature }: { temperature: number }) {
  const tone =
    temperature >= 150
      ? 'text-lab-danger border-lab-danger/40'
      : temperature >= 70
        ? 'text-lab-warn border-lab-warn/40'
        : 'text-lab-muted'
  return (
    <Badge className={cx(tone)}>
      {temperature.toFixed(0)} °C
      {temperature >= 100 ? ' · 沸腾' : temperature >= 70 ? ' · 高温' : ''}
    </Badge>
  )
}

/**
 * Lists the rules whose reactants are a subset of what is in the vessel,
 * separating "ready now" from "needs a condition". A vessel holding zinc and
 * acid shows its reaction as ready; adding a flame is what flips the
 * thermal-decomposition rules into the ready column.
 */
function ReactionHints({
  apparatus,
  onSpark,
}: {
  apparatus: Apparatus
  onSpark?: ((x: number, y: number) => void) | null
}) {
  const present = useMemo(
    () => new Set(apparatus.contents.map((content) => content.reagentId)),
    [apparatus.contents],
  )

  const { ready, pending } = useMemo(() => {
    const readyList: ReactionRule[] = []
    const pendingList: ReactionRule[] = []
    for (const rule of REACTION_RULES) {
      if (!rule.reactants.every((id) => present.has(id))) continue
      // A rule whose reactants are all present is either live or waiting on a
      // condition. Conditions we cannot evaluate here (flame contact, stirring)
      // are simply reported as "needs".
      const needs: string[] = []
      if (rule.conditions?.minTemperature !== undefined) {
        if (apparatus.temperature < rule.conditions.minTemperature) {
          needs.push(`温度 ≥ ${rule.conditions.minTemperature} °C`)
        }
      }
      if (rule.conditions?.heat) needs.push('外加火焰或高温')
      if (rule.conditions?.stir) needs.push('玻璃棒搅拌')
      if (rule.conditions?.catalyst) {
        if (!present.has(rule.conditions.catalyst)) {
          needs.push(`催化剂 ${findReagent(rule.conditions.catalyst)?.name ?? rule.conditions.catalyst}`)
        }
      }
      if (needs.length === 0) readyList.push(rule)
      else pendingList.push({ ...rule, __needs: needs } as ReactionRule & { __needs: string[] })
    }
    return { ready: readyList, pending: pendingList as (ReactionRule & { __needs?: string[] })[] }
  }, [present, apparatus.temperature])

  if (ready.length === 0 && pending.length === 0) {
    return (
      <section>
        <SectionTitle title="可能的反应" />
        <Hint>当前内容物不匹配任何已知反应，试试加入稀盐酸或氢氧化钠。</Hint>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle
        title="可能的反应"
        action={
          ready.length > 0 && onSpark ? (
            <button
              type="button"
              className="text-[10px] text-lab-accent hover:underline"
              onClick={() => onSpark(apparatus.x, apparatus.y - 30)}
            >
              测试特效
            </button>
          ) : null
        }
      />
      <ul className="space-y-1">
        {ready.map((rule) => (
          <li
            key={rule.id}
            className="rounded-md border border-lab-accent/35 bg-lab-accent/8 px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-lab-text">{rule.name}</span>
              <span className="shrink-0 text-[9px] tracking-wide text-lab-accent uppercase">
                进行中
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-lab-accent/90">{rule.equation}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-lab-muted">{rule.description}</p>
          </li>
        ))}
        {pending.map((rule) => (
          <li
            key={rule.id}
            className="rounded-md border border-lab-border-soft bg-lab-panel-2/40 px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-lab-muted">{rule.name}</span>
              <span className="shrink-0 text-[9px] tracking-wide text-lab-faint uppercase">待触发</span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-lab-faint">{rule.equation}</p>
            {rule.__needs && (
              <p className="mt-0.5 text-[10px] text-lab-warn">需要：{rule.__needs.join('、')}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

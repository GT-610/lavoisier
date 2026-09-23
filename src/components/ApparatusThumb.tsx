/**
 * Shelf thumbnails.
 *
 * Rather than maintaining a parallel set of icons, the shelf previews render
 * through the very same `drawApparatus` code the bench uses. A thumbnail is
 * therefore guaranteed to look like what actually lands on the canvas.
 */
import { useEffect, useRef } from 'react'

import { getApparatusDef } from '@/data/reagents'
import { drawApparatus } from '@/render/apparatus'
import { createApparatus } from '@/store/labStore'
import type { ApparatusKind } from '@/types'

export function ApparatusThumb({
  kind,
  size = 44,
}: {
  kind: ApparatusKind
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const def = getApparatusDef(kind)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    // Scale the instrument to fill the tile with a small margin.
    const scale = Math.min((size - 8) / def.width, (size - 8) / def.height)
    const apparatus = createApparatus(kind, 0, 0)

    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.scale(scale, scale)
    const centred = { ...apparatus, x: 0, y: 0 }
    drawApparatus(ctx, centred, { selected: false, hovered: false, time: 0 })
    ctx.restore()
  }, [kind, size])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} aria-hidden="true" />
}

import { clamp, wrapAngle } from '../../core/math.ts'
import type { RaceSnapshot } from '../../race/types.ts'
import { getTrack } from '../../tracks/registry.ts'
import type { Track } from '../../tracks/types.ts'
import { el } from '../controls.ts'
import type { HudWidget, UiFrame } from '../types.ts'

const MAP_PAD = 12
const DOT_INSET = 8
const MAX_DPR = 2
const POINT_SPACING = 1.5
const STYLE_ID = 'agp-minimap-style'
const MOVE_PX = 0.5
const YAW_STEP = 0.09

const MINIMAP_CSS = `
.widget-minimap {
  align-self: flex-end;
  flex: none;
  width: 152px;
  height: 152px;
  pointer-events: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  box-shadow: 0 8px 20px rgb(var(--shadow-ink) / 0.35);
  overflow: hidden;
  visibility: hidden;
}
.widget-minimap.is-ready {
  visibility: visible;
}
.widget-minimap canvas {
  display: block;
  width: 100%;
  height: 100%;
}
@media (max-width: 720px) {
  .widget-minimap {
    width: 116px;
    height: 116px;
  }
}
`

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface MapFit {
  scale: number
  minX: number
  minZ: number
  originX: number
  originY: number
  width: number
  height: number
  pad: number
}

export interface Point {
  x: number
  y: number
}

export interface MinimapPalette {
  shoulder: string
  asphalt: string
  ink: string
  accent: string
  outline: string
}

export const FALLBACK_PALETTE: MinimapPalette = {
  shoulder: '#5e5d57',
  asphalt: '#9a9890',
  ink: '#f4f3ee',
  accent: '#cad649',
  outline: '#0e0e0c',
}

export type MarkerKind = 'player' | 'rival' | 'extra'

export interface MapMarker {
  x: number
  y: number
  yaw: number
  color: string
  kind: MarkerKind
}

export function minimapLabel(trackName: string): string {
  return `Minimapa de ${trackName}. El punto con la flecha sos vos.`
}

export function measureTrack(track: Track): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const grow = (x: number, z: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  for (const sample of track.samples) grow(sample.x, sample.z)
  for (const cut of track.shortcuts) {
    grow(cut.x0, cut.z0)
    grow(cut.x1, cut.z1)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
  }
  const margin = track.width / 2 + track.runoff
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  }
}

export function fitBounds(bounds: Bounds, width: number, height: number, pad: number): MapFit {
  const spanX = Math.max(1e-3, bounds.maxX - bounds.minX)
  const spanZ = Math.max(1e-3, bounds.maxZ - bounds.minZ)
  const safePad = Math.min(pad, width / 4, height / 4)
  const innerW = Math.max(1, width - safePad * 2)
  const innerH = Math.max(1, height - safePad * 2)
  const scale = Math.min(innerW / spanX, innerH / spanZ)
  const usedW = spanX * scale
  const usedH = spanZ * scale
  return {
    scale,
    minX: bounds.minX,
    minZ: bounds.minZ,
    originX: safePad + (innerW - usedW) / 2,
    originY: safePad + (innerH - usedH) / 2,
    width,
    height,
    pad: safePad,
  }
}

export function project(fit: MapFit, x: number, z: number): Point {
  return {
    x: fit.originX + (x - fit.minX) * fit.scale,
    y: fit.originY + (z - fit.minZ) * fit.scale,
  }
}

export function projectClamped(fit: MapFit, x: number, z: number, inset: number): Point {
  const point = project(fit, x, z)
  return {
    x: clamp(point.x, inset, fit.width - inset),
    y: clamp(point.y, inset, fit.height - inset),
  }
}

/** Yaw 0 faces +Z, which points down on the map. Positive yaw turns toward +X. */
export function noseOffset(yaw: number, length: number): Point {
  return { x: Math.sin(yaw) * length, y: Math.cos(yaw) * length }
}

export function acrossTrack(heading: number, half: number): Point {
  return { x: Math.cos(heading) * half, y: -Math.sin(heading) * half }
}

export function ribbonWidths(
  trackWidth: number,
  runoff: number,
  scale: number,
): { asphalt: number; shoulder: number } {
  const asphalt = clamp(trackWidth * scale, 3.5, 20)
  const shoulder = clamp((trackWidth + runoff * 2) * scale, asphalt + 2, 34)
  return { asphalt, shoulder }
}

export function markerRadius(kind: MarkerKind): number {
  if (kind === 'player') return 5
  if (kind === 'extra') return 3.2
  return 3.7
}

export function centerlinePoints(track: Track, fit: MapFit): Point[] {
  const firstSample = track.samples[0]
  if (!firstSample) return []
  const points: Point[] = [project(fit, firstSample.x, firstSample.z)]
  const minDistSq = POINT_SPACING * POINT_SPACING
  for (let i = 1; i < track.samples.length; i += 1) {
    const sample = track.samples[i]
    if (!sample) continue
    const point = project(fit, sample.x, sample.z)
    const prev = points[points.length - 1]
    if (!prev) continue
    const dx = point.x - prev.x
    const dy = point.y - prev.y
    const last = i === track.samples.length - 1
    if (!last && dx * dx + dy * dy < minDistSq) continue
    points.push(point)
  }
  const start = points[0]
  if (start) points.push({ x: start.x, y: start.y })
  return points
}

export function resolveTrack(id: string): Track | null {
  try {
    return getTrack(id)
  } catch {
    return null
  }
}

export function writeMarkers(snapshot: RaceSnapshot, fit: MapFit, out: MapMarker[]): number {
  let n = 0
  const place = (x: number, z: number, yaw: number, color: string, kind: MarkerKind) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return
    const marker = out[n] ?? { x: 0, y: 0, yaw: 0, color: '', kind }
    const px = fit.originX + (x - fit.minX) * fit.scale
    const py = fit.originY + (z - fit.minZ) * fit.scale
    marker.x = clamp(px, DOT_INSET, fit.width - DOT_INSET)
    marker.y = clamp(py, DOT_INSET, fit.height - DOT_INSET)
    marker.yaw = yaw
    marker.color = color
    marker.kind = kind
    out[n] = marker
    n += 1
  }
  for (const extra of snapshot.extras) {
    place(extra.x, extra.z, extra.yaw, extra.color, 'extra')
  }
  for (const racer of snapshot.racers) {
    if (!racer.isPlayer) place(racer.x, racer.z, racer.yaw, racer.color, 'rival')
  }
  for (const racer of snapshot.racers) {
    if (racer.isPlayer) place(racer.x, racer.z, racer.yaw, racer.color, 'player')
  }
  return n
}

export function renderTrack(
  ctx: CanvasRenderingContext2D,
  track: Track,
  fit: MapFit,
  palette: MinimapPalette,
): void {
  const points = centerlinePoints(track, fit)
  const ribbon = ribbonWidths(track.width, track.runoff, fit.scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  if (points.length >= 3) {
    ctx.strokeStyle = palette.shoulder
    ctx.lineWidth = ribbon.shoulder
    strokeLoop(ctx, points)
    ctx.strokeStyle = palette.asphalt
    ctx.lineWidth = ribbon.asphalt
    strokeLoop(ctx, points)
    if (ribbon.asphalt >= 5.5) {
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = 1
      ctx.setLineDash([1.5, 5])
      strokeLoop(ctx, points)
      ctx.restore()
    }
  }
  for (const cut of track.shortcuts) {
    const from = project(fit, cut.x0, cut.z0)
    const to = project(fit, cut.x1, cut.z1)
    ctx.save()
    ctx.strokeStyle = palette.accent
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
  }
  const sample = track.samples[0]
  if (!sample) return
  const origin = project(fit, sample.x, sample.z)
  const side = acrossTrack(sample.heading, Math.max(5, ribbon.asphalt * 0.55))
  ctx.setLineDash([])
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(origin.x - side.x, origin.y - side.y)
  ctx.lineTo(origin.x + side.x, origin.y + side.y)
  ctx.stroke()
}

export function renderMarkers(
  ctx: CanvasRenderingContext2D,
  markers: readonly MapMarker[],
  count: number,
  palette: MinimapPalette,
): void {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  for (let i = 0; i < count; i += 1) {
    const marker = markers[i]
    if (!marker) continue
    const radius = markerRadius(marker.kind)
    if (marker.kind === 'extra') {
      ctx.save()
      ctx.globalAlpha = 0.72
      ctx.beginPath()
      ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2)
      ctx.strokeStyle = marker.color || palette.ink
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
      continue
    }
    ctx.beginPath()
    ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = marker.color || palette.ink
    ctx.fill()
    ctx.lineWidth = marker.kind === 'player' ? 2 : 1.25
    ctx.strokeStyle = marker.kind === 'player' ? palette.ink : palette.outline
    ctx.stroke()
    if (marker.kind === 'player') drawChevron(ctx, marker, radius, palette.ink)
    if (marker.kind === 'rival') drawTick(ctx, marker, radius, palette.ink)
  }
}

export const widget: HudWidget = {
  id: 'minimap',
  mount(parent) {
    ensureStyles()
    const root = el('div', 'widget-minimap')
    root.dataset.widget = 'minimap'
    const canvas = el('canvas')
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Minimapa')
    root.append(canvas)
    parent.append(root)

    const palette = readPalette(parent)
    const cache = el('canvas')
    const markers: MapMarker[] = []
    const prevX: number[] = []
    const prevY: number[] = []
    const prevYaw: number[] = []
    let prevCount = -1
    let markersDirty = true
    let cssW = 0
    let cssH = 0
    let dpr = 1
    let bakedW = -1
    let bakedH = -1
    let bakedDpr = -1
    let bakedFit: MapFit | null = null
    let trackId = ''
    let track: Track | null = null
    let labeledName = ''
    let ready = false
    let view = canvas.getContext('2d')
    let baked = cache.getContext('2d')

    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      cssW = Math.round(rect.width)
      cssH = Math.round(rect.height)
      const raw = window.devicePixelRatio
      dpr = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DPR) : 1
    }
    const onResize = () => {
      measure()
      bakedW = -1
    }
    measure()
    window.addEventListener('resize', onResize)

    return {
      update(frame: UiFrame) {
        const snapshot = frame.snapshot
        if (!snapshot) return
        if (snapshot.trackId !== trackId) {
          trackId = snapshot.trackId
          track = resolveTrack(snapshot.trackId)
          bakedW = -1
        }
        if (!track) return
        if (cssW < 8 || cssH < 8) measure()
        if (cssW < 8 || cssH < 8 || !view || !baked) return
        if (cssW !== bakedW || cssH !== bakedH || dpr !== bakedDpr || !bakedFit) {
          bakedFit = fitBounds(measureTrack(track), cssW, cssH, MAP_PAD)
          const bitmapW = Math.max(1, Math.round(cssW * dpr))
          const bitmapH = Math.max(1, Math.round(cssH * dpr))
          if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
            canvas.width = bitmapW
            canvas.height = bitmapH
            view = canvas.getContext('2d')
          }
          if (cache.width !== bitmapW || cache.height !== bitmapH) {
            cache.width = bitmapW
            cache.height = bitmapH
            baked = cache.getContext('2d')
          }
          if (!view || !baked) return
          const scaleX = bitmapW / cssW
          const scaleY = bitmapH / cssH
          baked.setTransform(scaleX, 0, 0, scaleY, 0, 0)
          baked.clearRect(0, 0, cssW, cssH)
          renderTrack(baked, track, bakedFit, palette)
          bakedW = cssW
          bakedH = cssH
          bakedDpr = dpr
          markersDirty = true
        }
        const fit = bakedFit
        if (!fit || !view) return
        const count = writeMarkers(snapshot, fit, markers)
        if (markersDirty || !sameDots(markers, count, prevX, prevY, prevYaw, prevCount)) {
          const bitmapW = canvas.width
          const bitmapH = canvas.height
          view.setTransform(1, 0, 0, 1, 0, 0)
          view.clearRect(0, 0, bitmapW, bitmapH)
          view.drawImage(cache, 0, 0)
          view.setTransform(bitmapW / cssW, 0, 0, bitmapH / cssH, 0, 0)
          renderMarkers(view, markers, count, palette)
          rememberDots(markers, count, prevX, prevY, prevYaw)
          prevCount = count
          markersDirty = false
        }
        if (snapshot.trackName !== labeledName) {
          labeledName = snapshot.trackName
          canvas.setAttribute('aria-label', minimapLabel(labeledName))
        }
        if (!ready) {
          ready = true
          root.classList.add('is-ready')
        }
      },
      unmount() {
        window.removeEventListener('resize', onResize)
        root.remove()
      },
    }
  },
}

export function sameDots(
  markers: readonly MapMarker[],
  count: number,
  prevX: readonly number[],
  prevY: readonly number[],
  prevYaw: readonly number[],
  prevCount: number,
): boolean {
  if (count !== prevCount) return false
  for (let i = 0; i < count; i += 1) {
    const marker = markers[i]
    const x = prevX[i]
    const y = prevY[i]
    const yaw = prevYaw[i]
    if (!marker || x === undefined || y === undefined || yaw === undefined) return false
    if (Math.abs(marker.x - x) > MOVE_PX || Math.abs(marker.y - y) > MOVE_PX) return false
    if (Math.abs(wrapAngle(marker.yaw - yaw)) > YAW_STEP) return false
  }
  return true
}

function rememberDots(
  markers: readonly MapMarker[],
  count: number,
  prevX: number[],
  prevY: number[],
  prevYaw: number[],
): void {
  for (let i = 0; i < count; i += 1) {
    const marker = markers[i]
    if (!marker) continue
    prevX[i] = marker.x
    prevY[i] = marker.y
    prevYaw[i] = marker.yaw
  }
}

function strokeLoop(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  const first = points[0]
  if (!first || points.length < 3) return
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i]
    if (point) ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.stroke()
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  marker: MapMarker,
  radius: number,
  color: string,
): void {
  const outer = radius + 8
  const inner = radius * 0.35
  const side = 3.4
  const sin = Math.sin(marker.yaw)
  const cos = Math.cos(marker.yaw)
  const px = Math.cos(marker.yaw)
  const py = -Math.sin(marker.yaw)
  ctx.beginPath()
  ctx.moveTo(marker.x + sin * outer, marker.y + cos * outer)
  ctx.lineTo(marker.x + sin * inner + px * side, marker.y + cos * inner + py * side)
  ctx.lineTo(marker.x + sin * inner - px * side, marker.y + cos * inner - py * side)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawTick(
  ctx: CanvasRenderingContext2D,
  marker: MapMarker,
  radius: number,
  color: string,
): void {
  const sin = Math.sin(marker.yaw)
  const cos = Math.cos(marker.yaw)
  ctx.beginPath()
  ctx.moveTo(marker.x + sin * radius, marker.y + cos * radius)
  ctx.lineTo(marker.x + sin * (radius + 4.5), marker.y + cos * (radius + 4.5))
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function readPalette(node: HTMLElement): MinimapPalette {
  const style = getComputedStyle(node)
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    shoulder: pick('--fg-disabled', FALLBACK_PALETTE.shoulder),
    asphalt: pick('--fg-3', FALLBACK_PALETTE.asphalt),
    ink: pick('--fg', FALLBACK_PALETTE.ink),
    accent: pick('--accent', FALLBACK_PALETTE.accent),
    outline: pick('--page', FALLBACK_PALETTE.outline),
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = el('style', undefined, MINIMAP_CSS)
  style.id = STYLE_ID
  document.head.append(style)
}

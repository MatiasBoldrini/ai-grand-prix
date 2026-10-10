import { at, clamp, wrapAngle } from '../core/math.ts'
import type { Vec2 } from '../core/math.ts'
import type { SurfaceId } from '../physics/surfaces.ts'
import type {
  ResolvedShortcut,
  SplineSample,
  Track,
  TrackDefinition,
  TrackLocation,
} from './types.ts'

export function buildTrack(def: TrackDefinition): Track {
  if (def.corners.length < 4) {
    throw new Error(`Track "${def.id}" needs at least 4 corners`)
  }
  const dense = catmullClosed(def.corners, 12)
  const length = polylineLength(dense)
  const count = Math.max(48, Math.round(length / def.sampleSpacing))
  const samples: SplineSample[] = []
  for (let i = 0; i < count; i += 1) {
    const s = (i / count) * length
    const point = pointAlong(dense, s, length)
    samples.push({ s, x: point.x, z: point.z, heading: 0, curvature: 0 })
  }
  for (let i = 0; i < count; i += 1) {
    const current = at(samples, i)
    const next = at(samples, (i + 1) % count)
    const dx = next.x - current.x
    const dz = next.z - current.z
    const closing = i === count - 1 ? pointAlong(dense, 0, length) : next
    const headingDx = i === count - 1 ? closing.x - current.x : dx
    const headingDz = i === count - 1 ? closing.z - current.z : dz
    current.heading = Math.atan2(headingDx, headingDz)
  }
  const spacing = length / count
  const rawCurvature: number[] = []
  for (let i = 0; i < count; i += 1) {
    const current = at(samples, i)
    const next = at(samples, (i + 1) % count)
    rawCurvature.push(wrapAngle(next.heading - current.heading) / spacing)
  }
  const window = 10
  for (let i = 0; i < count; i += 1) {
    let sum = 0
    for (let offset = -window; offset <= window; offset += 1) {
      sum += at(rawCurvature, (i + offset + count) % count)
    }
    at(samples, i).curvature = sum / (window * 2 + 1)
  }
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    laps: def.laps,
    width: def.width,
    runoff: def.runoff,
    gates: def.gates,
    spacing,
    length,
    samples,
    shortcuts: resolveShortcuts(def),
    corners: def.corners,
  }
}

export function sampleAt(track: Track, s: number): SplineSample {
  const length = track.length
  let wrapped = s % length
  if (wrapped < 0) wrapped += length
  const count = track.samples.length
  const index = Math.min(count - 1, Math.floor((wrapped / length) * count))
  const current = at(track.samples, index)
  const next = at(track.samples, (index + 1) % count)
  const span = track.spacing
  const t = span <= 1e-6 ? 0 : clamp((wrapped - current.s) / span, 0, 1)
  const nextHeading = next.heading
  return {
    s: wrapped,
    x: current.x + (next.x - current.x) * t,
    z: current.z + (next.z - current.z) * t,
    heading: current.heading + wrapAngle(nextHeading - current.heading) * t,
    curvature: current.curvature + (next.curvature - current.curvature) * t,
  }
}

export function locate(track: Track, x: number, z: number, hintS?: number): TrackLocation {
  const count = track.samples.length
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  const consider = (index: number) => {
    const sample = at(track.samples, index)
    const distance = (sample.x - x) ** 2 + (sample.z - z) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  if (hintS === undefined) {
    for (let i = 0; i < count; i += 1) consider(i)
  } else {
    const center = Math.round((hintS / track.length) * count)
    const window = 40
    for (let offset = -window; offset <= window; offset += 1) {
      consider((center + offset + count * 4) % count)
    }
    if (bestDistance > 25 * 25) {
      bestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < count; i += 1) consider(i)
    }
  }
  const sample = at(track.samples, bestIndex)
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  const lateral = (x - sample.x) * rx + (z - sample.z) * rz
  let surface: SurfaceId = 'grass'
  if (Math.abs(lateral) <= track.width / 2) surface = 'asphalt'
  else if (shortcutHit(track, x, z)) surface = 'shortcut'
  return {
    s: sample.s,
    x: sample.x,
    z: sample.z,
    heading: sample.heading,
    curvature: sample.curvature,
    lateral,
    distance: Math.sqrt(bestDistance),
    surface,
    width: track.width,
  }
}

export function placeOnTrack(
  track: Track,
  s: number,
  lateral: number,
): { x: number; z: number; yaw: number } {
  const sample = sampleAt(track, s)
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  return {
    x: sample.x + rx * lateral,
    z: sample.z + rz * lateral,
    yaw: sample.heading,
  }
}

export interface TrackBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  centerX: number
  centerZ: number
  radius: number
}

export function trackBounds(track: Track): TrackBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const sample of track.samples) {
    minX = Math.min(minX, sample.x)
    maxX = Math.max(maxX, sample.x)
    minZ = Math.min(minZ, sample.z)
    maxZ = Math.max(maxZ, sample.z)
  }
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2
  return { minX, maxX, minZ, maxZ, centerX, centerZ, radius }
}

function resolveShortcuts(def: TrackDefinition): ResolvedShortcut[] {
  return def.shortcuts.map((shortcut) => {
    const from = def.corners[shortcut.fromCorner]
    const to = def.corners[shortcut.toCorner]
    if (!from || !to) {
      throw new Error(`Shortcut "${shortcut.id}" points outside the corner list`)
    }
    return { ...shortcut, x0: from.x, z0: from.z, x1: to.x, z1: to.z }
  })
}

function shortcutHit(track: Track, x: number, z: number): boolean {
  for (const shortcut of track.shortcuts) {
    const vx = shortcut.x1 - shortcut.x0
    const vz = shortcut.z1 - shortcut.z0
    const lengthSq = vx * vx + vz * vz
    if (lengthSq < 1) continue
    const t = clamp(((x - shortcut.x0) * vx + (z - shortcut.z0) * vz) / lengthSq, 0, 1)
    const px = shortcut.x0 + vx * t
    const pz = shortcut.z0 + vz * t
    if (Math.hypot(x - px, z - pz) <= shortcut.halfWidth) return true
  }
  return false
}

function catmullClosed(corners: readonly Vec2[], steps: number): Vec2[] {
  const points: Vec2[] = []
  const count = corners.length
  for (let i = 0; i < count; i += 1) {
    const p0 = at(corners, (i - 1 + count) % count)
    const p1 = at(corners, i)
    const p2 = at(corners, (i + 1) % count)
    const p3 = at(corners, (i + 2) % count)
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps
      points.push(catmull(p0, p1, p2, p3, t))
    }
  }
  return points
}

function catmull(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t
  const t3 = t2 * t
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  }
}

function polylineLength(points: readonly Vec2[]): number {
  let length = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = at(points, i)
    const next = at(points, (i + 1) % points.length)
    length += Math.hypot(next.x - current.x, next.z - current.z)
  }
  return length
}

function pointAlong(points: readonly Vec2[], distance: number, length: number): Vec2 {
  let remaining = distance % length
  if (remaining < 0) remaining += length
  for (let i = 0; i < points.length; i += 1) {
    const current = at(points, i)
    const next = at(points, (i + 1) % points.length)
    const span = Math.hypot(next.x - current.x, next.z - current.z)
    if (remaining <= span || i === points.length - 1) {
      const t = span <= 1e-6 ? 0 : remaining / span
      return { x: current.x + (next.x - current.x) * t, z: current.z + (next.z - current.z) * t }
    }
    remaining -= span
  }
  return at(points, 0)
}

import type { SurfaceId } from '../physics/surfaces.ts'
import type { Vec2 } from '../core/math.ts'

export interface ShortcutDefinition {
  id: string
  name: string
  /** Indexes into `corners`. The chord between them is the cut. */
  fromCorner: number
  toCorner: number
  halfWidth: number
}

export interface TrackDefinition {
  id: string
  name: string
  description: string
  laps: number
  /** Full asphalt width in metres. */
  width: number
  /** Grass between the white line and the wall. */
  runoff: number
  gates: number
  /** Target distance between query samples, in metres. */
  sampleSpacing: number
  corners: readonly Vec2[]
  shortcuts: readonly ShortcutDefinition[]
}

export interface SplineSample {
  s: number
  x: number
  z: number
  heading: number
  curvature: number
}

export interface ResolvedShortcut {
  id: string
  name: string
  fromCorner: number
  toCorner: number
  halfWidth: number
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface Track {
  id: string
  name: string
  description: string
  laps: number
  width: number
  runoff: number
  gates: number
  spacing: number
  length: number
  samples: SplineSample[]
  shortcuts: ResolvedShortcut[]
  corners: readonly Vec2[]
}

export interface TrackLocation {
  s: number
  x: number
  z: number
  heading: number
  curvature: number
  lateral: number
  distance: number
  surface: SurfaceId
  width: number
}

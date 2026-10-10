/** Grip multiplier relative to dry asphalt. Drag is an extra rolling factor. */
export const SURFACES = {
  asphalt: { mu: 1, drag: 1 },
  shortcut: { mu: 0.86, drag: 1.08 },
  gravel: { mu: 0.62, drag: 1.35 },
  grass: { mu: 0.42, drag: 1.85 },
} as const

export type SurfaceId = keyof typeof SURFACES

export function surfaceGrip(id: SurfaceId): number {
  return SURFACES[id].mu
}

export function surfaceDrag(id: SurfaceId): number {
  return SURFACES[id].drag
}

export interface Vec2 {
  x: number
  z: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Wrap to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const tau = Math.PI * 2
  let next = (angle + Math.PI) % tau
  if (next < 0) next += tau
  return next - Math.PI
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t
}

export function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Index ${index} is outside 0..${items.length - 1}`)
  }
  return item
}

export interface StepResult {
  steps: number
  /** 0..1 remainder used to interpolate render state between physics ticks. */
  alpha: number
}

/**
 * Deterministic fixed-timestep accumulator.
 * The callback always receives the same `dt` (1/hz). Frame time only changes
 * how many steps run and the interpolation alpha.
 */
export class FixedStepper {
  readonly hz: number
  readonly dt: number
  private acc = 0
  private readonly maxSteps: number

  constructor(hz = 60, maxSteps = 5) {
    this.hz = hz
    this.dt = 1 / hz
    this.maxSteps = maxSteps
  }

  advance(frameSeconds: number, step: (dt: number) => void): StepResult {
    const capped = Math.min(Math.max(frameSeconds, 0), 0.25)
    this.acc += capped
    let steps = 0
    while (this.acc >= this.dt - 1e-9 && steps < this.maxSteps) {
      step(this.dt)
      this.acc -= this.dt
      steps += 1
    }
    if (steps === this.maxSteps) {
      this.acc = Math.min(this.acc, this.dt)
    }
    return { steps, alpha: clamp01(this.acc / this.dt) }
  }

  reset(): void {
    this.acc = 0
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

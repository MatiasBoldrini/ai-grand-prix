import { FRAME_BUDGET_MS } from '../core/budget.ts'

export class FpsOverlay {
  private readonly frames: number[] = []
  private readonly sims: number[] = []
  private readonly element: HTMLElement
  visible: boolean

  constructor(element: HTMLElement) {
    this.element = element
    const params = new URLSearchParams(window.location.search)
    this.visible = params.has('fps')
    this.element.hidden = !this.visible
  }

  toggle(): void {
    this.visible = !this.visible
    this.element.hidden = !this.visible
  }

  push(frameMs: number, simMs: number): void {
    push(this.frames, frameMs)
    push(this.sims, simMs)
    if (!this.visible) return
    const avgFrame = average(this.frames)
    const avgSim = average(this.sims)
    const fps = avgFrame > 0 ? 1000 / avgFrame : 0
    this.element.textContent = [
      `FPS ${fps.toFixed(0)}`,
      `cuadro ${avgFrame.toFixed(1)} ms`,
      `sim ${avgSim.toFixed(2)} ms`,
      `presupuesto ${FRAME_BUDGET_MS.toFixed(1)} ms`,
    ].join('\n')
  }

  averages(): { frameMs: number; simMs: number; fps: number } {
    const frameMs = average(this.frames)
    return { frameMs, simMs: average(this.sims), fps: frameMs > 0 ? 1000 / frameMs : 0 }
  }
}

function push(values: number[], value: number): void {
  values.push(value)
  if (values.length > 90) values.shift()
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

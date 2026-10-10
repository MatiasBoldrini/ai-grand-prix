import { clamp } from '../../core/math.ts'
import { IDLE_SAMPLE, type DeviceSample, type InputDevice } from '../types.ts'

export const device: InputDevice = {
  id: 'keyboard',
  priority: 1,
  poll,
}

const down = new Set<string>()
let installed = false
let pauseEdge = false
let fpsEdge = false
let respawnEdge = false

function install(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', () => down.clear())
}

function onKeyDown(event: KeyboardEvent): void {
  if (typing(event)) return
  if (event.repeat && (event.code === 'Escape' || event.code === 'F3' || event.code === 'KeyR'))
    return
  down.add(event.code)
  if (event.code === 'Escape') pauseEdge = true
  if (event.code === 'F3') {
    fpsEdge = true
    event.preventDefault()
  }
  if (event.code === 'KeyR') respawnEdge = true
  if (
    event.code === 'ArrowUp' ||
    event.code === 'ArrowDown' ||
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight' ||
    event.code === 'Space'
  ) {
    event.preventDefault()
  }
}

function onKeyUp(event: KeyboardEvent): void {
  down.delete(event.code)
}

function typing(event: KeyboardEvent): boolean {
  const target = event.target
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

function poll(): DeviceSample {
  install()
  const throttle = down.has('KeyW') || down.has('ArrowUp') ? 1 : 0
  const brake = down.has('KeyS') || down.has('ArrowDown') ? 1 : 0
  const steer = clamp(
    (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) -
      (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0),
    -1,
    1,
  )
  const sample: DeviceSample = {
    active: throttle > 0 || brake > 0 || steer !== 0,
    throttle,
    brake,
    steer,
    pauseEdge,
    fpsEdge,
    respawnEdge,
  }
  pauseEdge = false
  fpsEdge = false
  respawnEdge = false
  if (!installed) return IDLE_SAMPLE
  return sample
}

import { preferences } from '../../game/preferences.ts'
import { suppressEscapePause } from '../escape-guard.ts'
import { pushLookDelta, setLookLocked } from '../mouse-look.ts'
import { IDLE_SAMPLE, type DeviceSample, type InputDevice } from '../types.ts'

export const device: InputDevice = {
  id: 'mouse',
  priority: 0,
  poll,
  mount,
  unmount,
}

let installed = false
let canvas: HTMLCanvasElement | null = null
let pauseEdge = false
let wasLocked = false
let releasing = false

function install(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  const found = document.querySelector('#view')
  if (!found || !('requestPointerLock' in found)) return
  canvas = found as HTMLCanvasElement
  installed = true
  canvas.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('mousemove', onMove)
  document.addEventListener('pointerlockchange', onLockChange)
}

function mount(): void {
  install()
}

function unmount(): void {
  if (!installed) return
  canvas?.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('pointerlockchange', onLockChange)
  if (document.pointerLockElement === canvas) {
    releasing = true
    document.exitPointerLock()
  }
  installed = false
  canvas = null
  wasLocked = false
  setLookLocked(false)
}

function hudVisible(): boolean {
  return Boolean(document.querySelector('#ui .hud'))
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !canvas || !hudVisible()) return
  const pending = canvas.requestPointerLock() as void | Promise<void>
  if (pending instanceof Promise) void pending.catch(() => undefined)
}

function onMove(event: MouseEvent): void {
  if (!canvas || document.pointerLockElement !== canvas || !hudVisible()) return
  pushLookDelta(event.movementX, event.movementY, preferences.lookSensitivity)
}

function onLockChange(): void {
  if (!canvas) return
  const lockedNow = document.pointerLockElement === canvas
  if (wasLocked && !lockedNow) {
    const userLeftRace = !releasing && hudVisible()
    releasing = false
    if (userLeftRace) {
      pauseEdge = true
      suppressEscapePause()
    }
  } else if (lockedNow) {
    releasing = false
  }
  wasLocked = lockedNow
  setLookLocked(lockedNow)
}

function releaseLock(): void {
  if (!canvas || document.pointerLockElement !== canvas) return
  releasing = true
  document.exitPointerLock()
  if (document.pointerLockElement !== canvas) releasing = false
}

function poll(): DeviceSample {
  install()
  if (typeof document === 'undefined') return IDLE_SAMPLE
  if (canvas && !hudVisible() && document.pointerLockElement === canvas) releaseLock()
  const sample: DeviceSample = {
    active: false,
    throttle: 0,
    brake: 0,
    steer: 0,
    pauseEdge,
    fpsEdge: false,
    respawnEdge: false,
  }
  pauseEdge = false
  return sample
}

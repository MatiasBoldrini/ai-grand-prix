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
/** When the lock was requested. The browser then warps the cursor and reports a huge delta. */
let lockRequestedAt = 0

const WARP_WINDOW_MS = 100
const WARP_PX = 400

function install(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  const found = document.querySelector('#view')
  if (!found || !('requestPointerLock' in found)) return
  canvas = found as HTMLCanvasElement
  installed = true
  // The HUD covers the canvas and wins hit testing, so the gesture arrives on #ui.
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('mousemove', onMove)
  document.addEventListener('pointerlockchange', onLockChange)
}

function mount(): void {
  install()
}

function unmount(): void {
  if (!installed) return
  document.removeEventListener('pointerdown', onPointerDown)
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
  if (event.button !== 0 || !canvas || !hudVisible() || isControl(event.target)) return
  lockRequestedAt = performance.now()
  const pending = canvas.requestPointerLock() as void | Promise<void>
  if (pending instanceof Promise) void pending.catch(() => undefined)
}

function isControl(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('closest' in target)) return false
  const closest = (target as Element).closest
  if (typeof closest !== 'function') return false
  return Boolean(closest.call(target, 'button, a, input, textarea, select, label, [role="slider"]'))
}

function onMove(event: MouseEvent): void {
  if (!canvas || document.pointerLockElement !== canvas || !hudVisible()) return
  if (event.movementX === 0 && event.movementY === 0) return
  if (isLockWarp(event.movementX, event.movementY)) return
  pushLookDelta(event.movementX, event.movementY, preferences.lookSensitivity)
}

function isLockWarp(dx: number, dy: number): boolean {
  if (performance.now() - lockRequestedAt > WARP_WINDOW_MS) return false
  return Math.hypot(dx, dy) > WARP_PX
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

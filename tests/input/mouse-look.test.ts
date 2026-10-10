import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HARD_ACCEL,
  LOOK_IDLE_S,
  PITCH_MAX,
  PITCH_MIN,
  YAW_LIMIT,
  advanceLook,
  applyLookDelta,
  createLookState,
} from '../../src/input/mouse-look.ts'

describe('chase mouse look', () => {
  it('looks right and up with the pointer', () => {
    const state = applyLookDelta(createLookState(), 120, -40, 1)
    expect(state.targetYaw).toBeGreaterThan(0.4)
    expect(state.targetPitch).toBeGreaterThan(0.08)
    expect(state.idle).toBe(0)
    expect(state.yaw).toBe(0)
  })

  it('looks down when the pointer moves down', () => {
    const state = applyLookDelta(createLookState(), 0, 36, 1)
    expect(state.targetPitch).toBeLessThan(0)
  })

  it('scales with sensitivity and clamps both axes', () => {
    const low = applyLookDelta(createLookState(), 50, 0, 0.4)
    const high = applyLookDelta(createLookState(), 50, 0, 1.8)
    expect(high.targetYaw / low.targetYaw).toBeCloseTo(1.8 / 0.4)

    const spun = applyLookDelta(createLookState(), 100000, -100000, 2)
    expect(spun.targetYaw).toBe(YAW_LIMIT)
    expect(spun.targetPitch).toBe(PITCH_MAX)
    const down = applyLookDelta(createLookState(), 0, 100000, 2)
    expect(down.targetPitch).toBe(PITCH_MIN)
  })

  it('ignores a still pointer so the idle timer keeps running', () => {
    let state = applyLookDelta(createLookState(), 20, 0, 1)
    state = advanceLook(state, 1 / 60, 0)
    state = advanceLook(state, 1 / 60, 0)
    const still = applyLookDelta(state, 0, 0, 1)
    expect(still.idle).toBeCloseTo(2 / 60)
    expect(still.targetYaw).toBe(state.targetYaw)
  })

  it('holds the orbit until the pointer has rested for 1.5s, then eases behind the car', () => {
    let state = applyLookDelta(createLookState(), 90, 0, 1)
    const held = state.targetYaw
    let elapsed = 0
    while (elapsed < LOOK_IDLE_S - 0.02) {
      state = advanceLook(state, 0.01, 0)
      elapsed += 0.01
    }
    expect(state.targetYaw).toBeCloseTo(held)
    expect(state.yaw).toBeGreaterThan(0)
    expect(state.yaw).toBeLessThan(held)

    state = advanceLook(state, 0.03, 0)
    expect(state.idle).toBeGreaterThanOrEqual(LOOK_IDLE_S)
    expect(state.targetYaw).toBeLessThan(held)
  })

  it('eases back on a hard launch and stays out while braking or cruising', () => {
    const looked = applyLookDelta(createLookState(), 90, -20, 1)
    const launched = advanceLook(looked, 1 / 60, HARD_ACCEL)
    expect(launched.targetYaw).toBeLessThan(looked.targetYaw)
    expect(launched.targetPitch).toBeLessThan(looked.targetPitch)

    const braking = advanceLook(looked, 0.2, -12)
    expect(braking.targetYaw).toBeCloseTo(looked.targetYaw)
    const cruise = advanceLook(looked, 0.2, HARD_ACCEL - 0.5)
    expect(cruise.targetYaw).toBeCloseTo(looked.targetYaw)
  })

  it('smooths the orbit toward the pointer on the first frame', () => {
    const looked = applyLookDelta(createLookState(), 80, 0, 1)
    const frame = advanceLook(looked, 1 / 60, 0)
    expect(frame.yaw).toBeGreaterThan(0)
    expect(frame.yaw).toBeLessThan(frame.targetYaw)
  })
})

describe('mouse device', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('locks on the race canvas, orbits, and does not steer', async () => {
    const rig = await boot()
    rig.setHud(true)
    rig.mouse.device.poll()
    rig.firePointerDown()
    expect(rig.canvas.requestPointerLock).toHaveBeenCalledOnce()
    expect(rig.documentStub.pointerLockElement).toBe(rig.canvas)
    expect(rig.look.peekLook().targetYaw).toBe(0)

    rig.fireMove(0, 0)
    expect(rig.look.peekLook().targetYaw).toBe(0)
    rig.fireMove(160, -20)
    expect(rig.look.peekLook().targetYaw).toBeGreaterThan(0.5)
    expect(rig.look.peekLook().targetPitch).toBeGreaterThan(0)

    rig.input.pollInput()
    rig.fireKey('KeyD')
    rig.fireKey('KeyW')
    const driving = rig.input.pollInput()
    expect(driving.vehicle.steer).toBe(1)
    expect(driving.vehicle.throttle).toBe(1)
    expect(driving.vehicle.brake).toBe(0)
    const mouse = rig.mouse.device.poll()
    expect(mouse.active).toBe(false)
    expect(mouse.steer).toBe(0)
    expect(mouse.pauseEdge).toBe(false)
  })

  it('pauses when escape drops the lock and ignores the duplicate key', async () => {
    const rig = await boot()
    rig.setHud(true)
    rig.mouse.device.poll()
    rig.firePointerDown()
    rig.unlockFromBrowser()
    expect(rig.guard.escapePauseSuppressed()).toBe(true)
    const paused = rig.input.pollInput()
    expect(paused.pauseEdge).toBe(true)
    expect(paused.vehicle).toEqual({ throttle: 0, brake: 0, steer: 0 })

    rig.fireKey('Escape')
    expect(rig.input.pollInput().pauseEdge).toBe(false)
  })

  it('still pauses on escape when the cursor is free', async () => {
    const rig = await boot()
    rig.setHud(true)
    rig.mouse.device.poll()
    rig.input.pollInput()
    rig.fireKey('Escape')
    expect(rig.input.pollInput().pauseEdge).toBe(true)
  })

  it('drops the lock without pausing when the race hud goes away', async () => {
    const rig = await boot()
    rig.setHud(true)
    rig.mouse.device.poll()
    rig.firePointerDown()
    rig.setHud(false)
    const sample = rig.mouse.device.poll()
    expect(sample.pauseEdge).toBe(false)
    expect(rig.documentStub.pointerLockElement).toBeNull()
    expect(rig.guard.escapePauseSuppressed()).toBe(false)
  })

  it('does not lock the pointer from the menu', async () => {
    const rig = await boot()
    rig.setHud(false)
    rig.mouse.device.poll()
    rig.firePointerDown()
    expect(rig.canvas.requestPointerLock).not.toHaveBeenCalled()
  })
})

async function boot() {
  vi.resetModules()
  const windowListeners = new Map<string, Set<(event: Event) => void>>()
  const documentListeners = new Map<string, Set<(event: Event) => void>>()
  let hudOn = false
  const canvas = {
    id: 'view',
    requestPointerLock: vi.fn(),
    addEventListener: (type: string, fn: (event: Event) => void) => {
      const set = documentListeners.get(`canvas:${type}`) ?? new Set<(event: Event) => void>()
      set.add(fn)
      documentListeners.set(`canvas:${type}`, set)
    },
    removeEventListener: () => undefined,
  }
  const documentStub = {
    pointerLockElement: null as object | null,
    visibilityState: 'visible',
    querySelector: (selector: string) => {
      if (selector === '#view') return canvas
      if (selector === '#ui .hud') return hudOn ? { className: 'hud' } : null
      return null
    },
    addEventListener: (type: string, fn: (event: Event) => void) => {
      const set = documentListeners.get(type) ?? new Set<(event: Event) => void>()
      set.add(fn)
      documentListeners.set(type, set)
    },
    removeEventListener: () => undefined,
    exitPointerLock: () => {
      documentStub.pointerLockElement = null
      emit(documentListeners, 'pointerlockchange')
    },
  }
  canvas.requestPointerLock.mockImplementation(() => {
    documentStub.pointerLockElement = canvas
    emit(documentListeners, 'pointerlockchange')
    return Promise.resolve()
  })
  const windowStub = {
    addEventListener: (type: string, fn: (event: Event) => void) => {
      const set = windowListeners.get(type) ?? new Set<(event: Event) => void>()
      set.add(fn)
      windowListeners.set(type, set)
    },
    removeEventListener: () => undefined,
    location: { search: '' },
  }
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('HTMLInputElement', class HTMLInputElement {})
  vi.stubGlobal('HTMLTextAreaElement', class HTMLTextAreaElement {})
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  })
  vi.stubGlobal('navigator', {})

  const mouse = await import('../../src/input/devices/mouse.ts')
  const look = await import('../../src/input/mouse-look.ts')
  const input = await import('../../src/input/registry.ts')
  const guard = await import('../../src/input/escape-guard.ts')

  return {
    mouse,
    look,
    input,
    guard,
    canvas,
    documentStub,
    setHud(value: boolean) {
      hudOn = value
    },
    firePointerDown() {
      emit(documentListeners, 'canvas:pointerdown', { button: 0 } as Event)
    },
    fireMove(movementX: number, movementY: number) {
      emit(documentListeners, 'mousemove', { movementX, movementY } as Event)
    },
    fireKey(code: string) {
      emit(windowListeners, 'keydown', {
        code,
        repeat: false,
        target: windowStub,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault() {},
      } as Event)
    },
    unlockFromBrowser() {
      documentStub.pointerLockElement = null
      emit(documentListeners, 'pointerlockchange')
    },
  }
}

function emit(
  listeners: Map<string, Set<(event: Event) => void>>,
  type: string,
  event: Event = new Event(type),
): void {
  for (const fn of listeners.get(type) ?? []) fn(event)
}

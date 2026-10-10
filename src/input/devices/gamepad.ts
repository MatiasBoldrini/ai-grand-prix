import { clamp } from '../../core/math.ts'
import type { DeviceSample, InputDevice } from '../types.ts'

export const device: InputDevice = {
  id: 'gamepad',
  priority: 2,
  poll,
}

let wasPause = false
let wasRespawn = false

function poll(): DeviceSample {
  const pads = typeof navigator === 'undefined' ? [] : (navigator.getGamepads?.() ?? [])
  const pad = [...pads].find((item) => item && item.connected) ?? null
  if (!pad) {
    wasPause = false
    wasRespawn = false
    return {
      active: false,
      throttle: 0,
      brake: 0,
      steer: 0,
      pauseEdge: false,
      fpsEdge: false,
      respawnEdge: false,
    }
  }
  const rawSteer = pad.axes[0] ?? 0
  const steer = Math.abs(rawSteer) < 0.12 ? 0 : clamp(rawSteer, -1, 1)
  const throttle = pad.buttons[7]?.value ?? 0
  const brake = pad.buttons[6]?.value ?? 0
  const pause = Boolean(pad.buttons[9]?.pressed)
  const respawn = Boolean(pad.buttons[1]?.pressed)
  const pauseEdge = pause && !wasPause
  const respawnEdge = respawn && !wasRespawn
  wasPause = pause
  wasRespawn = respawn
  const active = Math.abs(steer) > 0 || throttle > 0.05 || brake > 0.05
  return {
    active,
    throttle: clamp(throttle, 0, 1),
    brake: clamp(brake, 0, 1),
    steer,
    pauseEdge,
    fpsEdge: false,
    respawnEdge,
  }
}

import { PerspectiveCamera, Vector3 } from 'three'
import { clamp } from '../../core/math.ts'
import { trackBounds } from '../../tracks/spline.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

const desired = new Vector3()
const look = new Vector3()
let camera: PerspectiveCamera | null = null
let lastMode = ''

export const layer: RenderLayer = {
  id: 'camera',
  order: 40,
  setup(ctx: RenderContext) {
    camera = ctx.camera
    camera.fov = 68
    camera.near = 0.1
    camera.far = 700
    camera.position.set(0, 30, 40)
    camera.updateProjectionMatrix()
  },
  update(frame: RenderFrame) {
    if (!camera) return
    if (frame.mode === 'menu') orbit(frame)
    else chase(frame)
    lastMode = frame.mode
  },
  dispose() {
    camera = null
    lastMode = ''
  },
}

function orbit(frame: RenderFrame): void {
  if (!camera) return
  const bounds = trackBounds(frame.track)
  const angle = frame.time * 0.12
  const distance = bounds.radius + 48
  camera.position.set(
    bounds.centerX + Math.sin(angle) * distance,
    36,
    bounds.centerZ + Math.cos(angle) * distance,
  )
  camera.lookAt(bounds.centerX, 0, bounds.centerZ)
  setFov(62)
}

function chase(frame: RenderFrame): void {
  if (!camera) return
  const follow = frame.poses.find((pose) => pose.id === 'player') ?? frame.poses[0]
  if (!follow) return
  desired.set(follow.x - Math.sin(follow.yaw) * 8.2, 3.15, follow.z - Math.cos(follow.yaw) * 8.2)
  const blend = lastMode !== 'race' ? 1 : 1 - Math.exp(-5 * Math.max(frame.dt, 0))
  camera.position.lerp(desired, blend)
  look.set(follow.x + Math.sin(follow.yaw) * 8, 1.1, follow.z + Math.cos(follow.yaw) * 8)
  camera.lookAt(look)
  setFov(68 + clamp(follow.speed, 0, 52) * 0.2)
}

function setFov(fov: number): void {
  if (!camera || Math.abs(camera.fov - fov) < 0.2) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}

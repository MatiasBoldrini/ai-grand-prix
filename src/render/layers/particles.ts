/**
 * Short-lived asphalt skid marks and off-track dust.
 * Slip lays a slide, a sharp drop in speed lays a brake mark, and grass throws dust.
 * Both effects are fixed instanced buffers: the ring cursor overwrites the oldest stamp.
 */
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  FrontSide,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  type Side,
} from 'three'
import { clamp } from '../../core/math.ts'
import { locate } from '../../tracks/spline.ts'
import type { Track } from '../../tracks/types.ts'
import type { RenderContext, RenderLayer, RenderPose } from '../types.ts'

export const PARTICLE_LIMITS = {
  skids: 480,
  dust: 144,
} as const

const SKID_CAPACITY = PARTICLE_LIMITS.skids
const DUST_CAPACITY = PARTICLE_LIMITS.dust
const SKID_LIFE = 3.15
const DUST_LIFE = 0.7
const HALF_TRACK = 0.74
const MAX_EMITTERS = 8
const AXLE = [1.26, 1.26, -1.34, -1.34]
const SIDE_OFFSET = [-1, 1, -1, 1]

const ROAD = new Color('#3c3b36')
const MILD = new Color('#221e18')
const HARD = new Color('#0c0b09')
const DUST_HOT = new Color('#d7c48a')
const DUST_END = new Color('#1b2a1c')
const scratch = new Color()
const fresh = new Color()
const dummy = new Object3D()

const skidX = new Float32Array(SKID_CAPACITY)
const skidZ = new Float32Array(SKID_CAPACITY)
const skidYaw = new Float32Array(SKID_CAPACITY)
const skidLength = new Float32Array(SKID_CAPACITY)
const skidWidth = new Float32Array(SKID_CAPACITY)
const skidHeatSlot = new Float32Array(SKID_CAPACITY)
const skidAge = new Float32Array(SKID_CAPACITY)
const skidLive = new Uint8Array(SKID_CAPACITY)
const skidHidden = new Uint8Array(SKID_CAPACITY)
const skidDrawn = new Uint8Array(SKID_CAPACITY)
const skidShade = new Int8Array(SKID_CAPACITY)

const dustX = new Float32Array(DUST_CAPACITY)
const dustZ = new Float32Array(DUST_CAPACITY)
const dustYaw = new Float32Array(DUST_CAPACITY)
const dustSpeed = new Float32Array(DUST_CAPACITY)
const dustGainSlot = new Float32Array(DUST_CAPACITY)
const dustPhase = new Float32Array(DUST_CAPACITY)
const dustAge = new Float32Array(DUST_CAPACITY)
const dustLive = new Uint8Array(DUST_CAPACITY)
const dustHidden = new Uint8Array(DUST_CAPACITY)

let skidCursor = 0
let dustCursor = 0
let dustSerial = 0
let trackKey = ''
let scene: RenderContext['scene'] | null = null
let skidMesh: InstancedMesh | null = null
let dustMesh: InstancedMesh | null = null
let basisFx = 0
let basisFz = 1
let basisRx = 1
let basisRz = 0

interface Emitter {
  id: string
  used: boolean
  seen: boolean
  ready: boolean
  x: number
  z: number
  speed: number
  decel: number
  hold: number
  hint: number
  surface: string
  wheelX: Float32Array
  wheelZ: Float32Array
}

const emitters: Emitter[] = Array.from({ length: MAX_EMITTERS }, () => ({
  id: '',
  used: false,
  seen: false,
  ready: false,
  x: 0,
  z: 0,
  speed: 0,
  decel: 0,
  hold: 0,
  hint: -1,
  surface: '',
  wheelX: new Float32Array(4),
  wheelZ: new Float32Array(4),
}))

/** 0..1. Lateral slip and braking (m/s²) both lay rubber once speed is up. */
export function skidHeat(slip: number, speed: number, decel: number): number {
  if (!(speed > 9)) return 0
  const slide = clamp((Math.abs(slip) - 0.11) / 0.3, 0, 1)
  const brake = clamp((decel - 4.2) / 7.5, 0, 1)
  return Math.max(slide, brake)
}

/** 0..1. Asphalt stays clean. Deep grass throws more dust than a worn shortcut. */
export function dustGain(surface: string, speed: number, slip: number): number {
  if (surface === 'asphalt' || !(speed > 7)) return 0
  const pace = clamp((speed - 7) / 16, 0, 1)
  const slide = clamp((Math.abs(slip) - 0.05) / 0.22, 0, 1)
  const cover = surface === 'grass' ? 1 : 0.62
  return clamp((pace * 0.72 + slide * 0.85) * cover, 0, 1)
}

export const layer: RenderLayer = {
  id: 'particles',
  order: 25,
  setup(ctx) {
    scene = ctx.scene
    skidMesh = makeMesh('skid-marks', skidGeometry(), SKID_CAPACITY, 2, FrontSide, true)
    dustMesh = makeMesh('grass-dust', dustGeometry(), DUST_CAPACITY, 3, FrontSide, false)
    ctx.scene.add(skidMesh, dustMesh)
    trackKey = ''
    resetParticles()
  },
  update(frame) {
    if (!skidMesh || !dustMesh) return
    if (frame.track.id !== trackKey) {
      trackKey = frame.track.id
      resetParticles()
    }
    ageBuffers(frame.dt)
    for (const emitter of emitters) emitter.seen = false
    for (const pose of frame.poses) {
      if (!Number.isFinite(pose.x) || !Number.isFinite(pose.z) || !Number.isFinite(pose.yaw))
        continue
      const emitter = claim(pose.id)
      if (!emitter) continue
      emitter.seen = true
      follow(emitter, pose, frame.dt, frame.track)
    }
    for (const emitter of emitters) {
      if (!emitter.seen) emitter.ready = false
    }
    syncSkids()
    syncDust()
  },
  dispose() {
    dropMesh(skidMesh)
    dropMesh(dustMesh)
    skidMesh = null
    dustMesh = null
    scene = null
    trackKey = ''
    resetEmitters()
  },
}

function makeMesh(
  name: string,
  geometry: BufferGeometry,
  capacity: number,
  order: number,
  side: Side,
  decal: boolean,
): InstancedMesh {
  const material = new MeshLambertMaterial({
    color: '#ffffff',
    side,
    polygonOffset: decal,
    polygonOffsetFactor: decal ? -2 : 0,
    polygonOffsetUnits: decal ? -2 : 0,
  })
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.name = name
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = order
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, ROAD)
  mesh.instanceColor?.setUsage(DynamicDrawUsage)
  return mesh
}

function skidGeometry(): BufferGeometry {
  const geometry = new PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function dustGeometry(): BufferGeometry {
  const geometry = new OctahedronGeometry(0.18, 0)
  geometry.translate(0, 0.18, 0)
  return geometry
}

function resetParticles(): void {
  skidCursor = 0
  dustCursor = 0
  dustSerial = 0
  skidLive.fill(0)
  skidDrawn.fill(0)
  skidShade.fill(-1)
  dustLive.fill(0)
  resetEmitters()
  const skids = skidMesh
  const dust = dustMesh
  if (!skids || !dust) return
  for (let i = 0; i < SKID_CAPACITY; i += 1) {
    writePose(skids, i, 0, -8, 0, 0, 0, 0, 0)
    skidHidden[i] = 1
  }
  for (let i = 0; i < DUST_CAPACITY; i += 1) {
    writePose(dust, i, 0, -8, 0, 0, 0, 0, 0)
    dustHidden[i] = 1
  }
  skids.instanceMatrix.needsUpdate = true
  dust.instanceMatrix.needsUpdate = true
}

function resetEmitters(): void {
  for (const emitter of emitters) {
    emitter.id = ''
    emitter.used = false
    emitter.seen = false
    emitter.ready = false
    emitter.x = 0
    emitter.z = 0
    emitter.speed = 0
    emitter.decel = 0
    emitter.hold = 0
    emitter.hint = -1
    emitter.surface = ''
  }
}

function claim(id: string): Emitter | null {
  let free: Emitter | null = null
  for (const emitter of emitters) {
    if (emitter.used && emitter.id === id) return emitter
    if (!emitter.used && !free) free = emitter
  }
  if (!free) return null
  free.used = true
  free.id = id
  free.ready = false
  free.hint = -1
  free.surface = ''
  free.decel = 0
  free.hold = 0
  return free
}

function follow(emitter: Emitter, pose: RenderPose, dt: number, track: Track): void {
  noteSpeed(emitter, pose, dt)
  if (!emitter.ready) {
    seed(emitter, pose)
    return
  }
  const moved = Math.hypot(pose.x - emitter.x, pose.z - emitter.z)
  if (moved > 3.2) {
    emitter.decel = 0
    emitter.hold = 0
    seed(emitter, pose)
    return
  }
  if (moved < 0.34) return

  const heat = skidHeat(pose.slip, pose.speed, emitter.decel)
  const hinted = emitter.hint >= 0 ? emitter.hint : undefined
  const loc = locate(track, pose.x, pose.z, hinted)
  emitter.hint = loc.s
  const gain = dustGain(loc.surface, Math.abs(pose.speed), pose.slip)
  const spacing = gain > 0.08 ? 0.92 - gain * 0.55 : 0.64
  if (moved < spacing) return

  if (loc.surface === 'asphalt' && heat > 0.05) stampWheels(emitter, pose, heat)
  if (gain > 0.08) puff(pose, gain, emitter.surface === 'asphalt')
  emitter.surface = loc.surface
  seed(emitter, pose)
}

function noteSpeed(emitter: Emitter, pose: RenderPose, dt: number): void {
  if (!emitter.ready) {
    emitter.speed = pose.speed
    emitter.decel = 0
    emitter.hold = 0
    return
  }
  if (Math.abs(pose.speed - emitter.speed) > 0.02 && dt > 1e-4) {
    emitter.decel = Math.max(0, (emitter.speed - pose.speed) / dt)
    emitter.speed = pose.speed
    emitter.hold = 0
    return
  }
  emitter.hold += dt
  if (emitter.hold > 0.16) emitter.decel = 0
}

function seed(emitter: Emitter, pose: RenderPose): void {
  emitter.ready = true
  emitter.x = pose.x
  emitter.z = pose.z
  loadBasis(pose.yaw)
  for (let i = 0; i < 4; i += 1) {
    emitter.wheelX[i] = pose.x + basisFx * axleAt(i) + basisRx * sideAt(i) * HALF_TRACK
    emitter.wheelZ[i] = pose.z + basisFz * axleAt(i) + basisRz * sideAt(i) * HALF_TRACK
  }
}

function stampWheels(emitter: Emitter, pose: RenderPose, heat: number): void {
  const fronts = emitter.decel > 5 && heat >= 0.42
  loadBasis(pose.yaw)
  for (let i = 0; i < 4; i += 1) {
    if (i < 2 && !fronts) continue
    const x1 = pose.x + basisFx * axleAt(i) + basisRx * sideAt(i) * HALF_TRACK
    const z1 = pose.z + basisFz * axleAt(i) + basisRz * sideAt(i) * HALF_TRACK
    layStrip(num(emitter.wheelX, i), num(emitter.wheelZ, i), x1, z1, heat)
  }
}

function layStrip(x0: number, z0: number, x1: number, z1: number, heat: number): void {
  const dx = x1 - x0
  const dz = z1 - z0
  const length = Math.hypot(dx, dz)
  if (length < 0.08) return
  pushSkid(
    (x0 + x1) * 0.5,
    (z0 + z1) * 0.5,
    Math.atan2(dx, dz),
    Math.min(length * 1.28, 3.6),
    0.32 + heat * 0.16,
    heat,
  )
}

function puff(pose: RenderPose, gain: number, entered: boolean): void {
  const count = puffCount(gain, entered)
  loadBasis(pose.yaw)
  for (let i = 0; i < count; i += 1) {
    const alternate = count > 1 ? i : dustSerial
    const lane = alternate % 2 === 0 ? -0.7 : 0.7
    const side = lane + (i - (count - 1) / 2) * 0.18
    const x = pose.x - basisFx * 1.55 + basisRx * side
    const z = pose.z - basisFz * 1.55 + basisRz * side
    pushDust(x, z, pose.yaw, Math.abs(pose.speed), gain, (dustSerial % 7) / 6)
    dustSerial += 1
  }
}

function puffCount(gain: number, entered: boolean): number {
  if (entered) return 3
  if (gain > 0.55) return 2
  return 1
}

function pushSkid(
  x: number,
  z: number,
  yaw: number,
  length: number,
  width: number,
  heat: number,
): void {
  const index = skidCursor
  skidCursor = (skidCursor + 1) % SKID_CAPACITY
  skidX[index] = x
  skidZ[index] = z
  skidYaw[index] = yaw
  skidLength[index] = length
  skidWidth[index] = width
  skidHeatSlot[index] = heat
  skidAge[index] = 0
  skidLive[index] = 1
  skidHidden[index] = 0
  skidDrawn[index] = 0
  skidShade[index] = -1
}

function pushDust(
  x: number,
  z: number,
  yaw: number,
  speed: number,
  gain: number,
  phase: number,
): void {
  const index = dustCursor
  dustCursor = (dustCursor + 1) % DUST_CAPACITY
  dustX[index] = x
  dustZ[index] = z
  dustYaw[index] = yaw
  dustSpeed[index] = speed
  dustGainSlot[index] = gain
  dustPhase[index] = phase
  dustAge[index] = 0
  dustLive[index] = 1
  dustHidden[index] = 0
}

function ageBuffers(dt: number): void {
  const step = clamp(dt, 0, 0.25)
  for (let i = 0; i < SKID_CAPACITY; i += 1) {
    if (!skidLive[i]) continue
    const age = num(skidAge, i) + step
    skidAge[i] = age
    if (age >= SKID_LIFE) skidLive[i] = 0
  }
  for (let i = 0; i < DUST_CAPACITY; i += 1) {
    if (!dustLive[i]) continue
    const age = num(dustAge, i) + step
    dustAge[i] = age
    if (age >= DUST_LIFE) dustLive[i] = 0
  }
}

function syncSkids(): void {
  const mesh = skidMesh
  if (!mesh) return
  let dirtyMatrix = false
  let dirtyColor = false
  for (let i = 0; i < SKID_CAPACITY; i += 1) {
    if (skidLive[i]) {
      if (!skidDrawn[i]) {
        writePose(
          mesh,
          i,
          num(skidX, i),
          0.07,
          num(skidZ, i),
          num(skidYaw, i),
          num(skidWidth, i),
          1,
          num(skidLength, i),
        )
        skidDrawn[i] = 1
        dirtyMatrix = true
      }
      const fade = 1 - smoothstep(0.42, 1, num(skidAge, i) / SKID_LIFE)
      const shade = Math.round(fade * 8)
      if (skidShade[i] !== shade) {
        skidShade[i] = shade
        fresh.copy(MILD).lerp(HARD, clamp(num(skidHeatSlot, i), 0, 1))
        scratch.copy(ROAD).lerp(fresh, fade)
        mesh.setColorAt(i, scratch)
        dirtyColor = true
      }
      skidHidden[i] = 0
    } else if (!skidHidden[i]) {
      writePose(mesh, i, 0, -8, 0, 0, 0, 0, 0)
      skidHidden[i] = 1
      skidDrawn[i] = 0
      skidShade[i] = -1
      dirtyMatrix = true
    }
  }
  if (dirtyMatrix) mesh.instanceMatrix.needsUpdate = true
  if (dirtyColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function syncDust(): void {
  const mesh = dustMesh
  if (!mesh) return
  let dirty = false
  for (let i = 0; i < DUST_CAPACITY; i += 1) {
    if (dustLive[i]) {
      const age = num(dustAge, i)
      const t = age / DUST_LIFE
      const speed = num(dustSpeed, i)
      const gain = num(dustGainSlot, i)
      const yaw = num(dustYaw, i)
      const phase = num(dustPhase, i)
      const along = t * (0.55 + Math.min(speed, 30) * 0.012)
      const side = (phase - 0.5) * (0.28 + t * 0.7)
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      const rx = Math.cos(yaw)
      const rz = -Math.sin(yaw)
      const grow = 0.5 + 0.5 * smoothstep(0, 0.2, t)
      const fade = 1 - smoothstep(0.4, 1, t)
      const size = (0.62 + gain * 0.28) * grow * fade
      writePose(
        mesh,
        i,
        num(dustX, i) - fx * along + rx * side,
        0.32 + t * (0.85 + Math.min(speed, 28) * 0.012),
        num(dustZ, i) - fz * along + rz * side,
        yaw + (phase - 0.5) * 1.2,
        size,
        size * 0.72,
        size,
        (phase - 0.5) * t * 1.4,
      )
      scratch.copy(DUST_HOT).lerp(DUST_END, smoothstep(0.12, 0.95, t))
      mesh.setColorAt(i, scratch)
      dustHidden[i] = 0
      dirty = true
    } else if (!dustHidden[i]) {
      writePose(mesh, i, 0, -8, 0, 0, 0, 0, 0)
      dustHidden[i] = 1
      dirty = true
    }
  }
  if (!dirty) return
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function writePose(
  mesh: InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy: number,
  sz: number,
  pitch = 0,
): void {
  dummy.position.set(x, y, z)
  dummy.rotation.set(pitch, yaw, 0)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function loadBasis(yaw: number): void {
  basisFx = Math.sin(yaw)
  basisFz = Math.cos(yaw)
  basisRx = Math.cos(yaw)
  basisRz = -Math.sin(yaw)
}

function axleAt(index: number): number {
  return AXLE[index] ?? 0
}

function sideAt(index: number): number {
  return SIDE_OFFSET[index] ?? 0
}

function num(values: ArrayLike<number>, index: number): number {
  return values[index] ?? 0
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const span = edge1 - edge0
  const t = span === 0 ? 0 : clamp((value - edge0) / span, 0, 1)
  return t * t * (3 - 2 * t)
}

function dropMesh(mesh: InstancedMesh | null): void {
  if (!mesh) return
  scene?.remove(mesh)
  mesh.geometry.dispose()
  const material = mesh.material
  if (Array.isArray(material)) material.forEach((item) => item.dispose())
  else material.dispose()
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three'
import type { WebGLRenderer } from 'three'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, snapshotRace, stepRace } from '../../src/race/world.ts'
import { listLayers } from '../../src/render/layer-registry.ts'
import { PARTICLE_LIMITS, dustGain, layer, skidHeat } from '../../src/render/layers/particles.ts'
import type { RenderFrame, RenderPose } from '../../src/render/types.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { locate, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

const matrix = new Matrix4()
const track = getTrack('gradiente')
const context = {
  camera: new PerspectiveCamera(),
  renderer: {} as WebGLRenderer,
  loadModel: () => Promise.resolve(new Object3D()),
}

let scene = new Scene()

describe('skid and dust layer', () => {
  beforeEach(() => {
    scene = new Scene()
    layer.setup({ ...context, scene })
  })

  afterEach(() => {
    layer.dispose()
  })

  it('registers a particle layer between props and cars', () => {
    const layers = listLayers()
    const particles = layers.find((item) => item.id === 'particles')
    const props = layers.find((item) => item.id === 'props')
    const cars = layers.find((item) => item.id === 'cars')
    expect(particles?.order).toBe(25)
    expect(props).toBeTruthy()
    expect(cars).toBeTruthy()
    expect(particles).toBeTruthy()
    expect(props?.order ?? 0).toBeLessThan(particles?.order ?? 0)
    expect(particles?.order ?? 0).toBeLessThan(cars?.order ?? 0)
  })

  it('keeps a fixed instanced buffer with lambert decals and no shadows', () => {
    const skids = named('skid-marks')
    const dust = named('grass-dust')
    expect(scene.children).toHaveLength(2)
    expect(skids.count).toBe(PARTICLE_LIMITS.skids)
    expect(dust.count).toBe(PARTICLE_LIMITS.dust)
    expect(skids.instanceMatrix.count).toBe(PARTICLE_LIMITS.skids)
    expect(dust.instanceMatrix.count).toBe(PARTICLE_LIMITS.dust)
    expect(skids.frustumCulled).toBe(false)
    expect(dust.frustumCulled).toBe(false)
    expect(skids.castShadow).toBe(false)
    expect(dust.castShadow).toBe(false)
    expect(skids.receiveShadow).toBe(false)
    const material = skids.material as MeshLambertMaterial
    expect(material).toBeInstanceOf(MeshLambertMaterial)
    expect(material.transparent).toBe(false)
    expect((dust.material as MeshLambertMaterial).transparent).toBe(false)
    expect(skids.geometry.getAttribute('normal').getY(0)).toBeGreaterThan(0.9)

    const geometryId = skids.geometry.uuid
    const matrixBuffer = skids.instanceMatrix.array
    drive({ s: 80, lateral: 0, speed: 40, slip: 0.8, decel: 0, frames: 420 })
    expect(scene.children).toHaveLength(2)
    expect(skids.geometry.uuid).toBe(geometryId)
    expect(skids.instanceMatrix.array).toBe(matrixBuffer)
    expect(skids.count).toBe(PARTICLE_LIMITS.skids)
    const laid = countVisible(skids)
    expect(laid).toBeGreaterThan(240)
    expect(laid).toBeLessThanOrEqual(PARTICLE_LIMITS.skids)
    expect(countVisible(dust)).toBeLessThanOrEqual(PARTICLE_LIMITS.dust)
  })

  it('paints brake marks and slides on asphalt, then lets them die', () => {
    expect(skidHeat(0, 32, 0)).toBe(0)
    expect(skidHeat(0, 32, 2)).toBe(0)
    expect(skidHeat(0.45, 8, 12)).toBe(0)
    expect(skidHeat(0, 32, 9)).toBeGreaterThan(0.5)
    expect(skidHeat(0.5, 28, 0)).toBeGreaterThan(0.8)

    drive({ s: 90, lateral: 0, speed: 34, slip: 0, decel: 0, frames: 80 })
    expect(countVisible(named('skid-marks'))).toBe(0)

    const braking = drive({ s: 120, lateral: 0, speed: 36, slip: 0.02, decel: 9, frames: 100 })
    const skids = named('skid-marks')
    expect(countVisible(skids)).toBeGreaterThan(20)
    expect(nearest(skids, braking.x, braking.z)).toBeLessThan(4)
    expect(longestStrip(skids)).toBeGreaterThan(0.45)

    const parked = poseAt(braking.s, braking.lateral, 0, 0)
    for (let i = 0; i < 24; i += 1) layer.update(frame([parked], 0.2, i))
    expect(countVisible(named('skid-marks'))).toBe(0)

    drive({ s: 200, lateral: 0, speed: 30, slip: 0.55, decel: 0, frames: 80 })
    expect(countVisible(named('skid-marks'))).toBeGreaterThan(12)
  })

  it('throws dust off the asphalt and keeps the racing line clean', () => {
    expect(dustGain('asphalt', 28, 0.6)).toBe(0)
    expect(dustGain('grass', 6, 0.4)).toBe(0)
    expect(dustGain('grass', 24, 0)).toBeGreaterThan(0.4)
    expect(dustGain('shortcut', 24, 0)).toBeGreaterThan(0)
    expect(dustGain('shortcut', 24, 0)).toBeLessThan(dustGain('grass', 24, 0))

    const grass = track.width / 2 + 4
    const spot = poseAt(420, grass, 0, 0)
    expect(locate(track, spot.x, spot.z).surface).toBe('grass')
    drive({ s: 420, lateral: grass, speed: 24, slip: 0.08, decel: 0, frames: 90 })
    expect(countVisible(named('grass-dust'))).toBeGreaterThan(6)
    expect(countVisible(named('grass-dust'))).toBeLessThanOrEqual(PARTICLE_LIMITS.dust)
    expect(countVisible(named('skid-marks'))).toBe(0)
    drive({ s: 470, lateral: grass, speed: 22, slip: 0.7, decel: 0, frames: 50 })
    expect(countVisible(named('skid-marks'))).toBe(0)
    expect(countVisible(named('grass-dust'))).toBeGreaterThan(4)

    layer.dispose()
    layer.setup({ ...context, scene })
    const cut = track.shortcuts[0]
    expect(cut).toBeTruthy()
    if (!cut) return
    const yaw = Math.atan2(cut.x1 - cut.x0, cut.z1 - cut.z0)
    let dusted = 0
    for (let i = 0; i <= 28; i += 1) {
      const t = 0.36 + (0.26 * i) / 28
      const pose: RenderPose = {
        id: 'player',
        x: cut.x0 + (cut.x1 - cut.x0) * t,
        z: cut.z0 + (cut.z1 - cut.z0) * t,
        yaw,
        steer: 0,
        speed: 22,
        slip: 0.04,
        color: '#d6e41a',
        modelUrl: '/assets/models/raceCarRed.dae',
      }
      expect(locate(track, pose.x, pose.z).surface).toBe('shortcut')
      layer.update(frame([pose], 1 / 60, i / 60))
      dusted = Math.max(dusted, countVisible(named('grass-dust')))
    }
    expect(dusted).toBeGreaterThan(2)

    const next = { ...track, id: 'otro-circuito' }
    layer.update(frame([poseAt(40, 0, 0, 0)], 1 / 60, 3, next))
    expect(countVisible(named('skid-marks'))).toBe(0)
    expect(countVisible(named('grass-dust'))).toBe(0)
  })

  it('lays rubber while the cautious AI brakes on Gradiente', () => {
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    let peak = 0
    let peakDecel = 0
    let peakSlip = 0
    let previous = 0
    for (let step = 0; step < 60 * 28 && peak < 16; step += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      const snap = snapshotRace(world)
      const player = snap.racers.find((racer) => racer.isPlayer)
      const speed = player?.speed ?? 0
      peakDecel = Math.max(peakDecel, (previous - speed) * 60)
      previous = speed
      peakSlip = Math.max(peakSlip, player?.slip ?? 0)
      layer.update({
        dt: 1 / 60,
        time: world.time,
        track: world.track,
        mode: 'race',
        poses: snap.racers.map((racer) => ({
          id: racer.id,
          x: racer.x,
          z: racer.z,
          yaw: racer.yaw,
          steer: racer.steer,
          speed: racer.speed,
          slip: racer.slip,
          color: racer.color,
          modelUrl: racer.modelUrl,
        })),
      })
      if (step % 3 === 0) peak = Math.max(peak, countVisible(named('skid-marks')))
    }
    expect(peak, `decel ${peakDecel.toFixed(2)} slip ${peakSlip.toFixed(3)}`).toBeGreaterThan(8)
    expect(peak).toBeLessThanOrEqual(PARTICLE_LIMITS.skids)
  })

  it('ignores updates before setup', () => {
    layer.dispose()
    expect(() => layer.update(frame([poseAt(10, 0, 30, 0.4)], 1 / 60, 0))).not.toThrow()
    expect(scene.getObjectByName('skid-marks')).toBeUndefined()
  })
})

function named(name: string): InstancedMesh {
  const found = scene.getObjectByName(name)
  if (!(found instanceof InstancedMesh)) throw new Error(`missing ${name}`)
  return found
}

function drive(options: {
  s: number
  lateral: number
  speed: number
  slip: number
  decel: number
  frames: number
}): { x: number; z: number; s: number; lateral: number } {
  let s = options.s
  let speed = options.speed
  const dt = 1 / 60
  let x = 0
  let z = 0
  for (let i = 0; i < options.frames; i += 1) {
    speed = Math.max(0, speed - options.decel * dt)
    s += speed * dt
    const pose = poseAt(s, options.lateral, speed, options.slip)
    x = pose.x
    z = pose.z
    layer.update(frame([pose], dt, i * dt))
  }
  return { x, z, s, lateral: options.lateral }
}

function poseAt(s: number, lateral: number, speed: number, slip: number): RenderPose {
  const sample = sampleAt(track, s)
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  return {
    id: 'player',
    x: sample.x + rx * lateral,
    z: sample.z + rz * lateral,
    yaw: sample.heading,
    steer: 0,
    speed,
    slip,
    color: '#d6e41a',
    modelUrl: '/assets/models/raceCarRed.dae',
  }
}

function frame(poses: RenderPose[], dt: number, time: number, circuit: Track = track): RenderFrame {
  return { dt, time, track: circuit, poses, mode: 'race' }
}

function countVisible(target: InstancedMesh): number {
  let visible = 0
  for (let i = 0; i < target.count; i += 1) {
    target.getMatrixAt(i, matrix)
    if (scaleX() > 0.02) visible += 1
  }
  return visible
}

function nearest(target: InstancedMesh, x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < target.count; i += 1) {
    target.getMatrixAt(i, matrix)
    if (scaleX() <= 0.02) continue
    const dx = (matrix.elements[12] ?? 0) - x
    const dz = (matrix.elements[14] ?? 0) - z
    best = Math.min(best, Math.hypot(dx, dz))
  }
  return best
}

function longestStrip(target: InstancedMesh): number {
  let best = 0
  for (let i = 0; i < target.count; i += 1) {
    target.getMatrixAt(i, matrix)
    const length = Math.hypot(
      matrix.elements[8] ?? 0,
      matrix.elements[9] ?? 0,
      matrix.elements[10] ?? 0,
    )
    if (length > best) best = length
  }
  return best
}

function scaleX(): number {
  return Math.hypot(matrix.elements[0] ?? 0, matrix.elements[1] ?? 0, matrix.elements[2] ?? 0)
}

import { readFileSync } from 'node:fs'
import { BoxGeometry, Group, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import type { WebGLRenderer } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { getTrack } from '../../src/tracks/registry.ts'
import { layer as cameraLayer } from '../../src/render/layers/camera.ts'
import { fallbackCar, fitObject } from '../../src/render/models.ts'
import type { RenderContext, RenderFrame, RenderPose } from '../../src/render/types.ts'

function rig(front: [number, number], rear: [number, number]): Object3D {
  const root = new Group()
  const frontWheel = new Mesh(new BoxGeometry(0.3, 0.3, 0.3))
  frontWheel.name = 'wheelFrontLeft'
  frontWheel.position.set(front[0], 0.2, front[1])
  const rearWheel = new Mesh(new BoxGeometry(0.3, 0.3, 0.3))
  rearWheel.name = 'wheelBackLeft'
  rearWheel.position.set(rear[0], 0.2, rear[1])
  const span = Math.max(Math.abs(front[0] - rear[0]), Math.abs(front[1] - rear[1]), 0.4)
  const body = new Mesh(new BoxGeometry(0.8, 0.4, span + 0.5))
  body.position.set(0, 0.35, (front[1] + rear[1]) / 2)
  root.add(frontWheel, rearWheel, body)
  return root
}

function wheelZ(root: Object3D, name: string): number {
  root.updateMatrixWorld(true)
  const node = root.getObjectByName(name)
  expect(node).toBeTruthy()
  return node?.getWorldPosition(new Vector3()).z ?? 0
}

describe('car model forward axis', () => {
  it('turns the Kenney nose from -Z onto +Z', () => {
    const dae = readFileSync('public/assets/models/raceCarRed.dae', 'utf8')
    const translationZ = (name: string) => {
      const match = dae.match(new RegExp(`name="${name}"[\\s\\S]*?<matrix>([^<]+)</matrix>`))
      expect(match?.[1]).toBeTruthy()
      const values = match?.[1]?.trim().split(/\s+/).map(Number) ?? []
      return values[11] ?? 0
    }
    const frontZ = translationZ('wheelFrontLeft')
    const rearZ = translationZ('wheelBackLeft')
    expect(frontZ).toBeLessThan(rearZ)

    const fitted = fitObject(rig([0.2, frontZ], [0.2, rearZ]), 4.4)
    expect(wheelZ(fitted, 'wheelFrontLeft')).toBeGreaterThan(wheelZ(fitted, 'wheelBackLeft') + 0.4)
  })

  it('leaves a model that already faces +Z pointing forward', () => {
    const fitted = fitObject(rig([0.2, 0.55], [0.2, -0.45]), 4)
    expect(wheelZ(fitted, 'wheelFrontLeft')).toBeGreaterThan(wheelZ(fitted, 'wheelBackLeft'))
  })

  it('yaws a nose that was authored on +X onto +Z', () => {
    const fitted = fitObject(rig([0.7, 0], [-0.6, 0]), 4)
    expect(wheelZ(fitted, 'wheelFrontLeft')).toBeGreaterThan(wheelZ(fitted, 'wheelBackLeft') + 0.4)
  })

  it('puts the fallback hood in front of the cabin', () => {
    const car = fallbackCar('#d6e41a')
    const nose = car.getObjectByName('nose')
    const cabin = car.getObjectByName('cabin')
    expect(nose).toBeTruthy()
    expect(cabin).toBeTruthy()
    expect(nose?.position.z ?? 0).toBeGreaterThan(0.8)
    expect(cabin?.position.z ?? 0).toBeLessThan(0)
  })
})

describe('chase camera', () => {
  afterEach(() => {
    cameraLayer.dispose()
  })

  it('sits behind the nose and looks along the heading', () => {
    const camera = new PerspectiveCamera()
    const context: RenderContext = {
      scene: new Scene(),
      camera,
      renderer: {} as WebGLRenderer,
      loadModel: () => Promise.resolve(new Object3D()),
    }
    cameraLayer.setup(context)
    cameraLayer.update(frame(10, 20, 0))
    expect(camera.position.z).toBeLessThan(20)
    expect(camera.position.x).toBeCloseTo(10, 1)
    const ahead = new Vector3()
    camera.getWorldDirection(ahead)
    expect(ahead.z).toBeGreaterThan(0.7)
    expect(Math.abs(ahead.x)).toBeLessThan(0.2)

    cameraLayer.dispose()
    cameraLayer.setup(context)
    cameraLayer.update(frame(10, 20, Math.PI / 2))
    expect(camera.position.x).toBeLessThan(10)
    camera.getWorldDirection(ahead)
    expect(ahead.x).toBeGreaterThan(0.7)
  })
})

function frame(x: number, z: number, yaw: number): RenderFrame {
  const pose: RenderPose = {
    id: 'player',
    x,
    z,
    yaw,
    steer: 0,
    speed: 12,
    slip: 0,
    color: '#d6e41a',
    modelUrl: '/assets/models/raceCarRed.dae',
  }
  return {
    dt: 1 / 60,
    time: 1,
    track: getTrack('gradiente'),
    poses: [pose],
    mode: 'race',
  }
}

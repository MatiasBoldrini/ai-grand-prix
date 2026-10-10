import { Color, InstancedMesh, Mesh, MeshLambertMaterial, Object3D } from 'three'
import { sampleAt } from '../../tracks/spline.ts'
import { bakeProp, loadModel } from '../models.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

const ASSETS = [
  { url: '/assets/models/barrierRed.dae', size: 2.2, color: '#9a3b32' },
  { url: '/assets/models/lightPostModern.dae', size: 7.5, color: '#cfc8b8' },
  { url: '/assets/models/pylon.dae', size: 1.15, color: '#d6e41a' },
  { url: '/assets/models/grandStand.dae', size: 12, color: '#8a8478' },
  { url: '/assets/models/flagCheckers.dae', size: 5, color: '#f4f3ee' },
] as const

let root: Object3D | null = null
let builtFor = ''
let building = false
let context: RenderContext | null = null

export const layer: RenderLayer = {
  id: 'props',
  order: 20,
  setup(ctx) {
    context = ctx
    root = new Object3D()
    ctx.scene.add(root)
  },
  update(frame) {
    if (!context || !root || building || builtFor === frame.track.id) return
    building = true
    const parent = root
    void rebuild(frame, parent).finally(() => {
      building = false
    })
  },
  dispose() {
    if (root && context) context.scene.remove(root)
    root = null
    builtFor = ''
  },
}

async function rebuild(frame: RenderFrame, parent: Object3D): Promise<void> {
  const trackId = frame.track.id
  clear(parent)
  const geometries = new Map<string, Awaited<ReturnType<typeof loadBaked>> | null>()
  await Promise.all(
    ASSETS.map(async (asset) => {
      try {
        geometries.set(asset.url, await loadBaked(asset.url, asset.size))
      } catch {
        geometries.set(asset.url, null)
      }
    }),
  )
  if (builtFor === trackId && parent.children.length > 0) return
  clear(parent)

  const barrier = geometries.get('/assets/models/barrierRed.dae')
  const light = geometries.get('/assets/models/lightPostModern.dae')
  const pylon = geometries.get('/assets/models/pylon.dae')
  const stand = geometries.get('/assets/models/grandStand.dae')
  const flag = geometries.get('/assets/models/flagCheckers.dae')

  if (barrier)
    parent.add(repeat(barrier, '#9a3b32', points(frame, 12, frame.track.width / 2 + 1.1)))
  if (light) parent.add(repeat(light, '#cfc8b8', points(frame, 40, frame.track.width / 2 + 5)))
  if (pylon) parent.add(repeat(pylon, '#d6e41a', shortcutPylons(frame)))
  if (stand) {
    parent.add(single(stand, '#8a8478', frame, 28, frame.track.width / 2 + 11))
    parent.add(single(stand, '#8a8478', frame, 52, frame.track.width / 2 + 11))
  }
  if (flag) {
    parent.add(single(flag, '#f4f3ee', frame, 0, frame.track.width / 2 + 2))
    parent.add(single(flag, '#f4f3ee', frame, 0, -(frame.track.width / 2 + 2)))
  }
  builtFor = trackId
}

async function loadBaked(url: string, size: number) {
  const model = await loadModel(url)
  return bakeProp(model, size)
}

function points(frame: RenderFrame, every: number, lateral: number) {
  const spots: { x: number; z: number; yaw: number }[] = []
  const count = Math.floor(frame.track.length / every)
  for (let i = 0; i < count; i += 1) {
    const sample = sampleAt(frame.track, i * every)
    const rx = Math.cos(sample.heading)
    const rz = -Math.sin(sample.heading)
    for (const side of [1, -1]) {
      if (side === 1 && sample.s > 18 && sample.s < 70) continue
      spots.push({
        x: sample.x + rx * lateral * side,
        z: sample.z + rz * lateral * side,
        yaw: sample.heading,
      })
    }
  }
  return spots
}

function shortcutPylons(frame: RenderFrame) {
  const shortcut = frame.track.shortcuts[0]
  if (!shortcut) return []
  const spots: { x: number; z: number; yaw: number }[] = []
  for (let i = 0; i <= 5; i += 1) {
    const t = i / 5
    spots.push({
      x: shortcut.x0 + (shortcut.x1 - shortcut.x0) * t,
      z: shortcut.z0 + (shortcut.z1 - shortcut.z0) * t + shortcut.halfWidth * 0.85,
      yaw: Math.atan2(shortcut.x1 - shortcut.x0, shortcut.z1 - shortcut.z0),
    })
  }
  return spots
}

function repeat(
  geometry: ReturnType<typeof bakeProp>,
  color: string,
  spots: { x: number; z: number; yaw: number }[],
): InstancedMesh {
  const mesh = new InstancedMesh(
    geometry,
    new MeshLambertMaterial({ color: new Color(color) }),
    Math.max(1, spots.length),
  )
  mesh.count = spots.length
  const dummy = new Object3D()
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, 0, spot.z)
    dummy.rotation.set(0, spot.yaw, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function single(
  geometry: ReturnType<typeof bakeProp>,
  color: string,
  frame: RenderFrame,
  s: number,
  lateral: number,
): Mesh {
  const sample = sampleAt(frame.track, s)
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ color }))
  mesh.position.set(sample.x + rx * lateral, 0, sample.z + rz * lateral)
  mesh.rotation.y = sample.heading + Math.PI / 2
  return mesh
}

function clear(parent: Object3D): void {
  for (const child of [...parent.children]) parent.remove(child)
}

import { Mesh, Object3D } from 'three'
import { fallbackCar, fitObject, loadModel, paintBody } from '../models.ts'
import type { RenderContext, RenderLayer, RenderPose } from '../types.ts'

const templates = new Map<string, Object3D | null>()
const cars = new Map<string, Object3D>()
let context: RenderContext | null = null
let loading = false

export const layer: RenderLayer = {
  id: 'cars',
  order: 30,
  setup(ctx) {
    context = ctx
  },
  update(frame) {
    if (!context) return
    const urls = [...new Set(frame.poses.map((pose) => pose.modelUrl))]
    if (urls.some((url) => !templates.has(url)) && !loading) {
      loading = true
      void Promise.all(urls.map((url) => ensureTemplate(url))).finally(() => {
        loading = false
      })
    }
    const seen = new Set<string>()
    for (const pose of frame.poses) {
      seen.add(pose.id)
      const node = nodeFor(pose)
      if (!node.parent) context.scene.add(node)
      node.position.set(pose.x, 0.04, pose.z)
      node.rotation.order = 'YXZ'
      node.rotation.y = pose.yaw
      node.rotation.z = -pose.steer * 0.05 - Math.sign(pose.steer || pose.slip) * pose.slip * 0.08
      spinWheels(node, pose, frame.dt)
    }
    for (const [id, node] of cars) {
      if (!seen.has(id)) {
        node.removeFromParent()
        cars.delete(id)
      }
    }
  },
  dispose() {
    for (const node of cars.values()) node.removeFromParent()
    cars.clear()
  },
}

async function ensureTemplate(url: string): Promise<void> {
  if (templates.has(url)) return
  try {
    const loaded = await loadModel(url)
    templates.set(url, fitObject(loaded, 4.4))
  } catch {
    templates.set(url, null)
  }
}

function nodeFor(pose: RenderPose): Object3D {
  const template = templates.get(pose.modelUrl)
  const ready = template !== undefined
  const existing = cars.get(pose.id)
  if (existing?.userData.ready === ready && existing.userData.color === pose.color) return existing
  if (existing) existing.removeFromParent()
  const node = template ? template.clone(true) : fallbackCar(pose.color)
  if (template) paintBody(node, pose.color)
  node.userData.ready = ready
  node.userData.color = pose.color
  cars.set(pose.id, node)
  return node
}

function spinWheels(node: Object3D, pose: RenderPose, dt: number): void {
  node.traverse((obj) => {
    if (!/wheel/i.test(obj.name)) return
    const mesh = obj as Mesh
    const data = mesh.userData as { spin?: number; baseX?: number; baseY?: number }
    if (data.baseX === undefined) {
      data.baseX = mesh.rotation.x
      data.baseY = mesh.rotation.y
    }
    data.spin = (data.spin ?? 0) + (pose.speed * dt) / 0.34
    const front = /front/i.test(mesh.name)
    mesh.rotation.order = 'YXZ'
    mesh.rotation.y = (data.baseY ?? 0) + (front ? pose.steer : 0)
    mesh.rotation.x = (data.baseX ?? 0) + data.spin
  })
}

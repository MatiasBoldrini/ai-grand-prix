import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'

const loader = new ColladaLoader()
const cache = new Map<string, Promise<Object3D>>()

export function loadModel(url: string): Promise<Object3D> {
  const cached = cache.get(url)
  if (cached) return cached
  const pending = loader.loadAsync(url).then((collada) => {
    if (!collada) throw new Error(`Empty model ${url}`)
    return prepareMaterials(collada.scene)
  })
  cache.set(url, pending)
  return pending
}

export function prepareMaterials(root: Object3D): Object3D {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = source.map((material) => {
      const lambert = new MeshLambertMaterial()
      lambert.name = material.name
      if ('color' in material && material.color instanceof Color) lambert.color.copy(material.color)
      if (/glass/i.test(material.name)) {
        lambert.color.set('#9aa7a6')
        lambert.transparent = true
        lambert.opacity = 0.45
      }
      return lambert
    })
    mesh.material = next.length === 1 ? next[0]! : next
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
  return root
}

/**
 * Uniform scale, nose toward +Z, bottom on y = 0.
 * Physics yaw 0 also faces +Z. Kenney's race car is authored with the nose
 * on -Z, so a raw `rotation.y = yaw` drives that mesh backwards.
 */
export function fitObject(root: Object3D, targetLength: number): Object3D {
  root.updateMatrixWorld(true)
  const yaw = yawToPlusZ(root)
  if (yaw !== 0) root.rotation.y += yaw
  const wrapper = new Group()
  wrapper.add(root)
  root.updateMatrixWorld(true)
  const fitted = new Box3().setFromObject(wrapper)
  const fittedSize = fitted.getSize(new Vector3())
  const center = fitted.getCenter(new Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= fitted.min.y
  const length = Math.max(fittedSize.x, fittedSize.z, 0.001)
  wrapper.scale.setScalar(targetLength / length)
  return wrapper
}

export function paintBody(root: Object3D, color: string): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const clones = materials.map((material) => {
      const next = material.clone()
      if (isBodyPaint(material.name) && next instanceof MeshLambertMaterial) next.color.set(color)
      return next
    })
    mesh.material = clones.length === 1 ? clones[0]! : clones
  })
}

export function bakeProp(root: Object3D, targetSize: number): BufferGeometry {
  root.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    mesh.updateWorldMatrix(true, false)
    geometry.applyMatrix4(mesh.matrixWorld)
    parts.push(geometry)
  })
  if (parts.length === 0) {
    return new BoxGeometry(targetSize, targetSize * 0.4, targetSize * 0.3)
  }
  let geometry = parts[0]!
  if (parts.length > 1) {
    try {
      const merged = mergeGeometries(parts, false)
      if (merged) geometry = merged
    } catch {
      geometry = largest(parts)
    }
  }
  geometry.computeBoundingBox()
  const box = geometry.boundingBox ?? new Box3()
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  geometry.translate(-center.x, -box.min.y, -center.z)
  const longest = Math.max(size.x, size.y, size.z, 0.001)
  const scale = targetSize / longest
  geometry.scale(scale, scale, scale)
  geometry.computeBoundingSphere()
  return geometry
}

export function fallbackCar(color: string): Group {
  const group = new Group()
  const body = new Mesh(new BoxGeometry(1.7, 0.45, 4.2), new MeshLambertMaterial({ color }))
  body.position.y = 0.48
  body.name = 'body'
  const cabin = new Mesh(
    new BoxGeometry(1.4, 0.38, 1.5),
    new MeshLambertMaterial({ color: '#2a2a26' }),
  )
  cabin.name = 'cabin'
  cabin.position.set(0, 0.86, -0.55)
  const nose = new Mesh(new BoxGeometry(1.35, 0.28, 0.7), new MeshLambertMaterial({ color }))
  nose.name = 'nose'
  nose.position.set(0, 0.62, 1.55)
  group.add(body, cabin, nose)
  return group
}

/**
 * Yaw that maps the model's nose onto +Z. Wheel names win; otherwise a mesh
 * that is longer on X is turned side-on and the nose is left as authored.
 */
function yawToPlusZ(root: Object3D): number {
  const front = centroid(root, /front/i)
  const rear = centroid(root, /back|rear/i)
  if (front && rear) {
    const fx = front.x - rear.x
    const fz = front.z - rear.z
    if (fx * fx + fz * fz > 1e-8) return -Math.atan2(fx, fz)
  }
  const size = new Box3().setFromObject(root).getSize(new Vector3())
  if (size.x > size.z * 1.05 && size.x >= size.y) return Math.PI / 2
  return 0
}

function centroid(root: Object3D, pattern: RegExp): Vector3 | null {
  const sum = new Vector3()
  const point = new Vector3()
  let count = 0
  root.traverse((obj) => {
    if (obj === root || !pattern.test(obj.name)) return
    obj.getWorldPosition(point)
    sum.add(point)
    count += 1
  })
  if (count === 0) return null
  return sum.multiplyScalar(1 / count)
}

function isBodyPaint(name: string): boolean {
  return /red|green|orange|white|body|carpaint/i.test(name)
}

function largest(parts: BufferGeometry[]): BufferGeometry {
  return parts.reduce((best, geometry) => {
    const a = best.getAttribute('position')?.count ?? 0
    const b = geometry.getAttribute('position')?.count ?? 0
    return b > a ? geometry : best
  })
}

import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { CarLivery } from '../cars/types.ts'
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

/** Uniform scale, nose toward +Z, bottom on y = 0. */
export function fitObject(root: Object3D, targetLength: number): Object3D {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  const size = box.getSize(new Vector3())
  const wrapper = new Group()
  if (size.x > size.z * 1.05 && size.x >= size.y) root.rotation.y += Math.PI / 2
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

const plates = new Map<string, CanvasTexture>()

/** Side, roof and rear plates. Geometry is local to the fitted car. */
export function attachLivery(root: Object3D, livery: CarLivery, team: string): void {
  const previous = root.getObjectByName('livery')
  if (previous) {
    previous.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    previous.removeFromParent()
  }
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const local = new Box3().setFromObject(root).applyMatrix4(inverse)
  const size = local.getSize(new Vector3())
  const center = local.getCenter(new Vector3())
  if (size.x < 0.01 || size.z < 0.01) return

  const group = new Group()
  group.name = 'livery'
  const plate = plateMaterial(livery, team)
  const stripe = new MeshLambertMaterial({ color: livery.stripe })
  const trim = new MeshLambertMaterial({ color: livery.trim })

  const cover = new Mesh(new PlaneGeometry(size.x * 0.42, size.z * 0.34), stripe)
  cover.rotation.x = -Math.PI / 2
  cover.position.set(center.x, local.max.y + 0.03, center.z - size.z * 0.06)
  cover.name = 'livery-cover'
  const pinstripe = new Mesh(new PlaneGeometry(size.x * 0.46, size.z * 0.045), trim)
  pinstripe.rotation.x = -Math.PI / 2
  pinstripe.position.set(center.x, local.max.y + 0.04, center.z + size.z * 0.12)
  pinstripe.name = 'livery-pin'
  group.add(cover, pinstripe)

  const rear = new Mesh(new PlaneGeometry(size.x * 0.62, size.y * 0.28), plate)
  rear.rotation.y = Math.PI
  rear.position.set(center.x, center.y + size.y * 0.08, local.min.z - 0.03)
  rear.name = 'livery-rear'
  group.add(rear)

  const boardW = size.z * 0.34
  const boardH = size.y * 0.2
  for (const side of [-1, 1]) {
    const board = new Mesh(new PlaneGeometry(boardW, boardH), plate)
    board.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2
    board.position.set(center.x + side * (size.x * 0.5 + 0.03), center.y, center.z - size.z * 0.02)
    board.name = 'livery-side'
    group.add(board)
  }

  root.add(group)
}

function plateMaterial(livery: CarLivery, team: string): MeshLambertMaterial {
  const key = `${livery.wordmark}|${team}|${livery.stripe}|${livery.trim}|${livery.ink}`
  let map = plates.get(key)
  if (!map) {
    map = new CanvasTexture(paintPlate(livery, team))
    map.colorSpace = SRGBColorSpace
    map.needsUpdate = true
    plates.set(key, map)
  }
  const material = new MeshLambertMaterial({ map, transparent: true })
  material.polygonOffset = true
  material.polygonOffsetFactor = -2
  material.polygonOffsetUnits = -2
  return material
}

function paintPlate(livery: CarLivery, team: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = livery.stripe
  ctx.fillRect(0, 0, 512, 160)
  ctx.fillStyle = livery.trim
  ctx.fillRect(0, 0, 18, 160)
  ctx.fillStyle = livery.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 28px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(team.toUpperCase(), 270, 42)
  ctx.font = '800 72px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(livery.wordmark, 270, 104)
  return canvas
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
  const cabin = new Mesh(
    new BoxGeometry(1.4, 0.38, 1.5),
    new MeshLambertMaterial({ color: '#2a2a26' }),
  )
  cabin.position.set(0, 0.86, -0.2)
  group.add(body, cabin)
  return group
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

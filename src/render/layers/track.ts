import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { at } from '../../core/math.ts'
import { sampleAt } from '../../tracks/spline.ts'
import type { Track } from '../../tracks/types.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'
import { ensureGrass } from './world.ts'

let group: Group | null = null
let builtFor = ''
let context: RenderContext | null = null

export const layer: RenderLayer = {
  id: 'track',
  order: 10,
  setup(ctx) {
    context = ctx
    group = new Group()
    ctx.scene.add(group)
  },
  update(frame: RenderFrame) {
    if (!context || !group) return
    ensureGrass(context, frame)
    if (builtFor === frame.track.id) return
    clear(group)
    group.add(roadMesh(frame.track))
    group.add(edgeMesh(frame.track, 1))
    group.add(edgeMesh(frame.track, -1))
    group.add(startMesh(frame.track))
    builtFor = frame.track.id
  },
  dispose() {
    if (group) clear(group)
    group = null
    builtFor = ''
  },
}

function roadMesh(track: Track): Mesh {
  return ribbon(track, track.width / 2, 0.02, '#3c3b36', 2)
}

function edgeMesh(track: Track, side: number): Mesh {
  const outer = track.width / 2
  const inner = outer - 0.35
  return ribbonBetween(track, inner * side, outer * side, 0.04, '#d8d4c8', 2)
}

function startMesh(track: Track): Mesh {
  const sample = sampleAt(track, 0)
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  const fx = Math.sin(sample.heading)
  const fz = Math.cos(sample.heading)
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const colors: number[] = []
  const half = track.width / 2
  const depth = 1.1
  for (let i = 0; i < 8; i += 1) {
    const t0 = -half + (half * 2 * i) / 8
    const t1 = -half + (half * 2 * (i + 1)) / 8
    const lime = i % 2 === 0
    const color = lime ? [0.79, 0.83, 0.29] : [0.08, 0.08, 0.07]
    const corners: Array<[number, number]> = [
      [t0, 0],
      [t1, 0],
      [t1, 1],
      [t0, 1],
    ]
    const quad = [0, 1, 2, 0, 2, 3]
    for (const index of quad) {
      const corner = at(corners, index)
      const lateral = corner[0]
      const along = (corner[1] - 0.5) * depth
      positions.push(
        sample.x + rx * lateral + fx * along,
        0.06,
        sample.z + rz * lateral + fz * along,
      )
      colors.push(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0)
    }
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.computeVertexNormals()
  return new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }))
}

function ribbon(track: Track, half: number, y: number, color: string, step: number): Mesh {
  return ribbonBetween(track, -half, half, y, color, step)
}

function ribbonBetween(
  track: Track,
  lateralA: number,
  lateralB: number,
  y: number,
  color: string,
  step: number,
): Mesh {
  const positions: number[] = []
  const indices: number[] = []
  const count = Math.ceil(track.length / step)
  for (let i = 0; i <= count; i += 1) {
    const sample = sampleAt(track, (i / count) * track.length)
    const rx = Math.cos(sample.heading)
    const rz = -Math.sin(sample.heading)
    positions.push(sample.x + rx * lateralA, y, sample.z + rz * lateralA)
    positions.push(sample.x + rx * lateralB, y, sample.z + rz * lateralB)
  }
  for (let i = 0; i < count; i += 1) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new Mesh(geometry, new MeshLambertMaterial({ color }))
}

function clear(target: Group): void {
  for (const child of [...target.children]) {
    target.remove(child)
    const mesh = child as Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  }
}

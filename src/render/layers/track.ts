import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
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
    group.add(gravelMesh(frame.track))
    group.add(roadMesh(frame.track))
    group.add(centerMesh(frame.track))
    group.add(edgeMesh(frame.track, 1))
    group.add(edgeMesh(frame.track, -1))
    group.add(curbMesh(frame.track, 1))
    group.add(curbMesh(frame.track, -1))
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
  return ribbon(track, track.width / 2, 0.03, '#3e4654', 2)
}

function gravelMesh(track: Track): Group {
  const inner = track.width / 2
  const outer = inner + Math.min(track.runoff, 4.2)
  const gravel = new Group()
  gravel.add(ribbonBetween(track, inner, outer, 0.012, '#c6a56e', 4))
  gravel.add(ribbonBetween(track, -outer, -inner, 0.012, '#c6a56e', 4))
  return gravel
}

function centerMesh(track: Track): Mesh {
  return dashedRibbon(track, -0.12, 0.12, 0.045, [0.72, 0.52, 0.12], 3.2, 3.2)
}

function edgeMesh(track: Track, side: number): Mesh {
  const outer = track.width / 2 - 0.08
  const inner = outer - 0.28
  return ribbonBetween(track, inner * side, outer * side, 0.05, '#f4f1ea', 2)
}

function curbMesh(track: Track, side: number): Mesh {
  const inner = track.width / 2 + 0.02
  const outer = inner + 0.72
  const sign = side < 0 ? -1 : 1
  return blockRibbon(
    track,
    inner * sign,
    outer * sign,
    0.055,
    (index) => (index % 2 === 0 ? [0.82, 0.16, 0.13] : [0.96, 0.95, 0.92]),
    1.6,
  )
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
    const light = i % 2 === 0
    const color = light ? [0.95, 0.94, 0.9] : [0.12, 0.13, 0.15]
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
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
}

function ribbon(track: Track, half: number, y: number, color: string, step: number): Mesh {
  return ribbonBetween(track, -half, half, y, color, step)
}

function blockRibbon(
  track: Track,
  lateralA: number,
  lateralB: number,
  y: number,
  colorAt: (index: number) => [number, number, number],
  step: number,
): Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const count = Math.max(1, Math.ceil(track.length / step))
  for (let i = 0; i < count; i += 1) {
    const color = colorAt(i)
    const start = sampleAt(track, (i / count) * track.length)
    const end = sampleAt(track, (((i + 1) % count) / count) * track.length)
    const base = positions.length / 3
    pushCorner(positions, colors, start, lateralA, y, color)
    pushCorner(positions, colors, start, lateralB, y, color)
    pushCorner(positions, colors, end, lateralA, y, color)
    pushCorner(positions, colors, end, lateralB, y, color)
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  return coloredMesh(positions, colors, indices)
}

function dashedRibbon(
  track: Track,
  lateralA: number,
  lateralB: number,
  y: number,
  color: [number, number, number],
  dash: number,
  gap: number,
): Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const period = dash + gap
  const count = Math.max(1, Math.floor(track.length / period))
  for (let i = 0; i < count; i += 1) {
    const origin = i * period
    const start = sampleAt(track, origin)
    const end = sampleAt(track, Math.min(track.length, origin + dash))
    const base = positions.length / 3
    pushCorner(positions, colors, start, lateralA, y, color)
    pushCorner(positions, colors, start, lateralB, y, color)
    pushCorner(positions, colors, end, lateralA, y, color)
    pushCorner(positions, colors, end, lateralB, y, color)
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  return coloredMesh(positions, colors, indices)
}

function pushCorner(
  positions: number[],
  colors: number[],
  sample: { x: number; z: number; heading: number },
  lateral: number,
  y: number,
  color: [number, number, number],
): void {
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  positions.push(sample.x + rx * lateral, y, sample.z + rz * lateral)
  colors.push(color[0], color[1], color[2])
}

function coloredMesh(positions: number[], colors: number[], indices: number[]): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
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
  return new Mesh(geometry, new MeshBasicMaterial({ color }))
}

function clear(target: Group): void {
  for (const child of [...target.children]) {
    target.remove(child)
    if (child instanceof Group) clear(child)
    const mesh = child as Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  }
}

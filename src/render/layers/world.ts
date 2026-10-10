import {
  BufferAttribute,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  BackSide,
} from 'three'
import { trackBounds } from '../../tracks/spline.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

let grass: Mesh | null = null
let sky: Mesh | null = null
let builtFor = ''
let context: RenderContext | null = null

export const layer: RenderLayer = {
  id: 'world',
  order: 0,
  setup(ctx: RenderContext) {
    context = ctx
    ctx.scene.background = new Color('#b7d6ee')
    ctx.scene.fog = new Fog('#d5e6f2', 88, 430)
    const skyLight = new HemisphereLight('#fff6e4', '#6ea35a', 0.62)
    const sun = new DirectionalLight('#fff1d2', 0.95)
    sun.position.set(70, 92, 28)
    sun.castShadow = false
    sky = makeSky()
    ctx.scene.add(skyLight, sun, sky)
  },
  update() {
    if (sky && context) sky.position.copy(context.camera.position)
  },
  dispose() {
    grass?.geometry.dispose()
    grass = null
    sky?.geometry.dispose()
    sky = null
    builtFor = ''
  },
}

export function ensureGrass(ctx: RenderContext, frame: RenderFrame): void {
  if (builtFor === frame.track.id && grass) return
  if (grass) {
    ctx.scene.remove(grass)
    grass.geometry.dispose()
  }
  const bounds = trackBounds(frame.track)
  const radius = bounds.radius + 260
  const geometry = new CircleGeometry(radius, 72)
  paintGrass(geometry)
  // Flat ground. A Lambert shade is the same on every pixel, so basic color keeps the sun tint.
  grass = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
  grass.rotation.x = -Math.PI / 2
  grass.position.set(bounds.centerX, 0, bounds.centerZ)
  ctx.scene.add(grass)
  builtFor = frame.track.id
}

function makeSky(): Mesh {
  const radius = 240
  const geometry = new SphereGeometry(radius, 28, 16)
  const position = geometry.attributes.position
  if (!position) throw new Error('Sky is missing positions')
  const colors = new Float32Array(position.count * 3)
  const zenith = new Color('#3c8fd4')
  const mid = new Color('#8ec8ef')
  const horizon = new Color('#f6d7b0')
  const below = new Color('#c9dcc4')
  const color = new Color()
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / radius
    if (y < 0) color.copy(below).lerp(horizon, y + 1)
    else if (y < 0.32) color.copy(horizon).lerp(mid, y / 0.32)
    else color.copy(mid).lerp(zenith, (y - 0.32) / 0.68)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: BackSide,
    fog: false,
    depthWrite: false,
    depthTest: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  // After the ground, so the gradient only fills pixels the track did not cover.
  mesh.renderOrder = 1
  mesh.name = 'sky'
  return mesh
}

function paintGrass(geometry: CircleGeometry): void {
  const position = geometry.attributes.position
  if (!position) return
  const colors = new Float32Array(position.count * 3)
  const shade = new Color('#3c7a34')
  const sunlit = new Color('#8bc85c')
  const color = new Color()
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const wave = Math.sin(x * 0.02) * Math.cos(y * 0.017)
    const t = wave * 0.5 + 0.5
    color.copy(shade).lerp(sunlit, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

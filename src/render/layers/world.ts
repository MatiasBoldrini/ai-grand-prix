import {
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import { trackBounds } from '../../tracks/spline.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

let grass: Mesh | null = null
let builtFor = ''

export const layer: RenderLayer = {
  id: 'world',
  order: 0,
  setup(ctx: RenderContext) {
    // Flat sky. A gradient mesh shades every open pixel and misses the frame budget.
    ctx.scene.background = new Color('#8ec8ef')
    ctx.scene.fog = new Fog('#d5e6f2', 88, 420)
    const skyLight = new HemisphereLight('#fff6e4', '#6ea35a', 0.62)
    const sun = new DirectionalLight('#fff1d2', 0.95)
    sun.position.set(70, 92, 28)
    sun.castShadow = false
    ctx.scene.add(skyLight, sun)
  },
  update() {},
  dispose() {
    grass?.geometry.dispose()
    grass = null
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
  const geometry = new CircleGeometry(radius, 48)
  // One solid color. The ground is flat, so a lit or painted shader repeats the same pixels.
  grass = new Mesh(geometry, new MeshBasicMaterial({ color: '#5a9a3c' }))
  grass.rotation.x = -Math.PI / 2
  grass.position.set(bounds.centerX, 0, bounds.centerZ)
  ctx.scene.add(grass)
  builtFor = frame.track.id
}

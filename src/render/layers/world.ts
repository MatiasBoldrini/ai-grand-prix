import {
  Color,
  Fog,
  HemisphereLight,
  DirectionalLight,
  Mesh,
  CircleGeometry,
  MeshLambertMaterial,
} from 'three'
import { trackBounds } from '../../tracks/spline.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

let grass: Mesh | null = null
let builtFor = ''

export const layer: RenderLayer = {
  id: 'world',
  order: 0,
  setup(ctx: RenderContext) {
    ctx.scene.background = new Color('#14140f')
    ctx.scene.fog = new Fog('#14140f', 90, 320)
    const sky = new HemisphereLight('#d9d4c4', '#1a2618', 0.95)
    const sun = new DirectionalLight('#fff4df', 1.05)
    sun.position.set(30, 80, 18)
    sun.castShadow = false
    ctx.scene.add(sky, sun)
  },
  update(frame: RenderFrame) {
    if (!grass || builtFor !== frame.track.id) return
    // Grass is rebuilt with the track layer's first update via ensure().
  },
  dispose() {
    grass?.geometry.dispose()
    grass = null
  },
}

export function ensureGrass(ctx: RenderContext, frame: RenderFrame): void {
  if (builtFor === frame.track.id && grass) return
  if (grass) {
    ctx.scene.remove(grass)
    grass.geometry.dispose()
  }
  const bounds = trackBounds(frame.track)
  const radius = bounds.radius + 80
  grass = new Mesh(new CircleGeometry(radius, 48), new MeshLambertMaterial({ color: '#1b2a1c' }))
  grass.rotation.x = -Math.PI / 2
  grass.position.set(bounds.centerX, 0, bounds.centerZ)
  ctx.scene.add(grass)
  builtFor = frame.track.id
}

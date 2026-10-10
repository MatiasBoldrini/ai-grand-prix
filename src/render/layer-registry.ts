import type { RenderLayer } from './types.ts'

interface LayerModule {
  layer: RenderLayer
}

const modules = import.meta.glob<LayerModule>('./layers/*.ts', { eager: true })

export function listLayers(): RenderLayer[] {
  return Object.values(modules)
    .map((mod) => mod.layer)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

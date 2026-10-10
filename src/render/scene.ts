import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { listLayers } from './layer-registry.ts'
import { loadModel } from './models.ts'
import type { RenderContext, RenderFrame, RenderLayer } from './types.ts'

export class RaceView {
  private readonly layers: RenderLayer[]
  private readonly renderer: WebGLRenderer
  private readonly scene: Scene
  private readonly camera: PerspectiveCamera
  private pixelCap = 1.25

  private constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    layers: RenderLayer[],
  ) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.layers = layers
  }

  static async create(canvas: HTMLCanvasElement): Promise<RaceView> {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    if (!renderer.getContext()) throw new Error('WebGL no está disponible')
    renderer.shadowMap.enabled = false
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor('#b7d6ee', 1)
    const scene = new Scene()
    const camera = new PerspectiveCamera(68, 1, 0.1, 700)
    const layers = listLayers()
    const ctx: RenderContext = { scene, camera, renderer, loadModel }
    for (const layer of layers) await layer.setup(ctx)
    const view = new RaceView(renderer, scene, camera, layers)
    view.resize()
    return view
  }

  setPixelRatioCap(cap: number): void {
    this.pixelCap = cap
    this.resize()
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    const ratio = Math.min(window.devicePixelRatio || 1, this.pixelCap)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  render(frame: RenderFrame): void {
    for (const layer of this.layers) layer.update(frame)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    for (const layer of this.layers) layer.dispose()
    this.renderer.dispose()
  }
}

import type { PerspectiveCamera, Scene, WebGLRenderer, Object3D } from 'three'
import type { Track } from '../tracks/types.ts'

export interface RenderPose {
  id: string
  x: number
  z: number
  yaw: number
  steer: number
  speed: number
  slip: number
  color: string
  modelUrl: string
}

export interface RenderFrame {
  dt: number
  time: number
  track: Track
  poses: RenderPose[]
  mode: 'menu' | 'race'
}

export interface RenderContext {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  loadModel(url: string): Promise<Object3D>
}

export interface RenderLayer {
  id: string
  order: number
  setup(ctx: RenderContext): Promise<void> | void
  update(frame: RenderFrame): void
  dispose(): void
}

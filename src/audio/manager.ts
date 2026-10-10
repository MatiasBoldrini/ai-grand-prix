import { preferences } from '../game/preferences.ts'
import { createEngineVoice, type EngineVoice } from './engine-voice.ts'
import { listClips } from './registry.ts'
import type { AudioBus, AudioMode } from './types.ts'

export class AudioManager implements AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private voice: EngineVoice | null = null
  private buffers = new Map<string, AudioBuffer>()
  private failed: string[] = []
  private mode: AudioMode = 'quiet'
  private started = false

  async load(): Promise<void> {
    const context = this.ensure()
    await Promise.all(
      listClips().map(async (clip) => {
        try {
          const response = await fetch(clip.url)
          if (!response.ok) throw new Error(String(response.status))
          const audio = await context.decodeAudioData(await response.arrayBuffer())
          this.buffers.set(clip.id, audio)
        } catch {
          this.failed.push(clip.id)
        }
      }),
    )
    this.voice = createEngineVoice(context, this.master!, this.buffers.get('engine') ?? null)
    const music = this.buffers.get('music')
    if (music && this.musicGain) {
      const source = context.createBufferSource()
      source.buffer = music
      source.loop = true
      source.connect(this.musicGain)
      source.start()
      this.musicSource = source
    }
    this.applyVolume()
  }

  missing(): string[] {
    return [...this.failed]
  }

  resume(): void {
    const context = this.ensure()
    if (context.state === 'suspended') void context.resume()
    this.started = true
    this.applyVolume()
  }

  play(id: string): void {
    const context = this.ctx
    const master = this.master
    const buffer = this.buffers.get(id)
    if (!context || !master || !buffer || !this.started) return
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.value = id === 'crash' ? 0.45 : 0.32
    source.connect(gain)
    gain.connect(master)
    source.start()
  }

  setMode(mode: AudioMode): void {
    this.mode = mode
    this.applyVolume()
  }

  updateEngine(rpm: number, throttle: number, slip: number): void {
    this.voice?.update(rpm, throttle, slip, this.started && this.mode === 'race')
  }

  private ensure(): AudioContext {
    if (this.ctx && this.master && this.musicGain) return this.ctx
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)
    const musicGain = context.createGain()
    musicGain.gain.value = 0
    musicGain.connect(master)
    this.ctx = context
    this.master = master
    this.musicGain = musicGain
    return context
  }

  private applyVolume(): void {
    if (!this.master || !this.musicGain || !this.ctx || this.musicSource === undefined) return
    const master = preferences.masterVolume
    this.master.gain.setTargetAtTime(this.started ? master : 0, this.ctx.currentTime, 0.05)
    const music = !preferences.music
      ? 0
      : this.mode === 'race'
        ? 0.08
        : this.mode === 'menu'
          ? 0.22
          : 0
    this.musicGain.gain.setTargetAtTime(music, this.ctx.currentTime, 0.08)
  }
}

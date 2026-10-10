import { preferences } from '../game/preferences.ts'
import { createEngineVoice, type EngineVoice } from './engine-voice.ts'
import { listClips } from './registry.ts'
import type { AudioBus, AudioMode } from './types.ts'

export interface BedBuffer {
  sampleRate: number
  length: number
  numberOfChannels: number
  getChannelData(channel: number): Float32Array
}

const CHORDS: readonly (readonly [number, number, number])[] = [
  [110, 164.81, 220],
  [87.31, 130.81, 174.61],
  [98, 146.83, 196],
  [110, 164.81, 220],
]

/** Menu is loud enough to hear the tune. The race ducks it under the engine. */
export function musicLevel(mode: AudioMode, musicEnabled: boolean): number {
  if (!musicEnabled) return 0
  if (mode === 'race') return 0.075
  if (mode === 'menu') return 0.18
  return 0
}

/**
 * Four-second minor pad used when `music.ogg` fails to decode.
 * The first and last samples meet, so the buffer can loop.
 */
export function fillMusicBed(buffer: BedBuffer): void {
  const duration = buffer.length / buffer.sampleRate
  if (!(duration > 0) || buffer.numberOfChannels < 1) return
  const chordDur = duration / CHORDS.length
  const mono = new Float32Array(buffer.length)
  for (let i = 0; i < mono.length; i += 1) {
    const t = i / buffer.sampleRate
    let sample = 0
    for (let chordIndex = 0; chordIndex < CHORDS.length; chordIndex += 1) {
      const chord = CHORDS[chordIndex]
      if (!chord) continue
      const center = (chordIndex + 0.5) * chordDur
      const distance = Math.min(Math.abs(t - center), duration - Math.abs(t - center))
      const half = chordDur * 0.85
      if (distance >= half) continue
      const env = 0.5 + 0.5 * Math.cos((distance / half) * Math.PI)
      sample += Math.sin(2 * Math.PI * chord[0] * t) * env * 0.2
      sample += Math.sin(2 * Math.PI * chord[1] * t) * env * 0.14
      sample += Math.sin(2 * Math.PI * chord[2] * t) * env * 0.1
    }
    mono[i] = sample * (0.86 + 0.14 * Math.sin(2 * Math.PI * 2 * t))
  }
  const fade = Math.min(Math.floor(buffer.sampleRate * 0.02), Math.floor(mono.length / 4))
  for (let i = 0; i < fade; i += 1) {
    const mix = i / fade
    const end = mono.length - fade + i
    mono[end] = (mono[end] ?? 0) * (1 - mix) + (mono[i] ?? 0) * mix
  }
  if (mono.length > 0) mono[mono.length - 1] = mono[0] ?? 0
  let peak = 0
  for (let i = 0; i < mono.length; i += 1) peak = Math.max(peak, Math.abs(mono[i] ?? 0))
  const scale = peak > 0 ? 0.4 / peak : 0
  const delay = Math.round(buffer.sampleRate * 0.012)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    const offset = channel === 0 ? 0 : delay
    for (let i = 0; i < data.length; i += 1) {
      const index = (i - offset + mono.length) % mono.length
      data[i] = (mono[index] ?? 0) * scale
    }
  }
}

export class AudioManager implements AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicHighpass: BiquadFilterNode | null = null
  private musicLowpass: BiquadFilterNode | null = null
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
    this.voice = createEngineVoice(
      context,
      this.master!,
      this.buffers.get('engine') ?? null,
      this.buffers.get('screech') ?? null,
    )
    this.startMusic(context)
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
    const level = context.createGain()
    level.gain.value = id === 'crash' ? 0.45 : 0.32
    source.connect(level)
    level.connect(master)
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
    if (this.ctx && this.master && this.musicGain && this.musicHighpass && this.musicLowpass) {
      return this.ctx
    }
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 90
    highpass.Q.value = 0.7
    const presence = context.createBiquadFilter()
    presence.type = 'peaking'
    presence.frequency.value = 2400
    presence.Q.value = 0.9
    presence.gain.value = 2
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 12000
    lowpass.Q.value = 0.6
    const musicGain = context.createGain()
    musicGain.gain.value = 0
    highpass.connect(presence)
    presence.connect(lowpass)
    lowpass.connect(musicGain)
    musicGain.connect(master)
    this.ctx = context
    this.master = master
    this.musicGain = musicGain
    this.musicHighpass = highpass
    this.musicLowpass = lowpass
    return context
  }

  private startMusic(context: AudioContext): void {
    const input = this.musicHighpass
    if (!input || this.musicSource) return
    const recorded = this.buffers.get('music')
    const buffer = recorded ?? this.synthesizedBed(context)
    if (!buffer) return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(input)
    source.start()
    this.musicSource = source
  }

  private synthesizedBed(context: AudioContext): AudioBuffer | null {
    try {
      const buffer = context.createBuffer(2, context.sampleRate * 4, context.sampleRate)
      fillMusicBed(buffer)
      return buffer
    } catch {
      return null
    }
  }

  private applyVolume(): void {
    if (!this.master || !this.musicGain || !this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.started ? preferences.masterVolume : 0, now, 0.05)
    this.musicGain.gain.setTargetAtTime(musicLevel(this.mode, preferences.music), now, 0.12)
    const racing = this.mode === 'race'
    this.musicHighpass?.frequency.setTargetAtTime(racing ? 180 : 90, now, 0.2)
    this.musicLowpass?.frequency.setTargetAtTime(racing ? 5200 : 14000, now, 0.2)
  }
}

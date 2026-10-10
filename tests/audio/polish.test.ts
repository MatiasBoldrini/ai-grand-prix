import { afterEach, describe, expect, it } from 'vitest'
import { listClips } from '../../src/audio/registry.ts'
import {
  createEngineVoice,
  engineTone,
  motionGate,
  screechLevel,
  screechRate,
  scrubLevel,
  seamlessLoop,
} from '../../src/audio/engine-voice.ts'
import { AudioManager, fillMusicBed, musicLevel } from '../../src/audio/manager.ts'

class FakeParam {
  value: number
  constructor(value = 0) {
    this.value = value
  }
  setTargetAtTime(value: number): void {
    this.value = value
  }
}

class FakeNode {
  connect(): FakeNode {
    return this
  }
  start(): void {}
  stop(): void {}
}

class FakeBuffer {
  readonly channels: Float32Array[]
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel]
    if (!data) throw new Error(`missing channel ${channel}`)
    return data
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null
  loop = false
  playbackRate = new FakeParam(1)
}

class FakeOsc extends FakeNode {
  type = 'sine'
  frequency = new FakeParam(440)
}

class FakeGain extends FakeNode {
  gain = new FakeParam(0)
}

class FakeFilter extends FakeNode {
  type = 'lowpass'
  frequency = new FakeParam(350)
  Q = new FakeParam(1)
  gain = new FakeParam(0)
}

let failDecode = false

class FakeContext {
  sampleRate = 44100
  currentTime = 0
  state: AudioContextState = 'suspended'
  destination = new FakeNode()
  sources: FakeSource[] = []
  oscillators: FakeOsc[] = []
  gains: FakeGain[] = []

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }

  async decodeAudioData(): Promise<FakeBuffer> {
    if (failDecode) throw new Error('bad ogg')
    return new FakeBuffer(1, 4000, this.sampleRate)
  }

  createGain(): FakeGain {
    const node = new FakeGain()
    this.gains.push(node)
    return node
  }

  createBiquadFilter(): FakeFilter {
    return new FakeFilter()
  }

  createBufferSource(): FakeSource {
    const node = new FakeSource()
    this.sources.push(node)
    return node
  }

  createOscillator(): FakeOsc {
    const node = new FakeOsc()
    this.oscillators.push(node)
    return node
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate)
  }
}

const contexts: FakeContext[] = []
const OriginalAudioContext = globalThis.AudioContext
const originalFetch = globalThis.fetch

function installAudio(): void {
  contexts.length = 0
  class AudioContextShim extends FakeContext {
    constructor() {
      super()
      contexts.push(this)
    }
  }
  globalThis.AudioContext = AudioContextShim as unknown as typeof AudioContext
}

afterEach(() => {
  failDecode = false
  globalThis.AudioContext = OriginalAudioContext
  globalThis.fetch = originalFetch
})

describe('engine tone', () => {
  it('climbs inside a gear and drops on the upshift', () => {
    const low = engineTone(2800, 0.4, 1)
    const high = engineTone(4100, 0.4, 1)
    expect(low.gear).toBe(1)
    expect(high.gear).toBe(1)
    expect(high.rate).toBeGreaterThan(low.rate)
    expect(high.fundamental).toBeGreaterThan(low.fundamental)
    expect(high.filterHz).toBeGreaterThan(low.filterHz)

    const before = engineTone(4240, 0.6, 1)
    const after = engineTone(4500, 0.6, 1)
    expect(before.gear).toBe(1)
    expect(after.gear).toBe(2)
    expect(after.rate).toBeLessThan(before.rate - 0.25)
  })

  it('holds the gear through a small dip and gives it back on a real drop', () => {
    const held = engineTone(4500, 0.6, 1).gear
    expect(engineTone(4200, 0.6, held).gear).toBe(held)
    expect(engineTone(4000, 0.6, held).gear).toBe(held - 1)
  })

  it('opens the filter and the body when the throttle comes in', () => {
    const coast = engineTone(3600, 0, 1)
    const pull = engineTone(3600, 1, 1)
    expect(pull.filterHz).toBeGreaterThan(coast.filterHz)
    expect(pull.body).toBeGreaterThan(coast.body)
    expect(pull.harmonic).toBeGreaterThan(coast.harmonic)
    expect(pull.rate).toBeGreaterThan(coast.rate)
  })

  it('keeps every sweep inside a playable range', () => {
    for (let rpm = 0; rpm <= 9000; rpm += 50) {
      const tone = engineTone(rpm, rpm % 100 === 0 ? 1 : 0.2)
      expect(tone.gear).toBeGreaterThanOrEqual(0)
      expect(tone.gear).toBeLessThanOrEqual(3)
      expect(tone.rate).toBeGreaterThanOrEqual(0.7)
      expect(tone.rate).toBeLessThanOrEqual(1.32)
      expect(tone.filterHz).toBeLessThanOrEqual(4800)
      expect(tone.idle).toBeGreaterThanOrEqual(0)
      expect(tone.idle).toBeLessThanOrEqual(1)
      expect(Number.isFinite(tone.fundamental)).toBe(true)
    }
    const broken = engineTone(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)
    expect(broken.gear).toBe(0)
    expect(Number.isFinite(broken.rate)).toBe(true)
    expect(engineTone(900, 0).idle).toBeGreaterThan(engineTone(3000, 0).idle)
    expect(engineTone(900, 1).idle).toBe(0)
  })
})

describe('tire screech', () => {
  it('stays quiet until the tire is actually sliding', () => {
    expect(screechLevel(0)).toBe(0)
    expect(screechLevel(0.15)).toBe(0)
    expect(scrubLevel(0.05)).toBe(0)
    expect(screechLevel(0.5)).toBeGreaterThan(screechLevel(0.28))
    expect(scrubLevel(0.3)).toBeGreaterThan(scrubLevel(0.12))
    expect(screechLevel(3)).toBeLessThanOrEqual(0.42)
    expect(scrubLevel(3)).toBeLessThanOrEqual(0.14)
    expect(screechLevel(Number.NaN)).toBe(0)
    expect(screechRate(0.8)).toBeGreaterThan(screechRate(0))
    expect(screechRate(4)).toBeLessThanOrEqual(1.3)
  })

  it('does not scream at idle rpm', () => {
    expect(motionGate(900)).toBe(0)
    expect(motionGate(4000)).toBe(1)
    expect(motionGate(Number.NaN)).toBe(0)
  })

  it('joins a loop without a sample jump and keeps a tiny buffer as-is', () => {
    const ctx = new FakeContext()
    const buffer = ctx.createBuffer(1, 1000, 1000)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = (i % 50) / 50
    const looped = seamlessLoop(
      ctx as unknown as BaseAudioContext,
      buffer as unknown as AudioBuffer,
    )
    const out = looped.getChannelData(0)
    expect(out[out.length - 1]).toBeCloseTo(out[0] ?? 0, 5)
    expect(out).not.toBe(data)

    const tiny = ctx.createBuffer(1, 10, 1000)
    expect(seamlessLoop(ctx as unknown as BaseAudioContext, tiny as unknown as AudioBuffer)).toBe(
      tiny,
    )
  })
})

describe('music bed', () => {
  it('is audible in the menu, quieter in the race, and gone when muted or quiet', () => {
    expect(musicLevel('menu', true)).toBeGreaterThan(musicLevel('race', true))
    expect(musicLevel('race', true)).toBeGreaterThan(0)
    expect(musicLevel('quiet', true)).toBe(0)
    expect(musicLevel('menu', false)).toBe(0)
    expect(musicLevel('race', false)).toBe(0)
  })

  it('fills a looping pad when the music file is missing', () => {
    const channels = [new Float32Array(44100), new Float32Array(44100)]
    fillMusicBed({
      sampleRate: 44100,
      length: channels[0]!.length,
      numberOfChannels: 2,
      getChannelData: (channel) => {
        const data = channels[channel]
        if (!data) throw new Error(`missing channel ${channel}`)
        return data
      },
    })
    const left = channels[0]!
    let peak = 0
    let energy = 0
    for (let i = 0; i < left.length; i += 1) {
      const sample = left[i] ?? 0
      peak = Math.max(peak, Math.abs(sample))
      energy += sample * sample
    }
    expect(peak).toBeGreaterThan(0.2)
    expect(peak).toBeLessThanOrEqual(0.41)
    expect(Math.sqrt(energy / left.length)).toBeGreaterThan(0.04)
    expect(Math.abs((left[0] ?? 0) - (left[left.length - 1] ?? 0))).toBeLessThan(0.08)
    let width = 0
    for (let i = 0; i < left.length; i += 20) {
      width += Math.abs((left[i] ?? 0) - (channels[1]?.[i] ?? 0))
    }
    expect(width).toBeGreaterThan(1)
    expect(() =>
      fillMusicBed({
        sampleRate: 44100,
        length: 0,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(0),
      }),
    ).not.toThrow()
  })
})

describe('audio bus', () => {
  it('lists the screech clip next to the others', () => {
    expect(listClips().map((clip) => clip.id)).toContain('screech')
    expect(listClips().find((clip) => clip.id === 'screech')?.url).toBe('/assets/audio/screech.ogg')
  })

  it('falls back to synthesis when every file is missing', async () => {
    installAudio()
    globalThis.fetch = async () => new Response(null, { status: 404 })
    const audio = new AudioManager()
    await audio.load()
    expect(audio.missing().sort()).toEqual(
      listClips()
        .map((clip) => clip.id)
        .sort(),
    )
    const ctx = contexts[0]
    expect(ctx).toBeDefined()
    expect(ctx!.oscillators.length).toBeGreaterThanOrEqual(4)
    expect(ctx!.sources.some((source) => source.loop)).toBe(true)
    audio.resume()
    audio.setMode('race')
    audio.updateEngine(4200, 0.8, 0.6)
    audio.setMode('menu')
    audio.play('crash')
    audio.updateEngine(Number.NaN, Number.NaN, Number.NaN)
  })

  it('keeps the bus methods and pitches a decoded engine', async () => {
    installAudio()
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    const audio = new AudioManager()
    expect(typeof audio.resume).toBe('function')
    expect(typeof audio.play).toBe('function')
    expect(typeof audio.setMode).toBe('function')
    expect(typeof audio.updateEngine).toBe('function')
    expect(typeof audio.missing).toBe('function')
    await audio.load()
    expect(audio.missing()).toEqual([])
    const ctx = contexts[0]
    expect(ctx).toBeDefined()
    audio.resume()
    expect(ctx!.state).toBe('running')
    audio.setMode('race')
    audio.updateEngine(1800, 0.3, 0)
    const low = ctx!.sources[0]?.playbackRate.value ?? 0
    audio.updateEngine(2400, 0.3, 0)
    const high = ctx!.sources[0]?.playbackRate.value ?? 0
    expect(high).toBeGreaterThan(low)
    expect(ctx!.sources[1]?.playbackRate.value).toBeCloseTo(high * 2, 5)
    audio.play('click')
    expect(ctx!.sources.some((source) => source.loop && source.buffer)).toBe(true)
  })

  it('opens the screech from slip and ignores a second close', () => {
    const ctx = new FakeContext()
    const buffer = ctx.createBuffer(1, 4000, 44100)
    const voice = createEngineVoice(
      ctx as unknown as AudioContext,
      ctx.destination as unknown as AudioNode,
      buffer as unknown as AudioBuffer,
      buffer as unknown as AudioBuffer,
    )
    voice.update(5000, 1, 0, true)
    const before = ctx.gains.map((node) => node.gain.value)
    voice.update(5000, 1, 0.85, true)
    const after = ctx.gains.map((node) => node.gain.value)
    expect(after.some((value, index) => value > (before[index] ?? 0) + 0.05)).toBe(true)
    voice.update(5000, 1, 0.85, false)
    voice.close()
    voice.close()
    voice.update(7000, 1, 1, true)
  })

  it('swallows a decode error and still builds a voice', async () => {
    installAudio()
    failDecode = true
    globalThis.fetch = async () => new Response(new Uint8Array([1]), { status: 200 })
    const audio = new AudioManager()
    await audio.load()
    expect(audio.missing().length).toBe(listClips().length)
    audio.resume()
    audio.setMode('race')
    audio.updateEngine(3000, 0.5, 0.4)
    expect(contexts[0]?.oscillators.length).toBeGreaterThanOrEqual(4)
  })
})

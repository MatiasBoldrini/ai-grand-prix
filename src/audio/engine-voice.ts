/** Engine loop pitched by RPM, plus a tire screech. A missing sample falls back to synthesis. */

export interface EngineVoice {
  update(rpm: number, throttle: number, slip: number, audible: boolean): void
  close(): void
}

export interface EngineTone {
  gear: number
  /** Sample playback rate. Drops at each upshift. */
  rate: number
  /** Oscillator fundamental, Hz, used only when the engine sample is missing. */
  fundamental: number
  filterHz: number
  body: number
  harmonic: number
  /** 0..1 idle lump. Gone once the car is pulling. */
  idle: number
}

interface GearBand {
  lo: number
  hi: number
}

/** Covers the rpm() span in the game loop (about 900..8100) in four ratios. */
const GEARS: readonly GearBand[] = [
  { lo: 900, hi: 2600 },
  { lo: 2600, hi: 4300 },
  { lo: 4300, hi: 6000 },
  { lo: 6000, hi: 8600 },
]

const HYSTERESIS = 140

export function engineTone(rpm: number, throttle: number, heldGear = 0): EngineTone {
  const safeRpm = finite(rpm)
  const load = clamp(finite(throttle), 0, 1)
  const gear = pickGear(safeRpm, heldGear)
  const band = gearBand(gear)
  const span = band.hi - band.lo
  const along = span <= 0 ? 0 : clamp((safeRpm - band.lo) / span, 0, 1)
  const shaped = along * along * (3 - 2 * along)
  return {
    gear,
    rate: 0.7 + shaped * 0.55 + load * 0.06,
    fundamental: 58 + shaped * 54 + load * 9,
    filterHz: Math.min(4800, 420 + shaped * 900 + load * 1900),
    body: 0.09 + load * 0.15 + shaped * 0.05,
    harmonic: 0.012 + shaped * 0.05 + load * 0.028,
    idle: load < 0.2 ? clamp((1400 - safeRpm) / 700, 0, 1) : 0,
  }
}

/** Tire scream. Slip is a rear slip angle in radians; small angles stay quiet. */
export function screechLevel(slip: number): number {
  const amount = finite(slip)
  const onset = 0.2
  if (amount <= onset) return 0
  const t = Math.min(1, (amount - onset) / 0.38)
  return t * (0.5 + 0.5 * t) * 0.42
}

/** Low tire scrub that starts before the scream. */
export function scrubLevel(slip: number): number {
  const amount = finite(slip)
  const onset = 0.1
  if (amount <= onset) return 0
  return Math.min(0.14, (amount - onset) * 0.36)
}

/** Standing still should not shriek. Full cry once the car is actually moving. */
export function motionGate(rpm: number): number {
  return clamp((finite(rpm) - 1000) / 1500, 0, 1)
}

export function screechRate(slip: number): number {
  return 0.92 + Math.min(0.38, Math.max(0, finite(slip) - 0.12) * 0.7)
}

export function seamlessLoop(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const fade = Math.min(Math.floor(buffer.sampleRate * 0.03), Math.floor(buffer.length / 4))
  if (fade < 8 || buffer.numberOfChannels < 1) return buffer
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const src = buffer.getChannelData(channel)
    const dst = out.getChannelData(channel)
    dst.set(src)
    for (let i = 0; i < fade; i += 1) {
      const mix = i / fade
      const end = src.length - fade + i
      dst[end] = (src[end] ?? 0) * (1 - mix) + (src[i] ?? 0) * mix
    }
    dst[dst.length - 1] = dst[0] ?? 0
  }
  return out
}

interface Partial {
  osc: OscillatorNode
  ratio: number
}

export function createEngineVoice(
  ctx: AudioContext,
  destination: AudioNode,
  engineBuffer: AudioBuffer | null,
  screechBuffer: AudioBuffer | null = null,
): EngineVoice {
  const filter = biquad(ctx, 'lowpass', 700, 0.7)
  const bodyGain = gain(ctx, 0)
  filter.connect(bodyGain)
  bodyGain.connect(destination)

  const stops: Array<{ stop: () => void }> = []
  let bodySource: AudioBufferSourceNode | null = null
  let harmSource: AudioBufferSourceNode | null = null
  let harmGain: GainNode | null = null
  const partials: Partial[] = []

  if (engineBuffer) {
    bodySource = loopingSource(ctx, engineBuffer, 0.74, stops)
    bodySource.connect(filter)
    const harmFilter = biquad(ctx, 'bandpass', 1800, 0.8)
    harmGain = gain(ctx, 0)
    harmSource = loopingSource(ctx, engineBuffer, 1.48, stops)
    harmSource.connect(harmFilter)
    harmFilter.connect(harmGain)
    harmGain.connect(destination)
  } else {
    partials.push(
      { osc: oscillator(ctx, 'sine', 70, filter, 0.55, stops), ratio: 1 },
      { osc: oscillator(ctx, 'sawtooth', 140, filter, 0.22, stops), ratio: 2 },
      { osc: oscillator(ctx, 'triangle', 280, filter, 0.1, stops), ratio: 4 },
    )
  }

  const screech = normalizePeak(
    ctx,
    screechBuffer ? seamlessLoop(ctx, screechBuffer) : noiseBuffer(ctx),
    0.8,
  )
  const screechSource = loopingSource(ctx, screech, 1, stops)
  const screamFilter = biquad(ctx, 'bandpass', 1900, 0.65)
  const screamGain = gain(ctx, 0)
  const scrubFilter = biquad(ctx, 'lowpass', 480, 0.7)
  const scrubGain = gain(ctx, 0)
  screechSource.connect(screamFilter)
  screamFilter.connect(screamGain)
  screamGain.connect(destination)
  screechSource.connect(scrubFilter)
  scrubFilter.connect(scrubGain)
  scrubGain.connect(destination)

  const lfo = track(stops, ctx.createOscillator())
  lfo.type = 'sine'
  lfo.frequency.value = 6.4
  const wobble = gain(ctx, 0)
  lfo.connect(wobble)
  const wobbleTarget = bodySource?.playbackRate ?? partials[0]?.osc.frequency
  if (wobbleTarget) wobble.connect(wobbleTarget)
  const flutter = gain(ctx, 0)
  lfo.connect(flutter)
  flutter.connect(bodyGain.gain)
  lfo.start()

  let gear = 0
  let bodyNow = 0
  let screamNow = 0
  let closed = false

  return {
    update(rpm, throttle, slip, audible) {
      if (closed) return
      const now = ctx.currentTime
      const tone = engineTone(rpm, throttle, gear)
      gear = tone.gear
      const level = audible ? tone.body : 0
      const bodyTau = level >= bodyNow ? 0.035 : 0.12
      bodyNow = level

      bodySource?.playbackRate.setTargetAtTime(tone.rate, now, 0.045)
      harmSource?.playbackRate.setTargetAtTime(tone.rate * 2, now, 0.045)
      harmGain?.gain.setTargetAtTime(audible ? tone.harmonic : 0, now, 0.05)
      for (const partial of partials) {
        partial.osc.frequency.setTargetAtTime(tone.fundamental * partial.ratio, now, 0.045)
      }
      filter.frequency.setTargetAtTime(tone.filterHz, now, 0.06)
      bodyGain.gain.setTargetAtTime(level, now, bodyTau)
      wobble.gain.setTargetAtTime(audible ? tone.idle * (bodySource ? 0.016 : 5) : 0, now, 0.08)
      flutter.gain.setTargetAtTime(audible ? tone.idle * 0.025 : 0, now, 0.08)

      const gate = audible ? motionGate(rpm) : 0
      const scream = screechLevel(slip) * gate
      const screamTau = scream >= screamNow ? 0.02 : 0.09
      screamNow = scream
      screamGain.gain.setTargetAtTime(scream, now, screamTau)
      scrubGain.gain.setTargetAtTime(scrubLevel(slip) * gate, now, 0.05)
      screechSource.playbackRate.setTargetAtTime(screechRate(slip), now, 0.04)
    },
    close() {
      if (closed) return
      closed = true
      for (const node of stops) node.stop()
    },
  }
}

function loopingSource(
  ctx: AudioContext,
  buffer: AudioBuffer,
  rate: number,
  stops: Array<{ stop: () => void }>,
): AudioBufferSourceNode {
  const source = track(stops, ctx.createBufferSource())
  source.buffer = buffer
  source.loop = true
  source.playbackRate.value = rate
  source.start()
  return source
}

function oscillator(
  ctx: AudioContext,
  type: OscillatorType,
  frequency: number,
  destination: AudioNode,
  level: number,
  stops: Array<{ stop: () => void }>,
): OscillatorNode {
  const osc = track(stops, ctx.createOscillator())
  osc.type = type
  osc.frequency.value = frequency
  const amp = gain(ctx, level)
  osc.connect(amp)
  amp.connect(destination)
  osc.start()
  return osc
}

function normalizePeak(ctx: BaseAudioContext, buffer: AudioBuffer, target: number): AudioBuffer {
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] ?? 0))
  }
  if (peak < 1e-4 || Math.abs(peak - target) < 0.04) return buffer
  const scale = target / peak
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const src = buffer.getChannelData(channel)
    const dst = out.getChannelData(channel)
    for (let i = 0; i < dst.length; i += 1) dst[i] = (src[i] ?? 0) * scale
  }
  return out
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let brown = 0
  for (let i = 0; i < data.length; i += 1) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = brown
  }
  let peak = 0
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] ?? 0))
  const scale = peak > 0 ? 0.8 / peak : 0
  for (let i = 0; i < data.length; i += 1) data[i] = (data[i] ?? 0) * scale
  return seamlessLoop(ctx, buffer)
}

function biquad(
  ctx: AudioContext,
  type: BiquadFilterType,
  frequency: number,
  q: number,
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  return filter
}

function gain(ctx: AudioContext, value: number): GainNode {
  const node = ctx.createGain()
  node.gain.value = value
  return node
}

function track<T extends { stop: () => void }>(stops: Array<{ stop: () => void }>, node: T): T {
  stops.push(node)
  return node
}

function gearBand(index: number): GearBand {
  return GEARS[index] ?? { lo: 900, hi: 2600 }
}

function pickGear(rpm: number, held: number): number {
  const start = Number.isFinite(held) ? Math.floor(held) : 0
  let gear = clamp(start, 0, GEARS.length - 1)
  while (gear < GEARS.length - 1 && rpm >= (GEARS[gear]?.hi ?? 0) + HYSTERESIS) gear += 1
  while (gear > 0 && rpm < (GEARS[gear]?.lo ?? 0) - HYSTERESIS) gear -= 1
  return gear
}

function finite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

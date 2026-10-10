/** Engine loop pitched by RPM, plus a procedural tire screech. No sample is required. */
export interface EngineVoice {
  update(rpm: number, throttle: number, slip: number, audible: boolean): void
  close(): void
}

export function createEngineVoice(
  ctx: AudioContext,
  destination: AudioNode,
  engineBuffer: AudioBuffer | null,
): EngineVoice {
  const engineGain = ctx.createGain()
  engineGain.gain.value = 0
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  filter.connect(engineGain)
  engineGain.connect(destination)

  let engineSource: AudioBufferSourceNode | OscillatorNode
  if (engineBuffer) {
    const source = ctx.createBufferSource()
    source.buffer = engineBuffer
    source.loop = true
    source.playbackRate.value = 0.7
    source.connect(filter)
    source.start()
    engineSource = source
  } else {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 70
    osc.connect(filter)
    osc.start()
    engineSource = osc
  }

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx)
  noise.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1400
  band.Q.value = 0.7
  const screechGain = ctx.createGain()
  screechGain.gain.value = 0
  noise.connect(band)
  band.connect(screechGain)
  screechGain.connect(destination)
  noise.start()

  return {
    update(rpm, throttle, slip, audible) {
      const now = ctx.currentTime
      const rate = 0.45 + Math.min(1.7, Math.max(0, rpm) / 7000)
      if (engineSource instanceof AudioBufferSourceNode) {
        engineSource.playbackRate.setTargetAtTime(rate, now, 0.05)
      } else {
        engineSource.frequency.setTargetAtTime(40 + rpm * 0.035, now, 0.05)
      }
      filter.frequency.setTargetAtTime(500 + throttle * 1400 + rpm * 0.15, now, 0.05)
      const engineLevel = audible ? 0.08 + throttle * 0.16 + Math.min(0.08, rpm / 40000) : 0
      engineGain.gain.setTargetAtTime(engineLevel, now, 0.04)
      const screech = audible ? Math.min(0.28, Math.max(0, slip - 0.22) * 0.7) : 0
      screechGain.gain.setTargetAtTime(screech, now, 0.03)
    },
    close() {
      engineSource.stop()
      noise.stop()
    },
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

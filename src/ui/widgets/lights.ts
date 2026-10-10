import { AudioManager } from '../../audio/manager.ts'
import type { AudioBus } from '../../audio/types.ts'
import { readStartLights } from '../../race/hooks/lights.ts'
import type { LightsLabel } from '../../race/hooks/lights.ts'
import { el } from '../controls.ts'
import type { HudWidget } from '../types.ts'

/**
 * The race hook cannot play audio, and a widget is not given the bus.
 * Remember the live `AudioManager` the frame loop already drives, then
 * beep through it. `click` is each red lamp. `confirm` is lights-out.
 */
let bus: AudioBus | null = null

installBusCapture()

function installBusCapture(): void {
  const updateEngine = AudioManager.prototype.updateEngine
  if (updateEngine.name === 'rememberBus') return
  AudioManager.prototype.updateEngine = function rememberBus(
    this: AudioManager,
    rpm: number,
    throttle: number,
    slip: number,
  ): void {
    holdBus(this)
    updateEngine.call(this, rpm, throttle, slip)
  }
}

function holdBus(manager: AudioBus): void {
  bus = manager
}

const STYLE_ID = 'agp-lights-style'

const LIGHTS_CSS = `
.agp-lights {
  position: fixed;
  top: 156px;
  left: 50%;
  z-index: 4;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 0;
  pointer-events: none;
}

.agp-lights[hidden] {
  display: none;
}

.agp-lights-row {
  display: flex;
  gap: 18px;
  padding: 14px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-overlay);
}

.agp-light {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  background: var(--surface-3);
  box-shadow: inset 0 0 0 2px var(--line-strong);
}

.agp-light.is-on {
  background: var(--danger);
  box-shadow:
    inset 0 0 0 2px var(--danger),
    0 0 16px var(--danger);
}

.agp-lights-count {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 64px;
  font-weight: var(--weight-semibold);
  line-height: 1;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}

.agp-lights[data-phase='go'] .agp-lights-count {
  color: var(--accent);
}
`

const SPOKEN: Record<Exclude<LightsLabel, ''>, string> = {
  '3': 'Tres',
  '2': 'Dos',
  '1': 'Uno',
  '¡ya!': 'Ya',
}

export function clipForLights(label: LightsLabel): 'click' | 'confirm' | null {
  if (label === '3' || label === '2' || label === '1') return 'click'
  if (label === '¡ya!') return 'confirm'
  return null
}

export function lightsAnnouncement(label: LightsLabel): string {
  if (label === '') return ''
  return SPOKEN[label]
}

export const widget: HudWidget = {
  id: 'lights',
  mount(parent) {
    acquireStyle()
    const root = el('div', 'agp-lights')
    root.setAttribute('data-widget', 'lights')
    root.setAttribute('data-phase', 'off')
    root.setAttribute('role', 'status')
    root.setAttribute('aria-live', 'polite')
    root.hidden = true

    const row = el('div', 'agp-lights-row')
    row.setAttribute('aria-hidden', 'true')
    const lamps = [1, 2, 3].map((index) => {
      const lamp = el('span', 'agp-light')
      lamp.setAttribute('data-light', String(index))
      return lamp
    })
    row.append(...lamps)

    const count = el('p', 'agp-lights-count')
    root.append(row, count)
    parent.append(root)

    let heard = 0

    return {
      update() {
        const lights = readStartLights()
        const showing = lights.label !== ''
        root.hidden = !showing
        root.setAttribute('data-phase', phaseOf(lights.label))
        root.setAttribute('data-lit', String(lights.lit))
        count.textContent = lights.label
        lamps.forEach((lamp, index) => {
          lamp.className = index < lights.lit ? 'agp-light is-on' : 'agp-light'
        })
        if (lights.cue !== heard) {
          const clip = clipForLights(lights.label)
          heard = lights.cue
          if (clip) bus?.play(clip)
        }
      },
      unmount() {
        root.remove()
        releaseStyle()
      },
    }
  },
}

function phaseOf(label: LightsLabel): string {
  if (label === '¡ya!') return 'go'
  if (label === '') return 'off'
  return label
}

let styleUsers = 0

function acquireStyle(): void {
  styleUsers += 1
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  style.textContent = LIGHTS_CSS
}

function releaseStyle(): void {
  styleUsers = Math.max(0, styleUsers - 1)
  if (styleUsers > 0) return
  document.getElementById(STYLE_ID)?.remove()
}

import {
  DEFAULT_PIXEL_CAP,
  LOOK_SENS_MAX,
  LOOK_SENS_MIN,
  PIXEL_CAP_MAX,
  PIXEL_CAP_MIN,
  onPreferences,
  preferences,
  updatePreferences,
} from '../../game/preferences.ts'
import { button, el } from '../controls.ts'
import type { ScreenContext, ScreenModule } from '../types.ts'

const VOLUME_STEP = 5
const LOOK_STEP = 10
const LOOK_PERCENT_MIN = Math.round(LOOK_SENS_MIN * 100)
const LOOK_PERCENT_MAX = Math.round(LOOK_SENS_MAX * 100)

const VOLUME_KEYS = new Set([
  'ArrowRight',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

const QUALITY = [
  {
    id: 'liviana',
    cap: PIXEL_CAP_MIN,
    label: 'Liviana',
    detail: 'Elegila si la imagen se traba.',
  },
  {
    id: 'balanceada',
    cap: DEFAULT_PIXEL_CAP,
    label: 'Balanceada',
    detail: 'Viene así. Apunta a 60 fps en una integrada.',
  },
  {
    id: 'nitida',
    cap: PIXEL_CAP_MAX,
    label: 'Nítida',
    detail: 'Más fina. Se nota en una retina y pide más.',
  },
] as const

export const screen: ScreenModule = {
  id: 'settings',
  menu: { label: 'Ajustes', variant: 'ghost', order: 20 },
  mount(root, ctx) {
    const panel = el('main', 'panel')
    // A hair under the shared 16px gap so the phone sheet fits without scrolling.
    panel.style.gap = '14px'
    const volumeValue = el('b', undefined, percentLabel(preferences.masterVolume))
    const volumeReadout = el('div', 'readout')
    volumeReadout.append(volumeValue)
    const volumeHead = el('div', 'hud-row')
    volumeHead.style.alignItems = 'baseline'
    volumeHead.append(el('h2', undefined, 'Volumen'), volumeReadout)

    const slider = mountVolume(ctx, volumeValue)
    const music = mountMusic(ctx)
    const quality = mountQuality(ctx)
    const lookValue = el('b', undefined, lookLabel(preferences.lookSensitivity))
    const lookReadout = el('div', 'readout')
    lookReadout.append(lookValue)
    const lookHead = el('div', 'hud-row')
    lookHead.style.alignItems = 'baseline'
    lookHead.append(el('h2', undefined, 'Mirada'), lookReadout)
    const look = mountLook(ctx, lookValue)

    panel.append(
      el('h1', undefined, 'Ajustes'),
      el('p', undefined, 'Estos ajustes quedan para la próxima vez.'),
      volumeHead,
      slider.root,
      el('p', 'hint', 'Arrastrá la barra o movela con las flechas, de a 5.'),
      music.row,
      el('p', 'hint', 'La dejás sonando en el menú y baja en la carrera.'),
      el('h2', undefined, 'Calidad'),
      quality.field,
      quality.detail,
      lookHead,
      look.root,
      el(
        'p',
        'hint',
        'Hacé clic en la pista para mirar alrededor del auto. Si el mouse queda quieto, o acelerás fuerte, la cámara vuelve atrás. Escape suelta el cursor y pausa.',
      ),
      button('Listo', 'primary', () => {
        ctx.resumeAudio()
        ctx.play('click')
        ctx.go('menu')
      }),
    )
    root.append(panel)

    const stop = onPreferences(() => {
      if (slider.dragging() || look.dragging()) return
      slider.paint()
      music.paint()
      quality.paint()
      look.paint()
    })
    const snapped = snapPercent(preferences.masterVolume)
    const preset = qualityFor(preferences.pixelRatioCap)
    const lookSnapped = lookPercent(preferences.lookSensitivity)
    const volumeDrift = Math.round(preferences.masterVolume * 100) !== snapped
    const qualityDrift = preset.cap !== preferences.pixelRatioCap
    const lookDrift = Math.round(preferences.lookSensitivity * 100) !== lookSnapped
    if (volumeDrift || qualityDrift || lookDrift) {
      updatePreferences({
        ...(volumeDrift ? { masterVolume: snapped / 100 } : {}),
        ...(qualityDrift ? { pixelRatioCap: preset.cap } : {}),
        ...(lookDrift ? { lookSensitivity: lookSnapped / 100 } : {}),
      })
    } else {
      slider.paint()
      music.paint()
      quality.paint()
      look.paint()
    }
    ctx.resumeAudio()

    return {
      unmount() {
        stop()
        panel.remove()
      },
    }
  },
}

function mountVolume(
  ctx: ScreenContext,
  volumeValue: HTMLElement,
): { root: HTMLDivElement; paint: () => void; dragging: () => boolean } {
  const slider = el('div', 'choice')
  slider.tabIndex = 0
  slider.setAttribute('role', 'slider')
  slider.setAttribute('aria-label', 'Volumen')
  slider.setAttribute('aria-valuemin', '0')
  slider.setAttribute('aria-valuemax', '100')
  slider.setAttribute('aria-orientation', 'horizontal')
  slider.style.padding = '0 12px'
  slider.style.touchAction = 'none'
  slider.style.userSelect = 'none'

  const meter = el('div', 'meter')
  meter.setAttribute('aria-hidden', 'true')
  meter.style.width = '100%'
  meter.style.height = '12px'
  meter.style.margin = '0'
  meter.style.pointerEvents = 'none'
  const fill = el('i')
  meter.append(fill)
  slider.append(meter)

  let dragging = false
  let preview = snapPercent(preferences.masterVolume)

  const show = (percent: number) => {
    preview = percent
    volumeValue.textContent = `${percent}%`
    fill.style.width = `${percent}%`
    slider.setAttribute('aria-valuenow', String(percent))
    slider.setAttribute('aria-valuetext', `${percent} por ciento`)
  }

  const commit = (volume: number, audible: boolean) => {
    const percent = snapPercent(volume)
    show(percent)
    if (snapPercent(preferences.masterVolume) !== percent) {
      updatePreferences({ masterVolume: percent / 100 })
    }
    if (audible) {
      ctx.resumeAudio()
      ctx.play('click')
    }
  }

  const volumeAt = (clientX: number) => {
    const rect = meter.getBoundingClientRect()
    if (rect.width <= 0) return preferences.masterVolume
    return (clientX - rect.left) / rect.width
  }

  slider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    dragging = true
    slider.setPointerCapture(event.pointerId)
    slider.focus({ preventScroll: true })
    ctx.resumeAudio()
    show(snapPercent(volumeAt(event.clientX)))
  })
  slider.addEventListener('pointermove', (event) => {
    if (!dragging) return
    show(snapPercent(volumeAt(event.clientX)))
  })
  const finishDrag = (audible: boolean) => {
    if (!dragging) return
    dragging = false
    commit(preview / 100, audible)
  }

  slider.addEventListener('pointerup', (event) => {
    if (!dragging) return
    show(snapPercent(volumeAt(event.clientX)))
    finishDrag(true)
  })
  slider.addEventListener('pointercancel', () => finishDrag(false))
  slider.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const current = snapPercent(preferences.masterVolume)
    const next = steppedPercent(current, event.key)
    if (next === null) return
    event.preventDefault()
    commit(next / 100, false)
  })
  slider.addEventListener('keyup', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!VOLUME_KEYS.has(event.key)) return
    ctx.resumeAudio()
    ctx.play('click')
  })
  slider.addEventListener('focus', () => {
    slider.style.outline = slider.matches(':focus-visible')
      ? 'var(--line-focus) solid var(--ring)'
      : ''
    slider.style.outlineOffset = 'var(--focus-offset)'
  })
  slider.addEventListener('blur', () => {
    slider.style.outline = ''
    finishDrag(false)
  })

  return {
    root: slider,
    dragging: () => dragging,
    paint() {
      show(snapPercent(preferences.masterVolume))
    },
  }
}

function mountMusic(ctx: ScreenContext): { row: HTMLLabelElement; paint: () => void } {
  const row = el('label', 'choice')
  const input = el('input')
  input.type = 'checkbox'
  input.checked = preferences.music
  input.addEventListener('change', () => {
    updatePreferences({ music: input.checked })
    ctx.resumeAudio()
    ctx.play('click')
  })
  row.append(input, el('span', undefined, 'Música de fondo'))
  return {
    row,
    paint() {
      input.checked = preferences.music
    },
  }
}

function mountQuality(ctx: ScreenContext): {
  field: HTMLFieldSetElement
  detail: HTMLParagraphElement
  paint: () => void
} {
  const field = el('fieldset', 'choices')
  field.setAttribute('aria-label', 'Calidad de imagen')
  const detail = el('p')
  const inputs = new Map<string, HTMLInputElement>()
  const selected = qualityFor(preferences.pixelRatioCap)

  for (const option of QUALITY) {
    const input = el('input')
    input.type = 'radio'
    input.name = 'image-quality'
    input.value = option.id
    input.checked = option.id === selected.id
    input.addEventListener('change', () => {
      if (!input.checked) return
      updatePreferences({ pixelRatioCap: option.cap })
      ctx.resumeAudio()
      ctx.play('click')
    })
    const row = el('label', 'choice')
    row.append(input, el('span', undefined, option.label))
    field.append(row)
    inputs.set(option.id, input)
  }

  return {
    field,
    detail,
    paint() {
      const next = qualityFor(preferences.pixelRatioCap)
      detail.textContent = next.detail
      const input = inputs.get(next.id)
      if (input) input.checked = true
    },
  }
}

function mountLook(
  ctx: ScreenContext,
  lookValue: HTMLElement,
): { root: HTMLDivElement; paint: () => void; dragging: () => boolean } {
  const slider = el('div', 'choice')
  slider.tabIndex = 0
  slider.setAttribute('role', 'slider')
  slider.setAttribute('aria-label', 'Sensibilidad del mouse')
  slider.setAttribute('aria-valuemin', String(LOOK_PERCENT_MIN))
  slider.setAttribute('aria-valuemax', String(LOOK_PERCENT_MAX))
  slider.setAttribute('aria-orientation', 'horizontal')
  slider.style.padding = '0 12px'
  slider.style.touchAction = 'none'
  slider.style.userSelect = 'none'

  const meter = el('div', 'meter')
  meter.setAttribute('aria-hidden', 'true')
  meter.style.width = '100%'
  meter.style.height = '12px'
  meter.style.margin = '0'
  meter.style.pointerEvents = 'none'
  const fill = el('i')
  meter.append(fill)
  slider.append(meter)

  let dragging = false
  let preview = lookPercent(preferences.lookSensitivity)

  const show = (percent: number) => {
    preview = percent
    lookValue.textContent = lookReadoutText(percent)
    const span = LOOK_PERCENT_MAX - LOOK_PERCENT_MIN
    fill.style.width = `${((percent - LOOK_PERCENT_MIN) / span) * 100}%`
    slider.setAttribute('aria-valuenow', String(percent))
    slider.setAttribute('aria-valuetext', `${(percent / 100).toFixed(1)} veces`)
  }

  const commit = (percent: number, audible: boolean) => {
    const next = clampLookPercent(percent)
    show(next)
    if (lookPercent(preferences.lookSensitivity) !== next) {
      updatePreferences({ lookSensitivity: next / 100 })
    }
    if (audible) {
      ctx.resumeAudio()
      ctx.play('click')
    }
  }

  const percentAt = (clientX: number) => {
    const rect = meter.getBoundingClientRect()
    if (rect.width <= 0) return lookPercent(preferences.lookSensitivity)
    const t = (clientX - rect.left) / rect.width
    return LOOK_PERCENT_MIN + t * (LOOK_PERCENT_MAX - LOOK_PERCENT_MIN)
  }

  slider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    dragging = true
    slider.setPointerCapture(event.pointerId)
    slider.focus({ preventScroll: true })
    ctx.resumeAudio()
    show(clampLookPercent(percentAt(event.clientX)))
  })
  slider.addEventListener('pointermove', (event) => {
    if (!dragging) return
    show(clampLookPercent(percentAt(event.clientX)))
  })
  const finishDrag = (audible: boolean) => {
    if (!dragging) return
    dragging = false
    commit(preview, audible)
  }
  slider.addEventListener('pointerup', (event) => {
    if (!dragging) return
    show(clampLookPercent(percentAt(event.clientX)))
    finishDrag(true)
  })
  slider.addEventListener('pointercancel', () => finishDrag(false))
  slider.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const current = lookPercent(preferences.lookSensitivity)
    const next = steppedLook(current, event.key)
    if (next === null) return
    event.preventDefault()
    commit(next, false)
  })
  slider.addEventListener('keyup', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!VOLUME_KEYS.has(event.key)) return
    ctx.resumeAudio()
    ctx.play('click')
  })
  slider.addEventListener('focus', () => {
    slider.style.outline = slider.matches(':focus-visible')
      ? 'var(--line-focus) solid var(--ring)'
      : ''
    slider.style.outlineOffset = 'var(--focus-offset)'
  })
  slider.addEventListener('blur', () => {
    slider.style.outline = ''
    finishDrag(false)
  })

  return {
    root: slider,
    dragging: () => dragging,
    paint() {
      show(lookPercent(preferences.lookSensitivity))
    },
  }
}

export function lookPercent(sensitivity: number): number {
  if (!Number.isFinite(sensitivity)) return lookPercent(preferences.lookSensitivity)
  return clampLookPercent(Math.round(sensitivity * 100))
}

export function sensitivityFromPercent(percent: number): number {
  return clampLookPercent(percent) / 100
}

function clampLookPercent(percent: number): number {
  if (!Number.isFinite(percent)) return lookPercent(preferences.lookSensitivity)
  const stepped = Math.round(percent / LOOK_STEP) * LOOK_STEP
  return Math.min(LOOK_PERCENT_MAX, Math.max(LOOK_PERCENT_MIN, stepped))
}

function steppedLook(current: number, key: string): number | null {
  if (key === 'ArrowRight' || key === 'ArrowUp') return current + LOOK_STEP
  if (key === 'ArrowLeft' || key === 'ArrowDown') return current - LOOK_STEP
  if (key === 'PageUp') return current + LOOK_STEP * 2
  if (key === 'PageDown') return current - LOOK_STEP * 2
  if (key === 'Home') return LOOK_PERCENT_MIN
  if (key === 'End') return LOOK_PERCENT_MAX
  return null
}

function lookReadoutText(percent: number): string {
  return `${(percent / 100).toFixed(1)}×`
}

function lookLabel(sensitivity: number): string {
  return lookReadoutText(lookPercent(sensitivity))
}

function qualityFor(cap: number): (typeof QUALITY)[number] {
  let best: (typeof QUALITY)[number] | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of QUALITY) {
    const distance = Math.abs(option.cap - cap)
    if (!best || distance < bestDistance) {
      best = option
      bestDistance = distance
    }
  }
  if (!best) throw new Error('Missing quality preset')
  return best
}

function steppedPercent(current: number, key: string): number | null {
  if (key === 'ArrowRight' || key === 'ArrowUp') return current + VOLUME_STEP
  if (key === 'ArrowLeft' || key === 'ArrowDown') return current - VOLUME_STEP
  if (key === 'PageUp') return current + VOLUME_STEP * 2
  if (key === 'PageDown') return current - VOLUME_STEP * 2
  if (key === 'Home') return 0
  if (key === 'End') return 100
  return null
}

function snapPercent(volume: number): number {
  if (!Number.isFinite(volume)) return snapPercent(preferences.masterVolume)
  const percent = Math.round(Math.min(1, Math.max(0, volume)) * 100)
  const stepped = Math.round(percent / VOLUME_STEP) * VOLUME_STEP
  return Math.min(100, Math.max(0, stepped))
}

function percentLabel(volume: number): string {
  return `${snapPercent(volume)}%`
}

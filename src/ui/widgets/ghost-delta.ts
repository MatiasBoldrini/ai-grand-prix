import { readGhostDelta } from '../../race/hooks/ghost.ts'
import type { GhostReadout } from '../../race/hooks/ghost.ts'
import { el } from '../controls.ts'
import { formatRaceTime } from '../format.ts'
import type { HudWidget } from '../types.ts'

export interface GhostDeltaView {
  label: string
  value: string
  tone: 'ahead' | 'behind' | 'even' | 'recording'
  live: string
}

const TONE: Record<GhostDeltaView['tone'], string> = {
  ahead: 'var(--success)',
  behind: 'var(--warn)',
  even: 'var(--fg)',
  recording: 'var(--fg-2)',
}

export const widget: HudWidget = {
  id: 'ghost-delta',
  mount(parent) {
    const block = el('div', 'readout')
    block.dataset.ghostDelta = 'true'
    block.setAttribute('aria-hidden', 'true')
    block.style.position = 'absolute'
    block.style.left = '50%'
    block.style.transform = 'translateX(-50%)'
    block.style.alignItems = 'center'
    block.style.textAlign = 'center'
    block.style.pointerEvents = 'none'
    block.style.whiteSpace = 'nowrap'
    const place = () => {
      // The pause control wraps onto its own row below 720px and fills the width.
      const narrow = window.matchMedia('(max-width: 720px)').matches
      block.style.top = narrow
        ? 'calc(132px + env(safe-area-inset-top, 0px))'
        : 'calc(72px + env(safe-area-inset-top, 0px))'
    }
    place()
    window.addEventListener('resize', place)
    const label = el('span', undefined, 'Fantasma')
    const value = el('b', undefined, 'Grabando')
    value.style.fontVariantNumeric = 'tabular-nums'
    block.append(label, value)

    const live = el('p', 'sr-only')
    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    parent.append(block, live)
    let announcedAt = -10
    let announcedTone = ''

    return {
      update(frame) {
        const snapshot = frame.snapshot
        const player = snapshot?.racers.find((racer) => racer.isPlayer)
        if (!snapshot || !player) {
          block.hidden = true
          live.textContent = ''
          announcedTone = ''
          return
        }
        block.hidden = false
        const view = formatGhostReadout(readGhostDelta())
        label.textContent = view.label
        value.textContent = view.value
        value.style.color = TONE[view.tone]
        const toneChanged = view.tone !== announcedTone
        if (toneChanged || snapshot.time - announcedAt >= 1.5) {
          announcedAt = snapshot.time
          announcedTone = view.tone
          if (live.textContent !== view.live) live.textContent = view.live
        }
      },
      unmount() {
        window.removeEventListener('resize', place)
        block.remove()
        live.remove()
      },
    }
  },
}

export function formatGhostReadout(readout: GhostReadout): GhostDeltaView {
  if (readout.phase !== 'comparing' || readout.delta === null || !Number.isFinite(readout.delta)) {
    return {
      label: 'Fantasma',
      value: 'Grabando',
      tone: 'recording',
      live: 'Todavía no hay mejor vuelta.',
    }
  }
  if (Math.abs(readout.delta) < 0.05) {
    return {
      label: 'Fantasma',
      value: '0.000 s',
      tone: 'even',
      live: 'Estás empatando tu mejor vuelta.',
    }
  }
  const ahead = readout.delta < 0
  const magnitude = formatMagnitude(Math.abs(readout.delta))
  return {
    label: ahead ? 'Adelante' : 'Atrás',
    value: `${ahead ? '-' : '+'}${magnitude} s`,
    tone: ahead ? 'ahead' : 'behind',
    live: liveGap(readout.delta),
  }
}

function formatMagnitude(seconds: number): string {
  if (seconds >= 60) return formatRaceTime(seconds)
  return seconds.toFixed(3)
}

function liveGap(delta: number): string {
  const magnitude = formatMagnitude(Math.abs(delta))
  return delta < 0
    ? `Vas ${magnitude} s adelante de tu mejor vuelta.`
    : `Vas ${magnitude} s atrás de tu mejor vuelta.`
}

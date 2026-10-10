import { CONDITION_FLOOR } from '../../race/hooks/damage.ts'
import { el } from '../controls.ts'
import type { HudWidget } from '../types.ts'

const FLASH_MS = 1700

/** Integer percent shown on the chassis chip. */
export function conditionPercent(condition: number): number {
  if (!Number.isFinite(condition)) return 100
  return Math.round(Math.min(1, Math.max(0, condition)) * 100)
}

/**
 * Steady line, or the points just lost. `droppedPoints` is set only for the
 * short beat after a new hit, so a remounted HUD does not invent one.
 */
export function damageStatus(condition: number, droppedPoints: number | null): string {
  const limp = condition <= CONDITION_FLOOR + 1e-4
  if (droppedPoints !== null && droppedPoints > 0) {
    return limp ? `Perdiste ${droppedPoints}%. Ya casi no empuja.` : `Perdiste ${droppedPoints}%.`
  }
  if (limp) return 'Quedó muy tocado. Ya casi no empuja.'
  if (condition >= 0.999) return 'Entero'
  if (condition >= 0.9) return 'Apenas un roce.'
  return 'Quedó tocado. Empuja menos.'
}

export const widget: HudWidget = {
  id: 'damage',
  mount(parent) {
    const block = el('div', 'readout')
    block.setAttribute('data-widget', 'damage')
    block.setAttribute('role', 'group')
    block.setAttribute('aria-label', 'Chasis')
    block.style.alignSelf = 'flex-start'
    block.style.width = 'max-content'
    block.style.maxWidth = 'min(16rem, 100%)'
    block.style.gap = '4px'
    block.style.padding = '8px 12px'
    block.style.background = 'var(--surface)'
    block.style.border = '1px solid var(--line)'
    block.style.borderRadius = 'var(--radius-panel)'

    const value = el('b', undefined, '100%')
    const meter = el('div', 'meter')
    meter.setAttribute('aria-hidden', 'true')
    const fill = document.createElement('i')
    fill.style.width = '100%'
    meter.append(fill)
    const status = el('span', undefined, 'Entero')
    status.setAttribute('data-damage-status', '')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    block.append(el('span', undefined, 'Chasis'), value, meter, status)
    parent.append(block)

    let seeded = false
    let shownCondition = 1
    let flashPoints = 0
    let flashUntil = 0

    return {
      update(frame) {
        const player = frame.snapshot?.racers.find((racer) => racer.isPlayer)
        if (!player) return
        const now = performance.now()
        const before = conditionPercent(shownCondition)
        const percent = conditionPercent(player.condition)
        if (!seeded) {
          seeded = true
        } else if (percent < before) {
          flashPoints = before - percent
          flashUntil = now + FLASH_MS
        }
        shownCondition = player.condition
        const flashing = now < flashUntil
        value.textContent = `${percent}%`
        fill.style.width = `${percent}%`
        meter.classList.toggle('low', percent <= 50)
        status.textContent = damageStatus(player.condition, flashing ? flashPoints : null)
        block.setAttribute('data-condition', String(percent))
      },
      unmount() {
        block.remove()
      },
    }
  },
}

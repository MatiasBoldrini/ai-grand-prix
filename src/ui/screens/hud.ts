import { formatRaceTime, formatSpeed } from '../format.ts'
import { button, el } from '../controls.ts'
import { mountWidgets } from '../widget-registry.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'hud',
  mount(root, ctx) {
    const hud = el('div', 'hud')
    const position = el('b', undefined, '1º')
    const lap = el('b', undefined, 'Vuelta 1')
    const time = el('b', undefined, '0:00.000')
    const speed = el('b', undefined, '0')
    const energy = document.createElement('i')
    const meter = el('div', 'meter')
    meter.append(energy)
    const note = el('p', 'note')
    note.setAttribute('role', 'status')
    const live = el('p', 'sr-only')
    live.setAttribute('aria-live', 'polite')
    const widgets = el('div', 'stack hud-widgets')
    const mountedWidgets = mountWidgets(widgets)

    hud.append(el('div', 'hud-row', undefined))
    const top = hud.firstElementChild
    if (top) {
      top.append(
        readout('Puesto', position),
        readout('Vuelta', lap),
        button('Pausa', 'ghost', () => {
          ctx.play('click')
          ctx.go('pause')
        }),
      )
    }
    const bottom = el('div', 'hud-row hud-telemetry')
    bottom.append(readout('Velocidad', speed), readout('Tiempo', time), readout('Contexto', meter))
    const speedUnit = el('span', undefined, 'km/h')
    speed.parentElement?.append(speedUnit)
    hud.append(bottom, note, live, widgets)
    root.append(hud)

    let announced = ''
    return {
      update(frame) {
        const snapshot = frame.snapshot
        const player = snapshot?.racers.find((racer) => racer.isPlayer)
        if (!snapshot || !player) return
        position.textContent = `${player.position}º`
        lap.textContent = `${Math.min(snapshot.laps, player.lap + 1)} de ${snapshot.laps}`
        const running = snapshot.time - player.lapTimes.reduce((sum, lapTime) => sum + lapTime, 0)
        time.textContent = formatRaceTime(
          player.finished ? (player.finishTime ?? snapshot.time) : running,
        )
        speed.textContent = formatSpeed(player.speed)
        const ratio = player.energyCapacity > 0 ? player.energy / player.energyCapacity : 0
        energy.style.width = `${Math.round(ratio * 100)}%`
        meter.classList.toggle('low', ratio < 0.2)
        if (player.surface === 'grass') note.textContent = 'Te fuiste al pasto. Volvé al asfalto.'
        else if (player.surface === 'shortcut')
          note.textContent = 'Estás en el corte. Agarrá fuerte.'
        else if (ratio <= 0) note.textContent = 'Te quedaste sin contexto. El auto ya no empuja.'
        else note.textContent = ''
        const shownLap = Math.min(snapshot.laps, player.lap + 1)
        const message = `Puesto ${player.position}, vuelta ${shownLap} de ${snapshot.laps}`
        if (message !== announced) {
          announced = message
          live.textContent = message
        }
        mountedWidgets.update?.(frame)
      },
      unmount() {
        mountedWidgets.unmount()
        hud.remove()
      },
    }
  },
}

function readout(label: string, value: HTMLElement): HTMLElement {
  const block = el('div', 'readout')
  block.append(el('span', undefined, label), value)
  return block
}

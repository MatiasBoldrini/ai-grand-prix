import { formatRaceTime } from '../format.ts'
import { button, el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'results',
  mount(root, ctx) {
    const panel = el('main', 'panel')
    const heading = el('h1', undefined, 'Terminó la carrera')
    const lead = el('p')
    const list = el('ul', 'stats')
    panel.append(
      heading,
      lead,
      el('h2', undefined, 'Tiempos'),
      list,
      button('Otra carrera', 'primary', () => {
        ctx.resumeAudio()
        ctx.play('click')
        ctx.startRace()
      }),
      button('Volver al menú', 'ghost', () => {
        ctx.play('click')
        ctx.quit()
      }),
    )
    root.append(panel)
    return {
      update(frame) {
        const snapshot = frame.snapshot
        if (!snapshot) return
        const player = snapshot.racers.find((racer) => racer.isPlayer)
        const ordered = [...snapshot.racers].sort((a, b) => a.position - b.position)
        lead.textContent =
          player?.position === 1
            ? 'Llegaste primero.'
            : `${ordered[0]?.name ?? 'El rival'} llegó antes.`
        list.replaceChildren()
        for (const racer of ordered) {
          const time = racer.finishTime === null ? 'sin cerrar' : formatRaceTime(racer.finishTime)
          const row = el('li')
          row.append(
            el('span', undefined, `${racer.position}º ${racer.name}`),
            el('span', undefined, time),
          )
          list.append(row)
        }
      },
      unmount: () => panel.remove(),
    }
  },
}

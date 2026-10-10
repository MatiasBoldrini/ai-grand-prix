import { listPersonalities } from '../../ai/registry.ts'
import { listCars } from '../../cars/registry.ts'
import { button, el, statRow } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

const STATS = [
  ['speed', 'Velocidad'],
  ['context', 'Contexto'],
  ['reasoning', 'Razonamiento'],
  ['creativity', 'Creatividad'],
  ['cost', 'Costo'],
] as const

export const screen: ScreenModule = {
  id: 'garage',
  menu: { label: 'Ver el garaje', variant: 'solid', order: 1 },
  mount(root, ctx) {
    const panel = el('main', 'panel')
    const state = ctx.getState()
    const cars = listCars()
    const personalities = listPersonalities()
    let carId = state.carId
    let personalityId = state.personalityId

    const summary = el('p')
    const stats = el('ul', 'stats')
    const carsField = el('fieldset', 'choices')
    carsField.setAttribute('aria-label', 'Modelos')
    const rivalCopy = el('p')

    const render = () => {
      const car = cars.find((item) => item.id === carId) ?? cars[0]
      if (!car) return
      summary.textContent = `${car.team}. ${car.summary}`
      stats.replaceChildren(...STATS.map(([key, label]) => statRow(label, String(car.stats[key]))))
      const personality = personalities.find((item) => item.id === personalityId)
      rivalCopy.textContent = personality
        ? `El rival maneja al estilo ${personality.name}. ${personality.blurb}`
        : 'Todavía no hay un rival cargado.'
    }

    panel.append(el('h1', undefined, 'Garaje'), el('h2', undefined, 'Modelos'), carsField)
    for (const car of cars) {
      carsField.append(
        radio(car.id, car.name, 'car', car.id === carId, () => {
          carId = car.id
          ctx.updateState({ carId })
          render()
        }),
      )
    }
    panel.append(summary, stats, el('h2', undefined, 'Rival'), rivalCopy)

    if (personalities.length > 1) {
      const field = el('fieldset', 'choices')
      for (const personality of personalities) {
        field.append(
          radio(
            personality.id,
            personality.name,
            'personality',
            personality.id === personalityId,
            () => {
              personalityId = personality.id
              ctx.updateState({ personalityId })
              render()
            },
          ),
        )
      }
      panel.append(field)
    }

    panel.append(
      button('Correr con este modelo', 'primary', () => {
        ctx.updateState({ carId, personalityId })
        ctx.resumeAudio()
        ctx.play('click')
        ctx.startRace()
      }),
      button('Volver', 'ghost', () => {
        ctx.play('click')
        ctx.go('menu')
      }),
    )
    render()
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}

function radio(
  id: string,
  label: string,
  group: string,
  checked: boolean,
  onChange: () => void,
): HTMLLabelElement {
  const row = el('label', 'choice')
  const input = el('input')
  input.type = 'radio'
  input.name = group
  input.value = id
  input.checked = checked
  input.addEventListener('change', onChange)
  row.append(input, el('span', undefined, label))
  return row
}

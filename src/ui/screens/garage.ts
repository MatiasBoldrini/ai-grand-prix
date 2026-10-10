import { listPersonalities } from '../../ai/registry.ts'
import { paramsFromStats } from '../../cars/params.ts'
import {
  commitSetup,
  formatSetupDelta,
  readSetup,
  setupEffect,
  type SetupId,
} from '../../cars/tuning/setup.ts'
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

const SETUPS: readonly { id: SetupId; name: string; blurb: string }[] = [
  {
    id: 'stock',
    name: 'De fábrica',
    blurb: 'Queda como salió del taller.',
  },
  {
    id: 'engine',
    name: 'Motor abierto',
    blurb: 'Empuja más en la recta y el tanque se vacía antes.',
  },
  {
    id: 'grip',
    name: 'Piso firme',
    blurb: 'Se pega al piso y el motor entrega un poco menos.',
  },
  {
    id: 'tank',
    name: 'Tanque largo',
    blurb: 'El contexto te alcanza para más vueltas, con menos empuje.',
  },
]

const EFFECTS = [
  ['engine', 'Motor'],
  ['grip', 'Agarre'],
  ['tank', 'Tanque'],
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
    let bias: SetupId = readSetup()

    const summary = el('p')
    const stats = el('ul', 'stats')
    const carsField = el('fieldset', 'choices')
    carsField.setAttribute('aria-label', 'Modelos')
    const rivalCopy = el('p')
    const setupCopy = el('p')
    setupCopy.setAttribute('aria-live', 'polite')
    const setupField = el('fieldset', 'choices')
    setupField.setAttribute('aria-label', 'Puesta a punto')
    const effects = el('ul', 'stats')
    effects.setAttribute('aria-label', 'Efecto de la puesta a punto')
    const effectValues = new Map<string, HTMLElement>()
    for (const [key, label] of EFFECTS) {
      const row = statRow(label, 'igual')
      const value = row.lastElementChild
      if (value instanceof HTMLElement) effectValues.set(key, value)
      effects.append(row)
    }

    const render = () => {
      const car = cars.find((item) => item.id === carId) ?? cars[0]
      if (!car) return
      summary.textContent = `${car.team}. ${car.summary}`
      stats.replaceChildren(...STATS.map(([key, label]) => statRow(label, String(car.stats[key]))))
      const personality = personalities.find((item) => item.id === personalityId)
      rivalCopy.textContent = personality
        ? `El rival maneja al estilo ${personality.name}. ${personality.blurb}`
        : 'Todavía no hay un rival cargado.'
      const choice = SETUPS.find((item) => item.id === bias) ?? SETUPS[0]
      setupCopy.textContent = choice?.blurb ?? ''
      const effect = setupEffect(paramsFromStats(car.stats), bias)
      for (const [key] of EFFECTS) {
        const node = effectValues.get(key)
        if (node) node.textContent = formatSetupDelta(effect[key])
      }
    }

    const remember = () => {
      commitSetup(bias)
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
      field.setAttribute('aria-label', 'Estilo del rival')
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

    panel.append(el('h2', undefined, 'Puesta a punto'), setupField)
    for (const setup of SETUPS) {
      setupField.append(
        radio(setup.id, setup.name, 'setup', setup.id === bias, () => {
          bias = setup.id
          remember()
          render()
        }),
      )
    }
    panel.append(setupCopy, effects, el('p', 'hint', 'El rival corre de serie.'))

    panel.append(
      button('Correr con este modelo', 'primary', () => {
        remember()
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

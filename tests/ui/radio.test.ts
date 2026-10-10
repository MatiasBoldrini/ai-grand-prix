import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RaceEvent, RaceSnapshot, RacerSnapshot } from '../../src/race/types.ts'
import { listWidgets } from '../../src/ui/widget-registry.ts'
import {
  createRadioState,
  RADIO_HOLD_S,
  stepRadio,
  widget,
  type RadioState,
} from '../../src/ui/widgets/radio.ts'
import type { UiFrame } from '../../src/ui/types.ts'

describe('race radio', () => {
  it('registers a hud widget without editing the registry', () => {
    expect(listWidgets().map((item) => item.id)).toContain('radio')
    expect(widget.id).toBe('radio')
  })

  it('changes the line once when a lap event is repeated on later snapshots', () => {
    let state = prime()
    const event: RaceEvent = { type: 'lap', racerId: 'player', time: 40 }
    state = speak(
      state,
      40,
      [event],
      [driver({ id: 'player', lap: 1, lapTimes: [40] }), driver({ id: 'rival', position: 2 })],
    )
    expect(state.line).toBe('Cerraste la vuelta en 0:40.000. Te queda una.')
    expect(state.revision).toBe(1)

    state = speak(state, 40, [event])
    expect(state.line).toBe('Cerraste la vuelta en 0:40.000. Te queda una.')
    expect(state.revision).toBe(1)
  })

  it('keeps the same state when the snapshot object does not change', () => {
    const frame: UiFrame = { snapshot: race() }
    const once = stepRadio(createRadioState(), frame)
    expect(stepRadio(once, frame)).toBe(once)
    expect(stepRadio(once, { snapshot: null })).toBe(once)
  })

  it('says how many laps are left', () => {
    const state = speak(
      prime(),
      40,
      [{ type: 'lap', racerId: 'player', time: 40 }],
      [driver({ id: 'player', lap: 1, lapTimes: [40] }), driver({ id: 'rival', position: 2 })],
      4,
    )
    expect(state.line).toBe('Cerraste la vuelta en 0:40.000. Quedan 3.')
  })

  it('gives the air to a finish and does not also call the lap', () => {
    const state = speak(
      prime(),
      80,
      [
        { type: 'lap', racerId: 'player', time: 80 },
        { type: 'finish', racerId: 'player', time: 80 },
      ],
      [
        driver({
          id: 'player',
          lap: 2,
          lapTimes: [40, 40],
          finished: true,
          finishTime: 80,
          position: 1,
        }),
        driver({ id: 'rival', position: 2 }),
      ],
    )
    expect(state.line).toBe('Cruzaste primero en 1:20.000.')
    expect(state.revision).toBe(1)
    expect(state.queue).toEqual([])
  })

  it('calls a finish behind the leader with the place', () => {
    const state = speak(
      prime(),
      90,
      [{ type: 'finish', racerId: 'player', time: 90 }],
      [
        driver({ id: 'player', lap: 2, finished: true, finishTime: 90, position: 2 }),
        driver({ id: 'rival', position: 1, finished: true, finishTime: 88 }),
      ],
    )
    expect(state.line).toBe('Llegaste 2º en 1:30.000.')
  })

  it('calls the rival when they finish first', () => {
    const state = speak(
      prime(),
      70,
      [{ type: 'finish', racerId: 'rival', time: 70 }],
      [
        driver({ id: 'player', position: 2 }),
        driver({ id: 'rival', position: 1, finished: true, finishTime: 70 }),
      ],
    )
    expect(state.line).toBe('Reasoner 70B cruzó primero en 1:10.000.')
  })

  it('switches to a wall once, then ignores collision, grass and respawn', () => {
    let state = speak(prime(), 12, [{ type: 'wall', racerId: 'player', time: 12 }])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(state.revision).toBe(1)

    state = speak(state, 12.2, [
      { type: 'collision', racerId: 'player', time: 12.2 },
      { type: 'offtrack', racerId: 'player', time: 12.2 },
      { type: 'respawn', racerId: 'player', time: 12.2 },
    ])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(state.revision).toBe(1)
  })

  it('holds a lap line, then lets a later wall replace it', () => {
    let state = speak(
      prime(),
      40,
      [{ type: 'lap', racerId: 'player', time: 40 }],
      [driver({ id: 'player', lap: 1, lapTimes: [40] }), driver({ id: 'rival', position: 2 })],
    )
    state = speak(state, 41, [{ type: 'wall', racerId: 'player', time: 41 }])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(state.revision).toBe(2)
  })

  it('queues a second voice and airs it once the hold ends', () => {
    let state = speak(prime(), 6, [
      { type: 'wall', racerId: 'player', time: 6 },
      { type: 'wall', racerId: 'rival', time: 6 },
    ])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(state.revision).toBe(1)

    state = speak(state, 6 + RADIO_HOLD_S - 0.05, [])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(state.revision).toBe(1)

    state = speak(state, 6 + RADIO_HOLD_S, [])
    expect(state.line).toBe('Reasoner 70B tocó el muro.')
    expect(state.revision).toBe(2)

    state = speak(state, 6 + RADIO_HOLD_S, [])
    expect(state.revision).toBe(2)
  })

  it('changes the wording when the same driver hits the wall again', () => {
    let state = speak(prime(), 5, [{ type: 'wall', racerId: 'player', time: 5 }])
    state = speak(state, 5 + RADIO_HOLD_S, [{ type: 'wall', racerId: 'player', time: 9 }])
    expect(state.line).toBe('Otra vez el muro. Abrí la línea.')
    expect(state.revision).toBe(2)
  })

  it('calls a shortcut once per entry and stays quiet while the car remains there', () => {
    let state = prime([driver({ id: 'player', surface: 'shortcut' }), driver({ id: 'rival' })])
    expect(state.line).toBe('')
    expect(state.revision).toBe(0)

    state = speak(
      state,
      3,
      [],
      [driver({ id: 'player', surface: 'asphalt' }), driver({ id: 'rival' })],
    )
    expect(state.line).toBe('')

    state = speak(
      state,
      4,
      [],
      [driver({ id: 'player', surface: 'shortcut' }), driver({ id: 'rival' })],
    )
    expect(state.line).toBe('Entraste al corte. Mantené el auto.')
    expect(state.revision).toBe(1)

    state = speak(
      state,
      5,
      [],
      [driver({ id: 'player', surface: 'shortcut' }), driver({ id: 'rival' })],
    )
    expect(state.line).toBe('Entraste al corte. Mantené el auto.')
    expect(state.revision).toBe(1)

    state = speak(
      state,
      8,
      [],
      [driver({ id: 'player', surface: 'asphalt' }), driver({ id: 'rival' })],
    )
    state = speak(
      state,
      9,
      [],
      [driver({ id: 'player', surface: 'shortcut' }), driver({ id: 'rival' })],
    )
    expect(state.line).toBe('Otra vez por el corte. Mantené el auto.')
    expect(state.revision).toBe(2)
  })

  it('calls the rival shortcut and ignores an unknown racer', () => {
    let state = prime()
    state = speak(
      state,
      4,
      [],
      [driver({ id: 'player' }), driver({ id: 'rival', surface: 'shortcut' })],
    )
    expect(state.line).toBe('Reasoner 70B entró al corte.')

    state = speak(state, 4 + RADIO_HOLD_S, [{ type: 'wall', racerId: 'ghost', time: 8 }])
    expect(state.line).toBe('Reasoner 70B entró al corte.')
  })

  it('forgets the previous race when the clock rewinds', () => {
    let state = speak(prime(), 12, [{ type: 'wall', racerId: 'player', time: 12 }])
    expect(state.line).toBe('Tocaste el muro. Enderezá y seguí.')
    state = speak(state, 0.1, [])
    expect(state.line).toBe('')
    expect(state.revision).toBe(0)
  })

  it('reads the frame and does not subscribe to anything else', () => {
    const source = readFileSync(new URL('../../src/ui/widgets/radio.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(
      /addEventListener|setInterval|setTimeout|requestAnimationFrame|localStorage|WebSocket/,
    )
    expect(source).not.toMatch(/from ['"][^'"]*\/(game|audio|race\/world|render|physics|input)\//)
  })

  it('writes the line into the hud once per new event', () => {
    const parent = installDom()
    const mounted = widget.mount(parent as unknown as HTMLElement)
    const line = parent.children[0]
    expect(line).toBeDefined()
    expect(line?.hidden).toBe(true)
    expect(line?.textWrites).toBe(0)

    const lap = race({
      time: 40,
      events: [{ type: 'lap', racerId: 'player', time: 40 }],
      racers: [
        driver({ id: 'player', lap: 1, lapTimes: [40] }),
        driver({ id: 'rival', position: 2 }),
      ],
    })
    mounted.update?.({ snapshot: race({ time: 0 }) })
    mounted.update?.({ snapshot: lap })
    mounted.update?.({ snapshot: lap })
    mounted.update?.({
      snapshot: race({
        time: 40,
        events: [{ type: 'lap', racerId: 'player', time: 40 }],
        racers: lap.racers,
      }),
    })
    expect(line?.textContent).toBe('Cerraste la vuelta en 0:40.000. Te queda una.')
    expect(line?.hidden).toBe(false)
    expect(line?.textWrites).toBe(1)
    expect(line?.attributes.get('role')).toBe('status')

    mounted.update?.({
      snapshot: race({
        time: 50,
        events: [{ type: 'wall', racerId: 'player', time: 50 }],
      }),
    })
    expect(line?.textContent).toBe('Tocaste el muro. Enderezá y seguí.')
    expect(line?.textWrites).toBe(2)

    mounted.unmount()
    expect(parent.children).toEqual([])
    expect(document.getElementById('agp-radio-style')).toBeNull()
  })
})

function prime(racers?: RacerSnapshot[]): RadioState {
  return stepRadio(createRadioState(), { snapshot: race({ time: 0, racers }) })
}

function speak(
  state: RadioState,
  time: number,
  events: RaceEvent[],
  racers?: RacerSnapshot[],
  laps?: number,
): RadioState {
  return stepRadio(state, { snapshot: race({ time, events, racers, laps }) })
}

function race(partial: Partial<RaceSnapshot> = {}): RaceSnapshot {
  const { racers, events, laps, ...rest } = partial
  return {
    trackId: 'gradiente',
    trackName: 'Autódromo del Gradiente',
    laps: laps ?? 2,
    time: 0,
    finished: false,
    racers: racers ?? [driver({ id: 'player' }), driver({ id: 'rival', position: 2 })],
    extras: [],
    events: events ?? [],
    ...rest,
  }
}

function driver(partial: Partial<RacerSnapshot> & Pick<RacerSnapshot, 'id'>): RacerSnapshot {
  const player = partial.id === 'player'
  return {
    carId: player ? 'flash-7b' : 'reasoner-70b',
    name: player ? 'Vos' : 'Reasoner 70B',
    isPlayer: player,
    color: player ? '#d6e41a' : '#c45c28',
    modelUrl: '/assets/models/raceCarRed.dae',
    x: 0,
    z: 0,
    yaw: 0,
    steer: 0,
    speed: 20,
    slip: 0,
    surface: 'asphalt',
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    gate: 1,
    energy: 10,
    energyCapacity: 10,
    condition: 1,
    finished: false,
    finishTime: null,
    position: player ? 1 : 2,
    odometer: 0,
    ...partial,
  }
}

class FakeEl {
  id = ''
  className = ''
  hidden = false
  textWrites = 0
  parent: FakeEl | null = null
  children: FakeEl[] = []
  attributes = new Map<string, string>()
  dataset: Record<string, string> = {}
  private text = ''

  get textContent(): string {
    return this.text
  }

  set textContent(value: string) {
    if (this.className === 'agp-radio') this.textWrites += 1
    this.text = value
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  append(node: FakeEl): void {
    node.parent = this
    this.children.push(node)
    if (node.id) ids.set(node.id, node)
  }

  remove(): void {
    if (this.id) ids.delete(this.id)
    const parent = this.parent
    if (!parent) return
    parent.children = parent.children.filter((child) => child !== this)
    this.parent = null
  }
}

const ids = new Map<string, FakeEl>()

function installDom(): FakeEl {
  ids.clear()
  const head = new FakeEl()
  const documentStub = {
    createElement: () => new FakeEl(),
    getElementById: (id: string) => ids.get(id) ?? null,
    head,
  }
  vi.stubGlobal('document', documentStub)
  return new FakeEl()
}

afterEach(() => {
  vi.unstubAllGlobals()
  ids.clear()
})

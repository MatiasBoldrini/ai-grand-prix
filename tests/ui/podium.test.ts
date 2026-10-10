import { describe, expect, it } from 'vitest'
import type { RaceSnapshot, RacerSnapshot } from '../../src/race/types.ts'
import {
  PODIUM_MENU,
  PODIUM_REMATCH,
  formatGap,
  paintColor,
  podiumActions,
  podiumView,
  rankRacers,
  screen,
} from '../../src/ui/screens/results.ts'

function racer(
  overrides: Partial<RacerSnapshot> & Pick<RacerSnapshot, 'id' | 'name' | 'position'>,
): RacerSnapshot {
  const finishTime = overrides.finishTime === undefined ? 70 : overrides.finishTime
  return {
    carId: 'flash-7b',
    isPlayer: false,
    color: '#d6e41a',
    modelUrl: '/assets/models/raceCarRed.dae',
    x: 0,
    z: 0,
    yaw: 0,
    steer: 0,
    speed: 0,
    slip: 0,
    surface: 'asphalt',
    lap: 2,
    lapTimes: [],
    sectorTimes: [],
    gate: 0,
    energy: 1,
    energyCapacity: 1,
    condition: 1,
    finished: finishTime !== null,
    finishTime,
    odometer: 100,
    ...overrides,
  }
}

function race(racers: RacerSnapshot[], extras: RacerSnapshot[] = []): RaceSnapshot {
  return {
    trackId: 'gradiente',
    trackName: 'Autódromo de Potrerillos',
    laps: 2,
    time: 90,
    finished: true,
    racers,
    extras,
    events: [],
  }
}

describe('podium', () => {
  it('keeps the results screen off the menu and the rematch labels exact', () => {
    expect(screen.id).toBe('results')
    expect(screen.menu).toBeUndefined()
    expect(PODIUM_REMATCH).toBe('Otra carrera')
    expect(PODIUM_MENU).toBe('Volver al menú')
  })

  it('ranks every racer by finish order and keeps lap times', () => {
    const ranked = rankRacers([
      racer({
        id: 'slow',
        name: 'Reasoner 70B',
        position: 2,
        color: '#c45c28',
        finishTime: 80.25,
        lapTimes: [40, 40.25],
      }),
      racer({
        id: 'fast',
        name: 'Flash 7B',
        position: 1,
        isPlayer: true,
        finishTime: 70,
        lapTimes: [36, 34],
      }),
    ])
    expect(ranked.map((entry) => entry.id)).toEqual(['fast', 'slow'])
    expect(ranked[0]?.finishLabel).toBe('1:10.000')
    expect(ranked[0]?.gapLabel).toBeNull()
    expect(ranked[0]?.lapsLine).toBe('0:36.000 · 0:34.000 · Mejor 0:34.000')
    expect(ranked[1]?.finishLabel).toBe('1:20.250')
    expect(ranked[1]?.gapLabel).toBe('+10.250')
    expect(ranked[1]?.lapsLine).toBe('0:40.000 · 0:40.250 · Mejor 0:40.000')
  })

  it('leaves an unfinished rival off the clock', () => {
    const view = podiumView(
      race([
        racer({
          id: 'you',
          name: 'Flash 7B',
          position: 1,
          isPlayer: true,
          finishTime: 72.5,
          lapTimes: [35.1, 37.4],
        }),
        racer({
          id: 'rival',
          name: 'Reasoner 70B',
          position: 2,
          finishTime: null,
          lapTimes: [40.2],
        }),
      ]),
    )
    expect(view.lead).toBe('Llegaste primero. Reasoner 70B todavía no cerró.')
    expect(view.detail).toBe('Se corrió en Autódromo de Potrerillos, a 2 vueltas.')
    expect(view.rows.map((entry) => entry.finishLabel)).toEqual(['1:12.500', 'sin cerrar'])
    expect(view.rows[1]?.gapLabel).toBeNull()
    expect(view.rows[1]?.lapsLine).toBe('0:40.200')
    expect(view.rows[0]?.lapsLine).toBe('0:35.100 · 0:37.400 · Mejor 0:35.100')
    const field = podiumView(
      race([
        racer({ id: 'you', name: 'Flash 7B', position: 1, isPlayer: true, finishTime: 70 }),
        racer({ id: 'b', name: 'B', position: 2, finishTime: null }),
        racer({ id: 'c', name: 'C', position: 3, finishTime: null }),
      ]),
    )
    expect(field.lead).toBe('Llegaste primero. El resto todavía no cerró.')
  })

  it('tells you the place and the gap when you lose', () => {
    const view = podiumView(
      race([
        racer({
          id: 'you',
          name: 'Flash 7B',
          position: 2,
          isPlayer: true,
          finishTime: 80.25,
          lapTimes: [40, 40.25],
        }),
        racer({
          id: 'rival',
          name: 'Reasoner 70B',
          position: 1,
          finishTime: 70,
          lapTimes: [34, 36],
        }),
      ]),
    )
    expect(view.lead).toBe('Llegaste 2º. Reasoner 70B te ganó. Te sacó 10.250 s.')
    expect(view.rows.find((entry) => entry.isPlayer)?.gapLabel).toBe('+10.250')
    expect(view.rows[0]?.gapLabel).toBeNull()
  })

  it('stands the winner in the middle and still lists the rest', () => {
    const view = podiumView(
      race([
        racer({ id: 'p4', name: 'Cuarto', position: 4, finishTime: 100 }),
        racer({ id: 'p2', name: 'Segundo', position: 2, finishTime: 80 }),
        racer({ id: 'p3', name: 'Tercero', position: 3, finishTime: 90, isPlayer: true }),
        racer({ id: 'p1', name: 'Primero', position: 1, finishTime: 70 }),
      ]),
    )
    expect(view.steps.map((step) => [step.position, step.visualOrder])).toEqual([
      [1, 2],
      [2, 1],
      [3, 3],
    ])
    expect(view.rows.map((entry) => entry.position)).toEqual([1, 2, 3, 4])
    expect(view.lead).toBe('Llegaste 3º. Primero te ganó. Te sacó 20.000 s.')
  })

  it('uses two steps for a pair and one step for a solo finish', () => {
    const pair = podiumView(
      race([
        racer({ id: 'a', name: 'A', position: 1, isPlayer: true, finishTime: 10 }),
        racer({ id: 'b', name: 'B', position: 2, finishTime: 12 }),
      ]),
    )
    expect(pair.steps.map((step) => step.visualOrder)).toEqual([2, 1])
    const solo = podiumView(race([racer({ id: 'a', name: 'A', position: 1, isPlayer: true })]))
    expect(solo.steps.map((step) => step.visualOrder)).toEqual([1])
    expect(solo.lead).toBe('Llegaste primero.')
  })

  it('ignores ghost extras and a tied clock', () => {
    const ghost = racer({ id: 'ghost', name: 'Fantasma', position: 1, finishTime: 1 })
    const view = podiumView(
      race(
        [
          racer({ id: 'b', name: 'B', position: 1, finishTime: 50, isPlayer: true }),
          racer({ id: 'a', name: 'A', position: 1, finishTime: 50 }),
        ],
        [ghost],
      ),
    )
    expect(view.rows.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(view.rows.every((entry) => entry.gapLabel === null)).toBe(true)
    expect(view.lead.startsWith('Llegaste primero.')).toBe(true)
  })

  it('does not invent a margin or a track line', () => {
    expect(formatGap(0)).toBeNull()
    expect(formatGap(0.0004)).toBeNull()
    expect(formatGap(5.5)).toBe('+5.500')
    expect(formatGap(10.25)).toBe('+10.250')
    expect(formatGap(70)).toBe('+1:10.000')
    expect(formatGap(Number.NaN)).toBeNull()
    const quiet = podiumView({
      ...race([]),
      trackName: '   ',
      laps: 0,
    })
    expect(quiet.lead).toBe('No hay tiempos para mostrar.')
    expect(quiet.detail).toBe('')
    expect(quiet.steps).toEqual([])
    expect(podiumView(null).lead).toBe('Estamos cerrando los tiempos.')
  })

  it('rejects a paint value that is not a hex color', () => {
    expect(paintColor('#d6e41a')).toBe('#d6e41a')
    expect(paintColor('#fff')).toBe('#fff')
    expect(paintColor('red')).toBe('var(--fg-3)')
    expect(paintColor('#1234567')).toBe('var(--fg-3)')
    expect(paintColor('#fff;color:red')).toBe('var(--fg-3)')
  })

  it('wires the rematch and the menu without extra calls', () => {
    const calls: string[] = []
    const actions = podiumActions({
      resumeAudio: () => calls.push('resume'),
      play: (id) => calls.push(`play:${id}`),
      startRace: () => calls.push('start'),
      quit: () => calls.push('quit'),
    })
    actions.rematch()
    expect(calls).toEqual(['resume', 'play:click', 'start'])
    calls.length = 0
    actions.menu()
    expect(calls).toEqual(['play:click', 'quit'])
  })

  it('says how many laps the circuit asked for', () => {
    const one = podiumView({
      ...race([racer({ id: 'a', name: 'A', position: 1, isPlayer: true })]),
      trackName: 'Embeddings',
      laps: 1,
    })
    expect(one.detail).toBe('Se corrió en Embeddings, a 1 vuelta.')
  })
})

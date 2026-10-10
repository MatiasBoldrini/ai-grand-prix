import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listTracks } from '../../src/tracks/registry.ts'
import {
  PLAYER_ID,
  RIVAL_ID,
  beginNextRound,
  createChampionship,
  currentChampionship,
  hintCopy,
  ingestRaceSnapshot,
  isComplete,
  leadCopy,
  loadSeason,
  nextRound,
  planRounds,
  pointsForPosition,
  primaryLabel,
  recordFinish,
  resetChampionshipStore,
  restartSeason,
  roundStatus,
  SEASON_STORAGE_KEY,
  roundTitle,
  standingText,
  standings,
  titleHolder,
  type Championship,
  type ClassifiedRace,
  type Entrant,
} from '../../src/championship/standings.ts'
import {
  installResultsTap,
  screen,
  startChampionshipRound,
} from '../../src/ui/screens/championship.ts'
import { getScreen, menuLinks } from '../../src/ui/screen-registry.ts'
import type { ScreenModule, UiFrame } from '../../src/ui/types.ts'

const GRADIENTE = { id: 'gradiente', name: 'Autódromo del Gradiente' }
const COSTANERA = { id: 'costanera', name: 'Costanera' }
const ENTRANTS: Entrant[] = [
  { id: PLAYER_ID, name: 'Vos' },
  { id: RIVAL_ID, name: 'Reasoner 70B' },
]

function finish(playerPosition: 1 | 2, rivalName = 'Reasoner 70B'): ClassifiedRace {
  const rivalPosition = playerPosition === 1 ? 2 : 1
  return {
    finished: true,
    racers: [
      { id: PLAYER_ID, name: 'Vos', position: playerPosition, finishTime: 40 + playerPosition },
      { id: RIVAL_ID, name: rivalName, position: rivalPosition, finishTime: 40 + rivalPosition },
      { id: 'ghost', name: 'Sombra', position: 3, finishTime: 90 },
    ],
  }
}

function arm(tracks: { id: string; name: string }[], pendingIndex = 0): Championship {
  return { ...createChampionship(tracks), pendingIndex }
}

describe('championship calendar', () => {
  it('plans three rounds and repeats a circuit when there is only one', () => {
    expect(planRounds([GRADIENTE]).map((round) => round.trackId)).toEqual([
      'gradiente',
      'gradiente',
      'gradiente',
    ])
    expect(planRounds([GRADIENTE, COSTANERA]).map((round) => round.trackName)).toEqual([
      'Autódromo del Gradiente',
      'Costanera',
      'Autódromo del Gradiente',
    ])
    expect(planRounds([])).toEqual([])
  })

  it('scores eight for a win and five for second', () => {
    expect(pointsForPosition(1)).toBe(8)
    expect(pointsForPosition(2)).toBe(5)
    expect(pointsForPosition(3)).toBe(0)
    expect(pointsForPosition(0)).toBe(0)
  })
})

describe('championship points', () => {
  it('ignores a finish until a round is armed, and ignores an unfinished race', () => {
    const season = createChampionship([GRADIENTE])
    expect(recordFinish(season, finish(1))).toBe(season)
    const armed = arm([GRADIENTE])
    expect(recordFinish(armed, { finished: false, racers: finish(1).racers })).toBe(armed)
  })

  it('records the field once and leaves a ghost out of the table', () => {
    const armed = arm([GRADIENTE])
    const scored = recordFinish(armed, finish(1))
    expect(scored.pendingIndex).toBeNull()
    expect(scored.results).toHaveLength(1)
    expect(scored.results[0]?.finishers.map((racer) => racer.id)).toEqual([PLAYER_ID, RIVAL_ID])
    const again = recordFinish(scored, finish(2))
    expect(again).toBe(scored)

    const rows = standings(scored, ENTRANTS)
    expect(rows.map((row) => [row.position, row.id, row.points, row.wins])).toEqual([
      [1, PLAYER_ID, 8, 1],
      [2, RIVAL_ID, 5, 0],
    ])
    expect(standingText(rows[0]!, true)).toEqual({ name: '1º Vos', value: '8 pts, 1 victoria' })
    expect(standingText(rows[1]!, false)).toEqual({ name: 'Reasoner 70B', value: '5 pts' })
  })

  it('breaks a points tie by wins and shares the place when both match', () => {
    let season = arm([GRADIENTE, COSTANERA])
    season = recordFinish(season, finish(1))
    season = { ...season, pendingIndex: 1 }
    season = recordFinish(season, finish(2))
    const rows = standings(season, ENTRANTS)
    expect(rows.map((row) => row.points)).toEqual([13, 13])
    expect(rows.map((row) => row.wins)).toEqual([1, 1])
    expect(rows.map((row) => row.position)).toEqual([1, 1])
    expect(titleHolder(rows)).toEqual({ kind: 'tie' })
    expect(leadCopy(season, rows)).toBe('Van empatados. Falta la fecha 3.')
  })

  it('gives the title to whoever has more points after three dates', () => {
    let season = arm([GRADIENTE])
    season = recordFinish(season, finish(1))
    season = { ...season, pendingIndex: 1 }
    season = recordFinish(season, finish(2))
    season = { ...season, pendingIndex: 2 }
    season = recordFinish(season, finish(1))
    expect(isComplete(season)).toBe(true)
    expect(nextRound(season)).toBeNull()
    const rows = standings(season, ENTRANTS)
    expect(rows[0]).toMatchObject({ id: PLAYER_ID, points: 21, wins: 2, position: 1 })
    expect(rows[1]).toMatchObject({ id: RIVAL_ID, points: 18, wins: 1, name: 'Reasoner 70B' })
    expect(titleHolder(rows)).toEqual({ kind: 'leader', row: rows[0] })
    expect(leadCopy(season, rows)).toBe('Te quedaste con el campeonato. Sumaste 21 puntos.')
    expect(primaryLabel(season)).toBe('Otro campeonato')
    expect(roundStatus(season, season.rounds[2]!)).toBe('Ganaste')
    expect(roundTitle(season.rounds[0]!)).toBe('Fecha 1, Autódromo del Gradiente')
  })

  it('names the rival when they take the title', () => {
    let season = arm([GRADIENTE])
    season = recordFinish(season, finish(2))
    season = { ...season, pendingIndex: 1 }
    season = recordFinish(season, finish(2))
    season = { ...season, pendingIndex: 2 }
    season = recordFinish(season, finish(1))
    const rows = standings(season, ENTRANTS)
    expect(leadCopy(season, rows)).toBe('El título se lo llevó Reasoner 70B, con 21 puntos.')
    expect(roundStatus(season, season.rounds[0]!)).toBe('Segundo')
  })
})

describe('championship copy', () => {
  it('explains a fresh season, a repeat circuit and a rotating calendar', () => {
    const single = createChampionship([GRADIENTE])
    const rows = standings(single, ENTRANTS)
    expect(leadCopy(single, rows)).toBe(
      'Son tres fechas. El primero suma 8 puntos y el segundo, 5. Todas en Autódromo del Gradiente.',
    )
    expect(hintCopy(single, 'Cauto')).toBe(
      'El auto sale del garaje. El rival maneja al estilo Cauto. Al cerrar la fecha, volvé a entrar para ver la tabla.',
    )
    expect(primaryLabel(single)).toBe('Arrancá la fecha 1')
    expect(roundStatus(single, single.rounds[0]!)).toBe('Pendiente')

    const rotating = createChampionship([GRADIENTE, COSTANERA])
    expect(leadCopy(rotating, standings(rotating, ENTRANTS))).toBe(
      'Son tres fechas. El primero suma 8 puntos y el segundo, 5. Cada fecha cambia de circuito.',
    )
    expect(leadCopy(createChampionship([]), [])).toBe(
      'No hay circuitos cargados para armar el campeonato.',
    )
    expect(primaryLabel(createChampionship([]))).toBe('Sin circuitos')
    expect(hintCopy(createChampionship([]), null)).toBe(
      'Cuando haya un circuito cargado, vas a poder largar.',
    )
  })

  it('tells the leader and the next date apart from an abandoned round', () => {
    const season = recordFinish(arm([GRADIENTE, COSTANERA]), finish(1))
    const rows = standings(season, ENTRANTS)
    expect(leadCopy(season, rows)).toBe('Vas primero con 8 puntos. Falta la fecha 2.')
    expect(primaryLabel(season)).toBe('Arrancá la fecha 2')
    expect(roundStatus(season, season.rounds[0]!)).toBe('Ganaste')
    expect(roundStatus(season, season.rounds[1]!)).toBe('Pendiente')

    const abandoned = { ...season, pendingIndex: 1 }
    expect(primaryLabel(abandoned)).toBe('Retomá la fecha 2')
    expect(roundStatus(abandoned, abandoned.rounds[1]!)).toBe('En curso')
    expect(hintCopy(abandoned, null)).toBe(
      'La fecha quedó a medias. La podés retomar cuando quieras.',
    )
    expect(hintCopy(season, null)).toContain('volvé a entrar')
    expect(leadCopy({ ...createChampionship([GRADIENTE]), pendingIndex: 0 }, rows)).toContain(
      'La fecha 1 quedó a medias.',
    )
  })
})

describe('championship season store', () => {
  beforeEach(() => {
    resetChampionshipStore()
  })

  it('keeps standings outside game state and launches the next circuit', () => {
    const tracks = listTracks().map((track) => ({ id: track.id, name: track.name }))
    const season = loadSeason(tracks)
    expect(season.rounds.length).toBe(3)
    expect(season.rounds.some((round) => round.trackId === 'gradiente')).toBe(true)
    expect(loadSeason(tracks)).toBe(season)

    const calls: string[] = []
    const started = startChampionshipRound({
      updateState: (partial) => calls.push(`update:${partial.trackId ?? ''}`),
      resumeAudio: () => calls.push('audio'),
      play: (id) => calls.push(`play:${id}`),
      startRace: () => calls.push('start'),
    })
    const first = season.rounds[0]
    expect(started).toBe(true)
    expect(first).toBeDefined()
    expect(calls).toEqual([`update:${first?.trackId}`, 'audio', 'play:click', 'start'])
    expect(currentChampionship()?.pendingIndex).toBe(0)

    expect(ingestRaceSnapshot({ finished: false, racers: finish(1).racers })).toBe(false)
    expect(currentChampionship()?.results).toEqual([])
    expect(ingestRaceSnapshot(finish(1))).toBe(true)
    expect(ingestRaceSnapshot(finish(2))).toBe(false)
    expect(currentChampionship()?.results).toHaveLength(1)
    expect(standings(currentChampionship()!, ENTRANTS)[0]?.points).toBe(8)
  })

  it('retries an abandoned date and then closes the season', () => {
    loadSeason([GRADIENTE, COSTANERA])
    startChampionshipRound(idleContext())
    expect(beginNextRound()?.trackId).toBe('gradiente')
    expect(ingestRaceSnapshot(finish(2))).toBe(true)

    const calls: string[] = []
    expect(
      startChampionshipRound({
        ...idleContext(),
        updateState: (partial) => calls.push(partial.trackId ?? ''),
        startRace: () => calls.push('start'),
      }),
    ).toBe(true)
    expect(calls[0]).toBe('costanera')
    ingestRaceSnapshot(finish(1))
    startChampionshipRound(idleContext())
    ingestRaceSnapshot(finish(1))

    const closed = currentChampionship()
    expect(closed && isComplete(closed)).toBe(true)
    expect(startChampionshipRound(idleContext())).toBe(false)
    const restarted = restartSeason([GRADIENTE])
    expect(restarted.results).toEqual([])
    expect(restarted.pendingIndex).toBeNull()
    expect(primaryLabel(restarted)).toBe('Arrancá la fecha 1')
  })
})

describe('championship screen', () => {
  beforeEach(() => {
    resetChampionshipStore()
  })

  it('registers a menu entry without editing the screen registry', () => {
    expect(screen.id).toBe('championship')
    expect(screen.menu).toEqual({ label: 'Campeonato', variant: 'ghost', order: 2 })
    expect(getScreen('championship')).toBe(screen)
    expect(menuLinks()).toContainEqual({
      id: 'championship',
      label: 'Campeonato',
      variant: 'ghost',
      order: 2,
    })
  })

  it('reads the finish from the results screen once', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    let updates = 0
    const results: ScreenModule = {
      id: 'results',
      mount() {
        return {
          update() {
            updates += 1
          },
          unmount() {},
        }
      },
    }
    installResultsTap(results)
    installResultsTap(results)
    const mounted = results.mount(unused(), unusedContext())
    const frame = { snapshot: finish(1) } as UiFrame
    mounted.update?.(frame)
    mounted.update?.(frame)
    expect(updates).toBe(2)
    expect(currentChampionship()?.results).toHaveLength(1)
    expect(standings(currentChampionship()!, ENTRANTS)[0]?.points).toBe(8)
  })

  it('still scores the round when the results screen fails to draw', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    const results: ScreenModule = {
      id: 'results',
      mount() {
        return {
          update() {
            throw new Error('podium')
          },
          unmount() {},
        }
      },
    }
    installResultsTap(results)
    const mounted = results.mount(unused(), unusedContext())
    expect(() => mounted.update?.({ snapshot: finish(2) } as UiFrame)).toThrow('podium')
    expect(standings(currentChampionship()!, ENTRANTS)[0]?.id).toBe(RIVAL_ID)
  })
})

describe('championship persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage(new Map()))
    resetChampionshipStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetChampionshipStore()
  })

  it('keeps an abandoned round under its own key and reads it when the screen opens', () => {
    expect(SEASON_STORAGE_KEY).toBe('agp-championship')
    expect(SEASON_STORAGE_KEY).not.toBe('agp-preferences')
    expect(SEASON_STORAGE_KEY).not.toBe('agp-garage-setup')

    loadSeason([GRADIENTE, COSTANERA])
    expect(beginNextRound()?.index).toBe(0)
    expect(saved()?.pendingIndex).toBe(0)

    resetChampionshipStore()
    const restored = loadSeason([GRADIENTE, COSTANERA])
    expect(restored.pendingIndex).toBe(0)
    expect(restored.results).toEqual([])
    expect(roundStatus(restored, restored.rounds[0]!)).toBe('En curso')
    expect(primaryLabel(restored)).toBe('Retomá la fecha 1')
    expect(loadSeason([GRADIENTE, COSTANERA])).toBe(restored)
  })

  it('keeps points from a finished round after a reload', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    expect(ingestRaceSnapshot(finish(1))).toBe(true)
    expect(saved()?.results).toHaveLength(1)

    resetChampionshipStore()
    const restored = loadSeason([GRADIENTE])
    expect(restored.pendingIndex).toBeNull()
    expect(standings(restored, ENTRANTS)[0]).toMatchObject({ id: PLAYER_ID, points: 8, wins: 1 })
    expect(roundStatus(restored, restored.rounds[0]!)).toBe('Ganaste')
    expect(primaryLabel(restored)).toBe('Arrancá la fecha 2')
  })

  it('reads the saved season again when the screen opens, even if memory differs', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    const stored = saved()
    if (!stored) throw new Error('missing season')
    const round = stored.rounds[0]
    if (!round) throw new Error('missing round')
    stored.pendingIndex = null
    stored.results = [
      {
        index: round.index,
        trackId: round.trackId,
        trackName: round.trackName,
        finishers: [
          { id: PLAYER_ID, name: 'Vos', position: 1, finishTime: 41 },
          { id: RIVAL_ID, name: 'Reasoner 70B', position: 2, finishTime: 42 },
        ],
      },
    ]
    localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(stored))

    const opened = loadSeason([GRADIENTE])
    expect(opened.pendingIndex).toBeNull()
    expect(standings(opened, ENTRANTS)[0]?.points).toBe(8)
    expect(roundStatus(opened, opened.rounds[0]!)).toBe('Ganaste')
  })

  it('starts fresh when the key is cleared, including while the old season is still in memory', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    ingestRaceSnapshot(finish(2))
    localStorage.removeItem(SEASON_STORAGE_KEY)

    const fresh = loadSeason([GRADIENTE])
    expect(fresh.pendingIndex).toBeNull()
    expect(fresh.results).toEqual([])
    expect(standings(fresh, ENTRANTS).map((row) => row.points)).toEqual([0, 0])
    expect(primaryLabel(fresh)).toBe('Arrancá la fecha 1')
    expect(roundStatus(fresh, fresh.rounds[0]!)).toBe('Pendiente')
    expect(saved()?.results).toEqual([])
  })

  it('lets a finished championship start over and stay over after a reload', () => {
    loadSeason([GRADIENTE])
    for (const place of [1, 1, 2] as const) {
      beginNextRound()
      ingestRaceSnapshot(finish(place))
    }
    expect(isComplete(currentChampionship()!)).toBe(true)

    const restarted = restartSeason([GRADIENTE])
    expect(restarted.results).toEqual([])
    expect(primaryLabel(restarted)).toBe('Arrancá la fecha 1')

    resetChampionshipStore()
    const restored = loadSeason([GRADIENTE])
    expect(restored.results).toEqual([])
    expect(restored.pendingIndex).toBeNull()
    expect(standings(restored, ENTRANTS).every((row) => row.points === 0)).toBe(true)
  })

  it('ignores corrupt data and starts a fresh season', () => {
    loadSeason([GRADIENTE])
    beginNextRound()
    const junk = [
      '{',
      'null',
      '[]',
      JSON.stringify({ rounds: 'no' }),
      JSON.stringify({ rounds: [], results: [], pendingIndex: '1' }),
      JSON.stringify({
        rounds: [{ index: 0, trackId: 'gradiente', trackName: 'Autódromo del Gradiente' }],
        results: [],
        pendingIndex: 4,
      }),
      JSON.stringify({
        rounds: [{ index: 0, trackId: 'gradiente', trackName: 'Autódromo del Gradiente' }],
        results: [
          {
            index: 0,
            trackId: 'gradiente',
            trackName: 'Autódromo del Gradiente',
            finishers: [{ id: 'player', name: 'Vos', position: 1.5, finishTime: 40 }],
          },
        ],
        pendingIndex: null,
      }),
    ]
    for (const raw of junk) {
      localStorage.setItem(SEASON_STORAGE_KEY, raw)
      resetChampionshipStore()
      expect(() => loadSeason([GRADIENTE])).not.toThrow()
      const season = currentChampionship()
      expect(season?.results).toEqual([])
      expect(season?.pendingIndex).toBeNull()
      expect(primaryLabel(season!)).toBe('Arrancá la fecha 1')
    }
  })

  it('keeps an extra field on an otherwise valid season', () => {
    const season = loadSeason([GRADIENTE])
    const raw = JSON.parse(localStorage.getItem(SEASON_STORAGE_KEY) ?? '{}') as {
      note?: string
    }
    raw.note = 'extra'
    localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(raw))
    resetChampionshipStore()
    const restored = loadSeason([GRADIENTE])
    expect(restored.rounds.map((round) => round.trackId)).toEqual(
      season.rounds.map((round) => round.trackId),
    )
    expect(restored.pendingIndex).toBeNull()
  })

  it('does not throw when storage rejects the write, and keeps memory if the read throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => {
      loadSeason([GRADIENTE])
      beginNextRound()
    }).not.toThrow()
    expect(currentChampionship()?.pendingIndex).toBe(0)

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => loadSeason([GRADIENTE])).not.toThrow()
    expect(currentChampionship()?.pendingIndex).toBe(0)
    expect(roundStatus(currentChampionship()!, currentChampionship()!.rounds[0]!)).toBe('En curso')
  })
})

function saved(): Championship | null {
  const raw = localStorage.getItem(SEASON_STORAGE_KEY)
  if (!raw) return null
  return JSON.parse(raw) as Championship
}

function memoryStorage(box: Map<string, string>): Storage {
  return {
    get length() {
      return box.size
    },
    clear: () => box.clear(),
    getItem: (key) => box.get(key) ?? null,
    key: (index) => [...box.keys()][index] ?? null,
    removeItem: (key) => {
      box.delete(key)
    },
    setItem: (key, value) => {
      box.set(key, value)
    },
  }
}

function idleContext(): Pick<
  Parameters<typeof startChampionshipRound>[0],
  'updateState' | 'startRace' | 'resumeAudio' | 'play'
> {
  return {
    updateState: () => {},
    startRace: () => {},
    resumeAudio: () => {},
    play: () => {},
  }
}

function unused(): HTMLElement {
  return {} as HTMLElement
}

function unusedContext(): Parameters<ScreenModule['mount']>[1] {
  return {} as Parameters<ScreenModule['mount']>[1]
}

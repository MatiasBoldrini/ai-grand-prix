/**
 * A three-round points season. Standings live here, not on `GameState`,
 * which only stores the car, the track and the rival.
 *
 * The shell delivers a finish snapshot to the mounted screen. That screen is
 * `results`, so the championship screen wraps its mount and calls
 * `ingestRaceSnapshot` once the player has armed a round from here.
 *
 * The season is also written to its own localStorage key. Opening the
 * championship screen calls `loadSeason`, which reads that key back. A missing
 * key starts a fresh season. Corrupt data is ignored and does the same.
 */

export const SEASON_LENGTH = 3
export const PLAYER_ID = 'player'
export const RIVAL_ID = 'rival'

/** Own key, separate from preferences and the garage setup. */
export const SEASON_STORAGE_KEY = 'agp-championship'

/** First and second. Anyone else in the field scores nothing. */
const POINTS_BY_PLACE = [8, 5] as const

const FIELD = new Set<string>([PLAYER_ID, RIVAL_ID])

export interface TrackRef {
  id: string
  name: string
}

export interface RoundPlan {
  index: number
  trackId: string
  trackName: string
}

export interface ClassifiedRacer {
  id: string
  name: string
  position: number
  finishTime: number | null
}

export interface ClassifiedRace {
  finished: boolean
  racers: readonly ClassifiedRacer[]
}

export interface RoundResult {
  index: number
  trackId: string
  trackName: string
  finishers: ClassifiedRacer[]
}

export interface Championship {
  rounds: RoundPlan[]
  results: RoundResult[]
  /** Round waiting for a finish. Null when nothing is on track. */
  pendingIndex: number | null
}

export interface StandingRow {
  id: string
  name: string
  points: number
  wins: number
  /** 1-based. Tied rows share a place. */
  position: number
}

export interface Entrant {
  id: string
  name: string
}

export type Title = { kind: 'none' } | { kind: 'leader'; row: StandingRow } | { kind: 'tie' }

export function pointsForPosition(position: number): number {
  if (position < 1) return 0
  return POINTS_BY_PLACE[position - 1] ?? 0
}

export function planRounds(tracks: readonly TrackRef[]): RoundPlan[] {
  if (tracks.length === 0) return []
  const rounds: RoundPlan[] = []
  for (let index = 0; index < SEASON_LENGTH; index += 1) {
    const track = tracks[index % tracks.length]
    if (!track) continue
    rounds.push({ index, trackId: track.id, trackName: track.name })
  }
  return rounds
}

export function createChampionship(tracks: readonly TrackRef[]): Championship {
  return { rounds: planRounds(tracks), results: [], pendingIndex: null }
}

export function isComplete(championship: Championship): boolean {
  return championship.rounds.length > 0 && championship.results.length >= championship.rounds.length
}

export function nextRound(championship: Championship): RoundPlan | null {
  const done = new Set(championship.results.map((result) => result.index))
  return championship.rounds.find((round) => !done.has(round.index)) ?? null
}

/** Score a finish against the armed round. Returns the same object when nothing changes. */
export function recordFinish(championship: Championship, race: ClassifiedRace): Championship {
  if (championship.pendingIndex === null || !race.finished) return championship
  const round = championship.rounds[championship.pendingIndex]
  if (!round) return championship
  if (championship.results.some((result) => result.index === round.index)) {
    return { ...championship, pendingIndex: null }
  }
  const finishers = race.racers
    .filter((racer) => FIELD.has(racer.id))
    .map((racer) => ({
      id: racer.id,
      name: racer.name,
      position: racer.position,
      finishTime: racer.finishTime,
    }))
    .sort((a, b) => a.position - b.position)
  if (finishers.length === 0) return championship
  return {
    rounds: championship.rounds,
    pendingIndex: null,
    results: [
      ...championship.results,
      { index: round.index, trackId: round.trackId, trackName: round.trackName, finishers },
    ],
  }
}

export function standings(championship: Championship, entrants: readonly Entrant[]): StandingRow[] {
  const seed = new Map(entrants.map((entrant, index) => [entrant.id, index]))
  const table = new Map<string, { id: string; name: string; points: number; wins: number }>()
  for (const entrant of entrants) {
    if (!FIELD.has(entrant.id)) continue
    table.set(entrant.id, { id: entrant.id, name: entrant.name, points: 0, wins: 0 })
  }
  for (const result of championship.results) {
    for (const finisher of result.finishers) {
      if (!FIELD.has(finisher.id)) continue
      const row = table.get(finisher.id) ?? {
        id: finisher.id,
        name: finisher.name,
        points: 0,
        wins: 0,
      }
      row.name = finisher.name
      row.points += pointsForPosition(finisher.position)
      if (finisher.position === 1) row.wins += 1
      table.set(finisher.id, row)
    }
  }
  const sorted = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    return (seed.get(a.id) ?? 99) - (seed.get(b.id) ?? 99)
  })
  let place = 0
  let previousKey = ''
  return sorted.map((row, index) => {
    const key = `${row.points}:${row.wins}`
    if (key !== previousKey) {
      place = index + 1
      previousKey = key
    }
    return { ...row, position: place }
  })
}

export function titleHolder(rows: readonly StandingRow[]): Title {
  const top = rows[0]
  if (!top || (top.points === 0 && top.wins === 0)) return { kind: 'none' }
  const tied = rows.filter((row) => row.points === top.points && row.wins === top.wins)
  if (tied.length > 1) return { kind: 'tie' }
  return { kind: 'leader', row: top }
}

export function standingText(
  row: StandingRow,
  showPlace: boolean,
): { name: string; value: string } {
  const value =
    row.wins === 1
      ? `${row.points} pts, 1 victoria`
      : row.wins > 1
        ? `${row.points} pts, ${row.wins} victorias`
        : `${row.points} pts`
  return { name: showPlace ? `${row.position}º ${row.name}` : row.name, value }
}

export function roundTitle(round: RoundPlan): string {
  return `Fecha ${round.index + 1}, ${round.trackName}`
}

export function roundStatus(championship: Championship, round: RoundPlan): string {
  const result = championship.results.find((item) => item.index === round.index)
  if (!result) return championship.pendingIndex === round.index ? 'En curso' : 'Pendiente'
  const player = result.finishers.find((finisher) => finisher.id === PLAYER_ID)
  if (!player) return 'Sin resultado'
  if (player.position === 1) return 'Ganaste'
  if (player.position === 2) return 'Segundo'
  return `Puesto ${player.position}`
}

export function primaryLabel(championship: Championship): string {
  if (championship.rounds.length === 0) return 'Sin circuitos'
  if (isComplete(championship)) return 'Otro campeonato'
  const next = nextRound(championship)
  if (!next) return 'Otro campeonato'
  const verb = championship.pendingIndex === next.index ? 'Retomá' : 'Arrancá'
  return `${verb} la fecha ${next.index + 1}`
}

export function leadCopy(championship: Championship, rows: readonly StandingRow[]): string {
  if (championship.rounds.length === 0) {
    return 'No hay circuitos cargados para armar el campeonato.'
  }
  if (isComplete(championship)) return completeCopy(rows)
  if (championship.results.length === 0) return freshCopy(championship)
  return midCopy(championship, rows)
}

export function hintCopy(championship: Championship, rivalStyle: string | null): string {
  if (championship.rounds.length === 0)
    return 'Cuando haya un circuito cargado, vas a poder largar.'
  const style = rivalStyle ? ` El rival maneja al estilo ${rivalStyle}.` : ''
  if (isComplete(championship)) {
    return 'Otro campeonato arranca de cero, con el auto que tengas en el garaje.'
  }
  if (championship.pendingIndex !== null) {
    return `La fecha quedó a medias. La podés retomar cuando quieras.${style}`
  }
  return `El auto sale del garaje.${style} Al cerrar la fecha, volvé a entrar para ver la tabla.`
}

const seasonStore: { current: Championship | null } = { current: null }

export function resetChampionshipStore(): void {
  seasonStore.current = null
}

export function currentChampionship(): Championship | null {
  return seasonStore.current
}

/**
 * Read the saved season when the screen opens.
 * A missing or corrupt key replaces whatever is in memory, so clearing storage
 * starts over. When storage itself cannot be read, the in-memory season stays.
 */
export function loadSeason(tracks: readonly TrackRef[]): Championship {
  const rounds = planRounds(tracks)
  const read = readSeason()

  if (read.kind === 'unavailable') return remember(rounds)

  if (read.kind === 'hit' && (hasProgress(read.season) || sameRounds(read.season.rounds, rounds))) {
    return adopt(read.season)
  }

  const current = seasonStore.current
  if (
    read.kind === 'miss' &&
    current &&
    !hasProgress(current) &&
    sameRounds(current.rounds, rounds)
  ) {
    return current
  }

  const created = blankSeason(rounds)
  seasonStore.current = created
  persistSeason(created)
  return created
}

export function restartSeason(tracks: readonly TrackRef[]): Championship {
  seasonStore.current = createChampionship(tracks)
  persistSeason(seasonStore.current)
  return seasonStore.current
}

/** Arm the next round, or keep the one already on track so a quit can be retried. */
export function beginNextRound(): RoundPlan | null {
  const current = seasonStore.current
  if (!current || isComplete(current)) return null
  let season = current
  if (season.pendingIndex === null) {
    const next = nextRound(season)
    if (!next) return null
    season = { ...season, pendingIndex: next.index }
    seasonStore.current = season
    persistSeason(season)
  }
  const pending = season.pendingIndex
  if (pending === null) return null
  return season.rounds[pending] ?? null
}

export function ingestRaceSnapshot(race: ClassifiedRace | null | undefined): boolean {
  const current = seasonStore.current
  if (!current || !race) return false
  const next = recordFinish(current, race)
  if (next === current) return false
  seasonStore.current = next
  persistSeason(next)
  return true
}

function hasProgress(championship: Championship): boolean {
  return championship.results.length > 0 || championship.pendingIndex !== null
}

function blankSeason(rounds: RoundPlan[]): Championship {
  return { rounds, results: [], pendingIndex: null }
}

/** Keep the in-memory season when localStorage cannot be read. */
function remember(rounds: RoundPlan[]): Championship {
  const current = seasonStore.current
  if (current && (hasProgress(current) || sameRounds(current.rounds, rounds))) return current
  const created = blankSeason(rounds)
  seasonStore.current = created
  return created
}

/** Use the stored season. Return the same object when nothing changed. */
function adopt(season: Championship): Championship {
  const current = seasonStore.current
  if (current && sameSeason(current, season)) return current
  seasonStore.current = season
  return season
}

type SeasonRead =
  | { kind: 'hit'; season: Championship }
  | { kind: 'miss' }
  | { kind: 'corrupt' }
  | { kind: 'unavailable' }

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function persistSeason(championship: Championship): void {
  try {
    storage()?.setItem(SEASON_STORAGE_KEY, JSON.stringify(championship))
  } catch {
    // Private mode can reject storage. The in-memory season still applies.
  }
}

function readSeason(): SeasonRead {
  const box = storage()
  if (!box) return { kind: 'unavailable' }
  let raw: string | null
  try {
    raw = box.getItem(SEASON_STORAGE_KEY)
  } catch {
    return { kind: 'unavailable' }
  }
  if (raw === null) return { kind: 'miss' }
  try {
    const season = decodeSeason(raw)
    return season ? { kind: 'hit', season } : { kind: 'corrupt' }
  } catch {
    return { kind: 'corrupt' }
  }
}

function decodeSeason(raw: string): Championship | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return null
  const rounds = decodeRounds(parsed.rounds)
  if (!rounds) return null
  const results = decodeResults(parsed.results, rounds)
  if (!results) return null
  const pendingIndex = decodePending(parsed.pendingIndex, rounds)
  if (pendingIndex === undefined) return null
  return { rounds, results, pendingIndex }
}

function decodeRounds(value: unknown): RoundPlan[] | null {
  if (!Array.isArray(value)) return null
  const rounds: RoundPlan[] = []
  const seen = new Set<number>()
  for (const item of value) {
    if (!isRecord(item)) return null
    if (!isIndex(item.index) || seen.has(item.index)) return null
    if (!isLabel(item.trackId) || !isLabel(item.trackName)) return null
    seen.add(item.index)
    rounds.push({ index: item.index, trackId: item.trackId, trackName: item.trackName })
  }
  return rounds
}

function decodeResults(value: unknown, rounds: readonly RoundPlan[]): RoundResult[] | null {
  if (!Array.isArray(value)) return null
  const results: RoundResult[] = []
  const seen = new Set<number>()
  for (const item of value) {
    if (!isRecord(item)) return null
    if (!isIndex(item.index) || seen.has(item.index)) return null
    if (!rounds.some((round) => round.index === item.index)) return null
    if (!isLabel(item.trackId) || !isLabel(item.trackName)) return null
    const finishers = decodeFinishers(item.finishers)
    if (!finishers) return null
    seen.add(item.index)
    results.push({
      index: item.index,
      trackId: item.trackId,
      trackName: item.trackName,
      finishers,
    })
  }
  return results
}

function decodeFinishers(value: unknown): ClassifiedRacer[] | null {
  if (!Array.isArray(value)) return null
  const finishers: ClassifiedRacer[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (!isLabel(item.id) || typeof item.name !== 'string') return null
    if (!isIndex(item.position) || item.position < 1) return null
    if (!isFinishTime(item.finishTime)) return null
    finishers.push({
      id: item.id,
      name: item.name,
      position: item.position,
      finishTime: item.finishTime,
    })
  }
  return finishers
}

/** `undefined` means the field is unusable. `null` is a real empty pending round. */
function decodePending(value: unknown, rounds: readonly RoundPlan[]): number | null | undefined {
  if (value === null) return null
  if (!isIndex(value)) return undefined
  if (!rounds.some((round) => round.index === value)) return undefined
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFinishTime(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function sameRounds(left: readonly RoundPlan[], right: readonly RoundPlan[]): boolean {
  if (left.length !== right.length) return false
  return left.every((round, index) => {
    const other = right[index]
    return (
      other?.index === round.index &&
      other.trackId === round.trackId &&
      other.trackName === round.trackName
    )
  })
}

function sameSeason(left: Championship, right: Championship): boolean {
  return (
    left.pendingIndex === right.pendingIndex &&
    sameRounds(left.rounds, right.rounds) &&
    sameResults(left.results, right.results)
  )
}

function sameResults(left: readonly RoundResult[], right: readonly RoundResult[]): boolean {
  if (left.length !== right.length) return false
  return left.every((result, index) => {
    const other = right[index]
    return (
      other?.index === result.index &&
      other.trackId === result.trackId &&
      other.trackName === result.trackName &&
      sameFinishers(result.finishers, other.finishers)
    )
  })
}

function sameFinishers(
  left: readonly ClassifiedRacer[],
  right: readonly ClassifiedRacer[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((racer, index) => {
    const other = right[index]
    return (
      other?.id === racer.id &&
      other.name === racer.name &&
      other.position === racer.position &&
      other.finishTime === racer.finishTime
    )
  })
}

function freshCopy(championship: Championship): string {
  const base = `${fechasPhrase(championship.rounds.length)} El primero suma 8 puntos y el segundo, 5.${circuitSentence(championship.rounds)}`
  if (championship.pendingIndex === null) return base
  return `${base} La fecha ${championship.pendingIndex + 1} quedó a medias.`
}

function midCopy(championship: Championship, rows: readonly StandingRow[]): string {
  const next = nextRound(championship)
  const falta = next ? ` Falta la fecha ${next.index + 1}.` : ''
  const title = titleHolder(rows)
  if (title.kind === 'tie') return `Van empatados.${falta}`
  if (title.kind === 'leader' && title.row.id === PLAYER_ID) {
    return `Vas primero con ${title.row.points} puntos.${falta}`
  }
  if (title.kind === 'leader') {
    return `${title.row.name} va primero con ${title.row.points} puntos.${falta}`
  }
  return freshCopy(championship)
}

function completeCopy(rows: readonly StandingRow[]): string {
  const title = titleHolder(rows)
  if (title.kind === 'tie') {
    return 'Empataron el campeonato. Misma cantidad de puntos y de victorias.'
  }
  if (title.kind === 'leader' && title.row.id === PLAYER_ID) {
    return `Te quedaste con el campeonato. Sumaste ${title.row.points} puntos.`
  }
  if (title.kind === 'leader') {
    return `El título se lo llevó ${title.row.name}, con ${title.row.points} puntos.`
  }
  return 'El campeonato cerró sin puntos cargados.'
}

function circuitSentence(rounds: readonly RoundPlan[]): string {
  const names = [...new Set(rounds.map((round) => round.trackName))]
  const only = names[0]
  if (names.length === 1 && only) return ` Todas en ${only}.`
  if (names.length > 1) return ' Cada fecha cambia de circuito.'
  return ''
}

function fechasPhrase(count: number): string {
  if (count === 1) return 'Es una fecha.'
  return `Son ${countWord(count)} fechas.`
}

function countWord(count: number): string {
  const words = [
    'cero',
    'una',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
  ]
  return words[count] ?? String(count)
}

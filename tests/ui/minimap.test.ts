import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, snapshotRace } from '../../src/race/world.ts'
import type { RaceSnapshot, RacerSnapshot } from '../../src/race/types.ts'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import type { SplineSample, Track } from '../../src/tracks/types.ts'
import { listWidgets } from '../../src/ui/widget-registry.ts'
import {
  FALLBACK_PALETTE,
  acrossTrack,
  centerlinePoints,
  fitBounds,
  markerRadius,
  measureTrack,
  minimapLabel,
  noseOffset,
  project,
  projectClamped,
  renderMarkers,
  renderTrack,
  resolveTrack,
  sameDots,
  ribbonWidths,
  widget,
  writeMarkers,
  type MapMarker,
} from '../../src/ui/widgets/minimap.ts'

describe('minimap widget', () => {
  it('mounts from the HUD registry', () => {
    expect(widget.id).toBe('minimap')
    expect(listWidgets().map((item) => item.id)).toContain('minimap')
    expect(widget.mount).toEqual(expect.any(Function))
  })

  it('names the map in rioplatense', () => {
    expect(minimapLabel('Autódromo de Potrerillos')).toBe(
      'Minimapa de Autódromo de Potrerillos. El punto con la flecha sos vos.',
    )
    expect(minimapLabel('Circuito')).not.toMatch(/\u2014|\u2013/)
  })
})

describe('minimap geometry', () => {
  it('fits the whole circuit inside the card, including a shortcut outside the ribbon', () => {
    const track = squareTrack([
      {
        id: 'corte',
        name: 'Corte',
        fromCorner: 0,
        toCorner: 2,
        halfWidth: 3,
        x0: -30,
        z0: 5,
        x1: 10,
        z1: 5,
      },
    ])
    const bounds = measureTrack(track)
    expect(bounds.minX).toBeCloseTo(-39)
    const fit = fitBounds(bounds, 148, 148, 12)
    for (const point of [project(fit, -30, 5), project(fit, 10, 5)]) {
      expect(point.x).toBeGreaterThanOrEqual(fit.pad - 0.01)
      expect(point.y).toBeGreaterThanOrEqual(fit.pad - 0.01)
      expect(point.x).toBeLessThanOrEqual(fit.width - fit.pad + 0.01)
      expect(point.y).toBeLessThanOrEqual(fit.height - fit.pad + 0.01)
    }
  })

  it('keeps a uniform scale and letterboxes the long axis', () => {
    const fit = fitBounds({ minX: 0, maxX: 200, minZ: 0, maxZ: 50 }, 100, 100, 0)
    expect(fit.scale).toBeCloseTo(0.5)
    const origin = project(fit, 0, 0)
    const east = project(fit, 200, 0)
    const south = project(fit, 0, 50)
    expect(east.x - origin.x).toBeCloseTo(100)
    expect(south.y - origin.y).toBeCloseTo(25)
    expect(south.y).toBeGreaterThan(origin.y)
    expect(fit.originY).toBeGreaterThan(10)
  })

  it('clamps a car that left the map', () => {
    const fit = fitBounds({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, 100, 100, 10)
    const point = projectClamped(fit, 10_000, -10_000, 8)
    expect(point.x).toBe(92)
    expect(point.y).toBe(8)
  })

  it('points yaw 0 down the map and keeps the start gate perpendicular', () => {
    expect(noseOffset(0, 10)).toEqual({ x: 0, y: 10 })
    expect(noseOffset(Math.PI / 2, 10).x).toBeCloseTo(10)
    expect(noseOffset(Math.PI / 2, 10).y).toBeCloseTo(0)
    for (const yaw of [0, 0.4, -1.2, Math.PI / 2]) {
      const nose = noseOffset(yaw, 1)
      const side = acrossTrack(yaw, 1)
      expect(nose.x * side.x + nose.y * side.y).toBeCloseTo(0)
    }
  })

  it('clamps the ribbon so a huge circuit stays readable', () => {
    const wide = ribbonWidths(100, 40, 10)
    expect(wide.asphalt).toBe(20)
    expect(wide.shoulder).toBe(34)
    const thin = ribbonWidths(0.01, 0, 0.01)
    expect(thin.asphalt).toBe(3.5)
    expect(thin.shoulder).toBeGreaterThan(thin.asphalt)
  })

  it('gives an empty circuit a finite frame', () => {
    const empty = measureTrack({ ...squareTrack([]), samples: [], shortcuts: [] })
    expect(empty.maxX).toBeGreaterThan(empty.minX)
    expect(empty.maxZ).toBeGreaterThan(empty.minZ)
    expect(Number.isFinite(fitBounds(empty, 80, 80, 12).scale)).toBe(true)
  })

  it('draws every loaded circuit closed and inside the card', () => {
    expect(resolveTrack('gradiente')?.id).toBe('gradiente')
    expect(resolveTrack('no-esta')).toBeNull()
    for (const track of listTracks()) {
      const fit = fitBounds(measureTrack(track), 148, 148, 12)
      const line = centerlinePoints(track, fit)
      expect(line.length).toBeGreaterThan(3)
      const start = line[0]
      const end = line[line.length - 1]
      expect(start?.x).toBeCloseTo(end?.x ?? Number.NaN)
      expect(start?.y).toBeCloseTo(end?.y ?? Number.NaN)
      for (const point of line) {
        expect(point.x).toBeGreaterThanOrEqual(fit.pad - 0.05)
        expect(point.y).toBeGreaterThanOrEqual(fit.pad - 0.05)
        expect(point.x).toBeLessThanOrEqual(fit.width - fit.pad + 0.05)
        expect(point.y).toBeLessThanOrEqual(fit.height - fit.pad + 0.05)
      }
      for (const cut of track.shortcuts) {
        for (const point of [project(fit, cut.x0, cut.z0), project(fit, cut.x1, cut.z1)]) {
          expect(point.x).toBeGreaterThanOrEqual(fit.pad - 0.05)
          expect(point.y).toBeGreaterThanOrEqual(fit.pad - 0.05)
        }
      }
    }
    const gradiente = getTrack('gradiente')
    const fitted = fitBounds(measureTrack(gradiente), 148, 148, 12)
    expect(centerlinePoints(gradiente, fitted).length).toBeLessThan(gradiente.samples.length)
  })
})

describe('minimap markers', () => {
  it('skips a redraw when the dots have barely moved', () => {
    const marker: MapMarker = { x: 10, y: 20, yaw: 0.2, color: '#fff', kind: 'player' }
    expect(sameDots([marker], 1, [10.2], [20.1], [0.2], 1)).toBe(true)
    expect(sameDots([marker], 1, [11], [20], [0.2], 1)).toBe(false)
    expect(sameDots([marker], 1, [10], [20], [0.5], 1)).toBe(false)
    expect(sameDots([marker], 1, [10], [20], [0.2], 0)).toBe(false)
  })

  it('keeps the player larger than the other dots', () => {
    expect(markerRadius('player')).toBe(5)
    expect(markerRadius('rival')).toBe(3.7)
    expect(markerRadius('extra')).toBe(3.2)
    expect(markerRadius('player')).toBeGreaterThan(markerRadius('rival'))
  })

  it('draws ghosts, then rivals, then the player, and reuses the pool', () => {
    const track = getTrack('gradiente')
    const fit = fitBounds(measureTrack(track), 160, 160, 12)
    const here = track.samples[8] ?? track.samples[0]
    const there = track.samples[40] ?? track.samples[0]
    if (!here || !there) throw new Error('Gradiente has no samples')
    const frame = snapshot(
      [
        racer({ id: 'player', x: here.x, z: here.z, yaw: 0.3, isPlayer: true, color: '#d6e41a' }),
        racer({ id: 'rival', x: there.x, z: there.z, yaw: -0.4, color: '#c45c28' }),
      ],
      [racer({ id: 'ghost', x: here.x + 4, z: here.z, yaw: 0.3, color: '#d6e41a' })],
    )
    const pool: MapMarker[] = []
    const count = writeMarkers(frame, fit, pool)
    expect(count).toBe(3)
    expect(pool[0]?.kind).toBe('extra')
    expect(pool[1]?.kind).toBe('rival')
    expect(pool[2]?.kind).toBe('player')
    expect(pool[2]?.color).toBe('#d6e41a')
    const expected = project(fit, here.x, here.z)
    expect(pool[2]?.x).toBeCloseTo(expected.x)
    expect(pool[2]?.y).toBeCloseTo(expected.y)
    expect(
      Math.hypot((pool[2]?.x ?? 0) - (pool[1]?.x ?? 0), (pool[2]?.y ?? 0) - (pool[1]?.y ?? 0)),
    ).toBeGreaterThan(1)
    const ghost = pool[0]
    const playerDot = pool[2]
    expect(writeMarkers(frame, fit, pool)).toBe(3)
    expect(pool[0]).toBe(ghost)
    expect(pool[2]).toBe(playerDot)
  })

  it('drops a non-finite pose and pins a runaway car to the edge', () => {
    const fit = fitBounds({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, 100, 100, 10)
    const pool: MapMarker[] = []
    const count = writeMarkers(
      snapshot([
        racer({ id: 'nan', x: Number.NaN, z: 0, isPlayer: true }),
        racer({ id: 'gone', x: 10_000, z: -10_000 }),
      ]),
      fit,
      pool,
    )
    expect(count).toBe(1)
    expect(pool[0]?.kind).toBe('rival')
    expect(pool[0]?.x).toBe(92)
    expect(pool[0]?.y).toBe(8)
  })

  it('places the real grid inside the card', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'human',
    })
    const fit = fitBounds(measureTrack(world.track), 148, 148, 12)
    const pool: MapMarker[] = []
    const count = writeMarkers(snapshotRace(world), fit, pool)
    expect(count).toBe(world.racers.length)
    const player = pool[count - 1]
    const rival = pool[0]
    expect(player?.kind).toBe('player')
    expect(player?.color).toBe('#1c1c1c')
    expect(rival?.kind).toBe('rival')
    expect(rival?.color).toBe('#c4654a')
    for (const marker of pool.slice(0, count)) {
      expect(marker.x).toBeGreaterThanOrEqual(8)
      expect(marker.y).toBeGreaterThanOrEqual(8)
      expect(marker.x).toBeLessThanOrEqual(140)
      expect(marker.y).toBeLessThanOrEqual(140)
      expect(Number.isFinite(marker.yaw)).toBe(true)
    }
    expect(
      Math.hypot((player?.x ?? 0) - (rival?.x ?? 0), (player?.y ?? 0) - (rival?.y ?? 0)),
    ).toBeGreaterThan(0.5)
  })
})

describe('minimap paint', () => {
  it('strokes the shoulder, the asphalt and the shortcut', () => {
    const track = squareTrack([
      {
        id: 'corte',
        name: 'Corte',
        fromCorner: 0,
        toCorner: 2,
        halfWidth: 3,
        x0: 0,
        z0: 0,
        x1: 40,
        z1: 40,
      },
    ])
    const fit = fitBounds(measureTrack(track), 120, 120, 12)
    const ctx = new FakeCtx()
    renderTrack(asCtx(ctx), track, fit, FALLBACK_PALETTE)
    expect(ctx.strokes[0]).toBe(FALLBACK_PALETTE.shoulder)
    expect(ctx.strokes[1]).toBe(FALLBACK_PALETTE.asphalt)
    expect(ctx.strokes).toContain(FALLBACK_PALETTE.accent)
    expect(ctx.strokes).toContain(FALLBACK_PALETTE.ink)
  })

  it('paints nothing when the circuit has no samples', () => {
    const ctx = new FakeCtx()
    const empty = { ...squareTrack([]), samples: [] as SplineSample[], shortcuts: [] }
    renderTrack(asCtx(ctx), empty, fitBounds(measureTrack(empty), 80, 80, 12), FALLBACK_PALETTE)
    expect(ctx.strokes).toEqual([])
    expect(ctx.fills).toEqual([])
  })

  it('draws the player arrow in the accent and keeps the dot on top', () => {
    const ctx = new FakeCtx()
    const markers: MapMarker[] = [
      { x: 20, y: 30, yaw: 0.2, color: '#c45c28', kind: 'rival' },
      { x: 40, y: 50, yaw: 1, color: '#d6e41a', kind: 'player' },
    ]
    renderMarkers(asCtx(ctx), markers, markers.length, FALLBACK_PALETTE)
    expect(ctx.arcs).toBe(2)
    expect(ctx.fills).toContain('#d6e41a')
    expect(ctx.fills[ctx.fills.length - 1]).toBe(FALLBACK_PALETTE.ink)
    expect(ctx.strokes).toContain(FALLBACK_PALETTE.ink)
    expect(ctx.strokes).toContain(FALLBACK_PALETTE.outline)
  })
})

class FakeCtx {
  fills: string[] = []
  strokes: string[] = []
  arcs = 0
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  globalAlpha = 1
  lineJoin = 'miter'
  lineCap = 'butt'
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  save(): void {}
  restore(): void {}
  setLineDash(): void {}
  arc(): void {
    this.arcs += 1
  }
  fill(): void {
    this.fills.push(this.fillStyle)
  }
  stroke(): void {
    this.strokes.push(this.strokeStyle)
  }
}

function asCtx(ctx: FakeCtx): CanvasRenderingContext2D {
  return ctx as unknown as CanvasRenderingContext2D
}

function squareTrack(shortcuts: Track['shortcuts']): Track {
  const samples: SplineSample[] = [
    { s: 0, x: 0, z: 0, heading: 0, curvature: 0 },
    { s: 10, x: 40, z: 0, heading: Math.PI / 2, curvature: 0 },
    { s: 20, x: 40, z: 40, heading: Math.PI, curvature: 0 },
    { s: 30, x: 0, z: 40, heading: -Math.PI / 2, curvature: 0 },
  ]
  return {
    id: 'test',
    name: 'Prueba',
    description: '',
    laps: 1,
    width: 10,
    runoff: 4,
    gates: 4,
    spacing: 1,
    length: 40,
    samples,
    shortcuts,
    corners: [],
  }
}

function racer(
  partial: Partial<RacerSnapshot> & Pick<RacerSnapshot, 'id' | 'x' | 'z'>,
): RacerSnapshot {
  return {
    carId: 'flash-7b',
    name: partial.id,
    isPlayer: false,
    color: '#ffffff',
    modelUrl: '',
    yaw: 0,
    steer: 0,
    speed: 0,
    slip: 0,
    surface: 'asphalt',
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    gate: 0,
    energy: 1,
    energyCapacity: 1,
    condition: 1,
    finished: false,
    finishTime: null,
    position: 1,
    odometer: 0,
    ...partial,
  }
}

function snapshot(racers: RacerSnapshot[], extras: RacerSnapshot[] = []): RaceSnapshot {
  return {
    trackId: 'gradiente',
    trackName: 'Autódromo de Potrerillos',
    laps: 2,
    time: 1,
    finished: false,
    racers,
    extras,
    events: [],
  }
}

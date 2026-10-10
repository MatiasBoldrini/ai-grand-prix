import { buildTrack } from './spline.ts'
import type { Track, TrackDefinition } from './types.ts'

interface TrackModule {
  track: TrackDefinition
}

const modules = import.meta.glob<TrackModule>('./circuits/*.ts', { eager: true })

const built = new Map<string, Track>()

function all(): Track[] {
  if (built.size === 0) {
    for (const mod of Object.values(modules)) {
      const track = buildTrack(mod.track)
      built.set(track.id, track)
    }
  }
  return [...built.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function listTracks(): Track[] {
  return all()
}

export function getTrack(id: string): Track {
  const track = all().find((item) => item.id === id)
  if (!track) throw new Error(`Unknown track "${id}"`)
  return track
}

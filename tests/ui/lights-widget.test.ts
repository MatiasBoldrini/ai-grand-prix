import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { resetStartLights } from '../../src/race/hooks/lights.ts'
import { createRace, stepRace } from '../../src/race/world.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { listWidgets } from '../../src/ui/widget-registry.ts'
import { clipForLights, lightsAnnouncement, widget } from '../../src/ui/widgets/lights.ts'

describe('start lights widget', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    ids.clear()
    resetStartLights()
  })

  it('registers from the widget folder', () => {
    expect(widget.id).toBe('lights')
    expect(listWidgets().map((item) => item.id)).toContain('lights')
  })

  it('beeps through the bus: click per lamp, confirm when the lights go out', () => {
    expect(clipForLights('3')).toBe('click')
    expect(clipForLights('2')).toBe('click')
    expect(clipForLights('1')).toBe('click')
    expect(clipForLights('¡ya!')).toBe('confirm')
    expect(clipForLights('')).toBeNull()
    expect(lightsAnnouncement('3')).toBe('Tres')
    expect(lightsAnnouncement('¡ya!')).toBe('Ya')
    expect(lightsAnnouncement('')).toBe('')
  })

  it('does not import the race world or the app shell', () => {
    const source = readFileSync(new URL('../../src/ui/widgets/lights.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/race\/world|game\/app|widget-registry|hook-registry/)
    const hook = readFileSync(new URL('../../src/race/hooks/lights.ts', import.meta.url), 'utf8')
    expect(hook).not.toMatch(/from ['"][^'"]*world\.ts['"]/)
    expect(hook).toMatch(/import type \{/)
  })

  it('shows 3, 2, 1 and ya, then gets out of the way', () => {
    const parent = installDom()
    const mounted = widget.mount(parent as unknown as HTMLElement)
    const root = parent.children[0]
    expect(root?.hidden).toBe(true)
    expect(root?.attributes.get('data-widget')).toBe('lights')
    expect(parent.queryAll('[data-light]')).toHaveLength(3)

    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'human',
    })
    const dt = 1 / 60
    const seen: string[] = []
    for (let i = 0; i < 60 * 5; i += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, dt)
      mounted.update?.({ snapshot: null })
      const label = root?.query('p')?.textContent ?? ''
      if (seen[seen.length - 1] !== label) seen.push(label)
    }
    expect(seen).toEqual(['3', '2', '1', '¡ya!', ''])
    expect(root?.hidden).toBe(true)
    expect(root?.attributes.get('data-phase')).toBe('off')

    mounted.unmount()
    expect(parent.children).toEqual([])
    expect(document.getElementById('agp-lights-style')).toBeNull()
  })
})

class FakeEl {
  id = ''
  className = ''
  hidden = false
  textContent = ''
  parent: FakeEl | null = null
  children: FakeEl[] = []
  attributes = new Map<string, string>()

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  append(...nodes: FakeEl[]): void {
    for (const node of nodes) {
      node.parent = this
      this.children.push(node)
      if (node.id) ids.set(node.id, node)
    }
  }

  remove(): void {
    if (this.id) ids.delete(this.id)
    const parent = this.parent
    if (!parent) return
    parent.children = parent.children.filter((child) => child !== this)
    this.parent = null
  }

  query(selector: string): FakeEl | undefined {
    return this.queryAll(selector)[0]
  }

  queryAll(selector: string): FakeEl[] {
    const found: FakeEl[] = []
    for (const child of this.children) {
      if (selector === 'p' && child.className.includes('agp-lights-count')) found.push(child)
      if (selector === '[data-light]' && child.attributes.has('data-light')) found.push(child)
      found.push(...child.queryAll(selector))
    }
    return found
  }
}

const ids = new Map<string, FakeEl>()

function installDom(): FakeEl {
  ids.clear()
  const head = new FakeEl()
  vi.stubGlobal('document', {
    createElement: () => new FakeEl(),
    getElementById: (id: string) => ids.get(id) ?? null,
    head,
  })
  return new FakeEl()
}

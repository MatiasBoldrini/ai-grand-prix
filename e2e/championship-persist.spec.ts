import { expect, test, type Page } from '@playwright/test'

// Playtest item 9 was measured on a desktop viewport. Phone layout is out of scope.
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })

const KEY = 'agp-championship'

test('an abandoned round is still in progress after a reload', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/')
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await openChampionship(page)
  await page.getByRole('button', { name: 'Arrancá la fecha 1' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Abandoná la carrera' }).click()
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()

  await openChampionship(page)
  await expect(page.getByRole('button', { name: 'Retomá la fecha 1' })).toBeVisible()
  await expect(page.getByText('En curso')).toBeVisible()

  await page.reload()
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await openChampionship(page)
  await expect(page.getByRole('button', { name: 'Retomá la fecha 1' })).toBeVisible()
  await expect(page.getByText('En curso')).toBeVisible()
  await expect(page.getByText('Pendiente').first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('points survive a reload, and clearing the key starts a fresh season', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/')
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await openChampionship(page)

  await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) throw new Error('missing season')
    const season = JSON.parse(raw) as {
      rounds: { index: number; trackId: string; trackName: string }[]
      results: unknown[]
      pendingIndex: number | null
    }
    const round = season.rounds[0]
    if (!round) throw new Error('missing round')
    season.pendingIndex = null
    season.results = [
      {
        index: round.index,
        trackId: round.trackId,
        trackName: round.trackName,
        finishers: [
          { id: 'player', name: 'Vos', position: 1, finishTime: 70.5 },
          { id: 'rival', name: 'Reasoner 70B', position: 2, finishTime: 75 },
        ],
      },
    ]
    localStorage.setItem(key, JSON.stringify(season))
  }, KEY)

  await page.reload()
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await openChampionship(page)
  await expect(page.getByText('8 pts, 1 victoria')).toBeVisible()
  await expect(page.getByText('Ganaste')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Arrancá la fecha 2' })).toBeVisible()

  await page.evaluate((key) => localStorage.removeItem(key), KEY)
  await page.reload()
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await openChampionship(page)
  await expect(page.getByRole('button', { name: 'Arrancá la fecha 1' })).toBeVisible()
  await expect(page.getByText('Ganaste')).toHaveCount(0)
  await expect(page.getByText('0 pts').first()).toBeVisible()
  await expect(page.getByText('Pendiente').first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

function watch(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function openChampionship(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Campeonato' }).click()
  await expect(page.getByRole('heading', { name: 'Campeonato' })).toBeVisible()
}

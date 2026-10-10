import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test('the start lights hold the grid, then the clock runs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()

  const lights = page.locator('[data-widget="lights"]')
  const pause = page.getByRole('button', { name: 'Pausa' })
  await expect(pause).toBeVisible()
  await expect(lights).toBeVisible()
  await expect(lights.locator('[data-light]')).toHaveCount(3)

  const phase = await lights.getAttribute('data-phase')
  expect(['3', '2', '1']).toContain(phase)
  await expect(readout(page, 'Puesto')).toHaveText('1º')
  await expect(readout(page, 'Velocidad')).toHaveText('0')
  await expect(readout(page, 'Tiempo')).toHaveText('0:00.000')

  const lightsBox = await lights.boundingBox()
  const pauseBox = await pause.boundingBox()
  const timeBox = await page.locator('.readout', { hasText: 'Tiempo' }).boundingBox()
  const ghostBox = await page.locator('[data-ghost-delta]').boundingBox()
  expect(lightsBox).not.toBeNull()
  expect(pauseBox).not.toBeNull()
  expect(timeBox).not.toBeNull()
  expect(ghostBox).not.toBeNull()
  if (lightsBox && pauseBox) expect(overlaps(lightsBox, pauseBox)).toBe(false)
  if (lightsBox && timeBox) expect(overlaps(lightsBox, timeBox)).toBe(false)
  if (lightsBox && ghostBox) expect(overlaps(lightsBox, ghostBox)).toBe(false)

  await expect
    .poll(async () => lights.getAttribute('data-phase'), { timeout: 8_000 })
    .toMatch(/go|off/)
  await expect
    .poll(async () => readout(page, 'Tiempo').textContent(), { timeout: 8_000 })
    .not.toBe('0:00.000')

  expect(errors, errors.join('\n')).toEqual([])
})

function readout(page: Page, label: string): Locator {
  return page.locator('.readout', { hasText: label }).locator('b')
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

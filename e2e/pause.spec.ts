import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test('Seguí corriendo after Escape unpauses, and Escape still toggles', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()

  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) > 10, undefined, {
    timeout: 8_000,
  })
  await page.keyboard.up('KeyW')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Pausa' })).toBeVisible()
  const frozen = await playerSpeed(page)
  expect(frozen).toBeGreaterThan(10)
  expect(frozen).toBeLessThan(14)
  await page.waitForTimeout(500)
  expect(await playerSpeed(page)).toBe(frozen)

  await page.getByRole('button', { name: 'Seguí corriendo' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__AGP?.screen)).toBe('hud')

  await page.keyboard.down('KeyW')
  await page.waitForFunction(
    (floor) => (window.__AGP?.playerSpeed ?? 0) > Math.max(14, floor + 3),
    frozen,
    { timeout: 4_000 },
  )
  await page.keyboard.up('KeyW')

  const moving = await playerSpeed(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Pausa' })).toBeVisible()
  await page.waitForTimeout(400)
  expect(await playerSpeed(page)).toBe(moving)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__AGP?.screen)).toBe('hud')
  await page.keyboard.down('KeyW')
  await page.waitForFunction((floor) => (window.__AGP?.playerSpeed ?? 0) > floor + 2, moving, {
    timeout: 4_000,
  })
  await page.keyboard.up('KeyW')
  expect(errors, errors.join('\n')).toEqual([])
})

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function playerSpeed(page: Page): Promise<number> {
  return page.evaluate(() => window.__AGP?.playerSpeed ?? 0)
}

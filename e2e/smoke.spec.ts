import { expect, test } from '@playwright/test'

test('loads the menu, starts a race and stays quiet in the console', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(errors, errors.join('\n')).toEqual([])
})

test('autodrive moves the car without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/?autodrive=1')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) > 8, undefined, {
    timeout: 20_000,
  })
  expect(errors, errors.join('\n')).toEqual([])
})

test('autodrive completes a full lap', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/?autodrive=1')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await page.waitForFunction(() => (window.__AGP?.playerLap ?? 0) >= 1, undefined, {
    timeout: 140_000,
  })
  expect(errors, errors.join('\n')).toEqual([])
})

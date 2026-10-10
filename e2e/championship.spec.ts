import { expect, test } from '@playwright/test'

test('the championship is on the menu and the next round starts a race', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()
  await page.getByRole('button', { name: 'Campeonato' }).click()
  await expect(page.getByRole('heading', { name: 'Campeonato' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Tabla' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Fechas' })).toBeVisible()
  await expect(page.getByText('Pendiente').first()).toBeVisible()
  await page.getByRole('button', { name: 'Arrancá la fecha 1' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

import { expect, test } from '@playwright/test'

test('a wall hit shows the chassis loss on the hud', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  const chip = page.locator('[data-widget="damage"]')
  await expect(chip).toBeVisible()
  await expect(chip.locator('b')).toHaveText('100%')
  await expect(chip).toContainText('Entero')

  await page.keyboard.down('ArrowUp')
  await page.keyboard.down('ArrowLeft')
  await expect
    .poll(async () => Number((await chip.getAttribute('data-condition')) ?? '100'), {
      timeout: 12_000,
    })
    .toBeLessThan(100)
  await expect(chip).toContainText(/Perdiste|tocado|empuja/)
  await page.keyboard.up('ArrowUp')
  await page.keyboard.up('ArrowLeft')
  expect(errors, errors.join('\n')).toEqual([])
})

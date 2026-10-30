import { expect, test } from '@playwright/test'
import { openEditor } from './helpers'

test('adds a shape from the toolbar and undoes it', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await expect(page.locator('input[value="Box"]')).toBeVisible()
  await page.getByTitle('Undo').click()
  await expect(page.locator('input[value="Box"]')).toHaveCount(0)
  await expect(page.locator('select option', { hasText: 'Box' })).toHaveCount(0)
})

test('keyframes the selection on the timeline', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  await page.getByTitle('Animation timeline').click()
  await expect(page.getByText(/press Keyframe/)).toBeVisible()
  await page.getByRole('button', { name: 'Keyframe', exact: true }).click()
  await expect(page.getByTitle('Keyframe at 0s')).toBeVisible()
})

test('explains it when the assistant is unavailable', async ({ page }) => {
  // Local runs have no model, so this is the error a user would see offline.
  await openEditor(page)
  const field = page.getByLabel('Message the assistant')
  await field.fill('add a red sphere')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('add a red sphere')).toBeVisible()
})

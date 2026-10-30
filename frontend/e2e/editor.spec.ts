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

test('jumps back through the history panel', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Add sphere').click()
  await page.getByTitle('History').click()
  const history = page.getByRole('dialog', { name: 'History' })
  await expect(history.getByRole('button', { name: 'Added Sphere' })).toHaveAttribute('aria-current', 'step')
  await history.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('select option', { hasText: 'Box' })).toHaveCount(0)
  await history.getByRole('button', { name: 'Added Sphere' }).click()
  await expect(page.locator('select option', { hasText: 'Sphere' }).first()).toBeAttached()
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

test('starts from a template and undoes it', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Start from a template').click()
  await page.getByRole('dialog', { name: 'Start from a template' }).getByRole('button', { name: /Snowman/ }).click()
  await expect(page.locator('select option', { hasText: 'Carrot nose' }).first()).toBeAttached()
  await page.getByTitle('Undo').click()
  await expect(page.locator('select option', { hasText: 'Carrot nose' })).toHaveCount(0)
})

test('exports a shape for 3D printing', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Export for 3D printing').click()
  const dialog = page.getByRole('dialog', { name: 'Export for 3D printing' })
  await dialog.getByRole('button', { name: 'Small' }).click()
  await expect(dialog).toContainText('50 × 50 × 50 mm')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download STL' }).click()
  expect((await download).suggestedFilename()).toBe('scene.stl')
})

test('offers a way to start on an empty scene', async ({ page }) => {
  await openEditor(page)
  const card = page.getByRole('region', { name: 'Get started' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Add a box' }).click()
  await expect(card).toHaveCount(0)
  await page.getByTitle('Undo').click()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /Try saying/ }).click()
  await expect(page.getByText('Build a snowman with a hat and a carrot nose').first()).toBeVisible()
})

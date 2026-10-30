import { expect, test } from '@playwright/test'
import { openEditor } from './helpers'

test('fits a phone: toolbar along the bottom and one sheet at a time', async ({ page }) => {
  await openEditor(page)
  const box = await page.getByTitle('Add box').boundingBox()
  const viewport = page.viewportSize()!
  expect(box!.y).toBeGreaterThan(viewport.height * 0.7)

  await page.getByTitle('Assistant').click()
  await expect(page.getByLabel('Message the assistant')).toBeVisible()
  await page.getByTitle('Inspector').click()
  await expect(page.getByLabel('Message the assistant')).toBeHidden()

  await page.getByTitle('More').click()
  await expect(page.getByRole('menuitem', { name: 'Animation timeline' })).toBeVisible()
})

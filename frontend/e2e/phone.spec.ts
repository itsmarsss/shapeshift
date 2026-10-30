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

test('fits the top bar on a narrow phone, with the account in the menu', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await openEditor(page)
  const cutOff = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => {
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.top < 60 && (r.right > innerWidth + 0.5 || r.left < -0.5)
      })
      .map((b) => b.title || b.textContent),
  )
  expect(cutOff).toEqual([])
  await page.getByTitle('More').click()
  await expect(page.getByRole('menuitem', { name: 'Sign in' })).toBeVisible()
})

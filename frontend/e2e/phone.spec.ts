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

test('keeps the toolbar tappable under the get-started card', async ({ page }) => {
  await openEditor(page)
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible()
  await page.getByTitle('Add sphere').tap()
  await expect(page.getByRole('region', { name: 'Get started' })).toHaveCount(0)
})

test('drags a shape with a finger', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').tap()
  const position = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects[0]?.position as number[] | undefined)
  await expect.poll(position).toEqual([0, 0.5, 0])
  const { width, height } = page.viewportSize()!
  // Real touch events, the way a phone sends them.
  const cdp = await page.context().newCDPSession(page)
  const from = { x: width / 2 - 25, y: height / 2 + 10 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + i * 7, y: from.y + i * 4 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await position())?.[0] ?? 0).toBeGreaterThan(0.3)
  expect((await position())?.[1]).toBeCloseTo(0.5)
})

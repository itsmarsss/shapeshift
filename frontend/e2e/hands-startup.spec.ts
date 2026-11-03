import { expect, test } from '@playwright/test'
import { openEditor } from './helpers'

// A fake camera, and the tracker's download held back so it's caught mid-way.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('shows each step of starting hand control, with the download, and can be cancelled', async ({ page }) => {
  await page.context().route('**/mediapipe/**', () => {})
  await openEditor(page)
  await page.getByTitle('Turn on hand control').click()
  const card = page.getByRole('status', { name: 'Starting hand control' })
  await expect(card).toContainText('Turning on hand control')
  await expect(card).toContainText('Camera on')
  await expect(card).toContainText('Downloading hand tracking')
  await expect(page.getByTitle('Turn off hand control').locator('.spin')).toBeVisible()
  await card.getByRole('button', { name: 'Cancel' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByTitle('Turn on hand control')).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { openEditor, signIn, uniqueEmail } from './helpers'

test('signs in, saves to the cloud, shares a link and remixes it', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add cone').click()
  const email = uniqueEmail('cloud')
  await signIn(page, email)

  const account = page.getByTitle(email)
  await account.click()
  await page.getByRole('menuitem', { name: 'Save to the cloud' }).click()
  await account.click()
  await page.getByRole('menuitem', { name: 'My scenes' }).click()
  const dialog = page.getByRole('dialog', { name: 'My scenes' })
  await expect(dialog.getByText('Untitled scene')).toBeVisible()

  await dialog.getByTitle('Share a view-only link').click()
  await expect(dialog.getByText('Anyone with the link can view')).toBeVisible()
  const slug = await page.evaluate(async () => {
    const res = await fetch('/api/scenes')
    const { scenes } = (await res.json()) as { scenes: { publicSlug: string | null }[] }
    return scenes[0].publicSlug
  })

  await page.goto(`/s/${slug}`)
  await expect(page.getByText('Untitled scene')).toBeVisible()
  await page.getByRole('link', { name: /Remix/ }).or(page.getByText('Remix in ShapeShift')).first().click()
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('select option', { hasText: 'Cone' })).toHaveCount(1)
})

test('joins the waitlist once', async ({ page }) => {
  const email = uniqueEmail('waitlist')
  await page.goto('/waitlist')
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.getByText("You're on the list")).toBeVisible()
  await page.reload()
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.getByText("You're already on the list")).toBeVisible()
})

test('shows a friendly message for links that no longer exist', async ({ page }) => {
  await page.goto('/s/AAAAAAAAAA')
  await expect(page.getByText("This link isn't shared anymore.")).toBeVisible()
})

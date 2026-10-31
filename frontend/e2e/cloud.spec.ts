import { expect, test } from '@playwright/test'
import { openEditor, signIn, uniqueEmail, countNamed } from './helpers'

test('signs in, saves to the cloud, shares a link and remixes it', async ({ page }) => {
  await openEditor(page)
  await page.keyboard.press('4')
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
  await page.getByText('Embed', { exact: true }).click()
  await expect(page.getByLabel('Embed code')).toHaveValue(new RegExp(`/s/${slug}\\?embed=1`))

  await page.goto(`/s/${slug}?embed=1`)
  const badge = page.getByRole('link', { name: /Made with ShapeShift/ })
  await expect(badge).toHaveAttribute('href', `/s/${slug}?remix=1`)
  await expect(page.getByText('Remix in ShapeShift')).toHaveCount(0)
  await page.goto(`/s/${slug}`)
  await page.getByRole('link', { name: /Remix/ }).or(page.getByText('Remix in ShapeShift')).first().click()
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(countNamed(page, 'Cone')).toBe(1)

  // The embed's remix link opens a copy straight in the editor.
  await page.goto(`/s/${slug}?remix=1`)
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(countNamed(page, 'Cone')).toBe(1)
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

test('shows signed-in people their scenes before the editor', async ({ page }) => {
  await openEditor(page)
  await page.keyboard.press('5')
  const email = uniqueEmail('home')
  await signIn(page, email)
  await page.getByTitle(email).click()
  await page.getByRole('menuitem', { name: 'Save to the cloud' }).click()
  await expect(page.getByTitle(email).locator('span')).toBeAttached()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your scenes · 1' })).toBeVisible()
  await page.getByTitle('Open', { exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect.poll(countNamed(page, 'Torus')).toBeGreaterThan(0)

  await page.goto('/')
  await page.getByRole('link', { name: 'Blank scene' }).click()
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible()
  await page.getByTitle('Undo').click()
  await expect.poll(countNamed(page, 'Torus')).toBeGreaterThan(0)

  await page.goto('/')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.goto('/')
  await expect(page.getByTitle('Add box')).toBeVisible()
})

test('lists a scene in Explore only when its owner chooses to', async ({ page }) => {
  // Counts listed scenes; earlier runs may have left some behind locally.
  const listed = () => page.evaluate(async () => (await (await fetch('/api/explore')).json()).scenes.length as number)
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const email = uniqueEmail('explore')
  await signIn(page, email)
  const before = await listed()
  await page.getByTitle(email).click()
  await page.getByRole('menuitem', { name: 'Save to the cloud' }).click()
  await page.getByTitle(email).click()
  await page.getByRole('menuitem', { name: 'My scenes' }).click()
  const dialog = page.getByRole('dialog', { name: 'My scenes' })
  await dialog.getByTitle('Share a view-only link').click()
  await expect(dialog.getByText('Anyone with the link can view')).toBeVisible()
  // Sharing a link alone doesn't list it.
  expect(await listed()).toBe(before)
  await dialog.getByLabel('Show in Explore').check()
  await expect.poll(listed).toBe(Math.min(before + 1, 24))

  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible()
  await page.locator('a[href^="/s/"]').first().click()
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9]{10}$/)
})

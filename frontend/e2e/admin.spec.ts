import { expect, test } from '@playwright/test'
import { openEditor, signIn, uniqueEmail } from './helpers'

// The local superuser only exists on localhost; see backend/src/admin.ts.
const SUPERUSER = 'admin@shapeshift.test'

test('keeps the admin page hidden and gives each role only its sections', async ({ browser }) => {
  // Someone who isn't an admin sees nothing there.
  const visitor = await (await browser.newContext()).newPage()
  await openEditor(visitor)
  const helper = uniqueEmail('moderator')
  await signIn(visitor, helper)
  await visitor.goto('/admin')
  await expect(visitor.getByText('Page not found')).toBeVisible()

  // The superuser sees every section and makes them a moderator.
  const boss = await (await browser.newContext()).newPage()
  await openEditor(boss)
  await signIn(boss, SUPERUSER)
  await boss.goto('/admin')
  await expect(boss.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  for (const section of ['Dashboard', 'Growth', 'Usage', 'Assistant', 'Health', 'People', 'Scenes', 'Feedback', 'Explore', 'Admins', 'Activity'])
    await expect(boss.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: section })).toBeVisible()
  await expect(boss.getByText('People signed up (vs a week ago)')).toBeVisible()

  // They can look someone up and open their account.
  const nav = (page: typeof boss) => page.getByRole('navigation', { name: 'Admin sections' })
  await nav(boss).getByRole('button', { name: 'People' }).click()
  await boss.getByLabel('Search people').fill(helper)
  await boss.getByRole('cell', { name: helper }).click()
  await expect(boss).toHaveURL(/s=people&id=/)
  await expect(boss.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
  await expect(boss.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible()
  await boss.goBack()
  await expect(boss.getByLabel('Search people')).toBeVisible()

  await nav(boss).getByRole('button', { name: 'Admins' }).click()
  await boss.getByLabel('Email of the new admin').fill(helper)
  await boss.getByLabel('Role').selectOption('moderator')
  await boss.getByRole('button', { name: 'Add or change' }).click()
  await expect(boss.getByRole('cell', { name: helper })).toBeVisible()
  await nav(boss).getByRole('button', { name: 'Activity' }).click()
  await expect(boss.getByText(`${helper} → moderator`)).toBeVisible()

  // Now they get in, but only to a moderator's sections.
  await visitor.reload()
  for (const section of ['Dashboard', 'Growth', 'Scenes', 'Feedback', 'Explore'])
    await expect(nav(visitor).getByRole('button', { name: section })).toBeVisible()
  for (const section of ['People', 'Admins', 'Activity']) await expect(nav(visitor).getByRole('button', { name: section })).toHaveCount(0)
})

test('shows each reported error with its stack trace on Health', async ({ page }) => {
  // Analytics Engine isn't reachable locally, so its answers are made up here.
  const days = (n: number) => Array.from({ length: n }, (_, i) => ({ day: new Date(Date.now() - (n - 1 - i) * 86400000).toISOString().slice(0, 10), n: i % 3 }))
  await page.route('**/api/admin/metrics/events*', (route) =>
    route.fulfill({ json: { configured: true, days: 7, visitors: days(14), events: { app_open: days(14) }, reach: {}, labels: [], firstShape: { medianSeconds: 0, count: 0 }, errors: days(14), topErrors: [] } }),
  )
  await page.route('**/api/admin/metrics/errors*', (route) =>
    route.fulfill({
      json: {
        configured: true,
        days: 7,
        errors: [
          { place: 'render', message: "Cannot read properties of undefined (reading 'x')", n: 12, visitors: 5, first: '2026-11-01 10:00:00', last: '2026-11-02 09:00:00', stack: 'TypeError: boom\n    at Inspector (Inspector.tsx:42)', pages: [{ label: '/edit', n: 11 }], browsers: [{ label: 'Safari 18 · iOS', n: 9 }], recent: [] },
          { place: 'promise', message: 'Failed to fetch', n: 3, visitors: 2, first: '2026-11-02 01:00:00', last: '2026-11-02 08:00:00', stack: '', pages: [], browsers: [], recent: [] },
        ],
      },
    }),
  )
  await openEditor(page)
  await signIn(page, SUPERUSER)
  await page.goto('/admin?s=health')
  const first = page.getByRole('button', { name: /reading 'x'/ })
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('at Inspector (Inspector.tsx:42)')).toBeVisible()
  await expect(page.getByText('Safari 18 · iOS · 9')).toBeVisible()
  await page.getByRole('button', { name: /Failed to fetch/ }).click()
  await expect(page.getByText('No stack trace (reported before they were kept).')).toBeVisible()
  await first.click()
  await expect(page.getByText('at Inspector (Inspector.tsx:42)')).toHaveCount(0)
})

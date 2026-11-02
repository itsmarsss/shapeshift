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
  await expect(boss.getByRole('heading', { name: 'Admin' })).toBeVisible()
  for (const section of ['Overview', 'Feedback', 'People', 'Explore', 'Admins', 'Activity'])
    await expect(boss.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: section })).toBeVisible()
  await expect(boss.getByText('People signed up')).toBeVisible()
  await boss.getByRole('button', { name: 'Admins' }).click()
  await boss.getByLabel('Email of the new admin').fill(helper)
  await boss.getByLabel('Role').selectOption('moderator')
  await boss.getByRole('button', { name: 'Add or change' }).click()
  await expect(boss.getByRole('cell', { name: helper })).toBeVisible()
  await boss.getByRole('button', { name: 'Activity' }).click()
  await expect(boss.getByText(`${helper} → moderator`)).toBeVisible()

  // Now they get in, but only to a moderator's sections.
  await visitor.reload()
  const nav = visitor.getByRole('navigation', { name: 'Admin sections' })
  await expect(nav.getByRole('button', { name: 'Feedback' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Explore' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'People' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Admins' })).toHaveCount(0)
})

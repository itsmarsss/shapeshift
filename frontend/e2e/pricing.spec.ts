import { expect, test } from '@playwright/test'
import { openEditor, signIn, uniqueEmail } from './helpers'

test('says Pro is coming when billing is off', async ({ page }) => {
  await page.goto('/pricing')
  const pro = page.getByRole('region', { name: 'Pro plan' })
  await expect(pro.getByRole('button', { name: 'Coming soon' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Free plan' })).toContainText('50 assistant prompts a month')
})

test('sends a free account to checkout for the chosen price', async ({ page }) => {
  // Billing needs Stripe keys, so these two calls stand in for the server.
  await page.route('/api/billing', (route) => route.fulfill({ json: { available: true } }))
  let interval: string | undefined
  await page.route('/api/billing/checkout', async (route) => {
    interval = route.request().postDataJSON().interval
    await route.fulfill({ json: { url: '/pricing?upgraded=1' } })
  })

  await openEditor(page)
  const email = uniqueEmail('pricing')
  await signIn(page, email)
  await page.getByTitle(email).click()
  await page.getByRole('menuitem', { name: 'Upgrade to Pro' }).click()
  await expect(page).toHaveURL(/\/pricing$/)
  await page.getByRole('button', { name: 'Monthly' }).click()
  await expect(page.getByRole('region', { name: 'Pro plan' })).toContainText('$12')
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click()
  await expect(page.getByRole('status')).toContainText('Finishing your upgrade')
  expect(interval).toBe('month')
})

test('scrolls on a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 600 })
  await page.goto('/pricing')
  const last = page.getByText('Do I need Pro to use hand control or export?')
  await expect(last).toBeAttached()
  await page.mouse.move(600, 300)
  // Wheel scrolling, as a person would, since that is what the page blocked.
  await expect(async () => {
    await page.mouse.wheel(0, 2000)
    await expect(last).toBeInViewport({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
})

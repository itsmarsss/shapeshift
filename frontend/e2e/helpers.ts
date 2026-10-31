import { expect, type Page } from '@playwright/test'

// Opens the editor fresh. Any first-run dialog is dismissed so tests start
// from the same place a returning user would.
export async function openEditor(page: Page, path = '/') {
  await page.addInitScript(() => localStorage.setItem('shapeshift-onboarded', '1'))
  await page.goto(path)
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.keyboard.press('Escape')
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`

export async function signIn(page: Page, email: string) {
  await page.getByRole('button', { name: /sign in/i }).first().click()
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  // Local development shows the code, since there's no email provider.
  const note = page.getByText(/your code is \d{6}/)
  await expect(note).toBeVisible()
  const code = (await note.textContent())!.match(/\d{6}/)![0]
  await page.getByPlaceholder('000000').fill(code)
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0)
}

// Picks an item from the top bar's File menu.
export async function fromFileMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

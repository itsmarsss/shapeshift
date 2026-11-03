import { expect, type Page } from '@playwright/test'

// Opens the editor fresh. Any first-run dialog is dismissed so tests start
// from the same place a returning user would.
export async function openEditor(page: Page, path = '/edit') {
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

// How many objects with this name the saved scene has. The editor saves its
// scene a moment after each change, so poll this rather than read it once.
export function countNamed(page: Page, name: string) {
  return () =>
    page.evaluate(
      (n) => (JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects as { name: string }[]).filter((o) => o.name === n).length,
      name,
    )
}

// Waits until a value read from the page stops changing for a while (three
// reads in a row, half a second apart). The scene autosaves 300ms after the
// last change, and slow CI machines can still be applying a drag after the
// mouse is released, so one matching pair of reads isn't enough.
export async function settled<T>(read: () => Promise<T>): Promise<T> {
  const seen: string[] = []
  await expect
    .poll(
      async () => {
        seen.push(JSON.stringify(await read()))
        return seen.length >= 3 && seen.slice(-3).every((v) => v === seen.at(-1))
      },
      { intervals: [500], timeout: 15000 },
    )
    .toBe(true)
  return JSON.parse(seen.at(-1)!) as T
}

// Lets the 3D view draw after a change, so the next click hits what was just added.
export const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

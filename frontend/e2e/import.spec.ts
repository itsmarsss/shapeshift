import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openEditor } from './helpers'

const STEP = readFileSync(new URL('../src/import/fixtures/as1.stp', import.meta.url))

// A 20 x 10 x 5 mm block as a binary STL: 12 triangles.
function blockSTL() {
  const [x, y, z] = [20, 10, 5]
  const v = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]]
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  const buffer = Buffer.alloc(84 + faces.length * 50)
  buffer.writeUInt32LE(faces.length, 80)
  faces.forEach((f, i) => {
    const at = 84 + i * 50 + 12
    f.forEach((index, k) => v[index].forEach((c, j) => buffer.writeFloatLE(c, at + k * 12 + j * 4)))
  })
  return buffer
}

const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <path id="letter-o" fill="#2060ff" d="M50 10 A40 40 0 1 1 49.99 10 Z M50 30 A20 20 0 1 0 50.01 30 Z"/>
  <rect id="base" x="0" y="92" width="100" height="8" fill="#ff8000"/>
</svg>`)

// Drops files on the viewport the way a file manager would.
async function drop(page: Page, files: { name: string; data: Buffer }[]) {
  const transfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer()
    for (const f of list) dt.items.add(new File([new Uint8Array(f.data)], f.name))
    return dt
  }, files.map((f) => ({ name: f.name, data: [...f.data] })))
  const canvas = page.locator('canvas').first()
  await canvas.dispatchEvent('dragenter', { dataTransfer: transfer })
  await expect(page.getByText('Drop to open')).toBeVisible()
  await canvas.dispatchEvent('dragover', { dataTransfer: transfer })
  await canvas.dispatchEvent('drop', { dataTransfer: transfer })
}

const parts = (page: Page) => page.getByRole('dialog', { name: 'Parts' })

test('drops a STEP assembly in and browses its parts', async ({ page }) => {
  await openEditor(page)
  await drop(page, [{ name: 'as1.stp', data: STEP }])
  const tree = parts(page)
  await expect(tree.getByRole('button', { name: 'as1', exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(tree.getByRole('button', { name: 'PLATE' })).toBeVisible()

  await tree.getByRole('button', { name: 'ROD_ASM' }).click()
  await expect(page.locator('select').first()).toHaveValue(/.+/)
  await tree.getByRole('button', { name: 'ROD_ASM' }).locator('[data-caret]').click()
  await expect(tree.getByRole('button', { name: 'ROD_ASM' })).toHaveAttribute('aria-expanded', 'true')

  const plate = tree.locator('[data-key]').filter({ has: page.getByRole('button', { name: 'PLATE' }) })
  await plate.hover()
  await plate.getByTitle('Hide', { exact: true }).click()
  await expect(plate.getByTitle('Show', { exact: true })).toBeVisible()
  await plate.getByTitle('Show', { exact: true }).click()

  await plate.getByTitle('Show only this').click()
  const rod = tree.locator('[data-key="/as1/ROD_ASM"]')
  await expect(rod.getByTitle('Show', { exact: true })).toBeVisible()
  await plate.getByTitle('Show everything').click()
  await expect(rod.getByTitle('Show', { exact: true })).toHaveCount(0)

  // The model comes back after a reload, meshes and all.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.getByTitle('Parts', { exact: true }).click()
  await expect(parts(page).getByRole('button', { name: 'PLATE' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('drops an STL and an SVG in', async ({ page }) => {
  await openEditor(page)
  await drop(page, [{ name: 'block.stl', data: blockSTL() }])
  await expect(page.locator('select option', { hasText: 'block' })).toBeAttached({ timeout: 30_000 })
  await drop(page, [{ name: 'logo.svg', data: SVG }])
  const tree = parts(page)
  await expect(tree.getByRole('button', { name: 'letter-o' })).toBeVisible({ timeout: 30_000 })
  await expect(tree.getByRole('button', { name: 'base' })).toBeVisible()
})

test('explains a file it can not open', async ({ page }) => {
  await openEditor(page)
  await drop(page, [{ name: 'broken.step', data: Buffer.from('ISO-10303-21;\nthis is not a model') }])
  await expect(page.getByRole('alert', { name: 'Import failed' })).toContainText("Couldn't open broken.step", { timeout: 60_000 })
  await page.getByRole('alert', { name: 'Import failed' }).getByTitle('Dismiss').click()
  await drop(page, [{ name: 'notes.txt', data: Buffer.from('hello') }])
  await expect(page.getByRole('alert', { name: 'Import failed' })).toContainText("isn't supported")
})

test('cuts the model with a section plane', async ({ page }) => {
  await openEditor(page)
  await drop(page, [{ name: 'as1.stp', data: STEP }])
  const tree = parts(page)
  await expect(tree.getByRole('button', { name: 'PLATE' })).toBeVisible({ timeout: 60_000 })
  const canvas = page.locator('canvas').first()
  await page.waitForTimeout(1000)
  const whole = await canvas.screenshot()

  await tree.getByLabel('Section axis').getByText('Y').click()
  await expect(tree.getByRole('checkbox', { name: 'Section' })).toBeChecked()
  await tree.getByLabel('Section position').fill('0.3')
  await page.waitForTimeout(500)
  const cut = await canvas.screenshot()
  expect(cut.equals(whole)).toBe(false)

  await tree.getByTitle('Flip the cut').click()
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(cut)).toBe(false)

  await tree.getByRole('checkbox', { name: 'Section' }).uncheck()
  await expect(tree.getByLabel('Section position')).toBeDisabled()
})

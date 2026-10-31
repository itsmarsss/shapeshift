import { expect, test } from '@playwright/test'
import { fromFileMenu, openEditor, countNamed } from './helpers'

test('adds a shape from the toolbar and undoes it', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await expect(page.locator('input[value="Box"]')).toBeVisible()
  await page.getByTitle('Undo').click()
  await expect(page.locator('input[value="Box"]')).toHaveCount(0)
  await expect.poll(countNamed(page, 'Box')).toBe(0)
})

test('shows the intro once to new visitors', async ({ page }) => {
  await page.goto('/')
  const intro = page.getByRole('dialog', { name: 'Welcome to ShapeShift' })
  await expect(intro).toContainText('1 of 4')
  await intro.getByRole('button', { name: 'Next' }).click()
  await expect(intro).toContainText('2 of 4')
  await intro.getByRole('button', { name: 'Back' }).click()
  await intro.getByRole('button', { name: 'Skip' }).click()
  await expect(intro).toHaveCount(0)
  await page.reload()
  await expect(page.getByTitle('Add box')).toBeVisible()
  await expect(intro).toHaveCount(0)
})

test('jumps back through the history panel', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Add sphere').click()
  await page.getByTitle('History').click()
  const history = page.getByRole('dialog', { name: 'History' })
  await expect(history.getByRole('button', { name: 'Added Sphere' })).toHaveAttribute('aria-current', 'step')
  await history.getByRole('button', { name: 'Start' }).click()
  await expect.poll(countNamed(page, 'Box')).toBe(0)
  await history.getByRole('button', { name: 'Added Sphere' }).click()
  await expect.poll(countNamed(page, 'Sphere')).toBeGreaterThan(0)
})

test('keyframes the selection on the timeline', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  await page.getByTitle('Animation timeline').click()
  await expect(page.getByText(/press Keyframe/)).toBeVisible()
  await page.getByRole('button', { name: 'Keyframe', exact: true }).click()
  await expect(page.getByTitle('Keyframe at 0s')).toBeVisible()
})

test('explains it when the assistant is unavailable', async ({ page }) => {
  // Local runs have no model, so this is the error a user would see offline.
  await openEditor(page)
  const field = page.getByLabel('Message the assistant')
  await field.fill('add a red sphere')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('add a red sphere')).toBeVisible()
})

test('starts from a template and undoes it', async ({ page }) => {
  await openEditor(page)
  await fromFileMenu(page, 'Start from a template')
  await page.getByRole('dialog', { name: 'Start from a template' }).getByRole('button', { name: /Snowman/ }).click()
  await expect.poll(countNamed(page, 'Carrot nose')).toBeGreaterThan(0)
  await page.getByTitle('Undo').click()
  await expect.poll(countNamed(page, 'Carrot nose')).toBe(0)
})

test('exports a shape for 3D printing', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await fromFileMenu(page, 'Export for 3D printing')
  const dialog = page.getByRole('dialog', { name: 'Export for 3D printing' })
  await dialog.getByRole('button', { name: 'Small' }).click()
  await expect(dialog).toContainText('50 × 50 × 50 mm')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download STL' }).click()
  expect((await download).suggestedFilename()).toBe('scene.stl')
})

test('offers a way to start on an empty scene', async ({ page }) => {
  await openEditor(page)
  const card = page.getByRole('region', { name: 'Get started' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Add a box' }).click()
  await expect(card).toHaveCount(0)
  await page.getByTitle('Undo').click()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /Try saying/ }).click()
  await expect(page.getByText('Build a snowman with a hat and a carrot nose').first()).toBeVisible()
})

test('drags a shape across the floor, and orbits when dragging empty space', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const position = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects[0]?.position as number[] | undefined)
  await expect.poll(position).toEqual([0, 0.5, 0])
  const canvas = (await page.locator('canvas').first().boundingBox())!
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 12 })
    await page.mouse.up()
  }

  // Press on the box, left of the gizmo in the middle, and pull it right.
  await drag(canvas.x + canvas.width / 2 - 60, canvas.y + canvas.height / 2, 160, 0)
  await expect.poll(async () => (await position())?.[0] ?? 0).toBeGreaterThan(0.3)
  const moved = await position()
  expect(moved?.[1]).toBeCloseTo(0.5)

  // Dragging empty space turns the camera and leaves the box alone.
  await drag(canvas.x + 420, canvas.y + 140, 150, 40)
  expect(await position()).toEqual(moved)
  await expect(page.locator('input[value="Box"]')).toBeVisible()

  // The whole drag was one step.
  await page.getByTitle('Undo').click()
  await expect.poll(position).toEqual([0, 0.5, 0])
})

test('picks colors from the palette or by hex, as one undo step', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  const color = () => page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects[0]?.material.color)
  // The scene saves a moment after each change; wait for the new sphere.
  await expect.poll(color).toBeTruthy()
  const before = await color()

  await page.getByRole('button', { name: /^Color: #/ }).click()
  const picker = page.getByRole('dialog', { name: 'Pick color' })
  await picker.getByRole('button', { name: '#3e8ed0' }).click()
  await expect.poll(color).toBe('#3e8ed0')
  await picker.getByLabel('Hex color').fill('f80')
  await expect.poll(color).toBe('#ff8800')
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)

  // The color it was given last time comes back under Recent.
  await page.getByRole('button', { name: /^Color: #/ }).click()
  await expect(picker.getByRole('button', { name: 'Recent #ff8800' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTitle('Undo').click()
  await expect.poll(color).toBe(before)
})

test('turns the camera from the view cube and fits the scene in view', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const cube = page.getByTitle('View from the front').locator('..')
  const turn = () => cube.evaluate((el) => (el as HTMLElement).style.transform)

  await page.getByTitle('View from the right').click()
  // Looking from the right turns the cube a quarter turn, so Right faces you.
  await expect.poll(turn).toMatch(/rotateY\(-89\.\d+deg\)|rotateY\(-90deg\)/)
  await page.getByTitle('Reset the view').click()
  await expect.poll(turn).not.toMatch(/rotateY\(-9\d/)

  // Fitting only moves the camera in or out; it names what it fits.
  await expect(page.getByTitle('Fit the selection in view (F)')).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTitle('Fit everything in view (F)')).toBeEnabled()
})

test('keeps the inspector simple, with exact numbers under More options', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  await expect(page.getByText('Position (m)')).toHaveCount(0)

  // Metal needs something to reflect, so the lighting switches to Studio too.
  await page.getByRole('button', { name: 'Gold', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Gold', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Lighting belongs to the scene, so it shows once nothing is selected.
  await page.keyboard.press('Escape')
  await page.getByTitle('Inspector').click()
  await expect(page.locator('select').filter({ hasText: 'Studio' }).last()).toHaveValue('studio')
  // The scene panel can pick things by name, too.
  await page.locator('select').first().selectOption({ label: 'Sphere' })

  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByText('Position (m)')).toBeVisible()
  // The choice sticks for the next object.
  await page.getByTitle('Add box').click()
  await expect(page.getByText('Position (m)')).toBeVisible()
  await page.getByRole('button', { name: 'Fewer options' }).click()
  await expect(page.getByText('Position (m)')).toHaveCount(0)
})

test('closes the color picker with Escape and keeps the selection', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  await page.getByRole('button', { name: /^Color: #/ }).click()
  await page.getByRole('dialog', { name: 'Pick color' }).getByRole('button', { name: '#46a758' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Pick color' })).toHaveCount(0)
  await expect(page.locator('input[value="Sphere"]')).toBeVisible()
})

test('combines two selected shapes from the inspector', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Add sphere').click()
  const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects.length)
  await expect.poll(count).toBe(2)
  // Nothing floats over the view for this any more; it's in the inspector.
  await expect(page.getByText('First object')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect.poll(count).toBe(1)
})

test('keeps the get-started card clear of the side panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openEditor(page)
  const card = page.getByRole('region', { name: 'Get started' })
  // With nothing selected the inspector stays out of the way.
  await expect(page.getByText('Inspector', { exact: true })).toHaveCount(0)
  // Opened for scene settings, it sits beside the card, not under it.
  await page.getByTitle('Inspector').click()
  const scene = (await page.getByText('Scene', { exact: true }).locator('..').locator('..').boundingBox())!
  expect((await card.boundingBox())!.x).toBeGreaterThanOrEqual(scene.x + scene.width)
})

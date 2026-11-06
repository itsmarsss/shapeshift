import { expect, test } from '@playwright/test'
import { fromFileMenu, openEditor, countNamed, settled } from './helpers'

test('adds a shape from the toolbar and undoes it', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await expect(page.locator('input[value="Box"]')).toBeVisible()
  await page.getByTitle('Undo').click()
  await expect(page.locator('input[value="Box"]')).toHaveCount(0)
  await expect.poll(countNamed(page, 'Box')).toBe(0)
})

test('shows the intro once to new visitors', async ({ page }) => {
  await page.goto('/edit')
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

test('gives new visitors a first-steps checklist that ticks itself off', async ({ page }) => {
  await page.goto('/edit')
  await page.getByRole('dialog', { name: 'Welcome to ShapeShift' }).getByRole('button', { name: 'Skip' }).click()
  const steps = page.getByRole('region', { name: 'First steps' })
  // Not on an empty screen, where the get-started card is.
  await expect(steps).toHaveCount(0)
  await page.getByRole('region', { name: 'Get started' }).getByRole('button', { name: 'Add a box' }).click()
  await expect(steps).toContainText('0 of 5 done')

  // Recoloring the box ticks off its step, wherever it was done from.
  await page.getByRole('button', { name: /^Color: #/ }).click()
  await page.getByRole('dialog', { name: 'Pick color' }).getByRole('button', { name: '#3e8ed0' }).click()
  await page.keyboard.press('Escape')
  await expect(steps).toContainText('1 of 5 done')

  // "Show me" points at what to use: here, the assistant's message box.
  await steps.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'and press Enter' })).toBeVisible()
  await page.getByLabel('Message the assistant').fill('Build a snowman')
  await page.getByLabel('Message the assistant').press('Enter')
  await expect(steps).toContainText('2 of 5 done')
  await expect(page.getByRole('status').filter({ hasText: 'and press Enter' })).toHaveCount(0)

  // It can be dragged out of the way, by its header.
  const before = (await steps.boundingBox())!
  await page.mouse.move(before.x + 60, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x - 140, before.y - 220, { steps: 6 })
  await page.mouse.up()
  const after = (await steps.boundingBox())!
  expect(after.y).toBeLessThan(before.y - 150)
  await expect(steps).toContainText('2 of 5 done')

  await steps.getByTitle('Hide first steps').click()
  await expect(steps).toHaveCount(0)
  await page.reload()
  await expect(page.getByTitle('Add box')).toBeVisible()
  await expect(steps).toHaveCount(0)
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
  // The scene saves a moment after the drag ends; wait until it has settled.
  const moved = await settled(position)
  expect(moved?.[0]).toBeGreaterThan(0.3)
  expect(moved?.[1]).toBeCloseTo(0.5)

  // Dragging empty space turns the camera and leaves the box alone.
  await drag(canvas.x + 420, canvas.y + 140, 150, 40)
  expect(await settled(position)).toEqual(moved)
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

test('turns the view by dragging the view cube, without clicking a face', async ({ page }) => {
  await openEditor(page)
  const cube = page.getByTitle('View from the front').locator('..')
  const turn = () => cube.evaluate((el) => (el as HTMLElement).style.transform)
  const before = await turn()
  const box = (await page.getByTitle('Drag to turn the view').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y + 20, { steps: 8 })
  // Back over the cube, so the release lands on a face.
  await page.mouse.move(x + 6, y + 4, { steps: 8 })
  await page.mouse.up()
  await expect.poll(turn).not.toBe(before)
  // Released over a face, but it was a drag: the view stays where it was dragged to.
  const dragged = await turn()
  await page.waitForTimeout(800)
  expect(await turn()).toBe(dragged)
})

test('keeps the inspector simple, with exact numbers in a section that stays open', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add sphere').click()
  await expect(page.getByText('Position (m)')).toHaveCount(0)

  // Metal needs something to reflect, so the lighting switches to Studio too.
  await page.getByRole('button', { name: 'Gold', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Gold', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Lighting belongs to the scene, so the docked inspector shows it once
  // nothing is selected, without closing and moving the view.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Lighting', { exact: true })).toBeVisible()
  await expect(page.locator('select').filter({ hasText: 'Studio' }).last()).toHaveValue('studio')
  // The scene panel can pick things by name, too.
  await page.locator('select').first().selectOption({ label: 'Sphere' })

  await page.getByRole('button', { name: 'Position, rotation and size' }).click()
  await expect(page.getByText('Position (m)')).toBeVisible()
  // The choice sticks for the next object.
  await page.getByTitle('Add box').click()
  await expect(page.getByText('Position (m)')).toBeVisible()
  await page.getByRole('button', { name: 'Position, rotation and size' }).click()
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
  // Docked, the inspector shows the scene settings beside the card, not under it.
  await expect(page.getByText('Scene', { exact: true })).toBeVisible()
  const scene = (await page.getByText('Scene', { exact: true }).locator('..').locator('..').boundingBox())!
  expect((await card.boundingBox())!.x).toBeGreaterThanOrEqual(scene.x + scene.width)
})

for (const width of [740, 960, 1280]) {
  test(`fits the top bar at ${width}px without cutting or wrapping anything`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await openEditor(page)
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => {
          const r = b.getBoundingClientRect()
          return r.width > 0 && r.top < 50 && (r.right > innerWidth + 0.5 || r.height > 40)
        })
        .map((b) => b.title || b.textContent),
    )
    expect(broken).toEqual([])
  })
}

test('closes dialogs with Escape and keeps the selection', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await fromFileMenu(page, 'Export for 3D printing')
  const dialog = page.getByRole('dialog', { name: 'Export for 3D printing' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('input[value="Box"]')).toBeVisible()
})

test('keeps a dragged shape on the floor', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const position = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects[0]?.position as number[] | undefined)
  await expect.poll(position).toEqual([0, 0.5, 0])
  const canvas = (await page.locator('canvas').first().boundingBox())!
  const x = canvas.x + canvas.width / 2 - 60
  const y = canvas.y + canvas.height / 2
  // With no workplane set, a drag slides along the floor: its height stays put.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 120, y, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await position())?.[0] ?? 0).not.toBe(0)
  expect((await position())?.[1]).toBeCloseTo(0.5)
})

test('nudges the selection with the arrow keys, one undo step per press', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const position = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects[0]?.position as number[] | undefined)
  await expect.poll(position).toEqual([0, 0.5, 0])
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await position())?.[0]).toBeCloseTo(0.1)
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(async () => (await position())?.[2]).toBeCloseTo(-1)
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(async () => (await position())?.[1]).toBeCloseTo(0.6)
  await page.getByTitle('Undo').click()
  await expect.poll(async () => (await position())?.[1]).toBeCloseTo(0.5)
})

test('stacks a dragged shape on top of another', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Add sphere').click()
  const sphere = () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects as { name: string; position: number[] }[]).find((o) => o.name === 'Sphere')?.position)
  await expect.poll(sphere).toEqual([1.5, 0.5, 0])
  const c = (await page.locator('canvas').first().boundingBox())!
  // The sphere sits right of the box at the starting view; drop it on the box.
  await page.mouse.move(c.x + c.width / 2 + 110, c.y + c.height / 2 - 20)
  await page.mouse.down()
  await page.mouse.move(c.x + c.width / 2 - 10, c.y + c.height / 2 - 30, { steps: 20 })
  await page.mouse.up()
  await expect.poll(async () => (await sphere())?.[1]).toBeCloseTo(1.5)
})

test('adds a ready-made object as one group', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('All shapes').click()
  await page.getByRole('tab', { name: 'Objects' }).click()
  await page.getByTitle('Add a chair').click()
  await expect(page.getByText(/group “Chair”/)).toBeVisible()
  await expect.poll(countNamed(page, 'Seat')).toBe(1)
  await page.getByTitle('Undo').click()
  await expect.poll(countNamed(page, 'Seat')).toBe(0)
})

test('sends anonymous usage events until turned off in settings', async ({ page }) => {
  const events: { event: string; label: string }[] = []
  await page.route('/api/events', async (route) => {
    events.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await expect.poll(() => events.map((e) => e.event)).toContain('app_open')
  await expect.poll(() => events.map((e) => e.event)).toContain('first_shape')
  // Nothing personal goes along.
  expect(JSON.stringify(events)).not.toMatch(/@/)

  await page.getByTitle(/Settings/).click()
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('div').filter({ hasText: /^Share anonymous usage/ }).getByRole('switch').click()
  await page.keyboard.press('Escape')
  const sent = events.length
  await page.getByTitle('Add sphere').click()
  await fromFileMenu(page, 'Save image')
  await page.waitForTimeout(500)
  expect(events.length).toBe(sent)
})

test('records the animation as a video and says which format it saved', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('Animation timeline').click()
  await page.getByRole('button', { name: 'Keyframe', exact: true }).click()
  const download = page.waitForEvent('download', { timeout: 30_000 })
  await page.getByTitle('Record the animation as a video').click()
  const file = (await download).suggestedFilename()
  expect(file).toMatch(/^shapeshift\.(mp4|webm)$/)
  await expect(page.getByRole('status').filter({ hasText: file.endsWith('mp4') ? 'MP4' : 'WebM' })).toBeVisible()
})

test('sends feedback with a picture of the scene', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  let sent: { message: string; picture?: string } | undefined
  await page.route('/api/feedback', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true } })
  })
  await fromFileMenu(page, 'Send feedback')
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await dialog.getByLabel('Your feedback').fill('Rotating is hard to find')
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog.getByText('Thanks! We read every message.')).toBeVisible()
  expect(sent?.message).toBe('Rotating is hard to find')
  expect(sent?.picture).toMatch(/^data:image\/jpeg;base64,/)
})

test('greets visitors without an account with the landing page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shapeshift-onboarded', '1'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build in 3D')
  // Followed by address rather than clicked: the 3D hero keeps CI's software
  // graphics too busy for a click to land in time.
  await expect(page.getByRole('link', { name: /Start creating, free/ })).toHaveAttribute('href', '/edit')
  await page.goto('/edit')
  await expect(page.getByTitle('Add box')).toBeVisible()
})

test('opens a sample project from Explore and remixes it into the editor', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shapeshift-onboarded', '1'))
  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Made by ShapeShift' })).toBeVisible()
  await page.getByRole('link', { name: /Windmill farm/ }).click()
  await expect(page).toHaveURL(/\/explore\/windmill$/)
  await expect(page.getByText('by ShapeShift')).toBeVisible()
  await expect(page.getByTitle('Show this scene on your own site')).toHaveCount(0)
  await page.getByRole('button', { name: /Remix in ShapeShift/ }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect.poll(countNamed(page, 'Sails 1')).toBe(1)
})

test('docks the inspector beside the view or floats it where it is dragged', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const inspector = page.getByRole('button', { name: 'Pop out as a floating panel' }).first()
  await expect(inspector).toBeVisible()
  // Docked, it takes its own column and the 3D view starts after it.
  const view = async () => (await page.locator('canvas').first().boundingBox())!
  expect((await view()).x).toBeGreaterThan(250)

  await inspector.click()
  await expect.poll(async () => (await view()).x).toBeLessThan(10)
  // Floating, it can be dragged by its header and stays there after a reload.
  const header = page.getByText('Inspector', { exact: true })
  const from = (await header.boundingBox())!
  await page.mouse.move(from.x + 10, from.y + 5)
  await page.mouse.down()
  await page.mouse.move(from.x + 310, from.y + 125, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await header.boundingBox())!.x).toBeGreaterThan(from.x + 250)
  await page.reload()
  await page.getByTitle('Add box').click()
  await expect.poll(async () => (await page.getByText('Inspector', { exact: true }).boundingBox())?.x ?? 0).toBeGreaterThan(from.x + 250)

  await page.getByRole('button', { name: 'Dock to the left side' }).click()
  await expect.poll(async () => (await view()).x).toBeGreaterThan(250)
})

test('shows a bar for the selected shape while the inspector is closed', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const bar = page.getByRole('toolbar', { name: 'Selected shape' })
  await expect(bar).toHaveCount(0)
  await page.getByTitle('Inspector').click()
  await expect(bar).toBeVisible()
  await bar.getByTitle('Duplicate').click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene') ?? '{"objects":[]}').objects.length)).toBe(2)
  await bar.getByTitle('More settings (inspector)').click()
  await expect(bar).toHaveCount(0)
})

test('rearranges panels by dragging them into columns, stacks and tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 860 })
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('History').click()
  const carry = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }
  const history = page.getByRole('dialog', { name: 'History' })
  // History starts under the assistant on the right; dropped at the bottom of
  // the left column, it becomes a new stack under the inspector.
  const at = (await history.boundingBox())!
  await carry({ x: at.x + 60, y: at.y + 20 }, { x: 140, y: 845 })
  await expect.poll(async () => (await history.boundingBox())!.x).toBeLessThan(10)

  // Dropped in the middle of the inspector, the assistant joins it as a tab.
  const assistant = (await page.getByText('Builds and changes things for you').boundingBox())!
  await carry({ x: assistant.x + 20, y: assistant.y + 6 }, { x: 140, y: 260 })
  const tabs = page.getByRole('tablist', { name: 'Panels' })
  await expect(tabs.getByRole('tab')).toHaveText(['Inspector', 'Assistant'])
  // With nothing left on the right, the view takes the room.
  await expect.poll(async () => {
    const view = (await page.locator('canvas').first().boundingBox())!
    return view.x + view.width
  }).toBeGreaterThan(1430)
  await tabs.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.getByText('Builds and changes things for you')).toBeHidden()

  // The layout is remembered.
  await page.reload()
  await page.getByTitle('Add box').click()
  await expect(page.getByRole('tablist', { name: 'Panels' }).getByRole('tab')).toHaveText(['Inspector', 'Assistant'])
})

test('docks panels in rows along the top and bottom of the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 860 })
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await page.getByTitle('History').click()
  const carry = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }
  const view = async () => (await page.locator('canvas').first().boundingBox())!
  const history = page.getByRole('dialog', { name: 'History' })
  // Dropped on the bottom edge of the view, History becomes a row along the
  // bottom, and the view ends above it.
  const at = (await history.boundingBox())!
  await carry({ x: at.x + 60, y: at.y + 20 }, { x: 700, y: 850 })
  await expect.poll(async () => (await history.boundingBox())!.width).toBeGreaterThan(600)
  await expect.poll(async () => {
    const v = await view()
    return v.y + v.height
  }).toBeLessThan(860 - 200)

  // The inspector on the top edge: a row under the top bar, and the view
  // starts below it.
  const header = (await page.getByText('Inspector', { exact: true }).boundingBox())!
  await carry({ x: header.x + 10, y: header.y + 5 }, { x: 700, y: 70 })
  await expect.poll(async () => (await view()).y).toBeGreaterThan(48 + 200)
  await expect.poll(async () => (await view()).x).toBeLessThan(10)

  // The assistant beside History, at the row's left end.
  const assistant = (await page.getByText('Builds and changes things for you').boundingBox())!
  const row = (await history.boundingBox())!
  await carry({ x: assistant.x + 20, y: assistant.y + 6 }, { x: row.x + 10, y: row.y + row.height / 2 })
  await expect.poll(async () => (await history.boundingBox())!.x).toBeGreaterThan(row.x + 200)
  await expect(page.getByRole('tablist', { name: 'Panels' })).toHaveCount(0)
})

test('keeps the precise arrows behind one button', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  await expect(page.getByTitle('Turn around one axis (E)')).toHaveCount(0)
  await page.getByTitle('Precise arrows: move, turn or stretch along one axis').click()
  await page.getByTitle('Turn around one axis (E)').click()
  await expect(page.getByTitle('Turn around one axis (E)')).toHaveAttribute('aria-pressed', 'true')
  // The same shortcut again puts them away.
  await page.locator('canvas').first().hover()
  await page.keyboard.press('e')
  await expect(page.getByTitle('Turn around one axis (E)')).toHaveCount(0)
})

test('edits a shape’s points on the shape itself, then finishes', async ({ page }) => {
  await openEditor(page)
  await expect(page.getByText('Reshape', { exact: true })).toHaveCount(0)
  await page.getByTitle('Add box').click()
  await page.getByRole('button', { name: 'Edit points', exact: true }).click()
  const banner = page.getByRole('toolbar', { name: 'Editing points' })
  await expect(banner).toContainText('Editing points of Box')
  await banner.getByRole('button', { name: 'Done' }).click()
  await expect(banner).toHaveCount(0)
  // Esc finishes too, and the shape stays selected.
  await page.getByRole('button', { name: 'Edit points', exact: true }).click()
  await expect(banner).toBeVisible()
  await page.locator('canvas').first().hover()
  await page.keyboard.press('Escape')
  await expect(banner).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit points', exact: true })).toBeVisible()
})

test('previews from the eye by the view cube and comes back', async ({ page }) => {
  await openEditor(page)
  await page.getByTitle('Add box').click()
  const bar = page.getByRole('toolbar', { name: 'Previewing' })
  await page.getByTitle(/^Preview: see it lit/).click()
  await expect(bar).toBeVisible()
  await expect(page.getByTitle('Add box')).toHaveCount(0)
  await bar.getByRole('button', { name: 'Back to editing' }).click()
  await expect(bar).toHaveCount(0)
  await expect(page.getByTitle('Add box')).toBeVisible()
  // P toggles it, and holding Space peeks.
  await page.locator('canvas').first().hover()
  await page.keyboard.press('p')
  await expect(bar).toBeVisible()
  await page.keyboard.press('p')
  await expect(bar).toHaveCount(0)
  await page.keyboard.down(' ')
  await expect(bar).toBeVisible()
  await page.keyboard.up(' ')
  await expect(bar).toHaveCount(0)
})

test('lets people pick the assistant model, and sends it with each message', async ({ page }) => {
  await openEditor(page)
  const picker = page.getByRole('combobox', { name: 'Assistant model' })
  await expect(picker).toHaveValue('fast')
  await picker.selectOption('careful')
  await expect(page.getByText(/2 a message/)).toBeVisible()
  let sent: string | undefined
  await page.route('**/api/agent', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    sent = JSON.parse(route.request().postData() ?? '{}').model
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'overloaded', error: 'Busy.' }) })
  })
  await page.getByRole('textbox', { name: 'Message the assistant' }).fill('a box')
  await page.keyboard.press('Enter')
  await expect.poll(() => sent).toBe('careful')
})
